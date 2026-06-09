import traceback

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import SessionLocal
from services.ads_monitor_logic import (
    analyze_ads_file_b64,
    get_monthly_report,
    get_tiktok_stores,
    list_discovered_accounts,
    list_internal_creators,
    save_internal_creators,
    save_bulk_manual_records,
    save_manual_daily_record,
    delete_daily_record,
    delete_month_records,
)
from services.permission_guard import require_tool_access

router = APIRouter(prefix="/api/ads-monitor", tags=["Ads Monitor"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class AnalyzeBody(BaseModel):
    filename: str
    content_b64: str
    data_date: str
    store_code: str


class InternalCreatorsBody(BaseModel):
    accounts: list[str] = Field(default_factory=list)


class SegmentInput(BaseModel):
    cost: float = 0
    gmv: float = 0


class ManualImportBody(BaseModel):
    store_code: str
    data_date: str
    product_card: SegmentInput = Field(default_factory=SegmentInput)
    inhouse: SegmentInput = Field(default_factory=SegmentInput)
    external: SegmentInput = Field(default_factory=SegmentInput)


class BulkImportRecord(BaseModel):
    data_date: str
    product_card: SegmentInput = Field(default_factory=SegmentInput)
    inhouse: SegmentInput = Field(default_factory=SegmentInput)
    external: SegmentInput = Field(default_factory=SegmentInput)


class BulkImportBody(BaseModel):
    store_code: str
    records: list[BulkImportRecord] = Field(default_factory=list)


@router.post("/analyze", dependencies=[Depends(require_tool_access("ads_monitor"))])
def analyze(body: AnalyzeBody, db: Session = Depends(get_db)):
    try:
        if not body.filename or not body.content_b64 or not body.data_date or not body.store_code:
            raise HTTPException(
                status_code=400,
                detail="filename, content_b64, data_date, and store_code are required",
            )
        return analyze_ads_file_b64(
            db,
            filename=body.filename,
            content_b64=body.content_b64,
            data_date=body.data_date,
            store_code=body.store_code,
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}") from e


@router.get("/internal-creators", dependencies=[Depends(require_tool_access("ads_monitor"))])
def get_internal_creators(db: Session = Depends(get_db)):
    return {"accounts": list_internal_creators(db)}


@router.put("/internal-creators", dependencies=[Depends(require_tool_access("ads_monitor"))])
def put_internal_creators(body: InternalCreatorsBody, db: Session = Depends(get_db)):
    try:
        saved = save_internal_creators(db, body.accounts)
        return {"accounts": saved}
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/discovered-accounts", dependencies=[Depends(require_tool_access("ads_monitor"))])
def get_discovered_accounts(
    q: str = Query("", description="Search TikTok account name"),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    return {"accounts": list_discovered_accounts(db, query=q, limit=limit)}


@router.get("/stores", dependencies=[Depends(require_tool_access("ads_monitor"))])
def list_tiktok_stores():
    return {"stores": get_tiktok_stores()}


@router.post("/manual-import", dependencies=[Depends(require_tool_access("ads_monitor"))])
def manual_import(body: ManualImportBody, db: Session = Depends(get_db)):
    try:
        if not body.store_code or not body.data_date:
            raise HTTPException(status_code=400, detail="store_code and data_date are required")
        return save_manual_daily_record(
            db,
            store_code=body.store_code,
            data_date=body.data_date,
            product_card_cost=body.product_card.cost,
            product_card_gmv=body.product_card.gmv,
            internal_cost=body.inhouse.cost,
            internal_gmv=body.inhouse.gmv,
            external_cost=body.external.cost,
            external_gmv=body.external.gmv,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/bulk-import", dependencies=[Depends(require_tool_access("ads_monitor"))])
def bulk_import(body: BulkImportBody, db: Session = Depends(get_db)):
    try:
        if not body.store_code:
            raise HTTPException(status_code=400, detail="store_code is required")
        if not body.records:
            raise HTTPException(status_code=400, detail="records are required")
        if len(body.records) > 400:
            raise HTTPException(status_code=400, detail="Maximum 400 rows per import")
        payload = [
            {
                "data_date": r.data_date,
                "product_card": {"cost": r.product_card.cost, "gmv": r.product_card.gmv},
                "inhouse": {"cost": r.inhouse.cost, "gmv": r.inhouse.gmv},
                "external": {"cost": r.external.cost, "gmv": r.external.gmv},
            }
            for r in body.records
        ]
        return save_bulk_manual_records(db, store_code=body.store_code, records=payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/daily-record", dependencies=[Depends(require_tool_access("ads_monitor"))])
def remove_daily_record(
    store_code: str = Query(..., description="TikTok store code"),
    data_date: str = Query(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    try:
        if not store_code or not data_date:
            raise HTTPException(status_code=400, detail="store_code and data_date are required")
        return delete_daily_record(db, store_code=store_code, data_date=data_date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/month-records", dependencies=[Depends(require_tool_access("ads_monitor"))])
def remove_month_records(
    store_code: str = Query(..., description="TikTok store code"),
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    try:
        if not store_code:
            raise HTTPException(status_code=400, detail="store_code is required")
        return delete_month_records(db, store_code=store_code, year=year, month=month)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/monthly-report", dependencies=[Depends(require_tool_access("ads_monitor"))])
def monthly_report(
    store_code: str = Query(..., description="TikTok store code"),
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    try:
        return get_monthly_report(db, store_code=store_code, year=year, month=month)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e
