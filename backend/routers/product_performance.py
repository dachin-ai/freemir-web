from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from database import get_db
from services.product_performance_logic import (
    get_all_weeks, process_shopee_upload, process_tiktok_upload, process_converter_upload,
    get_converter_stats, get_store_name_map, compute_sku_performance, get_sku_comparison,
    get_sku_photo_map, get_at1_store_codes,
)
from models import ProductPerformance, PidStoreMap, SkuPerformance, FreemirName

router = APIRouter(prefix="/api/product-performance", tags=["Product Performance"])


@router.get("/weeks")
def list_weeks():
    return get_all_weeks()


@router.post("/upload/shopee")
async def upload_shopee(
    file: UploadFile = File(...),
    week_num: int = Form(...),
    db: Session = Depends(get_db),
):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")
    contents = await file.read()
    try:
        result = process_shopee_upload(db, contents, week_num)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload/tiktok")
async def upload_tiktok(
    file: UploadFile = File(...),
    week_num: int = Form(...),
    db: Session = Depends(get_db),
):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")
    contents = await file.read()
    try:
        result = process_tiktok_upload(db, contents, week_num)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/data")
def get_data(
    week: str = None,
    platform: str = None,
    store: str = None,
    db: Session = Depends(get_db),
):
    q = db.query(ProductPerformance)
    if week:
        q = q.filter(ProductPerformance.week == week)
    if platform:
        q = q.filter(ProductPerformance.platform == platform)
    if store:
        q = q.filter(ProductPerformance.store == store)
    rows = q.order_by(ProductPerformance.gmv.desc()).limit(500).all()
    return [
        {
            "id": r.id,
            "week": r.week,
            "week_start": r.week_start,
            "week_end": r.week_end,
            "platform": r.platform,
            "store": r.store,
            "pid": r.pid,
            "product_picture": r.product_picture,
            "product_name": r.product_name,
            "impression": r.impression,
            "visitor": r.visitor,
            "click": r.click,
            "unit": r.unit,
            "gmv": r.gmv,
            "ctr": r.ctr,
            "co": r.co,
        }
        for r in rows
    ]


@router.get("/summary")
def get_summary(db: Session = Depends(get_db)):
    """Return distinct weeks, platforms, stores for filter options."""
    from sqlalchemy import distinct
    weeks    = [r[0] for r in db.query(distinct(ProductPerformance.week)).all() if r[0]]
    platforms = [r[0] for r in db.query(distinct(ProductPerformance.platform)).all() if r[0]]
    stores   = [r[0] for r in db.query(distinct(ProductPerformance.store)).order_by(ProductPerformance.store).all() if r[0]]
    return {"weeks": weeks, "platforms": platforms, "stores": stores}


@router.get("/availability")
def get_availability(db: Session = Depends(get_db)):
    from sqlalchemy import distinct
    pairs = db.query(distinct(ProductPerformance.week), ProductPerformance.store).all()
    weeks = sorted({p[0] for p in pairs if p[0]})
    stores = sorted({p[1] for p in pairs if p[1]})
    store_week = {}
    for week, store in pairs:
        if not week or not store:
            continue
        store_week.setdefault(store, set()).add(week)

    return {
        "weeks": weeks,
        "stores": stores,
        "store_week": {k: sorted(v) for k, v in store_week.items()},
    }


@router.delete("/data")
def delete_data(week: str, platform: str, db: Session = Depends(get_db)):
    """Delete records for a specific week + platform (re-upload correction)."""
    deleted = db.query(ProductPerformance).filter(
        ProductPerformance.week == week,
        ProductPerformance.platform == platform,
    ).delete()
    db.commit()
    return {"deleted": deleted}


@router.delete("/data/week")
def delete_week(week: str, db: Session = Depends(get_db)):
    """Delete records for a specific week across all platforms."""
    deleted = db.query(ProductPerformance).filter(
        ProductPerformance.week == week,
    ).delete()
    db.commit()
    return {"deleted": deleted}


# ─────────────────────────────────────────────────────────────────
# CONVERTER ENDPOINTS
# ─────────────────────────────────────────────────────────────────

@router.get("/converter/stats")
def converter_stats(db: Session = Depends(get_db)):
    return get_converter_stats(db)


@router.get("/converter/data")
def converter_data(store: str = None, db: Session = Depends(get_db)):
    q = db.query(PidStoreMap)
    if store:
        q = q.filter(PidStoreMap.store == store)
    rows = q.order_by(PidStoreMap.store, PidStoreMap.pid).limit(2000).all()
    store_name_map = get_store_name_map()
    return [
        {
            "store_code": r.store,
            "store_name": store_name_map.get(r.store, r.store),
            "pid": r.pid,
            "mid": r.mid,
            "sku": r.sku,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.get("/converter/stores")
def converter_stores():
    """Return store codes from Google Sheet AT1 tab, column C (Code). Cached 5 min."""
    try:
        stores = get_at1_store_codes()
        return {"stores": stores}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/converter/upload-shopee")
async def converter_upload_shopee(
    file: UploadFile = File(...),
    store: str = Form(...),
    db: Session = Depends(get_db),
):
    if not file.filename.lower().endswith((".xlsx", ".xls", ".zip")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) or .zip are supported")
    contents = await file.read()
    try:
        result = process_converter_upload(db, contents, store, file.filename)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/converter/store")
def delete_converter_store(store: str, db: Session = Depends(get_db)):
    """Delete converter mappings for a single store code."""
    deleted = db.query(PidStoreMap).filter(PidStoreMap.store == store).delete()
    db.commit()
    return {"deleted": deleted}


# ─────────────────────────────────────────────────────────────────
# SKU BRAND ENDPOINTS
# ─────────────────────────────────────────────────────────────────

@router.post("/sku/compute")
def compute_sku(week: str, platform: str, db: Session = Depends(get_db)):
    """Trigger SKU brand aggregation. platform='All' computes Shopee + TikTok."""
    try:
        if platform.lower() == "all":
            results = []
            for p in ["Shopee", "TikTok"]:
                results.append(compute_sku_performance(db, week, p))
            total = sum(r["computed"] for r in results)
            return {"computed": total, "week": week, "platform": "All", "detail": results}
        result = compute_sku_performance(db, week, platform)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sku/summary")
def sku_summary(db: Session = Depends(get_db)):
    """Return distinct weeks, platforms, stores present in sku_performance."""
    from sqlalchemy import distinct
    weeks     = sorted([r[0] for r in db.query(distinct(SkuPerformance.week)).all() if r[0]])
    platforms = [r[0] for r in db.query(distinct(SkuPerformance.platform)).all() if r[0]]
    stores    = sorted([r[0] for r in db.query(distinct(SkuPerformance.store)).all() if r[0]])
    return {"weeks": weeks, "platforms": platforms, "stores": stores}


@router.get("/sku/availability")
def sku_availability(db: Session = Depends(get_db)):
    """Return which (week, store) pairs have been computed in sku_performance."""
    from sqlalchemy import distinct
    pairs = db.query(distinct(SkuPerformance.week), SkuPerformance.store).all()
    weeks = sorted({p[0] for p in pairs if p[0]})
    stores = sorted({p[1] for p in pairs if p[1]})
    store_week: dict = {}
    for week, store in pairs:
        if not week or not store:
            continue
        store_week.setdefault(store, set()).add(week)
    return {
        "weeks": weeks,
        "stores": stores,
        "store_week": {k: sorted(v) for k, v in store_week.items()},
    }


@router.get("/sku/data")
def sku_data(
    week: str = None,
    platform: str = None,
    store: str = None,
    sku: str = None,
    db: Session = Depends(get_db),
):
    q = db.query(SkuPerformance)
    if week:
        q = q.filter(SkuPerformance.week == week)
    if platform and platform.lower() != "all":
        q = q.filter(SkuPerformance.platform == platform)
    if store:
        q = q.filter(SkuPerformance.store == store)
    if sku:
        q = q.filter(SkuPerformance.sku.ilike(f"%{sku}%"))
    rows = q.order_by(SkuPerformance.gmv.desc()).limit(1000).all()
    # Enrich with product name + link from freemir_name
    skus = {r.sku for r in rows}
    name_map = {
        n.sku: n
        for n in db.query(FreemirName).filter(FreemirName.sku.in_(skus)).all()
    }
    # Get photos from product_performance.product_picture via PidStoreMap
    photo_map = get_sku_photo_map(db, skus)
    return [
        {
            "id": r.id,
            "week": r.week,
            "week_start": r.week_start,
            "week_end": r.week_end,
            "platform": r.platform,
            "store": r.store,
            "sku": r.sku,
            "product_name": name_map[r.sku].product_name if r.sku in name_map else None,
            "product_link": name_map[r.sku].link if r.sku in name_map else None,
            "mark": name_map[r.sku].mark if r.sku in name_map else None,
            "photo": (name_map[r.sku].link if r.sku in name_map else None) or photo_map.get(r.sku),
            "impression": r.impression,
            "visitor": r.visitor,
            "click": r.click,
            "unit": r.unit,
            "gmv": r.gmv,
            "ctr": r.ctr,
            "co": r.co,
            "pid_count": r.pid_count,
        }
        for r in rows
    ]


@router.get("/sku/comparison")
def sku_comparison(week_a: str, week_b: str, platform: str = "All", db: Session = Depends(get_db)):
    """Compare SKU performance between two periods. platform='All' includes both."""
    try:
        return get_sku_comparison(db, week_a, week_b, platform)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sku/data")
def delete_sku_data(week: str, platform: str, db: Session = Depends(get_db)):
    q = db.query(SkuPerformance).filter(SkuPerformance.week == week)
    if platform and platform.lower() != "all":
        q = q.filter(SkuPerformance.platform == platform)
    deleted = q.delete()
    db.commit()
    return {"deleted": deleted}
