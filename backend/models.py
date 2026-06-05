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


class PriceCheckerBundleCache(Base):
    __tablename__ = "price_checker_bundle_cache"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    bundle_key = Column(String, index=True, nullable=False)  # e.g. IDR|SKU1+SKU2
    bundle_sku = Column(String, index=True, nullable=False)  # normalized SKU string with "+"
    sku_count = Column(Integer, index=True, nullable=False, default=1)
    currency = Column(String(8), index=True, nullable=False, default="IDR")
    source = Column(String(16), nullable=False, default="direct")  # direct | batch
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

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
    preview_gcs_object_path = Column(String, nullable=True)
    mime_type = Column(String, nullable=False)
    size_bytes = Column(Integer, default=0)
    uploaded_at = Column(DateTime, server_default=func.now())
    uploaded_by = Column(String, default="")
    note = Column(String(500), default="")


class SharedQuickLinks(Base):
    """Satu baris global (id=1): Quick Links bersama untuk semua user yang login."""

    __tablename__ = "shared_quick_links"

    id = Column(Integer, primary_key=True)
    payload = Column(JSON, nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SocmedAnalyticsVideo(Base):
    """Tracked social post/reel for Social Media Analytics (freemir suite)."""

    __tablename__ = "socmed_analytics_videos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_by = Column(String(120), default="", index=True)
    platform = Column(String(20), nullable=False, index=True)  # tiktok | instagram
    url = Column(String(512), nullable=False)
    url_key = Column(String(512), default="", index=True)
    canonical_url = Column(String(512), default="")
    post_id = Column(String(80), default="", index=True)
    author_username = Column(String(120), default="")
    author_display_name = Column(String(200), default="")
    caption = Column(String(2000), default="")
    thumbnail_url = Column(String(1024), default="")
    posted_at = Column(String(40), default="")
    views = Column(Integer, nullable=True)
    likes = Column(Integer, nullable=True)
    comments = Column(Integer, nullable=True)
    shares = Column(Integer, nullable=True)
    saves = Column(Integer, nullable=True)
    video_download_url = Column(String(1024), default="")
    duration_sec = Column(Integer, nullable=True)
    last_fetched_at = Column(DateTime, nullable=True)
    fetch_status = Column(String(20), default="pending")  # pending | ok | error
    fetch_error = Column(String(500), default="")
    note = Column(String(500), default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SocmedAnalyticsSnapshot(Base):
    """Point-in-time metrics for a tracked video (performance over time)."""

    __tablename__ = "socmed_analytics_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    video_id = Column(Integer, nullable=False, index=True)
    fetched_at = Column(DateTime, nullable=False, index=True)
    views = Column(Integer, nullable=True)
    likes = Column(Integer, nullable=True)
    comments = Column(Integer, nullable=True)
    shares = Column(Integer, nullable=True)
    saves = Column(Integer, nullable=True)
    engagement_rate = Column(String(20), default="")


class SocmedAnalyticsProfile(Base):
    """Tracked creator profile (TikTok / Instagram)."""

    __tablename__ = "socmed_analytics_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_by = Column(String(120), default="", index=True)
    platform = Column(String(20), nullable=False, index=True)
    username = Column(String(120), nullable=False, index=True)
    profile_key = Column(String(160), default="", index=True)
    profile_url = Column(String(512), default="")
    display_name = Column(String(200), default="")
    biography = Column(String(2000), default="")
    avatar_url = Column(String(1024), default="")
    followers = Column(Integer, nullable=True)
    following = Column(Integer, nullable=True)
    posts_count = Column(Integer, nullable=True)
    total_likes = Column(Integer, nullable=True)
    is_verified = Column(String(10), default="")
    recent_posts_json = Column(JSON, nullable=True)
    recent_avg_views = Column(Integer, nullable=True)
    recent_avg_likes = Column(Integer, nullable=True)
    recent_avg_comments = Column(Integer, nullable=True)
    recent_avg_engagement_rate = Column(String(20), default="")
    last_fetched_at = Column(DateTime, nullable=True)
    fetch_status = Column(String(20), default="pending")
    fetch_error = Column(String(500), default="")
    note = Column(String(500), default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SocmedApifyToken(Base):
    """Encrypted Apify API token saved per account owner (Social Media Analytics)."""

    __tablename__ = "socmed_apify_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    owner = Column(String(120), nullable=False, index=True)
    label = Column(String(120), default="")
    token_enc = Column(Text, nullable=False)
    token_hint = Column(String(32), default="")
    is_default = Column(String(1), default="0")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class SocmedAnalyticsProfileSnapshot(Base):
    """Point-in-time profile metrics."""

    __tablename__ = "socmed_analytics_profile_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, nullable=False, index=True)
    fetched_at = Column(DateTime, nullable=False, index=True)
    followers = Column(Integer, nullable=True)
    following = Column(Integer, nullable=True)
    posts_count = Column(Integer, nullable=True)
    total_likes = Column(Integer, nullable=True)
    recent_avg_views = Column(Integer, nullable=True)
    recent_avg_likes = Column(Integer, nullable=True)
    recent_avg_engagement_rate = Column(String(20), default="")

