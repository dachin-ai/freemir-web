import pandas as pd
import numpy as np
import numbers
import io
import re
import os
import json
import gspread
import requests
from gspread.utils import rowcol_to_a1
from typing import Tuple, Dict, Any, List
from PIL import Image, ImageOps, UnidentifiedImageError
from database import SessionLocal
from models import FreemirPrice, FreemirName
from services.product_performance_logic import get_sku_photo_map, parse_sku_tokens
from services.brand_material_logic import (
    GCS_BUCKET,
    brand_material_public_url,
    download_gcs_object_bytes,
    get_brand_main_photo_map,
    get_brand_main_photo_url_map,
)

SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1aS1wpEJ5jIYFYYsZT1U4-gabyb5XwGn4u1-OpRhiucc"

if os.path.exists("/etc/secrets/credentials.json"):
    CREDENTIALS_FILE = "/etc/secrets/credentials.json"
else:
    CREDENTIALS_FILE = "credentials.json"

# Synced from SKU_Info but not used in price-check calculations.
SHEET_EXTRA_PRICE_TIERS = ["Original"]

# Sheet headers for list/original price (stored in JSON as tier key "Original").
ORIGINAL_TIER = "Original"
ORIGINAL_COLUMN_ALIASES_BY_CURRENCY: Dict[str, tuple] = {
    "IDR": ("IDR-Original", "IDR Original", "IDR_Original", "Original"),
    "MYR": ("MYR-Original", "MYR Original", "MYR_Original"),
}

PRICE_TYPES = [
    "Warning", "Daily-Discount", "Daily-Livestream", "Daily-Mid-Creator",
    "Daily-Top-Creator", "Daily-FS", "Daily-Shopee-FS", "DD-FS",
    "DD-Shoptab", "DD-Livestream", "DD-Mid-Creator", "DD-Top-Creator",
    "PD-Shoptab", "PD-Livestream", "PD-Mid-Creator", "PD-Top-Creator"
]

# Supported pricing regions. Sheet headers use "<CURRENCY>-<PriceType>" pattern,
# e.g. "IDR-Warning", "MYR-Warning". Order matters: IDR is the default region.
CURRENCIES = ["IDR", "MYR"]

# Gift SKUs inside a multi-SKU bundle receive a discount instead of being free.
# GIFT_DISCOUNT_RATE = 0.20 → gift contributes 80% of its normal price.
# Single-SKU orders and bundles that contain only gifts ignore this factor.
GIFT_DISCOUNT_RATE = 0.20
GIFT_PRICE_FACTOR = 1.0 - GIFT_DISCOUNT_RATE

# Warehouse-based stock columns. Note: the "IDR"/"SBY" prefixes here are
# warehouse codes (Jakarta / Surabaya), NOT currency. "MYS" = Malaysia warehouse.
STOCK_TYPES_IDR = [
    "IDR-Ready", "SBY-Ready",
    "IDR-Lock", "SBY-Lock",
    "IDR-OTW", "SBY-OTW",
]
STOCK_TYPES_MYR = [
    "MYS-Ready", "MYS-Lock", "MYS-OTW",
]
STOCK_TYPES_BY_CURRENCY = {
    "IDR": STOCK_TYPES_IDR,
    "MYR": STOCK_TYPES_MYR,
}
STOCK_TYPES_ALL = STOCK_TYPES_IDR + STOCK_TYPES_MYR
# Backward-compat alias: existing call sites default to IDR warehouses.
STOCK_TYPES = STOCK_TYPES_IDR

# Stock-related "Gap *" columns in export (tri-color: >0 green, 0 yellow, <0 red)
STOCK_GAP_COLUMN_NAMES = frozenset(
    ["Gap Available Stock"] + [f"Gap {st}" for st in STOCK_TYPES_ALL]
)

# Listing export: secondary warehouse columns (non-primary) hidden by default.
# The "primary" column for a currency stays visible; the rest are collapsed.
LISTING_STOCK_DETAIL_HIDDEN_BY_CURRENCY: Dict[str, tuple] = {
    "IDR": (
        "SBY-Ready", "Gap SBY-Ready",
        "IDR-Lock",  "Gap IDR-Lock",
        "SBY-Lock",  "Gap SBY-Lock",
        "IDR-OTW",   "Gap IDR-OTW",
        "SBY-OTW",   "Gap SBY-OTW",
    ),
    "MYR": (
        "MYS-Lock", "Gap MYS-Lock",
        "MYS-OTW",  "Gap MYS-OTW",
    ),
}
# Backward-compat alias for older imports/uses.
LISTING_STOCK_DETAIL_COLS_HIDDEN = LISTING_STOCK_DETAIL_HIDDEN_BY_CURRENCY["IDR"]

# Extra hidden informational columns in export.
EXPORT_HIDDEN_COLUMNS = ()

SHEET_CONFIG = [
    ("All", PRICE_TYPES),
    ("Account Responsible", ["Warning", "Daily-Discount", "Daily-FS", "Daily-Shopee-FS", "DD-FS", "DD-Shoptab", "PD-Shoptab"]),
    ("Livestreamer", ["Warning", "Daily-Livestream", "DD-Livestream", "PD-Livestream"]),
    ("Affiliate", ["Warning", "Daily-Mid-Creator", "Daily-Top-Creator", "DD-Mid-Creator", "DD-Top-Creator", "PD-Mid-Creator", "PD-Top-Creator"])
]

_cached_price_db = None
_cached_name_map = None
_cached_link_map = None
_cached_client = None

def _is_image_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    return bool(re.search(r"\.(jpe?g|png|gif|webp|svg)(\?|$)", url, re.IGNORECASE))


def _is_cdn_picture_url(url: str) -> bool:
    """True for Shopee/Aliyun/GCS picture URLs that often lack a file extension."""
    if not url or not isinstance(url, str):
        return False
    u = url.lower()
    if _is_image_url(url):
        return True
    hints = (
        "aliyuncs.com",
        "shopee",
        "googleusercontent.com",
        "storage.googleapis.com",
        "product_performance",
        "/file/",
        "image.",
        "photo",
        "picture",
    )
    return any(h in u for h in hints)


def normalize_upper_key_map(data: Dict | None) -> Dict:
    """Map with both original and UPPER keys (link/name maps from DB vary in casing)."""
    out: Dict = {}
    for k, v in (data or {}).items():
        if k is None:
            continue
        raw = str(k).strip()
        if not raw:
            continue
        out[raw] = v
        out[raw.upper()] = v
    return out


def _is_combined_sku_name(name: str, sku: str) -> bool:
    if not name or not sku:
        return False
    normalized = str(name).strip()
    if normalized == sku:
        return False
    if any(d in normalized for d in ['+', '-', '|', ',', '/']):
        tokens = parse_sku_tokens(normalized)
        return len(tokens) > 1 and sku in normalized
    return False


def _normalize_sku_name(sku: str, name: str) -> str:
    if not name or _is_combined_sku_name(name, sku):
        return sku
    return str(name).strip()


def normalize_currency(currency: Any) -> str:
    """Return a valid currency code from CURRENCIES, defaulting to the first entry."""
    if isinstance(currency, str):
        cur = currency.strip().upper()
        if cur in CURRENCIES:
            return cur
    return CURRENCIES[0]


def get_stock_types_for(currency: str) -> List[str]:
    return STOCK_TYPES_BY_CURRENCY.get(currency, STOCK_TYPES_BY_CURRENCY[CURRENCIES[0]])


def _item_price(item_data: Dict, tier: str, currency: str) -> Any:
    """Read a single tier price for a SKU, honoring nested per-currency storage
    with a fallback to legacy flat top-level keys (treated as default currency).
    Returns the raw value (float, None, or string) — parsing is up to the caller.
    """
    currencies = item_data.get("_currencies") if isinstance(item_data, dict) else None
    if isinstance(currencies, dict) and currency in currencies:
        cur = currencies[currency]
        if isinstance(cur, dict):
            for key in tier_lookup_keys(tier, currency):
                if key in cur:
                    return cur.get(key)
        return None
    # Legacy fallback: only valid for the default currency.
    if currency == CURRENCIES[0]:
        return item_data.get(tier)
    return None


def _item_stock(item_data: Dict, stock_key: str) -> Any:
    stock = item_data.get("_stock") if isinstance(item_data, dict) else None
    if isinstance(stock, dict) and stock_key in stock:
        return stock[stock_key]
    return item_data.get(stock_key, 0)


def resolve_sku_info_price_column(
    normalized: Dict[str, str],
    *,
    currency: str,
    tier: str,
) -> str | None:
    """Resolve a SKU_Info column name from header aliases (case-insensitive).

    Price tiers use \"<CURRENCY>-<Tier>\" in the sheet (e.g. MYR-Daily-Discount).
    Original list price: IDR may use legacy \"Original\"; Malaysia uses MYR-Original.
    """
    cur = normalize_currency(currency)
    candidates: List[str] = []

    if tier == ORIGINAL_TIER:
        candidates.extend(ORIGINAL_COLUMN_ALIASES_BY_CURRENCY.get(cur, (f"{cur}-Original",)))
    else:
        candidates.extend([
            f"{cur}-{tier}",
            f"{cur} {tier}",
            f"{cur}_{tier}",
        ])
        if cur == CURRENCIES[0]:
            candidates.append(tier)

    seen: set[str] = set()
    for alias in candidates:
        key = alias.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        if key in normalized:
            return normalized[key]
    return None


def tier_lookup_keys(tier: str, currency: str) -> List[str]:
    """Keys to read a tier from nested per-currency price JSON (new + legacy)."""
    cur = normalize_currency(currency)
    keys = [tier]
    if tier == ORIGINAL_TIER:
        keys.extend(ORIGINAL_COLUMN_ALIASES_BY_CURRENCY.get(cur, (f"{cur}-Original",)))
    else:
        keys.extend([f"{cur}-{tier}", f"{cur} {tier}", f"{cur}_{tier}"])
    out: List[str] = []
    seen: set[str] = set()
    for k in keys:
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    return out


def _parse_price_cell(raw: Any) -> Any:
    """Parse a single price cell from Google Sheets.

    Returns:
        float — when the cell holds a valid number (e.g. "12,000" → 12000.0).
        None  — when the cell is blank / unparsable. Downstream callers
                treat None as "Invalid" so the SKU is excluded from that tier.
    """
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        if isinstance(raw, float) and raw != raw:  # NaN guard
            return None
        return float(raw)
    text = str(raw).strip()
    if not text or text.lower() in ("nan", "none", "null", "-"):
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def load_product_database() -> Tuple[Dict, Dict, Dict]:
    global _cached_price_db, _cached_name_map, _cached_link_map
    if _cached_price_db is not None:
        return _cached_price_db, _cached_name_map, _cached_link_map
        
    db = SessionLocal()
    try:
        prices = db.query(FreemirPrice).all()
        names = db.query(FreemirName).all()
        
        price_db = {}
        default_currency = CURRENCIES[0]
        for p in prices:
            item = {"Category": p.category, "Clearance": p.clearance}

            # Normalize prices payload to a dict regardless of how it was stored.
            raw_prices = p.prices
            parsed: Dict[str, Any] = {}
            if isinstance(raw_prices, dict):
                parsed = raw_prices
            elif isinstance(raw_prices, str):
                text = raw_prices.strip()
                if text:
                    try:
                        decoded = json.loads(text)
                        if isinstance(decoded, dict):
                            parsed = decoded
                    except Exception:
                        # Keep working even if legacy/corrupted rows exist.
                        parsed = {}

            # Detect new nested shape ({"IDR": {...}, "MYR": {...}, "stock": {...}})
            # vs legacy flat shape ({"Warning": ..., "IDR-Ready": ...}).
            is_nested = any(c in parsed for c in CURRENCIES) or "stock" in parsed

            if is_nested:
                currencies = {c: dict(parsed.get(c) or {}) for c in CURRENCIES}
                stock = dict(parsed.get("stock") or {})
            else:
                # Legacy fallback: split flat dict into the default currency + stock.
                currencies = {c: {} for c in CURRENCIES}
                stock = {}
                for k, v in parsed.items():
                    if k == "Clearance" or k in PRICE_TYPES or k in SHEET_EXTRA_PRICE_TIERS:
                        currencies[default_currency][k] = v
                    elif k in STOCK_TYPES_ALL:
                        stock[k] = v
                    else:
                        # Legacy flat rows: "MYR-Original" stored at top level.
                        k_lower = str(k).strip().lower()
                        for cur in CURRENCIES:
                            if k_lower == f"{cur.lower()}-original":
                                currencies[cur][ORIGINAL_TIER] = v
                                break

            # Backward-compat surface: flatten the default currency (IDR) plus all
            # stock keys onto the top level so existing calculate_prices / breakdown
            # code keeps working without knowing about regions.
            default_prices = currencies.get(default_currency, {})
            for tier in PRICE_TYPES:
                item[tier] = default_prices.get(tier)
            if default_prices.get("Clearance") is not None:
                item["Clearance"] = default_prices["Clearance"]
            for st in STOCK_TYPES_ALL:
                item[st] = stock.get(st, 0)

            # Region-aware access for future multi-currency consumers.
            item["_currencies"] = currencies
            item["_stock"] = stock

            price_db[p.sku] = item
            
        name_map = {}
        link_map = {}
        for n in names:
            name_map[n.sku] = n.product_name
            link_map[n.sku] = n.link
            
        _cached_price_db = price_db
        _cached_name_map = name_map
        _cached_link_map = link_map
        return price_db, name_map, link_map
    except Exception as e:
        print(f"Error fetching from DB: {e}")
        return {}, {}, {}
    finally:
        db.close()

def sync_google_sheets_to_vps_postgres() -> int:
    """Sync Google Sheets price data to PostgreSQL database (optimized with timeout & bulk operations)"""
    db = None
    try:
        print("[Sync] Initializing Google Sheets connection...")
        client = gspread.service_account(filename=CREDENTIALS_FILE)
        sh = client.open_by_url(SPREADSHEET_URL)

        db = SessionLocal()
        count = 0

        # ===== SYNC PRICE + NAME DATA (SKU_Info as single source) =====
        # Sheet layout (2026-05+): row 1 holds merged group labels
        # ("Indonesia Price", "Malaysia Price", "Indonesia Stock", ...), and the
        # real per-column headers live in row 2. Data starts at row 3.
        # Price columns follow the pattern "<CURRENCY>-<PriceType>", e.g.
        # "IDR-Warning", "MYR-Daily-Discount". Clearance is also per-currency
        # ("IDR-Clearance", "MYR-Clearance"). Stock columns keep their warehouse
        # prefixes (IDR/SBY = Indonesia warehouses, MYS = Malaysia warehouse).
        print("[Sync] Fetching SKU_Info worksheet...")
        try:
            sku_info_ws = sh.worksheet("SKU_Info")
            sku_info_data = sku_info_ws.get_all_values()

            if len(sku_info_data) >= 2:
                # Row 2 (index 1) is the real header; data starts at row 3 (index 2).
                # Falls back to legacy single-header layout if row 2 is empty.
                header_row_idx = 1 if any(str(c).strip() for c in sku_info_data[1]) else 0
                data_start_idx = header_row_idx + 1
                sku_info_cols = [str(c).strip() for c in sku_info_data[header_row_idx]]

                # De-duplicate empty headers so pandas does not collapse them onto each other.
                seen_counts: Dict[str, int] = {}
                unique_cols: List[str] = []
                for c in sku_info_cols:
                    base = c or "_blank"
                    n = seen_counts.get(base, 0)
                    unique_cols.append(base if n == 0 else f"{base}__{n}")
                    seen_counts[base] = n + 1

                df_sku_info = pd.DataFrame(sku_info_data[data_start_idx:], columns=unique_cols)
                normalized = {str(c).strip().lower(): c for c in df_sku_info.columns}

                def col(*aliases):
                    for alias in aliases:
                        key = alias.strip().lower()
                        if key in normalized:
                            return normalized[key]
                    return None

                sku_col = col("SKU") or (df_sku_info.columns[1] if len(df_sku_info.columns) > 1 else df_sku_info.columns[0])
                df_sku_info = df_sku_info[df_sku_info[sku_col].astype(str).str.strip() != ""]

                # Category usually exists as explicit header. Fallback to column E when
                # sheet headers are changed/empty, because business data stores it there.
                cat_col = col("Category") or (df_sku_info.columns[4] if len(df_sku_info.columns) > 4 else None)
                name_col = col("Product-Name", "Product Name", "Name", "English Name")
                link_col = col("Link", "Product Link", "URL", "Image", "Image URL", "Pic")
                mark_col = col("Mark")

                # Resolve currency-prefixed price columns. Older sheets without prefix
                # ("Warning", "Clearance") still work and are treated as IDR.
                price_col_lookup: Dict[str, Dict[str, str]] = {}
                sheet_price_tiers = ["Clearance", *SHEET_EXTRA_PRICE_TIERS, *PRICE_TYPES]
                for currency in CURRENCIES:
                    cur_lookup: Dict[str, str] = {}
                    for tier in sheet_price_tiers:
                        resolved = resolve_sku_info_price_column(
                            normalized, currency=currency, tier=tier,
                        )
                        if resolved is not None:
                            cur_lookup[tier] = resolved
                    price_col_lookup[currency] = cur_lookup

                stock_col_lookup: Dict[str, str] = {}
                for st in STOCK_TYPES_ALL:
                    resolved = col(st)
                    if resolved is not None:
                        stock_col_lookup[st] = resolved

                print(f"[Sync] Processing {len(df_sku_info)} SKU_Info rows...")

                def expand_skus(raw_value: str):
                    if pd.isna(raw_value) or not str(raw_value).strip():
                        return []
                    parts = re.split(r'[+\-,|]+', str(raw_value))
                    return [p.strip() for p in parts if p.strip()]

                skus_to_update = {}
                names_by_sku = {}
                links_by_sku = {}
                marks_by_sku = {}

                for _, row in df_sku_info.iterrows():
                    raw_sku = str(row[sku_col]).strip()
                    if not raw_sku:
                        continue

                    cat_val = str(row[cat_col]).strip() if cat_col and cat_col in row else ""
                    raw_name = str(row[name_col]).strip() if name_col and name_col in row else ""
                    raw_link = str(row[link_col]).strip() if link_col and link_col in row else ""
                    raw_mark = str(row[mark_col]).strip() if mark_col and mark_col in row else ""

                    # Build per-currency price dict. Blank / unparsable cells are
                    # stored as None so downstream code marks that tier as Invalid.
                    currencies_data: Dict[str, Dict[str, Any]] = {}
                    for currency, cur_lookup in price_col_lookup.items():
                        cur_dict: Dict[str, Any] = {}
                        for tier in sheet_price_tiers:
                            src_col = cur_lookup.get(tier)
                            cur_dict[tier] = _parse_price_cell(row[src_col]) if src_col else None
                        currencies_data[currency] = cur_dict

                    stock_data: Dict[str, int] = {}
                    for st in STOCK_TYPES_ALL:
                        src_col = stock_col_lookup.get(st)
                        stock_data[st] = parse_stock_value(row[src_col]) if src_col else 0

                    prices_json: Dict[str, Any] = {**currencies_data, "stock": stock_data}

                    # Legacy `clearance` column on FreemirPrice mirrors IDR clearance,
                    # so existing readers (load_product_database etc.) keep working.
                    idr_clear = currencies_data.get(CURRENCIES[0], {}).get("Clearance")
                    clear_val = "" if idr_clear is None else str(idr_clear)

                    for sku in expand_skus(raw_sku):
                        skus_to_update[sku] = {
                            'sku': sku,
                            'category': cat_val,
                            'clearance': clear_val,
                            'prices': prices_json,
                        }
                        if raw_name:
                            names_by_sku[sku] = raw_name
                        if raw_link:
                            links_by_sku[sku] = raw_link
                        if raw_mark:
                            marks_by_sku[sku] = raw_mark

                db.query(FreemirPrice).delete()
                db.commit()
                if skus_to_update:
                    db.bulk_insert_mappings(FreemirPrice, list(skus_to_update.values()))
                    db.commit()
                    count = len(skus_to_update)
                    print(f"[Sync] Synced {count} price records from SKU_Info")

                db.query(FreemirName).delete()
                db.commit()
                names_to_insert = []
                for sku, _ in skus_to_update.items():
                    names_to_insert.append({
                        'sku': sku,
                        'product_name': names_by_sku.get(sku, ""),
                        'link': links_by_sku.get(sku, ""),
                        'mark': marks_by_sku.get(sku, "")
                    })

                if names_to_insert:
                    db.bulk_insert_mappings(FreemirName, names_to_insert)
                    db.commit()
                    print(f"[Sync] Synced {len(names_to_insert)} product names/links from SKU_Info")
        except Exception as e:
            print(f"[Sync] Warning: Could not sync SKU_Info data: {e}")

        global _cached_price_db, _cached_name_map, _cached_link_map
        _cached_price_db = None
        _cached_name_map = None
        _cached_link_map = None

        print(f"[Sync] Sync complete: {count} price records updated")
        return count
    except Exception as e:
        print(f"[Sync] Error syncing Google Sheets to PostgreSQL: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        if db:
            db.close()

# Keep old function name for backward compatibility
def sync_google_sheets_to_postgres() -> int:
    """Legacy function name - use sync_google_sheets_to_vps_postgres() instead"""
    return sync_google_sheets_to_vps_postgres()


def upload_stock_data_to_google_sheet(file_bytes: bytes) -> Dict[str, Any]:
    """
    Replace Google Sheet tab 'In-Stock' with uploaded Excel data.
    Writes data from column A up to CA (79 columns), replacing old rows.
    """
    df = pd.read_excel(io.BytesIO(file_bytes), sheet_name=0, dtype=str)
    df = df.fillna("")
    max_cols = 79  # A..CA
    if df.shape[1] > max_cols:
        df = df.iloc[:, :max_cols]

    headers = [str(col).strip() for col in df.columns.tolist()]

    id_like_keywords = ("sku", "code", "id", "name", "link", "url", "warehouse")

    def _normalize_cell(header: str, value: Any):
        if value is None:
            return ""
        text = str(value).strip()
        if text.startswith("'"):
            text = text[1:].strip()
        if text == "":
            return ""

        # Keep identifier columns as text to avoid accidental type conversion.
        lowered_header = str(header).strip().lower()
        if any(k in lowered_header for k in id_like_keywords):
            return text

        # Convert numeric-looking values to actual numbers for SUMIF compatibility.
        numeric_text = text.replace(",", "")
        if re.fullmatch(r"[-+]?\d+", numeric_text):
            try:
                return int(numeric_text)
            except Exception:
                return text
        if re.fullmatch(r"[-+]?\d*\.\d+", numeric_text):
            try:
                return float(numeric_text)
            except Exception:
                return text
        return text

    data_rows = []
    for row in df.values.tolist():
        normalized_row = []
        for idx, raw_val in enumerate(row):
            col_header = headers[idx] if idx < len(headers) else ""
            normalized_row.append(_normalize_cell(col_header, raw_val))
        data_rows.append(normalized_row)
    values = [headers] + data_rows

    client = gspread.service_account(filename=CREDENTIALS_FILE)
    sh = client.open_by_url(SPREADSHEET_URL)
    ws = sh.worksheet("In-Stock")

    # Clear existing data in A:CA, then write new dataset from A1.
    ws.batch_clear(["A:CA"])
    if values:
        end_row = len(values)
        end_col = max(len(r) for r in values) if values else 1
        end_col = max(1, min(end_col, max_cols))
        range_a1 = f"A1:{rowcol_to_a1(end_row, end_col)}"
        ws.update(range_a1, values, value_input_option="USER_ENTERED")

    return {
        "rows_uploaded": len(data_rows),
        "columns_uploaded": len(headers),
        "sheet": "In-Stock",
    }

def clean_sku_list(sku_string: str) -> List[str]:
    if pd.isna(sku_string) or not sku_string: return []
    # Accept delimiters: + , - | and plain whitespace between SKUs.
    parts = re.split(r'\s*[+\-,|]+\s*|\s+', str(sku_string).strip())
    return [p.strip() for p in parts if p.strip()]

def parse_idr_price(val: Any) -> float:
    if val is None: return 0.0
    # Already numeric (from PostgreSQL DB JSON) — return directly, avoid stripping decimal point
    if isinstance(val, (int, float)):
        return 0.0 if val != val else float(val)  # guard NaN
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ('', 'nan', 'none'): return 0.0
    # Try direct float first (handles "15000.0", "15000")
    try:
        return float(val_str)
    except ValueError:
        pass
    # Last resort: strip everything except digits (e.g. "Rp 15,000" from raw sheets)
    digits = re.sub(r'[^\d]', '', val_str)
    return float(digits) if digits else 0.0


def parse_stock_value(val: Any) -> int:
    if val is None:
        return 0
    if isinstance(val, (int, float)):
        if val != val:  # NaN
            return 0
        return max(0, int(round(float(val))))
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ('', 'nan', 'none', 'null', '-'):
        return 0
    try:
        return max(0, int(round(float(val_str.replace(',', '')))))
    except ValueError:
        digits = re.sub(r'[^\d]', '', val_str)
        return int(digits) if digits else 0


def summarize_bundle_stock(stock_map: Dict[str, int]) -> str:
    positive = [(stock_key, int(stock_val)) for stock_key, stock_val in stock_map.items() if int(stock_val) > 0]
    if not positive:
        return "No Stock"
    min_key, min_val = min(positive, key=lambda x: x[1])
    return f"{min_val} ({min_key})"

def get_bundle_discount_rate(count: int) -> float:
    if count == 1: return 0.0
    elif count == 2: return 0.02
    elif count == 3: return 0.03
    elif count == 4: return 0.045
    elif count >= 5: return 0.05
    return 0.0

def generate_breakdown_table(
    sku_string: str,
    price_db: Dict,
    name_map: Dict,
    currency: str = CURRENCIES[0],
) -> List[Dict]:
    currency = normalize_currency(currency)
    stock_types = get_stock_types_for(currency)

    skus = clean_sku_list(sku_string)
    sku_count = len(skus)
    if sku_count == 0: return []

    base_disc = get_bundle_discount_rate(sku_count)

    # Pass 1: cache per-SKU context. The main cost of this function is parsing
    # prices/categories out of the JSON-backed item_data — caching it once cuts
    # the work to ~1/3 versus reading every value in each of the three logical
    # phases (classify, total, render).
    sku_ctx: List[Tuple[str, Dict, bool, bool, float, float]] = []
    has_normal = False
    for sku in skus:
        item_data = price_db.get(sku, {})
        cat = str(item_data.get("Category", "")).lower()
        is_gift = "gift" in cat
        if not is_gift:
            has_normal = True
        c_val = parse_idr_price(_item_price(item_data, "Clearance", currency))
        w_val = parse_idr_price(_item_price(item_data, "Warning", currency))
        is_clearance = c_val >= 1
        sku_ctx.append((sku, item_data, is_gift, is_clearance, c_val, w_val))

    mixed_bundle = sku_count > 1 and has_normal

    # Pass 2: floor-check totals (cheap arithmetic over cached values).
    total_raw_warning = 0.0
    total_discounted_warning = 0.0
    for _, _, is_gift, is_clearance, c_val, w_val in sku_ctx:
        if is_clearance:
            total_raw_warning += c_val
            total_discounted_warning += c_val
        else:
            gift_factor = GIFT_PRICE_FACTOR if (mixed_bundle and is_gift) else 1.0
            total_raw_warning += w_val
            total_discounted_warning += w_val * gift_factor * (1 - base_disc)
    hit_floor = total_discounted_warning < total_raw_warning

    # Pass 3: render the breakdown rows.
    breakdown_data: List[Dict] = []
    for sku, item_data, is_gift, is_clearance, c_val, w_val in sku_ctx:
        name = name_map.get(sku, "-")
        gift_factor = GIFT_PRICE_FACTOR if (mixed_bundle and is_gift) else 1.0

        if is_clearance:
            final_price = c_val
            logic_applied = "Clearance Override"
        elif hit_floor:
            final_price = w_val
            logic_applied = "Floor Protection Applied"
        else:
            final_price = w_val * gift_factor * (1 - base_disc)
            logic_list: List[str] = []
            if mixed_bundle and is_gift:
                logic_list.append(f"Gift (-{int(round(GIFT_DISCOUNT_RATE * 100))}%)")
            if base_disc > 0:
                logic_list.append(f"Bundle Disc ({base_disc*100}%)")
            logic_applied = " + ".join(logic_list) if logic_list else "Normal Price"

        breakdown_data.append({
            "SKU": sku,
            "Product Name": name,
            "Base Price (Warning)": int(w_val),
            "Logic Applied": logic_applied,
            f"Total Contribution ({currency})": int(round(final_price)),
            **{st: parse_stock_value(_item_stock(item_data, st)) for st in stock_types}
        })

    return breakdown_data

def slim_sku_items_for_cache(sku_items: list | None) -> list:
    """Keep photo/link fields in bundle cache without full breakdown payload."""
    keys = (
        "sku", "name", "link", "image", "imageSource",
        "brandMaterialId", "previewUrl", "previewGcsPath",
    )
    out = []
    for it in sku_items or []:
        if not isinstance(it, dict):
            continue
        row = {k: it[k] for k in keys if it.get(k) not in (None, "")}
        if row.get("sku"):
            out.append(row)
    return out


def _export_url_from_gcs_path(gcs: str) -> str:
    gcs = str(gcs or "").strip()
    if not gcs:
        return ""
    pub = brand_material_public_url(gcs)
    if pub:
        return pub
    return f"gcs:{gcs}"


def _is_usable_picture_url(url: str) -> bool:
    u = str(url or "").strip()
    if not u:
        return False
    return _is_image_url(u) or _is_cdn_picture_url(u)


def export_link_for_item(item: dict | None) -> str:
    """Best URL for Excel SKU Link column — Material Library Main before SKU_Info / PP."""
    if not isinstance(item, dict):
        return ""
    link = str(item.get("link") or "").strip()
    image = str(item.get("image") or "").strip()
    gcs = str(item.get("previewGcsPath") or "").strip()
    gcs_url = _export_url_from_gcs_path(gcs) if gcs else ""
    brand_id = item.get("brandMaterialId")
    image_source = item.get("imageSource")

    if brand_id or image_source == "brand_material":
        for candidate in (gcs_url, image, link):
            if candidate and (_is_usable_picture_url(candidate) or candidate.startswith("gcs:")):
                return candidate
        if gcs_url:
            return gcs_url

    if link and _is_usable_picture_url(link):
        return link
    if image and _is_usable_picture_url(image):
        return image
    if link:
        return link
    if image:
        return image
    if gcs_url:
        return gcs_url
    return ""


def build_sku_export_item(
    sku: str,
    *,
    name_map: Dict,
    link_map: Dict,
    brand_photo_meta_map: Dict,
    brand_photo_map: Dict,
    photo_map: Dict,
) -> dict:
    """Resolve one SKU row for export/UI (brand material → SKU link → product performance)."""
    raw_name = name_map.get(sku, "") or name_map.get((sku or "").upper(), "") or ""
    sku_name = _normalize_sku_name(sku, raw_name)
    sku_link = link_map.get(sku, "") or link_map.get((sku or "").upper(), "") or ""
    sku_key = (sku or "").strip().upper()
    brand_meta = brand_photo_meta_map.get(sku_key) or {}
    brand_image = brand_photo_map.get(sku_key) or brand_meta.get("url") or None
    brand_material_id = brand_meta.get("materialId")
    brand_preview_url = (brand_meta.get("previewUrl") or "").strip() or None
    preview_gcs = (brand_meta.get("previewGcsPath") or "").strip() or ""
    brand_gcs_url = _export_url_from_gcs_path(preview_gcs) if preview_gcs else ""

    image_url = None
    export_link = sku_link
    image_source = None
    if brand_material_id or brand_gcs_url or brand_image:
        image_source = "brand_material"
        image_url = brand_preview_url or brand_image or brand_gcs_url or None
        export_link = brand_image or brand_gcs_url or brand_preview_url or sku_link
    elif _is_image_url(sku_link):
        image_url = sku_link
    else:
        image_url = photo_map.get(sku_key) or photo_map.get(sku)

    if image_source is None:
        if image_url and _is_image_url(sku_link) and image_url == sku_link:
            image_source = "sku_info"
        elif image_url:
            image_source = "product_performance"

    return {
        "sku": sku,
        "name": sku_name,
        "link": export_link,
        "image": image_url,
        "imageSource": image_source,
        "brandMaterialId": brand_material_id,
        "previewUrl": brand_preview_url,
        "previewGcsPath": preview_gcs,
    }


def payload_items_have_export_links(items: list | None) -> bool:
    """True when every item row already has a resolvable export link."""
    if not items:
        return False
    for it in items:
        if not isinstance(it, dict) or not export_link_for_item(it):
            return False
    return True


def build_sku_items_for_export(
    skus: list,
    *,
    name_map: Dict,
    link_map: Dict,
    brand_photo_meta_map: Dict,
    brand_photo_map: Dict,
    photo_map: Dict,
) -> list:
    return [
        build_sku_export_item(
            sku,
            name_map=name_map,
            link_map=link_map,
            brand_photo_meta_map=brand_photo_meta_map,
            brand_photo_map=brand_photo_map,
            photo_map=photo_map,
        )
        for sku in skus
    ]


def resolve_photo_maps_for_skus(db, skus: set) -> tuple[dict, dict]:
    """
    Batch-resolve brand main photos + Product Performance fallbacks.
    Still queries PP when brand row exists but has no usable URL/path.
    """
    brand_photo_meta_map = get_brand_main_photo_map(db, skus)
    need_pp: set = set()
    for s in skus:
        raw = str(s or "").strip()
        key = raw.upper()
        if not key:
            continue
        meta = brand_photo_meta_map.get(key) or {}
        has_brand_pic = bool(
            (meta.get("url") or "").strip()
            or (meta.get("previewGcsPath") or "").strip()
        )
        if not has_brand_pic:
            need_pp.add(raw)
            need_pp.add(key)
    photo_map = get_sku_photo_map(db, need_pp) if need_pp else {}
    # Normalize keys to uppercase for consistent lookup in calculate/export.
    photo_map_upper = {}
    for k, v in photo_map.items():
        if not k or not v:
            continue
        ku = str(k).strip().upper()
        photo_map_upper[ku] = v
        photo_map_upper[str(k).strip()] = v
    return brand_photo_meta_map, photo_map_upper


def calculate_prices(
    sku_string: str,
    price_db: Dict,
    name_map: Dict,
    link_map: Dict,
    photo_map: Dict = None,
    brand_photo_map: Dict = None,
    brand_photo_meta_map: Dict = None,
    currency: str = CURRENCIES[0],
) -> Dict:
    currency = normalize_currency(currency)
    stock_types = get_stock_types_for(currency)
    skus = clean_sku_list(sku_string)
    sku_count = len(skus)
    result = {}
    sku_items = []
    categories_per_sku = []

    sku_set = set(skus)
    if photo_map is None or brand_photo_meta_map is None:
        db = SessionLocal()
        try:
            if brand_photo_meta_map is None and photo_map is None:
                brand_photo_meta_map, photo_map = resolve_photo_maps_for_skus(db, sku_set)
            elif brand_photo_meta_map is None:
                brand_photo_meta_map = get_brand_main_photo_map(db, sku_set)
            elif photo_map is None:
                need_pp = {
                    s for s in sku_set
                    if (s or "").strip().upper() not in brand_photo_meta_map
                }
                photo_map = get_sku_photo_map(db, need_pp) if need_pp else {}
        finally:
            db.close()
    photo_map = photo_map or {}
    brand_photo_meta_map = brand_photo_meta_map or {}
    if brand_photo_map is None:
        brand_photo_map = {
            sku: meta.get("url", "")
            for sku, meta in brand_photo_meta_map.items()
            if meta.get("url")
        }
    else:
        brand_photo_map = brand_photo_map or {}

    for i, sku in enumerate(skus):
        idx = i + 1
        item = build_sku_export_item(
            sku,
            name_map=name_map,
            link_map=link_map,
            brand_photo_meta_map=brand_photo_meta_map,
            brand_photo_map=brand_photo_map,
            photo_map=photo_map,
        )
        result[f"SKU {idx} Link"] = item["link"]
        result[f"SKU {idx} Name"] = item["name"]
        item["stock"] = {
            st: parse_stock_value(_item_stock(price_db.get(sku, {}), st))
            for st in stock_types
        }
        sku_items.append(item)
        category_value = str(price_db.get(sku, {}).get("Category", "")).strip()
        categories_per_sku.append((sku, category_value))

    if sku_count == 0:
        result.update({
            "Bundle Discount": 0, "Mark Clearance": "-", "Mark Gift": "-",
            **{k: "Invalid" for k in PRICE_TYPES},
            **{k: 0 for k in stock_types},
            "Available Stock": "No Stock",
            "currency": currency,
            "stock_types": stock_types,
            "sku_items": []
        })
        return result

    # Short-circuit: any unknown SKU invalidates the whole bundle. We bail out
    # before doing any computation so callers get a fast Invalid response.
    if any(not price_db.get(sku) for sku in skus):
        result.update({
            "Bundle Discount": "", "Mark Clearance": "", "Mark Gift": "",
            **{k: "Invalid" for k in PRICE_TYPES},
            **{k: 0 for k in stock_types},
            "Available Stock": "No Stock",
            "currency": currency,
            "stock_types": stock_types,
        })
        return result

    base_discount_rate = get_bundle_discount_rate(sku_count)
    total_prices = {k: 0.0 for k in PRICE_TYPES}
    is_valid = {k: True for k in PRICE_TYPES}
    bundle_stock = {st: None for st in stock_types}

    # Pass 1: cheap classification — needs has_normal known before gift_factor.
    # Cache resolved item_data + category + clearance/warning to avoid re-reading.
    sku_ctx: List[Tuple[Any, Dict, str, float, float]] = []
    has_normal = False
    has_clearance = False
    has_gift = False
    absolute_floor = 0.0

    for sku in skus:
        item_data = price_db.get(sku)
        cat = str(item_data.get("Category", "")).lower()
        c_val = parse_idr_price(_item_price(item_data, "Clearance", currency))
        w_val = parse_idr_price(_item_price(item_data, "Warning", currency))
        is_clearance_item = c_val >= 1

        if "gift" in cat:
            has_gift = True
        else:
            has_normal = True
        if is_clearance_item:
            has_clearance = True
            absolute_floor += c_val
        else:
            absolute_floor += w_val

        sku_ctx.append((sku, item_data, cat, c_val, w_val))

    # Pass 2: heavy compute (per-tier price contributions + per-warehouse min stock).
    mixed_bundle = sku_count > 1 and has_gift and has_normal
    for sku, item_data, cat, c_val, _w_val in sku_ctx:
        is_clearance_item = c_val >= 1
        gift_factor = GIFT_PRICE_FACTOR if (mixed_bundle and "gift" in cat) else 1.0

        if is_clearance_item:
            disc_multiplier = gift_factor  # Clearance ignores bundle discount.
            for p_type in PRICE_TYPES:
                total_prices[p_type] += c_val * disc_multiplier
        else:
            disc_multiplier = gift_factor * (1 - base_discount_rate)
            for p_type in PRICE_TYPES:
                val = parse_idr_price(_item_price(item_data, p_type, currency))
                if val >= 1:
                    total_prices[p_type] += val * disc_multiplier
                else:
                    is_valid[p_type] = False

        for st in stock_types:
            qty = parse_stock_value(_item_stock(item_data, st))
            current = bundle_stock[st]
            bundle_stock[st] = qty if current is None else min(current, qty)

    for st in stock_types:
        if bundle_stock[st] is None:
            bundle_stock[st] = 0

    final_discount_display = 0.0 if has_clearance else base_discount_rate
    # Gift discount is only effectively applied when the bundle mixes a gift
    # SKU with at least one normal SKU. Solo gifts / pure-gift bundles pay full.
    gift_discount_rate = GIFT_DISCOUNT_RATE if mixed_bundle else 0.0

    result.update({
        "Bundle Discount": final_discount_display,
        "Mark Clearance": "Yes" if has_clearance else "-",
        "Mark Gift": "Yes" if has_gift else "-",
        "Gift Discount": gift_discount_rate,
        "Category": "+".join([cat if cat else "-" for _, cat in categories_per_sku]),
        **bundle_stock,
        "Available Stock": summarize_bundle_stock(bundle_stock),
        "currency": currency,
        "stock_types": stock_types,
        "sku_items": sku_items
    })
    
    for p_type in PRICE_TYPES:
        if is_valid[p_type]: 
            calc_val = total_prices[p_type]
            if calc_val < absolute_floor:
                calc_val = absolute_floor
            result[p_type] = int(round(calc_val))
        else: result[p_type] = "Invalid"

    return result

def convert_df_to_excel_multisheet(
    df: pd.DataFrame,
    method: str = "Listing",
    include_pictures: bool = False,
    currency: str = CURRENCIES[0],
    export_fast: bool = False,
) -> bytes:
    currency = normalize_currency(currency)
    stock_types = get_stock_types_for(currency)
    hidden_detail_cols = LISTING_STOCK_DETAIL_HIDDEN_BY_CURRENCY.get(currency, ())
    import xlsxwriter
    output = io.BytesIO()
    from services.excel_picture_utils import (
        FRAME_H_PX,
        FRAME_W_PX,
        IMAGE_CELL_H_PX,
        IMAGE_CELL_W_PX,
        fetch_framed_image_bytes,
    )

    image_cache: Dict[str, bytes | None] = {}
    frame_w_px = FRAME_W_PX
    frame_h_px = FRAME_H_PX
    image_cell_w_px = IMAGE_CELL_W_PX
    image_cell_h_px = IMAGE_CELL_H_PX

    def _get_image_bytes(url: str) -> bytes | None:
        if not include_pictures:
            return None
        link_value = str(url or "").strip()
        if link_value.startswith("gcs:"):
            return fetch_framed_image_bytes(
                gcs_object_path=link_value[4:],
                cache=image_cache,
            )
        return fetch_framed_image_bytes(link_value, image_cache)

    with pd.ExcelWriter(output, engine='xlsxwriter', engine_kwargs={'options': {'nan_inf_to_errors': True}}) as writer:
        workbook = writer.book
        
        header_fmt_dark = workbook.add_format({'bold': True, 'bg_color': '#0c2461', 'font_color': 'white', 'border': 1, 'align': 'center', 'valign': 'vcenter'})
        header_fmt_stock = workbook.add_format({'bold': True, 'bg_color': '#DCFCE7', 'font_color': '#14532D', 'border': 1, 'align': 'center', 'valign': 'vcenter'})
        header_fmt_price = workbook.add_format({'bold': True, 'bg_color': '#DBEAFE', 'font_color': '#1E3A8A', 'border': 1, 'align': 'center', 'valign': 'vcenter'})
        # Data: default center + vertical middle; column A (data rows) uses left + vertical middle
        text_fmt = workbook.add_format({'num_format': '@', 'border': 1, 'align': 'center', 'valign': 'vcenter'})
        text_fmt_a = workbook.add_format({'num_format': '@', 'border': 1, 'align': 'left', 'valign': 'vcenter'})
        num_fmt = workbook.add_format({'num_format': '0', 'border': 1, 'align': 'center', 'valign': 'vcenter'})
        num_fmt_a = workbook.add_format({'num_format': '0', 'border': 1, 'align': 'left', 'valign': 'vcenter'})
        percent_fmt = workbook.add_format({'num_format': '0.0%', 'border': 1, 'align': 'center', 'valign': 'vcenter'})
        percent_fmt_a = workbook.add_format({'num_format': '0.0%', 'border': 1, 'align': 'left', 'valign': 'vcenter'})
        center_fmt = workbook.add_format({'align': 'center', 'valign': 'vcenter', 'border': 1})
        left_fmt = workbook.add_format({'align': 'left', 'valign': 'vcenter', 'border': 1})
        green_bg = workbook.add_format({
            'bg_color': '#C6EFCE', 'font_color': '#006100', 'num_format': '0', 'align': 'center', 'valign': 'vcenter', 'border': 1,
        })
        red_bg = workbook.add_format({
            'bg_color': '#FFC7CE', 'font_color': '#9C0006', 'num_format': '0', 'align': 'center', 'valign': 'vcenter', 'border': 1,
        })
        yellow_bg = workbook.add_format({
            'bg_color': '#FFEB9C', 'font_color': '#9C6500', 'num_format': '0', 'align': 'center', 'valign': 'vcenter', 'border': 1,
        })
        invalid_fmt = workbook.add_format({'bg_color': '#FFFFE0', 'font_color': '#b71540', 'border': 1, 'align': 'center', 'valign': 'vcenter'})
        invalid_fmt_a = workbook.add_format({'bg_color': '#FFFFE0', 'font_color': '#b71540', 'border': 1, 'align': 'left', 'valign': 'vcenter'})
        link_fmt = workbook.add_format({'bg_color': '#e3f2fd', 'border': 1, 'num_format': '@', 'align': 'center', 'valign': 'vcenter'})
        link_fmt_a = workbook.add_format({'bg_color': '#e3f2fd', 'border': 1, 'num_format': '@', 'align': 'left', 'valign': 'vcenter'})
        # Available Stock: long text should wrap (still respects stock column width)
        header_fmt_avail_stock = workbook.add_format({
            'bold': True, 'bg_color': '#DCFCE7', 'font_color': '#14532D', 'border': 1,
            'align': 'center', 'valign': 'vcenter',
        })
        num_fmt_avail = workbook.add_format({
            'num_format': '0', 'border': 1, 'align': 'center', 'valign': 'vcenter',
        })
        num_fmt_avail_a = workbook.add_format({
            'num_format': '0', 'border': 1, 'align': 'left', 'valign': 'vcenter',
        })
        text_fmt_avail = workbook.add_format({
            'num_format': '@', 'border': 1, 'align': 'center', 'valign': 'vcenter',
        })
        text_fmt_avail_a = workbook.add_format({
            'num_format': '@', 'border': 1, 'align': 'left', 'valign': 'vcenter',
        })

        sku_link_cols = [c for c in df.columns if re.match(r'SKU \d+ Link', c)]
        sku_name_cols = [c for c in df.columns if re.match(r'SKU \d+ Name', c)]
        sku_link_cols.sort(key=lambda x: int(x.split()[1]))
        sku_name_cols.sort(key=lambda x: int(x.split()[1]))
        # Keep export order predictable for easier hide/show:
        # all photos first, then all names.
        sku_info_cols = sku_link_cols + sku_name_cols

        if method == "Listing":
            core_cols = ["Product ID", "PID Name", "Variation ID", "MID Name", "Campaign Price", "Target Stock", "SKU"]
        else:
            core_cols = ["SKU", "Input Price", "Target Stock"]
            
        identity_cols = ["Bundle Discount", "Mark Clearance", "Mark Gift"]
        stock_cols = ["Available Stock", "Gap Available Stock"] + stock_types + [f"Gap {st}" for st in stock_types]

        if export_fast and not include_pictures:
            processing_sheets = [("All", PRICE_TYPES)]
        else:
            processing_sheets = [("All", PRICE_TYPES), ("Reminder", PRICE_TYPES)]
            for sc in SHEET_CONFIG:
                if sc[0] == "All":
                    continue
                processing_sheets.append(sc)

        for sheet_name, price_cols in processing_sheets:
            current_df = df.copy()
            
            if sheet_name == "Reminder":
                col_gap_warn = "Gap Warning"
                if col_gap_warn in current_df.columns:
                    is_under = pd.to_numeric(current_df[col_gap_warn], errors='coerce') < 0
                    is_invalid = current_df[col_gap_warn] == "Invalid"
                    current_df = current_df[is_under | is_invalid]
                else:
                    current_df = pd.DataFrame(columns=current_df.columns)

            interleaved_price_cols = []
            for pc in price_cols:
                interleaved_price_cols.append(pc)
                interleaved_price_cols.append(f"Gap {pc}")

            interleaved_stock_cols = ["Available Stock", "Gap Available Stock"]
            for st in stock_types:
                interleaved_stock_cols.append(st)
                interleaved_stock_cols.append(f"Gap {st}")
            
            if method == "Listing":
                ordered_core_cols = [
                    "Product ID", "PID Name", "Variation ID", "MID Name",
                    "Campaign Price", "Target Stock", "Category", "SKU"
                ]
            else:
                ordered_core_cols = ["SKU", "Input Price", "Target Stock", "Category"]

            target_cols = ordered_core_cols + sku_info_cols + identity_cols + interleaved_stock_cols + interleaved_price_cols
            final_cols = [c for c in target_cols if c in current_df.columns]
            
            sheet_df = current_df[final_cols].fillna("").replace([np.inf, -np.inf], "")

            # Bulk export path: one sheet, no images — much faster for large MYR/IDR catalogs.
            if export_fast and not include_pictures:
                sheet_df.to_excel(writer, index=False, sheet_name=sheet_name, startrow=0)
                worksheet = writer.sheets[sheet_name]
                for col_num, value in enumerate(sheet_df.columns.values):
                    if value in interleaved_price_cols:
                        header_fmt = header_fmt_price
                    elif value == "Available Stock":
                        header_fmt = header_fmt_avail_stock
                    elif value in stock_cols:
                        header_fmt = header_fmt_stock
                    else:
                        header_fmt = header_fmt_dark
                    worksheet.write(0, col_num, value, header_fmt)
                for i, col_name in enumerate(final_cols):
                    if col_name == "SKU":
                        worksheet.set_column(i, i, 35)
                # Hide SKU photo link + name columns (same as full export; unhide in Excel if needed).
                for sku_col in sku_info_cols:
                    if sku_col in final_cols:
                        idx = final_cols.index(sku_col)
                        worksheet.set_column(idx, idx, 4, None, {"hidden": True})
                for _hide_name in hidden_detail_cols:
                    if _hide_name in final_cols:
                        _hi = final_cols.index(_hide_name)
                        worksheet.set_column(_hi, _hi, 4, None, {"hidden": True})
                for _hide_name in EXPORT_HIDDEN_COLUMNS:
                    if _hide_name in final_cols:
                        _hi = final_cols.index(_hide_name)
                        worksheet.set_column(_hi, _hi, 4, None, {"hidden": True})
                continue

            # Only create the sheet + header row; writing full data here then overwriting every
            # cell in the loop below doubled generation time for large exports.
            pd.DataFrame(columns=sheet_df.columns).to_excel(
                writer, index=False, sheet_name=sheet_name
            )
            worksheet = writer.sheets[sheet_name]

            for col_num, value in enumerate(sheet_df.columns.values):
                if value in interleaved_price_cols:
                    header_fmt = header_fmt_price
                elif value == "Available Stock":
                    header_fmt = header_fmt_avail_stock
                elif value in stock_cols:
                    header_fmt = header_fmt_stock
                else:
                    header_fmt = header_fmt_dark
                worksheet.write(0, col_num, value, header_fmt)
            
            for row_idx, row_data in enumerate(sheet_df.values):
                for col_idx, cell_data in enumerate(row_data):
                    col_name = sheet_df.columns[col_idx]
                    is_col_a = col_idx == 0
                    if "Link" in col_name:
                         link_value = str(cell_data)
                         img_bytes = _get_image_bytes(link_value)
                         if img_bytes:
                             worksheet.set_row(row_idx + 1, 48)
                             worksheet.write(row_idx + 1, col_idx, "", center_fmt)
                             worksheet.insert_image(
                                 row_idx + 1,
                                 col_idx,
                                 "img.jpg",
                                 {
                                     "image_data": io.BytesIO(img_bytes),
                                     "x_scale": 1.0,
                                     "y_scale": 1.0,
                                     "x_offset": max(0, (image_cell_w_px - frame_w_px) // 2),
                                     "y_offset": max(0, (image_cell_h_px - frame_h_px) // 2),
                                     "object_position": 1
                                 }
                             )
                         else:
                             worksheet.write(row_idx + 1, col_idx, link_value, link_fmt_a if is_col_a else link_fmt)
                    elif col_name in ["Product ID", "Variation ID", "SKU", "PID Name", "MID Name"] or "Name" in col_name:
                         worksheet.write(row_idx + 1, col_idx, str(cell_data), text_fmt_a if is_col_a else text_fmt)
                    elif col_name == "Available Stock":
                        if cell_data == "Invalid":
                            worksheet.write(
                                row_idx + 1, col_idx, cell_data,
                                invalid_fmt_a if is_col_a else invalid_fmt,
                            )
                        elif isinstance(cell_data, numbers.Real) and not isinstance(cell_data, bool):
                            worksheet.write(
                                row_idx + 1, col_idx, cell_data,
                                num_fmt_avail_a if is_col_a else num_fmt_avail,
                            )
                        else:
                            worksheet.write(
                                row_idx + 1, col_idx, str(cell_data),
                                text_fmt_avail_a if is_col_a else text_fmt_avail,
                            )
                    elif col_name == "Bundle Discount":
                        if cell_data == "":
                            worksheet.write(row_idx + 1, col_idx, "", left_fmt if is_col_a else center_fmt)
                        else:
                            try:
                                worksheet.write(
                                    row_idx + 1, col_idx, float(cell_data),
                                    percent_fmt_a if is_col_a else percent_fmt,
                                )
                            except Exception:
                                worksheet.write(row_idx + 1, col_idx, cell_data, left_fmt if is_col_a else center_fmt)
                    elif cell_data == "Invalid":
                        worksheet.write(row_idx + 1, col_idx, cell_data, invalid_fmt_a if is_col_a else invalid_fmt)
                    # numpy int/float (e.g. int64) are not isinstance of int/float; must write true numbers
                    # or Excel conditional formats on gap columns (numeric rules) will not apply.
                    elif isinstance(cell_data, numbers.Real) and not isinstance(cell_data, bool):
                        worksheet.write(row_idx + 1, col_idx, cell_data, num_fmt_a if is_col_a else num_fmt)
                    else:
                        worksheet.write(row_idx + 1, col_idx, str(cell_data), left_fmt if is_col_a else center_fmt)

            worksheet.set_column('A:B', 20)
            # Target Stock + inventory block: same compact width (SKU layout: Target Stock = col C)
            stock_block_width = 10

            for i, col_name in enumerate(final_cols):
                if col_name == "SKU":
                    worksheet.set_column(i, i, 35)
                elif "Link" in col_name and include_pictures:
                    worksheet.set_column(i, i, 9.5)
                elif col_name == "Target Stock":
                    worksheet.set_column(i, i, stock_block_width)
                elif col_name == "Available Stock":
                    worksheet.set_column(i, i, stock_block_width)
                elif col_name in stock_types or col_name == "Gap Available Stock" or (
                    col_name.startswith("Gap ") and any(col_name == f"Gap {st}" for st in stock_types)
                ):
                    worksheet.set_column(i, i, stock_block_width)
                elif col_name in PRICE_TYPES or col_name.startswith("Gap "):
                    worksheet.set_column(i, i, 16)

            for sku_col in sku_info_cols:
                if sku_col in final_cols:
                    idx = final_cols.index(sku_col)
                    if include_pictures and "Link" in sku_col:
                        worksheet.set_column(idx, idx, 10)
                    else:
                        worksheet.set_column(idx, idx, 4, None, {'hidden': True})

            current_gap_cols = [c for c in final_cols if c.startswith("Gap")]
            for col_name in current_gap_cols:
                col_idx = final_cols.index(col_name)
                col_letter = xlsxwriter.utility.xl_col_to_name(col_idx)
                last_row = len(sheet_df) + 1
                rng = f"{col_letter}2:{col_letter}{last_row}"
                worksheet.conditional_format(rng, {"type": "text", "criteria": "containing", "value": "Invalid", "format": invalid_fmt})
                if col_name in STOCK_GAP_COLUMN_NAMES:
                    # Stock gaps: >0 green, 0 yellow, <0 red
                    worksheet.conditional_format(rng, {"type": "cell", "criteria": "greater than", "value": 0, "format": green_bg})
                    worksheet.conditional_format(rng, {"type": "cell", "criteria": "equal to", "value": 0, "format": yellow_bg})
                    worksheet.conditional_format(rng, {"type": "cell", "criteria": "less than", "value": 0, "format": red_bg})
                else:
                    worksheet.conditional_format(rng, {"type": "cell", "criteria": "greater than or equal to", "value": 0, "format": green_bg})
                    worksheet.conditional_format(rng, {"type": "cell", "criteria": "less than", "value": 0, "format": red_bg})

            # Hide detailed stock columns (compact view by default).
            for _hide_name in hidden_detail_cols:
                if _hide_name in final_cols:
                    _hi = final_cols.index(_hide_name)
                    worksheet.set_column(_hi, _hi, 4, None, {"hidden": True})

            # Hide verbose informational columns by default.
            for _hide_name in EXPORT_HIDDEN_COLUMNS:
                if _hide_name in final_cols:
                    _hi = final_cols.index(_hide_name)
                    worksheet.set_column(_hi, _hi, 4, None, {"hidden": True})

    return output.getvalue()

def generate_template_file(method_type: str) -> bytes:
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        workbook = writer.book
        header_fmt = workbook.add_format({'bold': True, 'bg_color': '#D3D3D3', 'border': 1})
        
        if method_type == "Listing":
            df_check = pd.DataFrame(columns=["Product ID", "Variation ID", "Campaign Price", "Target Stock"])
            df_check.to_excel(writer, index=False, sheet_name='Check Price')
            
            df_mass = pd.DataFrame(columns=["PID", "Listing Name", "MID", "Variations", "Parent SKU", "SKU"])
            df_mass.to_excel(writer, index=False, sheet_name='Mass Update')
            
            for sheet in ['Check Price', 'Mass Update']:
                ws = writer.sheets[sheet]
                ws.set_column('A:F', 20)
                cols = df_check.columns if sheet == 'Check Price' else df_mass.columns
                for idx, col in enumerate(cols):
                    ws.write(0, idx, col, header_fmt)
        else:
            df_sku = pd.DataFrame(columns=["SKU", "Input Price", "Target Stock"])
            df_sku.to_excel(writer, index=False, sheet_name='Price Check')
            ws = writer.sheets['Price Check']
            ws.set_column('A:C', 25)
            for idx, col in enumerate(df_sku.columns):
                ws.write(0, idx, col, header_fmt)

    return output.getvalue()
