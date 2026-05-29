from fastapi import APIRouter, Query
from database import SessionLocal
from services.public_catalog_logic import get_landing_products

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
    return {"currency": cur, "products": products}
  finally:
    db.close()
