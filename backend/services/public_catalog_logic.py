"""Public-facing product snippets for the freemir brand landing page."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from models import FreemirName, FreemirPrice
from services.brand_material_logic import get_brand_main_photo_map
from services.price_checker_logic import CURRENCIES, parse_idr_price
from services.product_performance_logic import get_sku_photo_map

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


def get_landing_products(db: Session, *, currency: str = "IDR") -> list[dict]:
    """Landing catalog uses IDR only (public storefront)."""
    cur = (currency or "IDR").strip().upper()
    if cur not in CURRENCIES:
        cur = "IDR"

    skus = [s.strip().upper() for s in LANDING_FEATURED_SKUS if s.strip()]
    if not skus:
        return []

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
    for sku in skus:
        price_row = price_rows.get(sku)
        name_row = name_rows.get(sku)
        raw_prices = price_row.prices if price_row else None

        sale = _tier_price_from_prices(raw_prices, "Daily-Discount", currency=cur)
        original = _tier_price_from_prices(raw_prices, "Original", currency=cur)

        image_url = _resolve_image_url(
            sku,
            brand_map=brand_map,
            name_link=name_row.link if name_row else None,
            pp_photo=pp_map.get(sku),
        )

        sale_int = int(round(sale)) if sale is not None else None
        original_int = int(round(original)) if original is not None else None
        show_strike = (
            original_int is not None
            and sale_int is not None
            and original_int > sale_int
        )

        out.append({
            "sku": sku,
            "name": (name_row.product_name if name_row and name_row.product_name else sku),
            "sale_price": sale_int,
            "original_price": original_int if show_strike else None,
            "currency": cur,
            "image_url": image_url,
            "has_price": sale_int is not None,
            "has_image": bool(image_url),
        })
    return out

