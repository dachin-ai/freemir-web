"""Public-facing product snippets for the freemir brand landing page."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

import gspread
from sqlalchemy.orm import Session

from models import FreemirName, FreemirPrice
from services.brand_material_logic import get_brand_main_photo_map
from services.price_checker_logic import CURRENCIES, parse_idr_price
from services.product_performance_logic import get_sku_photo_map
from services.auth_logic import CREDENTIALS_FILE, SPREADSHEET_URL

def _landing_featured_skus_paths() -> list[Path]:
    """Local dev: repo frontend JSON. Cloud Run (split API image): backend/data copy."""
    backend_root = Path(__file__).resolve().parents[1]
    repo_root = backend_root.parent
    return [
        backend_root / "data" / "landingFeaturedSkus.json",
        repo_root / "frontend" / "src" / "data" / "landingFeaturedSkus.json",
    ]


def _load_landing_featured_skus() -> list[str]:
    """Single source of truth: frontend/src/data/landingFeaturedSkus.json"""
    for path in _landing_featured_skus_paths():
        if not path.is_file():
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                skus = [str(s).strip().upper() for s in raw if str(s).strip()]
                if skus:
                    return skus
        except Exception as e:
            print(f"[WARN] landingFeaturedSkus.json ({path}): {e}")
    print("[WARN] landingFeaturedSkus.json not found — landing catalog will be empty")
    return []


# Curated SKUs shown on the public landing page (order preserved).
LANDING_FEATURED_SKUS = _load_landing_featured_skus()

_IMAGE_URL_RE = re.compile(r"\.(jpe?g|png|gif|webp|svg)(\?|$)", re.I)
_SKU_DETAIL_CACHE_SECONDS = 300
_SKU_DETAIL_CACHE: dict[str, Any] = {
    "ts": 0.0,
    "rows": [],
}
_LANG_PREFIX = {
    "en": "EN",
    "id": "ID",
    "zh": "ZH",
}


def _norm_status(raw: Any) -> str:
    return re.sub(r"[\s_\-]+", "", str(raw or "").strip().lower())


def _is_image_url(url: str | None) -> bool:
    if not url or not isinstance(url, str):
        return False
    u = url.strip()
    return bool(_IMAGE_URL_RE.search(u)) or "cdn" in u.lower() or "storage.googleapis.com" in u.lower()


def _parse_prices_raw(raw: Any) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return {}
        try:
            decoded = json.loads(text)
            return decoded if isinstance(decoded, dict) else {}
        except Exception:
            return {}
    return {}


def _parse_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    text = re.sub(r"[^\d.\-]", "", text)
    if not text or text in ("-", ".", "-."):
        return None
    try:
        return float(text)
    except Exception:
        return None


def _stock_summary_from_prices(prices_raw: Any, *, currency: str = "IDR") -> str:
    parsed = _parse_prices_raw(prices_raw)
    if not parsed:
        return "No Stock"
    if any(c in parsed for c in CURRENCIES):
        cur_data = parsed.get(currency) or {}
    else:
        cur_data = parsed
    if not isinstance(cur_data, dict):
        return "No Stock"

    stock_map = cur_data.get("stock") if isinstance(cur_data.get("stock"), dict) else {}
    positives: list[tuple[str, int]] = []
    for key, val in (stock_map or {}).items():
        if str(key).strip().lower() in {"warning", "clearance", "category", "link", "name"}:
            continue
        num = _parse_number(val)
        qty = int(num) if num is not None else 0
        if qty > 0:
            positives.append((str(key), qty))
    if not positives:
        return "No Stock"
    warehouse, qty = min(positives, key=lambda x: x[1])
    return f"{qty} ({warehouse})"


def _get_sku_detail_rows() -> list[dict]:
    now = time.time()
    if _SKU_DETAIL_CACHE["rows"] and (now - float(_SKU_DETAIL_CACHE["ts"] or 0)) < _SKU_DETAIL_CACHE_SECONDS:
        return _SKU_DETAIL_CACHE["rows"]

    try:
        client = gspread.service_account(filename=CREDENTIALS_FILE)
        sh = client.open_by_url(SPREADSHEET_URL)
        ws = sh.worksheet("SKU_Detail")
        raw_rows = ws.get_all_values()
    except Exception as e:
        print(f"[WARN] SKU_Detail read failed: {e}")
        return _SKU_DETAIL_CACHE["rows"] or []

    if not raw_rows:
        return []

    headers = [str(h or "").strip() for h in raw_rows[0]]
    out: list[dict] = []
    for row in raw_rows[1:]:
        normalized = {}
        for idx, header in enumerate(headers):
            if not header:
                continue
            normalized[header] = row[idx].strip() if idx < len(row) else ""
        if str(normalized.get("SKU", "")).strip():
            out.append(normalized)

    _SKU_DETAIL_CACHE["rows"] = out
    _SKU_DETAIL_CACHE["ts"] = now
    return out


def invalidate_landing_catalog_cache() -> None:
    _SKU_DETAIL_CACHE["ts"] = 0.0
    _SKU_DETAIL_CACHE["rows"] = []


def refresh_landing_catalog_data() -> dict[str, Any]:
    """
    Manual refresh hook for Login page button:
    - sync SKU_Info -> DB prices/names
    - clear SKU_Detail cache and warm it
    """
    synced = 0
    sync_error = ""
    try:
        from services.price_checker_logic import sync_google_sheets_to_vps_postgres
        synced = int(sync_google_sheets_to_vps_postgres() or 0)
    except Exception as e:
        sync_error = str(e)
    invalidate_landing_catalog_cache()
    rows = _get_sku_detail_rows()
    return {
        "synced_sku_info": synced,
        "sku_detail_rows": len(rows),
        "sync_error": sync_error,
    }


def _pick_lang_value(row: dict, key_suffix: str, lang: str) -> str:
    prefix = _LANG_PREFIX.get((lang or "").strip().lower(), "ID")
    val = str(row.get(f"{prefix}_{key_suffix}", "")).strip()
    if val:
        return val
    for fallback in ("ID", "EN", "ZH"):
        val = str(row.get(f"{fallback}_{key_suffix}", "")).strip()
        if val:
            return val
    return ""


def _pick_lang_list(row: dict, key_suffix: str, lang: str) -> list[str]:
    values = []
    for idx in range(1, 6):
        v = _pick_lang_value(row, f"{key_suffix}_{idx}", lang)
        if v:
            values.append(v)
    return values


def _tier_price_from_prices(
    prices_raw: Any,
    tier: str,
    *,
    currency: str = "IDR",
) -> float | None:
    parsed = _parse_prices_raw(prices_raw)
    if not parsed:
        return None

    is_nested = any(c in parsed for c in CURRENCIES) or "stock" in parsed

    def _tier_value(cur_dict: dict, name: str) -> float | None:
        val = cur_dict.get(name)
        num = parse_idr_price(val)
        return num if num >= 1 else None

    if is_nested:
        cur_data = parsed.get(currency) or {}
        if isinstance(cur_data, dict):
            return _tier_value(cur_data, tier)
        return None

    if currency == CURRENCIES[0]:
        return _tier_value(parsed, tier)
    return None


def _resolve_image_url(
    sku: str,
    *,
    brand_map: dict,
    name_link: str | None,
    pp_photo: str | None,
) -> str | None:
    key = (sku or "").strip().upper()
    brand = brand_map.get(key) or {}
    for candidate in (
        brand.get("url"),
        brand.get("previewUrl"),
        name_link if _is_image_url(name_link) else None,
        pp_photo if _is_image_url(pp_photo) else None,
    ):
        if candidate and str(candidate).strip():
            return str(candidate).strip()
    return None


def get_landing_products(
    db: Session,
    *,
    currency: str = "IDR",
    lang: str = "id",
) -> dict[str, Any]:
    """Landing catalog from SKU_Detail + SKU_Info price/stock data."""
    cur = (currency or "IDR").strip().upper()
    if cur not in CURRENCIES:
        cur = "IDR"
    lang_key = (lang or "id").strip().lower()
    if lang_key not in _LANG_PREFIX:
        lang_key = "id"

    detail_rows = _get_sku_detail_rows()
    detail_by_sku = {
        str(r.get("SKU", "")).strip().upper(): r
        for r in detail_rows
        if str(r.get("SKU", "")).strip()
    }
    skus = [s for s in detail_by_sku.keys()]
    if not skus:
        return {"products": [], "top_tier_products": [], "categories": []}

    price_rows = {
        (r.sku or "").strip().upper(): r
        for r in db.query(FreemirPrice).filter(FreemirPrice.sku.in_(skus)).all()
    }
    name_rows = {
        (r.sku or "").strip().upper(): r
        for r in db.query(FreemirName).filter(FreemirName.sku.in_(skus)).all()
    }

    sku_set = set(skus)
    brand_map = get_brand_main_photo_map(db, sku_set)
    pp_map = get_sku_photo_map(db, sku_set)

    out: list[dict] = []
    catalog_products: list[dict] = []
    categories_ordered: list[str] = []
    top_tier: list[dict] = []
    learn_products: list[dict] = []
    compare_products: list[dict] = []
    for sku in skus:
        detail = detail_by_sku.get(sku) or {}
        price_row = price_rows.get(sku)
        name_row = name_rows.get(sku)
        raw_prices = price_row.prices if price_row else None

        sale = _tier_price_from_prices(raw_prices, "Daily-Discount", currency=cur)
        original = _tier_price_from_prices(raw_prices, "Original", currency=cur)
        stock_summary = _stock_summary_from_prices(raw_prices, currency=cur)

        image_url = _resolve_image_url(
            sku,
            brand_map=brand_map,
            name_link=name_row.link if name_row else None,
            pp_photo=pp_map.get(sku),
        )

        category_l1 = _pick_lang_value(detail, "Level_1_Category", lang_key)
        category_l2 = _pick_lang_value(detail, "Level_2_Category", lang_key)
        product_name = (
            _pick_lang_value(detail, "Name", lang_key)
            or (name_row.product_name if name_row and name_row.product_name else sku)
        )
        status = str(detail.get("Status", "")).strip()
        status_norm = _norm_status(status)

        sale_int = int(round(sale)) if sale is not None else None
        original_int = int(round(original)) if original is not None else None
        show_strike = (
            original_int is not None
            and sale_int is not None
            and original_int > sale_int
        )
        discount_percent = 0
        if show_strike and original_int:
            discount_percent = int(round(((original_int - sale_int) / original_int) * 100))

        item = {
            "sku": sku,
            "name": product_name,
            "sale_price": sale_int,
            "original_price": original_int if show_strike else None,
            "currency": cur,
            "stock_summary": stock_summary,
            "image_url": image_url,
            "has_price": sale_int is not None,
            "has_image": bool(image_url),
            "status": status,
            "order_index": int(detail_rows.index(detail)) if detail in detail_rows else 0,
            "category_l1": category_l1,
            "category_l2": category_l2,
            "discount_percent": discount_percent,
            "detail": {
                "color": _pick_lang_value(detail, "Color", lang_key),
                "main_material": _pick_lang_value(detail, "Main_Material", lang_key),
                "sub_material": _pick_lang_value(detail, "Sub_Material", lang_key),
                "detail_material": _pick_lang_value(detail, "Detail_Material", lang_key),
                "product_dimension_cm": str(detail.get("Product_Dimension_Cm", "")).strip(),
                "package_dimension_cm": str(detail.get("Package_Dimension_Cm", "")).strip(),
                "gross_weight_g": str(detail.get("Gross_Weight_G", "")).strip(),
                "nett_weight_g": str(detail.get("Nett_Weight_G", "")).strip(),
                "advantages": _pick_lang_list(detail, "Key_Advantage", lang_key),
                "detail_advantages": _pick_lang_list(detail, "Detail_Advantage", lang_key),
                "notes": _pick_lang_value(detail, "Data_Notes", lang_key),
            },
        }
        out.append(item)
        if status_norm not in {"zerosales", "later"}:
            catalog_products.append(item)
            if category_l2 and category_l2 not in categories_ordered:
                categories_ordered.append(category_l2)
        else:
            learn_products.append(item)
            compare_products.append(item)
        if status_norm in {"gtmnew", "hot"}:
            top_tier.append(item)

    return {
        "products": catalog_products,
        "all_products": out,
        "top_tier_products": top_tier,
        "learn_products": learn_products,
        "compare_products": compare_products,
        "categories": categories_ordered,
    }

