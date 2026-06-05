from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from sqlalchemy import text
from routers import price_checker, order_loss, failed_delivery, presales, erp_oos, sku_plan, conversion_cleaner, order_match, auth, warehouse_order, socmed, affiliate, tiktok_ads, access, product_performance, livestream_display, photo_downloader, quick_links, brand_material, sku_review, public_site, social_media_analytics
from database import engine, Base, SessionLocal, USING_SQLITE_DEV
import models  # noqa: F401 - ensure all models are registered before create_all
import os
import sys

# Windows consoles often use cp1252; avoid UnicodeEncodeError on startup logs / exception text.
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# AI Chat router is optional (loaded if any LLM provider key is configured)
ai_chat_available = False
if os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY"):
    try:
        from routers import ai_chat
        ai_chat_available = True
    except Exception as e:
        print(f"[Startup] [WARN] AI Chat not available: {e}")
else:
    print("[Startup] [INFO] GEMINI_API_KEY not configured. AI Chat endpoint will not be available.")


def _run_migrations():
    migrations = [
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'access_requests'
            ) THEN
                CREATE TABLE access_requests (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR,
                    tool_key VARCHAR,
                    status VARCHAR DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT NOW()
                );
            END IF;
        END
        $$;
        """,
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'account_users' AND column_name = 'permissions'
            ) THEN
                ALTER TABLE account_users ADD COLUMN permissions JSON;
            END IF;
        END
        $$;
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'account_users'
            ) THEN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'account_users' AND column_name = 'name'
                ) THEN
                    ALTER TABLE account_users ADD COLUMN name VARCHAR;
                END IF;

                UPDATE account_users
                SET name = username
                WHERE (name IS NULL OR TRIM(name) = '')
                  AND username IS NOT NULL
                  AND TRIM(username) <> '';
            END IF;
        END
        $$;
        """,
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'pid_store_map'
            ) THEN
                CREATE TABLE pid_store_map (
                    store VARCHAR,
                    mid VARCHAR,
                    pid VARCHAR,
                    sku VARCHAR,
                    updated_at TIMESTAMP DEFAULT NOW(),
                    PRIMARY KEY (store, mid)
                );
            END IF;
        END
        $$;
        """,
        """
        DO $$
        DECLARE
            pk_cols text[];
        BEGIN
            -- Ensure PK is (store, mid)
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'pid_store_map'
            ) THEN
                SELECT array_agg(kcu.column_name ORDER BY kcu.ordinal_position)
                INTO pk_cols
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_name = kcu.table_name
                WHERE tc.table_name='pid_store_map'
                  AND tc.constraint_type='PRIMARY KEY';

                IF pk_cols IS NULL OR pk_cols <> ARRAY['store','mid'] THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.tables
                        WHERE table_name = 'pid_store_map_new'
                    ) THEN
                        CREATE TABLE pid_store_map_new (
                            store VARCHAR,
                            mid VARCHAR,
                            pid VARCHAR,
                            sku VARCHAR,
                            updated_at TIMESTAMP DEFAULT NOW(),
                            PRIMARY KEY (store, mid)
                        );
                    END IF;

                    INSERT INTO pid_store_map_new (store, mid, pid, sku, updated_at)
                    SELECT store, mid, pid, sku, updated_at
                    FROM pid_store_map
                    ON CONFLICT (store, mid) DO UPDATE
                    SET pid = EXCLUDED.pid,
                        sku = EXCLUDED.sku,
                        updated_at = EXCLUDED.updated_at;

                    DROP TABLE pid_store_map;
                    ALTER TABLE pid_store_map_new RENAME TO pid_store_map;
                END IF;
            END IF;
            -- Add mid column if missing (very old schema)
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pid_store_map' AND column_name='mid') THEN
                ALTER TABLE pid_store_map ADD COLUMN mid VARCHAR;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pid_store_map' AND column_name='store') THEN
                ALTER TABLE pid_store_map ADD COLUMN store VARCHAR;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pid_store_map' AND column_name='sku') THEN
                ALTER TABLE pid_store_map ADD COLUMN sku VARCHAR;
            END IF;
        END
        $$;
        """,
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'product_performance'
            ) THEN
                CREATE TABLE product_performance (
                    id SERIAL PRIMARY KEY,
                    week VARCHAR,
                    week_start VARCHAR,
                    week_end VARCHAR,
                    platform VARCHAR,
                    store VARCHAR,
                    pid VARCHAR,
                    product_picture VARCHAR,
                    product_name VARCHAR,
                    impression FLOAT,
                    visitor FLOAT,
                    click FLOAT,
                    unit FLOAT,
                    gmv FLOAT,
                    ctr FLOAT,
                    co FLOAT,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='product_performance' AND column_name='visitor'
            ) THEN
                ALTER TABLE product_performance ADD COLUMN visitor FLOAT;
            END IF;
        END
        $$;
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'activity_logs'
            ) THEN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='activity_logs' AND column_name='tools_general'
                ) THEN
                    ALTER TABLE activity_logs ADD COLUMN tools_general VARCHAR;
                END IF;

                UPDATE activity_logs
                SET tools_general = TRIM(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(tools, ''), '\\s*\\([^)]*\\)\\s*', ' ', 'g'), '\\s+', ' ', 'g'))
                WHERE tools IS NOT NULL
                  AND (tools_general IS NULL OR tools_general = '');
            END IF;
        END
        $$;
        """,
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'shared_quick_links'
            ) THEN
                CREATE TABLE shared_quick_links (
                    id INTEGER PRIMARY KEY,
                    payload JSON NOT NULL,
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            END IF;
        END
        $$;
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'brand_materials'
            ) THEN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'brand_materials' AND column_name = 'media_type'
                ) THEN
                    ALTER TABLE brand_materials ADD COLUMN media_type VARCHAR NOT NULL DEFAULT 'photo';
                    UPDATE brand_materials SET media_type = 'video' WHERE mime_type LIKE 'video/%';
                END IF;
            END IF;
        END
        $$;
        """,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'socmed_analytics_videos'
            ) THEN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'socmed_analytics_videos' AND column_name = 'url_key'
                ) THEN
                    ALTER TABLE socmed_analytics_videos ADD COLUMN url_key VARCHAR(512) DEFAULT '';
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'socmed_analytics_videos' AND column_name = 'video_download_url'
                ) THEN
                    ALTER TABLE socmed_analytics_videos ADD COLUMN video_download_url VARCHAR(1024) DEFAULT '';
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'socmed_analytics_videos' AND column_name = 'duration_sec'
                ) THEN
                    ALTER TABLE socmed_analytics_videos ADD COLUMN duration_sec INTEGER;
                END IF;
                UPDATE socmed_analytics_videos
                SET url_key = LOWER(RTRIM(url))
                WHERE (url_key IS NULL OR url_key = '')
                  AND url IS NOT NULL;
            END IF;
        END
        $$;
        """,
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'socmed_analytics_snapshots'
            ) THEN
                CREATE TABLE socmed_analytics_snapshots (
                    id SERIAL PRIMARY KEY,
                    video_id INTEGER NOT NULL,
                    fetched_at TIMESTAMP NOT NULL,
                    views INTEGER,
                    likes INTEGER,
                    comments INTEGER,
                    shares INTEGER,
                    saves INTEGER,
                    engagement_rate VARCHAR(20) DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS ix_socmed_analytics_snapshots_video_id
                    ON socmed_analytics_snapshots (video_id);
                CREATE INDEX IF NOT EXISTS ix_socmed_analytics_snapshots_fetched_at
                    ON socmed_analytics_snapshots (fetched_at);
            END IF;
        END
        $$;
        """,
    ]
    with engine.connect() as conn:
        for sql in migrations:
            conn.execute(text(sql))
        conn.commit()
    print("[Startup] [OK] Database migrations checked / applied.")


def _migrate_brand_material_media_type_column():
    """SQLite (and any DB) — add media_type if table predates the column."""
    from sqlalchemy import inspect

    insp = inspect(engine)
    if "brand_materials" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("brand_materials")}
    if "media_type" in cols:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE brand_materials ADD COLUMN media_type VARCHAR DEFAULT 'photo'"))
        conn.execute(text("UPDATE brand_materials SET media_type = 'video' WHERE mime_type LIKE 'video/%'"))
    print("[Startup] [OK] brand_materials.media_type column added.")


def _migrate_brand_material_preview_column():
    from sqlalchemy import inspect

    insp = inspect(engine)
    if "brand_materials" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("brand_materials")}
    if "preview_gcs_object_path" in cols:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE brand_materials ADD COLUMN preview_gcs_object_path VARCHAR"))
    print("[Startup] [OK] brand_materials.preview_gcs_object_path column added.")


def _migrate_brand_material_note_column():
    from sqlalchemy import inspect

    insp = inspect(engine)
    if "brand_materials" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("brand_materials")}
    if "note" in cols:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE brand_materials ADD COLUMN note VARCHAR(500) DEFAULT ''"))
    print("[Startup] [OK] brand_materials.note column added.")


def _migrate_socmed_analytics_tables():
    from sqlalchemy import inspect

    insp = inspect(engine)
    if "socmed_analytics_videos" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("socmed_analytics_videos")}
        if "url_key" not in cols:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE socmed_analytics_videos ADD COLUMN url_key VARCHAR(512) DEFAULT ''"
                ))
            print("[Startup] [OK] socmed_analytics_videos.url_key column added.")
    # create_all handles new snapshot table; ensure url_key backfill on sqlite
    try:
        with engine.begin() as conn:
            conn.execute(text(
                "UPDATE socmed_analytics_videos SET url_key = LOWER(RTRIM(url)) "
                "WHERE (url_key IS NULL OR url_key = '') AND url IS NOT NULL"
            ))
    except Exception:
        pass


def _migrate_socmed_analytics_video_download_column():
    from sqlalchemy import inspect

    insp = inspect(engine)
    if "socmed_analytics_videos" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("socmed_analytics_videos")}
    if "video_download_url" in cols:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE socmed_analytics_videos ADD COLUMN video_download_url VARCHAR(1024) DEFAULT ''"))
    print("[Startup] [OK] socmed_analytics_videos.video_download_url column added.")


def _migrate_socmed_analytics_note_columns():
    from sqlalchemy import inspect

    insp = inspect(engine)
    for table in ("socmed_analytics_videos", "socmed_analytics_profiles"):
        if table not in insp.get_table_names():
            continue
        cols = {c["name"] for c in insp.get_columns(table)}
        if "note" in cols:
            continue
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN note VARCHAR(500) DEFAULT ''"))
        print(f"[Startup] [OK] {table}.note column added.")


def _seed_sqlite_dev_user():
    """Tanpa Neon: satu user admin lokal agar login di http://localhost:5173 berhasil."""
    if not USING_SQLITE_DEV:
        return
    from models import AccountUser
    from services.auth_logic import TOOL_KEYS, hash_password

    db = SessionLocal()
    try:
        if db.query(AccountUser).count() > 0:
            return
        perms = {k: 1 for k in TOOL_KEYS}
        db.add(
            AccountUser(
                id=1,
                email="dev@local.test",
                username="dev",
                name="Local Dev",
                password=hash_password("devdev"),
                approval="approve",
                permissions=perms,
            )
        )
        db.commit()
        print("[Startup] [OK] SQLite dev login: username=dev  password=devdev  (set DATABASE_URL to use real DB)")
    except Exception as e:
        print(f"[Startup] [WARN] SQLite dev seed failed: {e}")
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Server sudah listen di port 8080 saat ini — DB init di background
    try:
        Base.metadata.create_all(bind=engine)
        print("[Startup] [OK] Database tables created/verified.")
        _migrate_brand_material_media_type_column()
        _migrate_brand_material_preview_column()
        _migrate_brand_material_note_column()
        _migrate_socmed_analytics_video_download_column()
        _migrate_socmed_analytics_note_columns()
        _migrate_socmed_analytics_tables()
        _seed_sqlite_dev_user()
    except Exception as e:
        print(f"[Startup] [WARN] Database not yet available: {e}")
    try:
        if engine.dialect.name == "postgresql":
            _run_migrations()
        else:
            print("[Startup] [INFO] Skipping PostgreSQL migration SQL (local SQLite).")
    except Exception as e:
        print(f"[Startup] [WARN] Migration warning: {e}")
    # Warm Google Sheets cache so first user request is fast
    try:
        from services.product_performance_logic import get_store_name_map, get_at1_store_codes
        get_store_name_map()
        get_at1_store_codes()
        print("[Startup] [OK] Sheets cache warmed.")
    except Exception as e:
        print(f"[Startup] [WARN] Sheets cache warm failed (non-fatal): {e}")
    yield


app = FastAPI(lifespan=lifespan)

# Frontend uses Bearer token in Authorization header (not cookies),
# so allow_credentials=False is correct and safer.
_cors_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(price_checker.router)
app.include_router(order_loss.router)
app.include_router(failed_delivery.router)
app.include_router(presales.router)
app.include_router(erp_oos.router)
app.include_router(sku_plan.router)
app.include_router(conversion_cleaner.router)
app.include_router(order_match.router)
app.include_router(auth.router)
app.include_router(public_site.router)
app.include_router(warehouse_order.router)
app.include_router(socmed.router)
app.include_router(affiliate.router)
app.include_router(tiktok_ads.router)
app.include_router(access.router)
app.include_router(product_performance.router)
app.include_router(livestream_display.router)
app.include_router(photo_downloader.router)
app.include_router(quick_links.router)
app.include_router(brand_material.router)
app.include_router(sku_review.router)
app.include_router(social_media_analytics.router)

# Include AI Chat router only if GEMINI_API_KEY is set
if ai_chat_available:
    app.include_router(ai_chat.router)
    print("[Startup] AI Chat endpoint registered.")

from routers import shopee_affiliate
app.include_router(shopee_affiliate.router, prefix="/api/shopee-affiliate", tags=["shopee-affiliate"])

@app.get("/api/health")
def health_check():
    """Lightweight wake-up endpoint — keeps Render from returning a cold start during login."""
    return {"status": "ok"}


def _mount_frontend(app: FastAPI) -> None:
    """Serve Vite build from ./static when present (unified Cloud Run deploy)."""
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    index_path = os.path.join(static_dir, "index.html")
    if not os.path.isfile(index_path):
        @app.get("/", include_in_schema=False)
        def api_root():
            return {
                "service": "freemir-web-api",
                "health": "/api/health",
                "docs": "/docs",
            }
        return

    @app.get("/", include_in_schema=False)
    async def spa_index():
        return FileResponse(index_path)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_files(full_path: str):
        if full_path.startswith("api") or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        safe_root = os.path.realpath(static_dir)
        target = os.path.realpath(os.path.join(static_dir, full_path))
        if not target.startswith(safe_root):
            raise HTTPException(status_code=404, detail="Not Found")
        if os.path.isfile(target):
            return FileResponse(target)
        return FileResponse(index_path)


_mount_frontend(app)
