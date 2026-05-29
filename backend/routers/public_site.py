from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from database import SessionLocal
from services.public_catalog_logic import LANDING_FEATURED_SKUS, get_landing_products

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/landing-products")
def landing_products(currency: str = Query("IDR", description="Price region (landing uses IDR)")):
  """Public catalog slice for the brand landing page (no auth)."""
  cur = (currency or "IDR").strip().upper()
  if cur not in ("MYR", "IDR"):
    cur = "IDR"
  db = SessionLocal()
  try:
    products = get_landing_products(db, currency=cur)
    payload = {
      "currency": cur,
      "products": products,
      "featured_count": len(LANDING_FEATURED_SKUS),
    }
    return JSONResponse(
      content=payload,
      headers={"Cache-Control": "no-store"},
    )
  finally:
    db.close()
