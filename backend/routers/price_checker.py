from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Response, Depends
from services.permission_guard import require_tool_access
from fastapi.responses import JSONResponse
from database import SessionLocal
import pandas as pd
import io
import json
from services.price_checker_logic import (
    load_product_database,
    calculate_prices,
    generate_breakdown_table,
    clean_sku_list,
    PRICE_TYPES,
    STOCK_TYPES,
    CURRENCIES,
    normalize_currency,
    get_stock_types_for,
    generate_template_file,
    convert_df_to_excel_multisheet,
    sync_google_sheets_to_vps_postgres,
    upload_stock_data_to_google_sheet,
    resolve_photo_maps_for_skus,
)
from pydantic import BaseModel
from datetime import datetime, timezone

from services.tool_update_info import (
    TOOL_KEY_PRICE_CHECKER_STOCK,
    get_tool_info,
    upsert_tool_info,
)

router = APIRouter(prefix="/api/price-checker", tags=["price-checker"])

db_cache = {
    "price_db": None,
    "name_map": None,
    "link_map": None,
    "last_refresh": None,
    "sku_photo_map": {}
}

def get_db():
    import time
    # Auto-refresh cache if it's older than 30 minutes
    if not db_cache["price_db"] or (db_cache["last_refresh"] and (time.time() - db_cache["last_refresh"]) > 1800):
        refresh_db()
    return db_cache["price_db"], db_cache["name_map"], db_cache["link_map"]

@router.post("/sync", dependencies=[Depends(require_tool_access("price_checker"))])
def sync_database():
    """Sync Google Sheets to PostgreSQL database"""
    try:
        count = sync_google_sheets_to_vps_postgres()
        global db_cache
        db_cache["price_db"] = None
        db_cache["name_map"] = None
        db_cache["link_map"] = None
        return {
            "success": True,
            "message": f"Successfully synced {count} price records from Google Sheets to PostgreSQL database.",
            "records_synced": count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync: {str(e)}")


_MAX_KETERANGAN_LEN = 4000


@router.post("/upload-stock-data", dependencies=[Depends(require_tool_access("price_checker"))])
async def upload_stock_data(
    file: UploadFile = File(...),
    keterangan: str | None = Form(None),
):
    """Upload stock Excel and replace Google Sheet tab In-Stock (A:CA). Persists last upload time + optional note to PostgreSQL."""
    try:
        file_content = await file.read()
        if not file_content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        note = (keterangan or "").strip() or None
        if note and len(note) > _MAX_KETERANGAN_LEN:
            raise HTTPException(
                status_code=400,
                detail=f"Keterangan terlalu panjang (maks {_MAX_KETERANGAN_LEN} karakter).",
            )
        result = upload_stock_data_to_google_sheet(file_content)
        db = SessionLocal()
        try:
            saved = upsert_tool_info(db, TOOL_KEY_PRICE_CHECKER_STOCK, note)
        finally:
            db.close()
        return {
            "success": True,
            "message": f"Stock data uploaded to {result['sheet']} ({result['rows_uploaded']} rows).",
            "last_uploaded_at": saved["last_uploaded_at"],
            "keterangan": saved.get("keterangan"),
            "waktu": saved.get("waktu"),
            **result
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload stock data: {str(e)}")


class StockUploadInfoPatch(BaseModel):
    keterangan: str | None = None


@router.patch("/upload-stock-data/info", dependencies=[Depends(require_tool_access("price_checker"))])
def patch_stock_upload_info(body: StockUploadInfoPatch):
    """Update keterangan saja (baris yang sama di DB), tanpa upload file. Waktu upload terakhir tidak diubah."""
    note = (body.keterangan or "").strip() or None
    if note and len(note) > _MAX_KETERANGAN_LEN:
        raise HTTPException(
            status_code=400,
            detail=f"Keterangan terlalu panjang (maks {_MAX_KETERANGAN_LEN} karakter).",
        )
    db = SessionLocal()
    try:
        from models import ToolUpdateInfo
        row = db.query(ToolUpdateInfo).filter(
            ToolUpdateInfo.tool_key == TOOL_KEY_PRICE_CHECKER_STOCK
        ).first()
        if not row:
            raise HTTPException(
                status_code=404,
                detail="Belum ada riwayat upload stok. Unggah file dulu.",
            )
        row.keterangan = note
        db.commit()
        db.refresh(row)
        waktu_iso = row.waktu.isoformat() if row.waktu else None
        return {
            "success": True,
            "keterangan": row.keterangan,
            "waktu": waktu_iso,
            "last_uploaded_at": waktu_iso,
        }
    finally:
        db.close()


@router.get("/upload-stock-data/status", dependencies=[Depends(require_tool_access("price_checker"))])
def get_stock_upload_status():
    db = SessionLocal()
    try:
        info = get_tool_info(db, TOOL_KEY_PRICE_CHECKER_STOCK)
    finally:
        db.close()
    if not info:
        return {"last_uploaded_at": None, "keterangan": None, "waktu": None}
    return {
        "last_uploaded_at": info.get("last_uploaded_at"),
        "keterangan": info.get("keterangan"),
        "waktu": info.get("waktu"),
    }

@router.get("/refresh", dependencies=[Depends(require_tool_access("price_checker"))])
def refresh_db():
    import time
    global db_cache
    db_cache["price_db"] = None
    db_cache["name_map"] = None
    db_cache["link_map"] = None
    db_cache["last_refresh"] = None
    db_cache["sku_photo_map"] = {}
    
    p, n, l = load_product_database()
    if not p:
         raise HTTPException(status_code=500, detail="Failed to connect to spreadsheet")
    db_cache["price_db"] = p
    db_cache["name_map"] = n
    db_cache["link_map"] = l
    db_cache["last_refresh"] = time.time()
    return {"message": "Success", "records": len(p)}

@router.get("/template/{method}", dependencies=[Depends(require_tool_access("price_checker"))])
def get_template(method: str):
    if method not in ["Listing", "SKU"]:
        raise HTTPException(status_code=400, detail="Method must be Listing or SKU")
    file_bytes = generate_template_file(method)
    headers = {
        'Content-Disposition': f'attachment; filename="Price_Checker_{method}_Template.xlsx"'
    }
    return Response(content=file_bytes, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)

class DirectInput(BaseModel):
    sku_string: str
    target_price: float
    target_stock: int = 0
    currency: str = CURRENCIES[0]


def _material_preview_response(db, material_id: str) -> Response:
    from services.brand_material_logic import get_material_preview

    try:
        data, mime = get_material_preview(db, material_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        code = str(e)
        if code in ("NOT_FOUND", "FILE_NOT_FOUND", "NO_PREVIEW"):
            raise HTTPException(status_code=404, detail=code) from e
        raise HTTPException(status_code=400, detail=code) from e

    return Response(
        content=data,
        media_type=mime,
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.get("/material-preview/{material_id}", dependencies=[Depends(require_tool_access("price_checker"))])
def material_preview(material_id: str):
    """Thumbnail for Direct checker — no SKU lookup (use id from calculate-direct)."""
    db = SessionLocal()
    try:
        return _material_preview_response(db, material_id)
    finally:
        db.close()


@router.get("/sku-photo/{sku}", dependencies=[Depends(require_tool_access("price_checker"))])
def sku_main_photo(sku: str):
    """Legacy: resolve SKU → main photo. Prefer /material-preview/{id} when id is known."""
    import re
    from services.brand_material_logic import get_brand_main_photo_map

    sku_norm = (sku or "").strip().upper()
    if not re.match(r"^[A-Z]{2}\d{4}[A-Z]\d{5}$", sku_norm):
        raise HTTPException(status_code=400, detail="Invalid SKU format")

    db = SessionLocal()
    try:
        meta = get_brand_main_photo_map(db, {sku_norm})
        material_id = (meta.get(sku_norm) or {}).get("materialId")
        if not material_id:
            raise HTTPException(status_code=404, detail="NO_MAIN_PHOTO")
        return _material_preview_response(db, material_id)
    finally:
        db.close()


@router.post("/calculate-direct", dependencies=[Depends(require_tool_access("price_checker"))])
def calc_direct(body: DirectInput):
    price_db, name_map, link_map = get_db()
    if not price_db:
        raise HTTPException(status_code=500, detail="Database not loaded")

    currency = normalize_currency(body.currency)
    stock_types = get_stock_types_for(currency)

    skus = clean_sku_list(body.sku_string)
    db = SessionLocal()
    try:
        brand_photo_meta_map, photo_map = resolve_photo_maps_for_skus(db, set(skus))
    finally:
        db.close()

    price_info = calculate_prices(
        body.sku_string,
        price_db,
        name_map,
        link_map,
        photo_map=photo_map,
        brand_photo_meta_map=brand_photo_meta_map,
        currency=currency,
    )
    breakdown = generate_breakdown_table(
        body.sku_string, price_db, name_map, currency=currency
    )
    
    eval_data = []
    for pt in PRICE_TYPES:
        sys_price = price_info.get(pt, "Invalid")
        if sys_price == "Invalid":
            gap_val = "Invalid"
            status = "🚫"
        else:
            gap_val = body.target_price - float(sys_price)
            status = "✅ Safe" if gap_val >= 0 else "⚠️ Under"
            
        eval_data.append({
            "Tier": pt,
            "SystemPrice": sys_price,
            "TargetPrice": body.target_price,
            "Gap": gap_val,
            "Status": status
        })

    stock_eval_data = []
    for st in stock_types:
        current_stock = int(price_info.get(st, 0) or 0)
        gap_stock = current_stock - int(body.target_stock)
        if gap_stock > 0:
            stock_status = "✅ Safe"
        elif gap_stock == 0:
            stock_status = "⚠️ No Stock Left"
        else:
            stock_status = "❌ Need Restock"
        stock_eval_data.append({
            "StockType": st,
            "CurrentStock": current_stock,
            "TargetStock": int(body.target_stock),
            "Gap": gap_stock,
            "Status": stock_status,
        })
        
    return {
        "currency": currency,
        "stock_types": stock_types,
        "summary": {
            "bundle_discount": price_info.get("Bundle Discount"),
            "clearance": price_info.get("Mark Clearance"),
            "gift": price_info.get("Mark Gift"),
            "gift_discount": price_info.get("Gift Discount", 0.0),
            "available_stock": price_info.get("Available Stock", "No Stock"),
        },
        "items": price_info.get("sku_items", []),
        "breakdown": breakdown,
        "evaluation": eval_data,
        "stock_evaluation": stock_eval_data,
    }

@router.post("/calculate-batch", dependencies=[Depends(require_tool_access("price_checker"))])
async def calc_batch(
    method: str = Form(...),
    include_pictures: bool = Form(False),
    currency: str = Form(CURRENCIES[0]),
    file: UploadFile = File(...)
):
    if method not in ["Listing", "SKU"]:
        raise HTTPException(status_code=400, detail="Method must be Listing or SKU")

    currency = normalize_currency(currency)
    stock_types = get_stock_types_for(currency)

    # Read once: SpooledTemporaryFile streams cannot be reliably re-read after the
    # first await, and re-reading is wasted I/O even when it does succeed.
    max_file_size = 10 * 1024 * 1024  # 10MB limit for Cloud Run
    contents = await file.read()
    if len(contents) > max_file_size:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {max_file_size // (1024*1024)}MB",
        )

    price_db, name_map, link_map = get_db()
    
    try:
        if method == "Listing":
            try:
                df_check = pd.read_excel(io.BytesIO(contents), sheet_name="Check Price")
                df_mass = pd.read_excel(io.BytesIO(contents), sheet_name="Mass Update")
            except Exception as e:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Failed to read Excel file. Please ensure it has 'Check Price' and 'Mass Update' sheets. Error: {str(e)}"
                )
            
            # Row limit validation for production
            max_rows = 5000  # Raised limit per business request
            if len(df_check) > max_rows:
                raise HTTPException(
                    status_code=413, 
                    detail=f"Too many rows. Maximum {max_rows} rows allowed. Found {len(df_check)} rows."
                )
            
            col_pid, col_var_id, col_camp_price = df_check.columns[:3]
            col_target_stock = df_check.columns[3] if len(df_check.columns) > 3 else None
            col_target_price = col_camp_price
            col_mass_pid, col_mass_name, col_mass_mid, col_mass_varname, col_mass_parent, col_mass_sku = df_mass.columns[:6]
            
            df_check[col_pid] = df_check[col_pid].astype(str).str.strip()
            df_check[col_var_id] = df_check[col_var_id].astype(str).str.strip()
            df_mass[col_mass_pid] = df_mass[col_mass_pid].astype(str).str.strip()
            df_mass[col_mass_mid] = df_mass[col_mass_mid].astype(str).str.strip()
            
            df_mass['Final_SKU'] = df_mass[col_mass_sku].fillna("")
            df_mass['Final_SKU'] = df_mass.apply(lambda x: x[col_mass_parent] if x['Final_SKU'] == "" or pd.isna(x['Final_SKU']) else x['Final_SKU'], axis=1)

            pid_name_map = df_mass.drop_duplicates(subset=col_mass_pid).set_index(col_mass_pid)[col_mass_name].to_dict()
            mid_name_map = df_mass.drop_duplicates(subset=col_mass_mid).set_index(col_mass_mid)[col_mass_varname].to_dict()
            mid_sku_map = df_mass.drop_duplicates(subset=col_mass_mid).set_index(col_mass_mid)['Final_SKU'].to_dict()
            
            df_check["PID Name"] = df_check[col_pid].map(pid_name_map)
            df_check["MID Name"] = df_check[col_var_id].map(mid_name_map)
            df_check["SKU"] = df_check[col_var_id].map(mid_sku_map)
            if col_target_stock is None:
                col_target_stock = "Target Stock"
                df_check[col_target_stock] = 0
            df_check[col_target_stock] = pd.to_numeric(df_check[col_target_stock], errors='coerce').fillna(0).astype(int)
            
            df_final = df_check
        else:
            try:
                df_sku = pd.read_excel(io.BytesIO(contents), sheet_name=0) 
            except Exception as e:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Failed to read Excel file. Error: {str(e)}"
                )
            
            # Row limit validation for production
            max_rows = 5000  # Raised limit per business request
            if len(df_sku) > max_rows:
                raise HTTPException(
                    status_code=413, 
                    detail=f"Too many rows. Maximum {max_rows} rows allowed. Found {len(df_sku)} rows."
                )
            
            if len(df_sku.columns) >= 3:
                df_sku = df_sku.iloc[:, :3]
                df_sku.columns = ["SKU", "Input Price", "Target Stock"]
            else:
                df_sku.columns = ["SKU", "Input Price"]
                df_sku["Target Stock"] = 0
            df_sku["SKU"] = df_sku["SKU"].astype(str).str.strip()
            col_target_price = "Input Price"
            col_target_stock = "Target Stock"
            df_final = df_sku

        # PERFORMANCE OPTIMIZATION: Collect all unique SKUs first, then batch fetch photo_map
        all_skus = set()
        for _, row in df_final.iterrows():
            sku_val = row["SKU"]
            skus_list = clean_sku_list(sku_val)
            all_skus.update(skus_list)
        
        # Single DB call for all photo maps
        db = SessionLocal()
        try:
            brand_photo_meta_map, photo_map = resolve_photo_maps_for_skus(db, all_skus)
        except Exception as e:
            print(f"[ERROR] Failed to get photo maps: {e}")
            brand_photo_meta_map = {}
            photo_map = {}
        finally:
            db.close()

        # Now process with cached photo_map with error handling
        calc_results = []
        failed_rows = []

        def _invalid_result():
            r = {p_type: "Invalid" for p_type in PRICE_TYPES}
            for stock_type in stock_types:
                r[stock_type] = 0
            r["Available Stock"] = "No Stock"
            r["currency"] = currency
            r["stock_types"] = stock_types
            r["sku_items"] = []
            return r

        for index, row in df_final.iterrows():
            try:
                sku_val = row["SKU"]
                sku_str = str(sku_val).strip() if not pd.isna(sku_val) else ""
                if not sku_str or len(sku_str) < 12:
                    failed_rows.append(index)
                    calc_results.append(_invalid_result())
                    continue
                    
                price_info = calculate_prices(
                    sku_val,
                    price_db,
                    name_map,
                    link_map,
                    photo_map=photo_map,
                    brand_photo_meta_map=brand_photo_meta_map,
                    currency=currency,
                )
                calc_results.append(price_info)
                
            except Exception as e:
                print(f"[ERROR] Failed to process row {index}: {e}")
                calc_results.append(_invalid_result())
                failed_rows.append(index)
        
        price_df = pd.DataFrame(calc_results)
        final_df = pd.concat([df_final, price_df], axis=1)
        
        final_df[col_target_price] = pd.to_numeric(final_df[col_target_price], errors='coerce').fillna(0)
        final_df[col_target_stock] = pd.to_numeric(final_df[col_target_stock], errors='coerce').fillna(0).astype(int)
        
        # Vectorized gap computation: previously this looped 16 price tiers and
        # called df.apply(axis=1) per tier, which is O(rows × tiers) python-level
        # iteration. The same logic done column-wise via pd.to_numeric is O(rows).
        target_price_series = final_df[col_target_price]
        for p_type in PRICE_TYPES:
            numeric_sys = pd.to_numeric(final_df[p_type], errors="coerce")
            gap_series = target_price_series - numeric_sys
            # Preserve the legacy contract: "Invalid" string when system price is non-numeric.
            final_df[f"Gap {p_type}"] = gap_series.where(numeric_sys.notna(), "Invalid")

        for stock_type in stock_types:
            final_df[f"Gap {stock_type}"] = (
                pd.to_numeric(final_df[stock_type], errors="coerce").fillna(0).astype(int)
                - final_df[col_target_stock]
            )
        final_df["Gap Available Stock"] = pd.to_numeric(
            final_df["Available Stock"].astype(str).str.extract(r"^(\d+)")[0], errors="coerce"
        ).fillna(0).astype(int) - final_df[col_target_stock]

        try:
            excel_bytes = convert_df_to_excel_multisheet(
                final_df, method, include_pictures=include_pictures, currency=currency
            )
        except Exception as e:
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to generate Excel file. Error: {str(e)}"
            )
        
        import base64
        import math
        b64_str = base64.b64encode(excel_bytes).decode('utf-8')
        
        total_rows = len(final_df)
        processed_rows = total_rows - len(failed_rows)
        invalid_rows = 0
        
        preview_fields = ["SKU"]
        if method == "Listing":
            preview_fields.extend([col_camp_price, "Warning", "Gap Warning", "Available Stock"])
        else:
            preview_fields.extend([col_target_price, "Warning", "Gap Warning", "Available Stock"])
            
        if "Gap Warning" in final_df.columns:
            invalid_rows = len(final_df[final_df["Gap Warning"] == "Invalid"])
            
        valid_rows = total_rows - invalid_rows
        preview_cols_exist = [c for c in preview_fields if c in final_df.columns]
        preview_df = final_df[preview_cols_exist].head(10).fillna("")
        preview_list = preview_df.to_dict(orient="records")
        
        # Sanitize any remaining float('nan') or float('inf') which break JSONResponse
        def sanitize_val(v):
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                return ""
            return v
            
        cleaned_preview = [
            {k: sanitize_val(v) for k, v in row.items()} 
            for row in preview_list
        ]
        
        return JSONResponse(content={
            "currency": currency,
            "stock_types": stock_types,
            "summary": {
                "total": int(total_rows),
                "processed": int(total_rows - len(failed_rows)),
                "valid": int(valid_rows),
                "invalid": int(invalid_rows),
                "failed": len(failed_rows)
            },
            "preview": cleaned_preview,
            "file_base64": b64_str,
            "processing_info": {
                "file_size_mb": round(len(contents) / (1024*1024), 2),
                "method": method,
                "currency": currency,
                "has_photo_data": len(photo_map) > 0,
                "failed_row_indices": failed_rows[:10] if failed_rows else []
            }
        })

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print("ERROR IN CALC BATCH:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
