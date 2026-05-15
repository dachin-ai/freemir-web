from sqlalchemy import Column, Integer, String, DateTime, JSON, Float, PrimaryKeyConstraint, Text
from sqlalchemy.sql import func
from database import Base


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String, index=True)
    tool_key = Column(String)
    status = Column(String, default="pending")  # pending / approved / rejected
    created_at = Column(DateTime, server_default=func.now())


class PidStoreMap(Base):
    __tablename__ = "pid_store_map"

    mid = Column(String, index=True)                      # MID can repeat across stores
    pid = Column(String, index=True)                      # PID can repeat (multiple variations)
    store = Column(String)
    sku = Column(String)
    updated_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        PrimaryKeyConstraint("store", "mid", name="pid_store_map_pk"),
    )


class ProductPerformance(Base):
    __tablename__ = "product_performance"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    week = Column(String, index=True)          # "Week 1"
    week_start = Column(String)                # "2025-12-29"
    week_end = Column(String)                  # "2026-01-04"
    platform = Column(String, index=True)      # "Shopee" / "TikTok"
    store = Column(String, index=True)
    pid = Column(String, index=True)
    product_picture = Column(String)
    product_name = Column(String)
    impression = Column(Float)
    visitor = Column(Float)
    click = Column(Float)
    unit = Column(Float)
    gmv = Column(Float)
    ctr = Column(Float)
    co = Column(Float)
    created_at = Column(DateTime, server_default=func.now())

class SkuPerformance(Base):
    __tablename__ = "sku_performance"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    week = Column(String, index=True)
    week_start = Column(String)
    week_end = Column(String)
    platform = Column(String, index=True)
    store = Column(String, index=True)
    sku = Column(String, index=True)
    impression = Column(Float)
    visitor = Column(Float)
    click = Column(Float)
    unit = Column(Float)
    gmv = Column(Float)
    ctr = Column(Float)
    co = Column(Float)
    pid_count = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    time = Column(DateTime)
    username = Column(String, index=True)
    tools = Column(String)
    tools_general = Column(String, index=True)


class ToolUpdateInfo(Base):
    """Per-tool metadata (e.g. last stock upload time + optional note). Upsert by tool_key."""
    __tablename__ = "tool_update_info"

    tool_key = Column(String(64), primary_key=True)
    keterangan = Column(Text, nullable=True)
    waktu = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

class AccountUser(Base):
    __tablename__ = "account_users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    email = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True)
    name = Column(String)
    password = Column(String)
    approval = Column(String)
    permissions = Column(JSON)

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import JSON

class FreemirPrice(Base):
    __tablename__ = "freemir_price"
    
    sku = Column(String, primary_key=True, index=True)
    category = Column(String)
    clearance = Column(String)
    # Flexible JSON storage for Warning, Daily-Discount, etc...
    # Using JSON instead of JSONB for broad compatibility across SQLites/Postgres if needed
    # But since we're on Neon Postgres, JSONB is ideal. We'll use the generic JSON.
    prices = Column(JSON)

class FreemirName(Base):
    __tablename__ = "freemir_name"
    
    sku = Column(String, primary_key=True, index=True)
    product_name = Column(String)
    link = Column(String)
    mark = Column(String)

class LivestreamDisplayItem(Base):
    __tablename__ = "livestream_display_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    store = Column(String, index=True)
    etalase = Column(String, index=True)
    pid = Column(String, index=True)
    sequence_no = Column(Integer, index=True)
    sku = Column(String, index=True)
    product_name = Column(String)
    product_link = Column(String)
    image_url = Column(String)
    price = Column(Float)
    sort_order = Column(Integer)
    notes = Column(String)
    created_at = Column(DateTime, server_default=func.now())

class LivestreamBaseProduct(Base):
    __tablename__ = "livestream_base_products"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    store = Column(String, index=True)
    pid = Column(String, index=True)
    product_code = Column(String)
    product_name = Column(String)
    variation_code = Column(String)
    variation_name = Column(String)
    parent_sku = Column(String)
    sku = Column(String, index=True)
    created_at = Column(DateTime, server_default=func.now())

# --- Shopee Affiliate Analytics Models ---

from sqlalchemy import Float, Date

class ShopeeAffConversion(Base):
    __tablename__ = "shopee_aff_conversions"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_id = Column(String, index=True)
    store_id = Column(String, index=True)
    order_time = Column(DateTime)
    order_status = Column(String)
    product_id = Column(String, index=True)
    variation_id = Column(String)
    product_name = Column(String)
    affiliate_username = Column(String, index=True)
    affiliate_name = Column(String)
    purchase_value = Column(Float)
    commission = Column(Float)
    channel = Column(String)

class ShopeeAffProduct(Base):
    __tablename__ = "shopee_aff_products"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date = Column(Date, index=True)
    store_id = Column(String, index=True)
    product_id = Column(String, index=True)
    product_name = Column(String)
    gmv = Column(Float)
    unit_sold = Column(Integer)
    commission = Column(Float)
    roi = Column(Float)

class ShopeeAffCreator(Base):
    __tablename__ = "shopee_aff_creators"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date = Column(Date, index=True)
    store_id = Column(String, index=True)
    affiliate_username = Column(String, index=True)
    affiliate_name = Column(String)
    gmv = Column(Float)
    unit_sold = Column(Integer)
    clicks = Column(Integer)
    commission = Column(Float)
    roi = Column(Float)


class BrandMaterial(Base):
    __tablename__ = "brand_materials"

    id = Column(String, primary_key=True)
    sku = Column(String, index=True, nullable=False)
    sku_key = Column(String, index=True, nullable=False)
    category = Column(String, nullable=False)  # main | sub
    media_type = Column(String, nullable=False, default="photo")  # photo | video
    sub_index = Column(Integer, nullable=True)
    gcs_object_path = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    size_bytes = Column(Integer, default=0)
    uploaded_at = Column(DateTime, server_default=func.now())
    uploaded_by = Column(String, default="")


class SharedQuickLinks(Base):
    """Satu baris global (id=1): Quick Links bersama untuk semua user yang login."""

    __tablename__ = "shared_quick_links"

    id = Column(Integer, primary_key=True)
    payload = Column(JSON, nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

