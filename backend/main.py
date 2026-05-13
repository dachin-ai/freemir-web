from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import text
from routers import price_checker, order_loss, failed_delivery, presales, erp_oos, sku_plan, conversion_cleaner, order_match, auth, warehouse_order, socmed, affiliate, tiktok_ads, access, product_performance, livestream_display, photo_downloader, quick_links
from database import engine, Base
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
    ]
    with engine.connect() as conn:
        for sql in migrations:
            conn.execute(text(sql))
        conn.commit()
    print("[Startup] [OK] Database migrations checked / applied.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Server sudah listen di port 8080 saat ini — DB init di background
    try:
        Base.metadata.create_all(bind=engine)
        print("[Startup] [OK] Database tables created/verified.")
    except Exception as e:
        print(f"[Startup] [WARN] Database not yet available: {e}")
    try:
        _run_migrations()
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
app.include_router(warehouse_order.router)
app.include_router(socmed.router)
app.include_router(affiliate.router)
app.include_router(tiktok_ads.router)
app.include_router(access.router)
app.include_router(product_performance.router)
app.include_router(livestream_display.router)
app.include_router(photo_downloader.router)
app.include_router(quick_links.router)

# Include AI Chat router only if GEMINI_API_KEY is set
if ai_chat_available:
    app.include_router(ai_chat.router)
    print("[Startup] AI Chat endpoint registered.")

from routers import shopee_affiliate
app.include_router(shopee_affiliate.router, prefix="/api/shopee-affiliate", tags=["shopee-affiliate"])

@app.get("/")
def read_root():
    return {"message": "Welcome to FastAPI Backend!"}

@app.get("/api/health")
def health_check():
    """Lightweight wake-up endpoint — keeps Render from returning a cold start during login."""
    return {"status": "ok"}
