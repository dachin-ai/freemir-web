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

SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1aS1wpEJ5jIYFYYsZT1U4-gabyb5XwGn4u1-OpRhiucc"

if os.path.exists("/etc/secrets/credentials.json"):
    CREDENTIALS_FILE = "/etc/secrets/credentials.json"
else:
    CREDENTIALS_FILE = "credentials.json"

PRICE_TYPES = [
    "Warning", "Daily-Discount", "Daily-Livestream", "Daily-Mid-Creator",
    "Daily-Top-Creator", "Daily-FS", "Daily-Shopee-FS", "DD-FS",
    "DD-Shoptab", "DD-Livestream", "DD-Mid-Creator", "DD-Top-Creator",
    "PD-Shoptab", "PD-Livestream", "PD-Mid-Creator", "PD-Top-Creator"
]
STOCK_TYPES = [
    "IDR-Ready", "SBY-Ready",
    "IDR-Lock", "SBY-Lock",
    "IDR-OTW", "SBY-OTW",
]

# Stock-related "Gap *" columns in export (tri-color: >0 green, 0 yellow, <0 red)
STOCK_GAP_COLUMN_NAMES = frozenset(
    ["Gap Available Stock"] + [f"Gap {st}" for st in STOCK_TYPES]
)

# Listing export: secondary warehouse columns (non-primary). Hidden with the same set_column(...)
# API as SKU Name/Link columns — per-index hidden works reliably; letter range O:V does not in some clients.
LISTING_STOCK_DETAIL_COLS_HIDDEN = (
    "SBY-Ready",
    "Gap SBY-Ready",
    "IDR-Lock",
    "Gap IDR-Lock",
    "SBY-Lock",
    "Gap SBY-Lock",
    "IDR-OTW",
    "Gap IDR-OTW",
    "SBY-OTW",
    "Gap SBY-OTW",
)

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


def load_product_database() -> Tuple[Dict, Dict, Dict]:
    global _cached_price_db, _cached_name_map, _cached_link_map
    if _cached_price_db is not None:
        return _cached_price_db, _cached_name_map, _cached_link_map
        
    db = SessionLocal()
    try:
        prices = db.query(FreemirPrice).all()
        names = db.query(FreemirName).all()
        
        price_db = {}
        for p in prices:
            item = {"Category": p.category, "Clearance": p.clearance}
            raw_prices = p.prices
            if isinstance(raw_prices, dict):
                item.update(raw_prices)
            elif isinstance(raw_prices, str):
                text = raw_prices.strip()
                if text:
                    try:
                        parsed = json.loads(text)
                        if isinstance(parsed, dict):
                            item.update(parsed)
                    except Exception:
                        # Keep working even if legacy/corrupted rows exist.
                        pass
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
        print("[Sync] Fetching SKU_Info worksheet...")
        try:
            sku_info_ws = sh.worksheet("SKU_Info")
            sku_info_data = sku_info_ws.get_all_values()

            if sku_info_data:
                sku_info_cols = [str(c).strip() for c in sku_info_data[0]]
                df_sku_info = pd.DataFrame(sku_info_data[1:], columns=sku_info_cols)
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
                clear_col = col("Clearance")
                name_col = col("Product-Name", "Product Name", "Name", "English Name")
                link_col = col("Link", "Product Link", "URL", "Image", "Image URL", "Pic")
                mark_col = col("Mark")

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
                    clear_val = str(row[clear_col]).strip() if clear_col and clear_col in row else ""
                    raw_name = str(row[name_col]).strip() if name_col and name_col in row else ""
                    raw_link = str(row[link_col]).strip() if link_col and link_col in row else ""
                    raw_mark = str(row[mark_col]).strip() if mark_col and mark_col in row else ""

                    prices_dict = {}
                    for pt in PRICE_TYPES:
                        if pt in row and str(row[pt]).strip():
                            try:
                                prices_dict[pt] = float(str(row[pt]).replace(",", ""))
                            except:
                                pass
                    for st in STOCK_TYPES:
                        if st in row:
                            prices_dict[st] = parse_stock_value(row[st])

                    for sku in expand_skus(raw_sku):
                        skus_to_update[sku] = {
                            'sku': sku,
                            'category': cat_val,
                            'clearance': clear_val,
                            'prices': prices_dict
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
    parts = re.split(r'[+\-,|]+', str(sku_string))
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

def generate_breakdown_table(sku_string: str, price_db: Dict, name_map: Dict) -> List[Dict]:
    skus = clean_sku_list(sku_string)
    sku_count = len(skus)
    if sku_count == 0: return []

    base_disc = get_bundle_discount_rate(sku_count)
    breakdown_data = []

    has_normal = False
    for sku in skus:
        cat = str(price_db.get(sku, {}).get("Category", "")).lower()
        if "gift" not in cat:
            has_normal = True

    total_raw_warning = 0.0
    total_discounted_warning = 0.0
    for sku in skus:
        item_data = price_db.get(sku, {})
        cat = str(item_data.get("Category", "")).lower()
        is_gift = "gift" in cat
        gift_factor = 0.5 if is_gift and sku_count > 1 and has_normal else 1.0

        c_val = parse_idr_price(item_data.get("Clearance", 0))
        is_clearance = c_val >= 1
        raw_base = item_data.get("Warning", 0)
        base_price_float = parse_idr_price(raw_base)

        if is_clearance:
            total_raw_warning += c_val
            total_discounted_warning += c_val
        else:
            total_raw_warning += base_price_float
            total_discounted_warning += base_price_float * gift_factor * (1 - base_disc)

    hit_floor = total_discounted_warning < total_raw_warning

    for sku in skus:
        item_data = price_db.get(sku, {})
        name = name_map.get(sku, "-")
        cat = str(item_data.get("Category", "")).lower()
        is_gift = "gift" in cat
        gift_factor = 0.5 if is_gift and sku_count > 1 and has_normal else 1.0

        c_val = parse_idr_price(item_data.get("Clearance", 0))
        is_clearance = c_val >= 1

        raw_base = item_data.get("Warning", 0)
        base_price_float = parse_idr_price(raw_base)

        if is_clearance:
            final_price = c_val
            logic_applied = "Clearance Override"
        else:
            if hit_floor:
                final_price = base_price_float
                logic_applied = "Floor Protection Applied"
            else:
                final_price = base_price_float * gift_factor * (1 - base_disc)
                logic_list = []
                if is_gift and sku_count > 1 and has_normal: logic_list.append("Gift (50%)")
                if base_disc > 0: logic_list.append(f"Bundle Disc ({base_disc*100}%)")
                logic_applied = " + ".join(logic_list) if logic_list else "Normal Price"

        breakdown_data.append({
            "SKU": sku,
            "Product Name": name,
            "Base Price (Warning)": int(base_price_float),
            "Logic Applied": logic_applied,
            "Total Contribution (IDR)": int(round(final_price)),
            **{st: parse_stock_value(item_data.get(st, 0)) for st in STOCK_TYPES}
        })

    return breakdown_data

def calculate_prices(sku_string: str, price_db: Dict, name_map: Dict, link_map: Dict, photo_map: Dict = None) -> Dict:
    skus = clean_sku_list(sku_string)
    sku_count = len(skus)
    result = {}
    sku_items = []
    categories_per_sku = []
    
    # Only open DB connection if photo_map not provided
    if photo_map is None:
        db = SessionLocal()
        try:
            photo_map = get_sku_photo_map(db, set(skus))
        finally:
            db.close()

    for i, sku in enumerate(skus):
        idx = i + 1
        raw_name = name_map.get(sku, "") or ""
        sku_name = _normalize_sku_name(sku, raw_name)
        sku_link = link_map.get(sku, "") or ""
        image_url = None
        if _is_image_url(sku_link):
            image_url = sku_link
        elif photo_map.get(sku):
            image_url = photo_map.get(sku)

        result[f"SKU {idx} Name"] = sku_name
        result[f"SKU {idx} Link"] = sku_link
        sku_items.append({
            "sku": sku,
            "name": sku_name,
            "link": sku_link,
            "image": image_url,
            "stock": {st: parse_stock_value(price_db.get(sku, {}).get(st, 0)) for st in STOCK_TYPES}
        })
        category_value = str(price_db.get(sku, {}).get("Category", "")).strip()
        categories_per_sku.append((sku, category_value))

    if sku_count == 0:
        result.update({
            "Bundle Discount": 0, "Mark Clearance": "-", "Mark Gift": "-",
            **{k: "Invalid" for k in PRICE_TYPES},
            **{k: 0 for k in STOCK_TYPES},
            "Available Stock": "No Stock",
            "sku_items": []
        })
        return result

    base_discount_rate = get_bundle_discount_rate(sku_count)
    total_prices = {k: 0.0 for k in PRICE_TYPES}
    is_valid = {k: True for k in PRICE_TYPES} 
    
    has_clearance = False
    has_gift = False
    all_skus_found = True
    
    for sku in skus:
        if not price_db.get(sku):
            all_skus_found = False
            break
    
    if not all_skus_found:
        result.update({
            "Bundle Discount": "", "Mark Clearance": "", "Mark Gift": "",
            **{k: "Invalid" for k in PRICE_TYPES},
            **{k: 0 for k in STOCK_TYPES},
            "Available Stock": "No Stock"
        })
        return result

    has_normal = False
    absolute_floor = 0.0

    for sku in skus:
        item_data = price_db.get(sku)
        cat = str(item_data.get("Category", "")).lower()
        if "gift" not in cat:
            has_normal = True
        
        c_val = parse_idr_price(item_data.get("Clearance", 0))
        if c_val >= 1:
            absolute_floor += c_val
        else:
            w_val = parse_idr_price(item_data.get("Warning", 0))
            absolute_floor += w_val

    for sku in skus:
        item_data = price_db.get(sku)
        col_cat, col_clearance = "Category", "Clearance"
        
        category = str(item_data.get(col_cat, "")).lower()
        if "gift" in category: has_gift = True
        
        gift_factor = 0.5 if "gift" in category and sku_count > 1 and has_normal else 1.0
        
        c_val = parse_idr_price(item_data.get(col_clearance, 0))
        is_clearance_item = c_val >= 1
            
        if is_clearance_item:
            has_clearance = True
            item_prices = {k: c_val for k in PRICE_TYPES}
            item_disc = 0.0
        else:
            item_prices = {}
            item_disc = base_discount_rate
            for p_type in PRICE_TYPES:
                val = parse_idr_price(item_data.get(p_type, 0))
                if val >= 1: item_prices[p_type] = val
                else:
                    item_prices[p_type] = 0
                    is_valid[p_type] = False 

        for p_type in PRICE_TYPES:
            total_prices[p_type] += item_prices[p_type] * gift_factor * (1 - item_disc)

    final_discount_display = 0.0 if has_clearance else base_discount_rate
    bundle_stock = {}
    for st in STOCK_TYPES:
        per_sku_stock = [parse_stock_value(price_db.get(sku, {}).get(st, 0)) for sku in skus]
        bundle_stock[st] = min(per_sku_stock) if per_sku_stock else 0

    result.update({
        "Bundle Discount": final_discount_display,
        "Mark Clearance": "Yes" if has_clearance else "-",
        "Mark Gift": "Yes" if has_gift else "-",
        "Category": "+".join([cat if cat else "-" for _, cat in categories_per_sku]),
        **bundle_stock,
        "Available Stock": summarize_bundle_stock(bundle_stock),
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

def convert_df_to_excel_multisheet(df: pd.DataFrame, method: str = "Listing", include_pictures: bool = False) -> bytes:
    import xlsxwriter
    output = io.BytesIO()
    image_cache: Dict[str, bytes | None] = {}
    frame_w_px = 56
    frame_h_px = 56
    image_cell_w_px = 68
    image_cell_h_px = 64

    def _make_framed_thumbnail(raw_bytes: bytes) -> bytes | None:
        try:
            with Image.open(io.BytesIO(raw_bytes)) as img:
                # Normalize to RGB and fit image into fixed frame area.
                img = img.convert("RGB")
                inner_w = frame_w_px - 8
                inner_h = frame_h_px - 8
                fitted = ImageOps.contain(img, (inner_w, inner_h), method=Image.Resampling.LANCZOS)

                canvas = Image.new("RGB", (frame_w_px, frame_h_px), color=(245, 248, 252))
                x = (frame_w_px - fitted.width) // 2
                y = (frame_h_px - fitted.height) // 2
                canvas.paste(fitted, (x, y))

                # Draw a subtle border frame.
                border_color = (180, 188, 200)
                for i in range(1):
                    canvas.paste(border_color, [i, i, frame_w_px - i, i + 1])
                    canvas.paste(border_color, [i, frame_h_px - i - 1, frame_w_px - i, frame_h_px - i])
                    canvas.paste(border_color, [i, i, i + 1, frame_h_px - i])
                    canvas.paste(border_color, [frame_w_px - i - 1, i, frame_w_px - i, frame_h_px - i])

                out = io.BytesIO()
                canvas.save(out, format="JPEG", quality=88, optimize=True)
                return out.getvalue()
        except (UnidentifiedImageError, OSError, ValueError):
            return None

    def _get_image_bytes(url: str) -> bytes | None:
        if not include_pictures:
            return None
        if not _is_image_url(url):
            return None
        if url in image_cache:
            return image_cache[url]
        try:
            resp = requests.get(url, timeout=3)
            if resp.status_code == 200 and resp.content:
                image_cache[url] = _make_framed_thumbnail(resp.content)
            else:
                image_cache[url] = None
        except Exception:
            image_cache[url] = None
        return image_cache[url]

    with pd.ExcelWriter(output, engine='xlsxwriter', engine_kwargs={'options': {'nan_inf_to_errors': True}}) as writer:
        workbook = writer.book
        
        header_fmt_dark = workbook.add_format({'bold': True, 'bg_color': '#0c2461', 'font_color': 'white', 'border': 1, 'align': 'center', 'valign': 'vcenter', 'text_wrap': True})
        header_fmt_stock = workbook.add_format({'bold': True, 'bg_color': '#DCFCE7', 'font_color': '#14532D', 'border': 1, 'align': 'center', 'valign': 'vcenter', 'text_wrap': True})
        header_fmt_price = workbook.add_format({'bold': True, 'bg_color': '#DBEAFE', 'font_color': '#1E3A8A', 'border': 1, 'align': 'center', 'valign': 'vcenter', 'text_wrap': True})
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
            'align': 'center', 'valign': 'vcenter', 'text_wrap': True,
        })
        num_fmt_avail = workbook.add_format({
            'num_format': '0', 'border': 1, 'align': 'center', 'valign': 'vcenter', 'text_wrap': True,
        })
        num_fmt_avail_a = workbook.add_format({
            'num_format': '0', 'border': 1, 'align': 'left', 'valign': 'vcenter', 'text_wrap': True,
        })
        text_fmt_avail = workbook.add_format({
            'num_format': '@', 'border': 1, 'align': 'center', 'valign': 'vcenter', 'text_wrap': True,
        })
        text_fmt_avail_a = workbook.add_format({
            'num_format': '@', 'border': 1, 'align': 'left', 'valign': 'vcenter', 'text_wrap': True,
        })

        sku_info_cols = [c for c in df.columns if re.match(r'SKU \d+ (Name|Link)', c)]
        sku_info_cols.sort(key=lambda x: (int(x.split()[1]), x.split()[2]))

        if method == "Listing":
            core_cols = ["Product ID", "PID Name", "Variation ID", "MID Name", "Campaign Price", "Target Stock", "SKU"]
        else:
            core_cols = ["SKU", "Input Price", "Target Stock"]
            
        identity_cols = ["Bundle Discount", "Mark Clearance", "Mark Gift"]
        stock_cols = ["Available Stock", "Gap Available Stock"] + STOCK_TYPES + [f"Gap {st}" for st in STOCK_TYPES]

        processing_sheets = [("All", PRICE_TYPES), ("Reminder", PRICE_TYPES)]
        for sc in SHEET_CONFIG:
            if sc[0] == "All": continue 
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
            for st in STOCK_TYPES:
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
                elif col_name in STOCK_TYPES or col_name == "Gap Available Stock" or col_name.startswith("Gap IDR-") or col_name.startswith("Gap SBY-"):
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
            for _hide_name in LISTING_STOCK_DETAIL_COLS_HIDDEN:
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
