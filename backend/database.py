import os
import pathlib
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

_BACKEND_DIR = pathlib.Path(__file__).resolve().parent
_DEFAULT_SQLITE_URL = f"sqlite:///{_BACKEND_DIR / 'freemir_local.db'}"

# Always load backend/.env regardless of process cwd (uvicorn reload, IDE, etc.)
load_dotenv(_BACKEND_DIR / ".env")

# Postgres di production; tanpa DATABASE_URL pakai SQLite lokal agar backend + login dev bisa jalan.
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL") or _DEFAULT_SQLITE_URL
USING_SQLITE_DEV = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

if USING_SQLITE_DEV:
    print(
        "[Startup] [INFO] DATABASE_URL not set — using local SQLite:",
        _BACKEND_DIR / "freemir_local.db",
        "(set DATABASE_URL for production / Neon Postgres)",
    )
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False,
    )
else:
    # pool_pre_ping: test koneksi sebelum dipakai (handles dead connections)
    # pool_recycle=300: recycle setiap 5 menit agar tidak melebihi idle timeout
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        pool_recycle=300,
        connect_args={"connect_timeout": 10},
        echo=False,
    )

# Buat session local untuk setiap request FastAPI
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class untuk semua Model/Tabel kita
Base = declarative_base()

# Fungsi Dependency untuk di-inject ke rute (router) FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
