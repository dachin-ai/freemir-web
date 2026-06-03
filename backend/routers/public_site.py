from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from database import SessionLocal
from services.public_catalog_logic import (
    LANDING_FEATURED_SKUS,
    get_landing_product_detail,
    get_landing_products,
)

router = APIRouter(prefix="/api/public", tags=["public"])


def _lang_currency(currency: str, lang: str) -> tuple[str, str]:
    cur = (currency or "IDR").strip().upper()
    if cur not in ("MYR", "IDR"):
        cur = "IDR"
    lang_key = (lang or "id").strip().lower()
    if lang_key not in ("id", "en", "zh"):
        lang_key = "id"
    return cur, lang_key


@router.get("/landing-products")
def landing_products(
    currency: str = Query("IDR", description="Price region (landing uses IDR)"),
    lang: str = Query("id", description="UI language: id|en|zh"),
    scope: str = Query(
        "landing",
        description="landing | learn | compare — smaller payload per page",
    ),
):
    """Public catalog slice for the brand landing site (no auth)."""
    cur, lang_key = _lang_currency(currency, lang)
    scope_key = (scope or "landing").strip().lower()
    if scope_key not in ("landing", "learn", "compare"):
        scope_key = "landing"

    db = SessionLocal()
    try:
        data = get_landing_products(db, currency=cur, lang=lang_key, scope=scope_key)
        payload = {
            "currency": cur,
            "lang": lang_key,
            "scope": scope_key,
            **data,
        }
        if scope_key == "landing":
            payload["featured_count"] = len(LANDING_FEATURED_SKUS)
        return JSONResponse(
            content=payload,
            headers={"Cache-Control": "public, max-age=60"},
        )
    finally:
        db.close()


@router.get("/landing-products/{sku}")
def landing_product_detail(
    sku: str,
    currency: str = Query("IDR"),
    lang: str = Query("id"),
):
    """Full product detail + material gallery for modal (lazy load)."""
    cur, lang_key = _lang_currency(currency, lang)
    db = SessionLocal()
    try:
        item = get_landing_product_detail(db, sku, currency=cur, lang=lang_key)
        if not item:
            raise HTTPException(status_code=404, detail="Product not found")
        return JSONResponse(
            content=item,
            headers={"Cache-Control": "public, max-age=120"},
        )
    finally:
        db.close()
