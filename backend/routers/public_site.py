from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from database import SessionLocal
from services.public_catalog_logic import LANDING_FEATURED_SKUS, get_landing_products

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/landing-products")
def landing_products(
  currency: str = Query("IDR", description="Price region (landing uses IDR)"),
  lang: str = Query("id", description="UI language: id|en|zh"),
):
  """Public catalog slice for the brand landing page (no auth)."""
  cur = (currency or "IDR").strip().upper()
  if cur not in ("MYR", "IDR"):
    cur = "IDR"
  lang_key = (lang or "id").strip().lower()
  if lang_key not in ("id", "en", "zh"):
    lang_key = "id"
  db = SessionLocal()
  try:
    data = get_landing_products(db, currency=cur, lang=lang_key)
    payload = {
      "currency": cur,
      "lang": lang_key,
      "products": data.get("products", []),
      "all_products": data.get("all_products", []),
      "top_tier_products": data.get("top_tier_products", []),
      "learn_products": data.get("learn_products", []),
      "compare_products": data.get("compare_products", []),
      "categories": data.get("categories", []),
      "featured_count": len(LANDING_FEATURED_SKUS),
    }
    return JSONResponse(
      content=payload,
      headers={"Cache-Control": "no-store"},
    )
  finally:
    db.close()
