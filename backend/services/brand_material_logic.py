"""
Brand Material — metadata in PostgreSQL, files in Google Cloud Storage.
"""

from __future__ import annotations

import io
import os
import re
import sys
import tempfile
import time
from collections import Counter, defaultdict
import shutil
import subprocess
import uuid
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from PIL import Image, ImageOps, UnidentifiedImageError

from google.cloud import storage
from google.oauth2 import service_account
from sqlalchemy import case, exists, func, or_, select
from sqlalchemy.orm import Session

from models import BrandMaterial, FreemirName

GCS_BUCKET = os.getenv("GCS_BUCKET", "dachin-ai-picture")
GCS_PREFIX = os.getenv("GCS_BRAND_MATERIAL_PREFIX", "brand-material")
JAKARTA_TZ = ZoneInfo("Asia/Jakarta")

# Cloud Run HTTP/1 request cap is 32 MiB — large files use signed GCS PUT instead.
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
DIRECT_UPLOAD_THRESHOLD_BYTES = 28 * 1024 * 1024
VIDEO_COMPRESS_MIN_BYTES = 32 * 1024 * 1024
VIDEO_COMPRESS_CRF = int(os.getenv("BM_VIDEO_CRF", "20"))
VIDEO_COMPRESS_PRESET = os.getenv("BM_VIDEO_PRESET", "medium")
VIDEO_COMPRESS_TIMEOUT_SEC = int(os.getenv("BM_VIDEO_COMPRESS_TIMEOUT", "900"))

if os.path.exists("/etc/secrets/credentials.json"):
    CREDENTIALS_FILE = "/etc/secrets/credentials.json"
else:
    CREDENTIALS_FILE = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "credentials.json",
    )

MIME_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
    "video/x-matroska": "mkv",
}

_storage_client: storage.Client | None = None


def _sku_key(sku: str) -> str:
    return (sku or "").strip().lower()


def normalize_sku(sku: str) -> str:
    return (sku or "").strip()


NOTE_MAX_LEN = 500


def normalize_note(note: str | None) -> str:
    return (note or "").strip()[:NOTE_MAX_LEN]


def is_allowed_media_mime(mime_type: str) -> bool:
    m = (mime_type or "").lower()
    return m.startswith("image/") or m.startswith("video/")


def media_type_from_mime(mime_type: str) -> str:
    return "video" if (mime_type or "").lower().startswith("video/") else "photo"


def normalize_media_type(value: str, mime_type: str = "") -> str:
    v = (value or "").strip().lower()
    if v in ("photo", "video"):
        return v
    return media_type_from_mime(mime_type)


def assert_type_matches_mime(media_type: str, mime_type: str) -> None:
    mt = normalize_media_type(media_type, mime_type)
    if mt == "video" and not (mime_type or "").lower().startswith("video/"):
        raise ValueError("TYPE_MIME_MISMATCH")
    if mt == "photo" and not (mime_type or "").lower().startswith("image/"):
        raise ValueError("TYPE_MIME_MISMATCH")


def storage_file_name(sku: str, category: str, sub_index: Optional[int], mime_type: str) -> str:
    ext = MIME_EXT.get((mime_type or "").lower(), "jpg")
    if category == "main":
        return f"{sku}_Main.{ext}"
    idx = sub_index or 1
    return f"{sku}_Sub({idx}).{ext}"


def _gcs_object_path(sku: str, file_name: str) -> str:
    safe_sku = re.sub(r"[^\w\-]+", "_", normalize_sku(sku))
    return f"{GCS_PREFIX}/{safe_sku}/{file_name}"


def brand_material_signed_read_url(
    gcs_object_path: str | None,
    *,
    minutes: int = 60,
) -> str | None:
    """Time-limited URL so the browser can load thumbnails directly from GCS (faster than API proxy)."""
    if not gcs_object_path:
        return None
    try:
        blob = get_storage_client().bucket(GCS_BUCKET).blob(gcs_object_path)
        return blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=minutes),
            method="GET",
        )
    except Exception:
        return brand_material_public_url(gcs_object_path)


def brand_material_signed_write_url(
    gcs_object_path: str,
    content_type: str,
    *,
    minutes: int = 30,
) -> str | None:
    """Signed PUT URL so the browser can upload large files directly to GCS."""
    if not gcs_object_path:
        return None
    try:
        blob = get_storage_client().bucket(GCS_BUCKET).blob(gcs_object_path)
        return blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=minutes),
            method="PUT",
            content_type=content_type,
        )
    except Exception:
        return None


def brand_material_public_url(gcs_object_path: str | None) -> str | None:
    """HTTPS URL for embedding in Price Checker / Excel (bucket must allow read or use GCS fallback)."""
    if not gcs_object_path:
        return None
    from urllib.parse import quote

    encoded = "/".join(quote(part, safe="") for part in gcs_object_path.split("/"))
    return f"https://storage.googleapis.com/{GCS_BUCKET}/{encoded}"


def download_gcs_object_bytes(gcs_object_path: str | None) -> bytes | None:
    if not gcs_object_path:
        return None
    try:
        client = get_storage_client()
        return client.bucket(GCS_BUCKET).blob(gcs_object_path).download_as_bytes()
    except Exception:
        return None


def get_brand_main_photo_map(
    db: Session,
    skus: set,
    *,
    sign_urls: bool = True,
    sign_minutes: int = 720,
) -> dict[str, dict]:
    """
    SKU (uppercase) → { materialId, url, catalogUrl, previewUrl } for Material Library main photo.
    catalogUrl is the small preview JPEG on GCS (preferred for public catalog cards).
    previewUrl is a signed read URL (private bucket); skipped when sign_urls=False.
    """
    if not skus:
        return {}
    keys = {_sku_key(s) for s in skus if s}
    if not keys:
        return {}

    rows = (
        db.query(
            BrandMaterial.id,
            BrandMaterial.sku,
            BrandMaterial.preview_gcs_object_path,
            BrandMaterial.gcs_object_path,
        )
        .filter(
            BrandMaterial.sku_key.in_(list(keys)),
            BrandMaterial.category == "main",
            BrandMaterial.media_type == "photo",
        )
        .order_by(BrandMaterial.id.asc())
        .all()
    )

    out: dict[str, dict] = {}
    sign_jobs: list[tuple[str, str]] = []
    seen: set[str] = set()
    for row in rows:
        sku_upper = (row.sku or "").strip().upper()
        if not sku_upper or sku_upper in seen:
            continue
        seen.add(sku_upper)
        preview_path = row.preview_gcs_object_path
        gcs_path = row.gcs_object_path
        catalog_url = brand_material_public_url(preview_path) if preview_path else ""
        full_url = brand_material_public_url(preview_path or gcs_path)
        out[sku_upper] = {
            "materialId": row.id,
            "url": full_url or "",
            "catalogUrl": catalog_url or "",
            "previewUrl": "",
            "previewGcsPath": preview_path or "",
        }
        if sign_urls and preview_path:
            sign_jobs.append((sku_upper, preview_path))

    if sign_jobs:
        from concurrent.futures import ThreadPoolExecutor

        max_workers = min(8, len(sign_jobs))

        def _sign(path: str) -> str | None:
            return brand_material_signed_read_url(path, minutes=sign_minutes)

        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            signed_urls = list(pool.map(_sign, [path for _, path in sign_jobs]))
        for (sku_upper, _), signed in zip(sign_jobs, signed_urls):
            if signed:
                out[sku_upper]["previewUrl"] = signed

    return out


def get_brand_main_photo_url_map(db: Session, skus: set) -> dict[str, str]:
    """SKU (uppercase) → public image URL (batch Excel export)."""
    meta = get_brand_main_photo_map(db, skus)
    return {sku: info["url"] for sku, info in meta.items() if info.get("url")}


def _landing_media_entry(row: BrandMaterial) -> dict | None:
    mt = (getattr(row, "media_type", None) or "photo").strip().lower()
    gcs = row.gcs_object_path
    preview = getattr(row, "preview_gcs_object_path", None)
    if mt == "video":
        url = brand_material_public_url(gcs)
        if not url:
            return None
        poster = brand_material_public_url(preview) if preview else None
        return {
            "materialId": row.id,
            "mediaType": "video",
            "url": url,
            "posterUrl": poster,
        }
    path = preview or gcs
    url = brand_material_public_url(path)
    if not url:
        return None
    return {
        "materialId": row.id,
        "mediaType": "photo",
        "url": url,
        "posterUrl": brand_material_public_url(preview) if preview else url,
    }


def _gallery_from_material_rows(rows: list[BrandMaterial]) -> dict:
    """Landing modal extras: 1 sub/main video + up to 4 sub photos."""
    videos = [r for r in rows if (getattr(r, "media_type", None) or "photo") == "video"]
    video_row = None
    for r in videos:
        if r.category == "main":
            video_row = r
            break
    if not video_row and videos:
        videos.sort(key=lambda r: (r.sub_index if r.sub_index is not None else 0, r.id or ""))
        video_row = videos[0]

    sub_photos = [
        r
        for r in rows
        if r.category == "sub" and (getattr(r, "media_type", None) or "photo") == "photo"
    ]
    sub_photos.sort(key=lambda r: (r.sub_index if r.sub_index is not None else 0, r.id or ""))

    photos: list[dict] = []
    for row in sub_photos:
        if len(photos) >= 4:
            break
        entry = _landing_media_entry(row)
        if entry:
            photos.append(entry)

    video = _landing_media_entry(video_row) if video_row else None
    return {"video": video, "photos": photos}


def get_landing_material_gallery_for_sku(db: Session, sku: str) -> dict:
    """Single-SKU gallery for landing modal (lazy load)."""
    sku_upper = (sku or "").strip().upper()
    if not sku_upper:
        return {}
    key = _sku_key(sku_upper)
    rows = (
        db.query(BrandMaterial)
        .filter(BrandMaterial.sku_key == key)
        .order_by(
            BrandMaterial.media_type.asc(),
            case((BrandMaterial.category == "main", 0), else_=1).asc(),
            BrandMaterial.sub_index.asc().nullsfirst(),
            BrandMaterial.id.asc(),
        )
        .all()
    )
    gallery = _gallery_from_material_rows(rows)
    if gallery.get("video") or gallery.get("photos"):
        return gallery
    return {}


def get_landing_material_gallery_map(db: Session, skus: set) -> dict[str, dict]:
    """SKU (uppercase) → { video: {...}|null, photos: [...] } for public landing modal."""
    if not skus:
        return {}
    keys = {_sku_key(s) for s in skus if s}
    if not keys:
        return {}

    rows = (
        db.query(BrandMaterial)
        .filter(BrandMaterial.sku_key.in_(list(keys)))
        .order_by(
            BrandMaterial.media_type.asc(),
            case((BrandMaterial.category == "main", 0), else_=1).asc(),
            BrandMaterial.sub_index.asc().nullsfirst(),
            BrandMaterial.id.asc(),
        )
        .all()
    )

    by_key: dict[str, list[BrandMaterial]] = {}
    for row in rows:
        by_key.setdefault(row.sku_key, []).append(row)

    out: dict[str, dict] = {}
    for sku in skus:
        sku_upper = (sku or "").strip().upper()
        if not sku_upper:
            continue
        key = _sku_key(sku_upper)
        gallery = _gallery_from_material_rows(by_key.get(key, []))
        if gallery.get("video") or gallery.get("photos"):
            out[sku_upper] = gallery
    return out


def get_storage_client() -> storage.Client:
    global _storage_client
    if _storage_client is not None:
        return _storage_client
    if not os.path.exists(CREDENTIALS_FILE):
        raise FileNotFoundError(
            f"GCS credentials not found at {CREDENTIALS_FILE}. "
            "Copy your service account JSON to backend/credentials.json"
        )
    creds = service_account.Credentials.from_service_account_file(CREDENTIALS_FILE)
    _storage_client = storage.Client(
        credentials=creds,
        project=creds.project_id,
    )
    return _storage_client


_GCS_UPLOAD_CORS_READY = False


def ensure_gcs_upload_cors() -> None:
    """Allow browser PUT to signed upload URLs (required for large direct uploads)."""
    global _GCS_UPLOAD_CORS_READY
    if _GCS_UPLOAD_CORS_READY:
        return
    try:
        bucket = get_storage_client().bucket(GCS_BUCKET)
        bucket.reload()
        origins = [
            o.strip()
            for o in os.getenv(
                "GCS_UPLOAD_CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173,"
                "http://localhost:8080,https://freemir-web-123563250077.asia-southeast1.run.app",
            ).split(",")
            if o.strip()
        ]
        upload_rule = {
            "origin": origins,
            "method": ["GET", "PUT", "HEAD", "OPTIONS"],
            "responseHeader": [
                "Content-Type",
                "Content-Length",
                "Content-Range",
                "x-goog-resumable",
            ],
            "maxAgeSeconds": 3600,
        }
        rules = list(bucket.cors or [])
        has_put = any(
            "PUT" in (r.get("method") or [])
            and set(origins).issubset(set(r.get("origin") or []))
            for r in rules
        )
        if not has_put:
            rules.append(upload_rule)
            bucket.cors = rules
            bucket.patch()
        _GCS_UPLOAD_CORS_READY = True
    except Exception as exc:
        print(f"[GCS] upload CORS setup skipped: {exc}")


def _uploaded_at_jakarta_iso(dt: Optional[datetime]) -> Optional[str]:
    """Naive DB datetimes are treated as UTC; API returns Asia/Jakarta offset."""
    if not dt:
        return None
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    return aware.astimezone(JAKARTA_TZ).isoformat()


def _row_to_dict(row: BrandMaterial) -> dict:
    mt = getattr(row, "media_type", None) or media_type_from_mime(row.mime_type)
    return {
        "id": row.id,
        "sku": row.sku,
        "category": row.category,
        "mediaType": mt,
        "subIndex": row.sub_index,
        "mimeType": row.mime_type,
        "sizeBytes": row.size_bytes,
        "uploadedAt": _uploaded_at_jakarta_iso(row.uploaded_at),
        "uploadedBy": row.uploaded_by or "",
        "note": getattr(row, "note", None) or "",
        "gcsObjectPath": row.gcs_object_path,
        "hasPreview": bool(getattr(row, "preview_gcs_object_path", None)),
    }


FREEMIR_SKU_RE = re.compile(r"^[A-Z]{2}\d{4}[A-Z]\d{5}$", re.I)


def _parse_sku_filter_tokens(sku_filter: str) -> list[str]:
    raw = (sku_filter or "").strip()
    if not raw:
        return []
    parts = re.split(r"[\s,;\n\r]+", raw)
    return [p.strip().upper() for p in parts if p.strip()]


def _is_freemir_sku(value: str) -> bool:
    return bool(FREEMIR_SKU_RE.match((value or "").strip().upper()))


def _parse_freemir_sku_tokens(raw: str) -> list[str]:
    """Extract valid Freemir SKUs from pasted text (aligned with frontend skuIndex)."""
    text = (raw or "").strip()
    if not text:
        return []
    found: set[str] = set()
    upper = text.upper()
    chunks = re.split(r"[\s,;\n\r\t]+", upper)
    token_re = re.compile(r"[A-Z]{2}\d{4}[A-Z]\d{5}")

    def collect(chunk: str) -> None:
        if _is_freemir_sku(chunk):
            found.add(chunk.upper())
            return
        for match in token_re.findall(chunk):
            if _is_freemir_sku(match):
                found.add(match.upper())

    for chunk in chunks:
        if chunk:
            collect(chunk)

    if not found or (len(chunks) == 1 and len(chunks[0]) > 12):
        compact = re.sub(r"\s+", "", upper)
        for match in token_re.findall(compact):
            if _is_freemir_sku(match):
                found.add(match.upper())

    return sorted(found)


def _skus_from_detail_search(
    query: str,
    search_index: dict[str, list[str]],
) -> list[str]:
    """SKUs whose catalog nicknames / localized names match the query."""
    needle = (query or "").strip().lower()
    if len(needle) < 2 or not search_index:
        return []

    tokens = [t for t in needle.split() if t]
    matched: list[str] = []

    for sku, haystacks in search_index.items():
        if not haystacks:
            continue
        hit = any(needle in h for h in haystacks)
        if not hit and len(tokens) > 1:
            hit = all(any(tok in h for h in haystacks) for tok in tokens)
        if hit:
            matched.append(sku)

    return matched


_COVERAGE_META_TTL_SECONDS = 300
_COVERAGE_META_CACHE: dict[str, Any] = {
    "ts": 0.0,
    "category": {},
    "status": {},
    "search_index": {},
    "sorted_all_names": [],
}


def invalidate_coverage_meta_cache() -> None:
    _COVERAGE_META_CACHE["ts"] = 0.0
    _COVERAGE_META_CACHE["category"] = {}
    _COVERAGE_META_CACHE["status"] = {}
    _COVERAGE_META_CACHE["search_index"] = {}
    _COVERAGE_META_CACHE["sorted_all_names"] = []


def _build_detail_search_index(db: Session) -> dict[str, list[str]]:
    from services.public_catalog_logic import _build_search_terms, _get_sku_detail_rows

    detail_rows = _get_sku_detail_rows()
    if not detail_rows:
        return {}

    skus = [
        str(row.get("SKU", "")).strip().upper()
        for row in detail_rows
        if str(row.get("SKU", "")).strip()
    ]
    if not skus:
        return {}

    name_rows = {
        (row.sku or "").strip().upper(): row
        for row in db.query(FreemirName).filter(FreemirName.sku.in_(skus)).all()
    }

    index: dict[str, list[str]] = {}
    for row in detail_rows:
        sku = str(row.get("SKU", "")).strip().upper()
        if not sku:
            continue
        terms = _build_search_terms(row, sku, name_rows.get(sku))
        haystacks = [str(t).strip().casefold() for t in terms if str(t).strip()]
        phrase = " ".join(haystacks)
        if phrase:
            haystacks.append(phrase)
        if haystacks:
            index[sku] = haystacks
    return index


def _get_coverage_meta(db: Session) -> tuple[dict[str, str], dict[str, str], dict[str, list[str]]]:
    now = time.time()
    cached_ts = float(_COVERAGE_META_CACHE.get("ts") or 0)
    if (
        cached_ts
        and (now - cached_ts) < _COVERAGE_META_TTL_SECONDS
        and _COVERAGE_META_CACHE.get("search_index")
    ):
        return (
            _COVERAGE_META_CACHE["category"],
            _COVERAGE_META_CACHE["status"],
            _COVERAGE_META_CACHE["search_index"],
        )

    category_map = _build_sku_category_map()
    status_map = _build_sku_status_map()
    search_index = _build_detail_search_index(db)
    _COVERAGE_META_CACHE.update({
        "ts": now,
        "category": category_map,
        "status": status_map,
        "search_index": search_index,
        "sorted_all_names": [],
    })
    return category_map, status_map, search_index


def _get_sorted_all_coverage_names(q, category_map: dict[str, str]) -> list:
    now = time.time()
    cached_ts = float(_COVERAGE_META_CACHE.get("ts") or 0)
    sorted_all = _COVERAGE_META_CACHE.get("sorted_all_names") or []
    if sorted_all and cached_ts and (now - cached_ts) < _COVERAGE_META_TTL_SECONDS:
        return sorted_all

    all_names = q.all()
    sorted_names = _sort_coverage_names(all_names, category_map)
    _COVERAGE_META_CACHE["sorted_all_names"] = sorted_names
    return sorted_names


def _apply_coverage_search(q, db: Session, sku_filter: str, search_index: dict[str, list[str]] | None = None):
    raw = (sku_filter or "").strip()
    if not raw:
        return q

    sku_tokens = _parse_freemir_sku_tokens(raw)
    if len(sku_tokens) > 1:
        keys = {_sku_key(t) for t in sku_tokens}
        return q.filter(func.lower(FreemirName.sku).in_(list(keys)))

    if len(sku_tokens) == 1:
        token = sku_tokens[0]
        return q.filter(FreemirName.sku.ilike(f"%{token}%"))

    like = f"%{raw}%"
    extra_skus = _skus_from_detail_search(raw, search_index or {})
    clauses = [
        FreemirName.sku.ilike(like),
        FreemirName.product_name.ilike(like),
        FreemirName.mark.ilike(like),
    ]
    if extra_skus:
        clauses.append(func.upper(FreemirName.sku).in_(extra_skus))
    return q.filter(or_(*clauses))


def list_materials(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 30,
    sku_filter: str = "",
    category: str = "all",
    media_type: str = "all",
) -> dict:
    q = db.query(BrandMaterial)

    cat = (category or "all").strip().lower()
    if cat in ("main", "sub"):
        q = q.filter(BrandMaterial.category == cat)

    mt = (media_type or "all").strip().lower()
    if mt in ("photo", "video"):
        q = q.filter(BrandMaterial.media_type == mt)

    tokens = _parse_sku_filter_tokens(sku_filter)
    if len(tokens) > 1:
        keys = [_sku_key(t) for t in tokens]
        q = q.filter(BrandMaterial.sku_key.in_(keys))
    elif len(tokens) == 1:
        q = q.filter(BrandMaterial.sku.ilike(f"%{tokens[0]}%"))

    total = q.count()
    page = max(1, int(page or 1))
    page_size = min(max(1, int(page_size or 30)), 100)

    order_cat = case((BrandMaterial.category == "main", 0), else_=1)
    rows = (
        q.order_by(
            BrandMaterial.sku_key.asc(),
            BrandMaterial.media_type.asc(),
            order_cat.asc(),
            BrandMaterial.sub_index.asc().nullsfirst(),
            BrandMaterial.id.asc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [_row_to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


DETAIL_SEARCH_MAX_PAGE_SIZE = 24  # 3 rows × 8 cols on desktop


def search_materials_detail(
    db: Session,
    *,
    query: str,
    page: int = 1,
    page_size: int = DETAIL_SEARCH_MAX_PAGE_SIZE,
) -> dict:
    """Cross-SKU material search — note, SKU, or product name (incl. catalog nicknames)."""
    raw = (query or "").strip()
    if len(raw) < 2:
        return {
            "items": [],
            "total": 0,
            "page": max(1, int(page or 1)),
            "pageSize": min(max(1, int(page_size or DETAIL_SEARCH_MAX_PAGE_SIZE)), DETAIL_SEARCH_MAX_PAGE_SIZE),
        }

    page = max(1, int(page or 1))
    page_size = min(
        max(1, int(page_size or DETAIL_SEARCH_MAX_PAGE_SIZE)),
        DETAIL_SEARCH_MAX_PAGE_SIZE,
    )

    _, _, search_index = _get_coverage_meta(db)
    sku_tokens = _parse_freemir_sku_tokens(raw)
    like = f"%{raw}%"

    q = db.query(BrandMaterial)

    if len(sku_tokens) > 1:
        keys = [_sku_key(t) for t in sku_tokens]
        q = q.filter(BrandMaterial.sku_key.in_(keys))
    elif len(sku_tokens) == 1:
        q = q.filter(BrandMaterial.sku.ilike(f"%{sku_tokens[0]}%"))
    else:
        name_matching_keys: set[str] = set()
        extra_skus = _skus_from_detail_search(raw, search_index)
        for row in db.query(FreemirName).filter(
            or_(
                FreemirName.sku.ilike(like),
                FreemirName.product_name.ilike(like),
                FreemirName.mark.ilike(like),
            )
        ).all():
            key = _sku_key(row.sku)
            if key:
                name_matching_keys.add(key)
        if extra_skus:
            for row in db.query(FreemirName).filter(
                func.upper(FreemirName.sku).in_(extra_skus)
            ).all():
                key = _sku_key(row.sku)
                if key:
                    name_matching_keys.add(key)

        clauses = [
            BrandMaterial.note.ilike(like),
            BrandMaterial.sku.ilike(like),
        ]
        if name_matching_keys:
            clauses.append(BrandMaterial.sku_key.in_(list(name_matching_keys)))
        q = q.filter(or_(*clauses))

    total = q.count()
    order_cat = case((BrandMaterial.category == "main", 0), else_=1)
    rows = (
        q.order_by(
            BrandMaterial.sku_key.asc(),
            BrandMaterial.media_type.asc(),
            order_cat.asc(),
            BrandMaterial.sub_index.asc().nullsfirst(),
            BrandMaterial.id.asc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    sku_keys = list({_sku_key(r.sku) for r in rows if r.sku})
    product_names: dict[str, str] = {}
    if sku_keys:
        for name_row in db.query(FreemirName).filter(
            func.lower(FreemirName.sku).in_(sku_keys)
        ).all():
            key = _sku_key(name_row.sku)
            if key:
                product_names[key] = (name_row.product_name or "").strip()

    items = []
    for row in rows:
        item = _row_to_dict(row)
        item["productName"] = product_names.get(_sku_key(row.sku), "")
        items.append(item)

    return {
        "items": items,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


def _row_media_type(row: BrandMaterial) -> str:
    return getattr(row, "media_type", None) or media_type_from_mime(row.mime_type)


def _pick_cover_row(rows: list[BrandMaterial], media_type: str = "all") -> Optional[BrandMaterial]:
    """Cover prefers Main; falls back to Sub when no Main for the filtered type."""
    if not rows:
        return None

    mt = (media_type or "all").strip().lower()

    def pick_typed(want_mt: str) -> Optional[BrandMaterial]:
        for cat in ("main", "sub"):
            for row in rows:
                if row.category == cat and _row_media_type(row) == want_mt:
                    return row
        return None

    if mt == "photo":
        return pick_typed("photo")
    if mt == "video":
        return pick_typed("video")

    for pred in (
        lambda r: r.category == "main" and _row_media_type(r) == "photo",
        lambda r: r.category == "main" and _row_media_type(r) == "video",
        lambda r: r.category == "main",
        lambda r: r.category == "sub" and _row_media_type(r) == "photo",
        lambda r: r.category == "sub" and _row_media_type(r) == "video",
    ):
        for row in rows:
            if pred(row):
                return row
    return rows[0]


def _folder_children(rows: list[BrandMaterial]) -> list[BrandMaterial]:
    subs = [r for r in rows if r.category == "sub"]
    return sorted(subs, key=lambda r: (r.sub_index or 0, r.id))


def list_material_folders(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 24,
    sku_filter: str = "",
    media_type: str = "all",
) -> dict:
    """Paginate by SKU — each folder has a cover (Main preferred, else Sub)."""
    q = db.query(BrandMaterial)

    mt = (media_type or "all").strip().lower()
    if mt in ("photo", "video"):
        q = q.filter(BrandMaterial.media_type == mt)

    tokens = _parse_sku_filter_tokens(sku_filter)
    if len(tokens) > 1:
        keys = [_sku_key(t) for t in tokens]
        q = q.filter(BrandMaterial.sku_key.in_(keys))
    elif len(tokens) == 1:
        q = q.filter(BrandMaterial.sku.ilike(f"%{tokens[0]}%"))

    sku_groups = (
        q.with_entities(
            BrandMaterial.sku_key,
            func.max(BrandMaterial.sku).label("sku"),
        )
        .group_by(BrandMaterial.sku_key)
        .order_by(BrandMaterial.sku_key.asc())
    )

    total = sku_groups.count()
    page = max(1, int(page or 1))
    page_size = min(max(1, int(page_size or 24)), 60)

    page_rows = (
        sku_groups.offset((page - 1) * page_size).limit(page_size).all()
    )

    order_cat = case((BrandMaterial.category == "main", 0), else_=1)
    folders = []
    for sku_key, sku in page_rows:
        materials = (
            db.query(BrandMaterial)
            .filter(BrandMaterial.sku_key == sku_key)
            .order_by(
                BrandMaterial.media_type.asc(),
                order_cat.asc(),
                BrandMaterial.sub_index.asc().nullsfirst(),
                BrandMaterial.id.asc(),
            )
            .all()
        )
        cover = _pick_cover_row(materials, mt)
        children = _folder_children(materials)
        folders.append(
            {
                "sku": sku or (materials[0].sku if materials else ""),
                "cover": _row_to_dict(cover) if cover else None,
                "children": [_row_to_dict(c) for c in children],
                "itemCount": len(materials),
            }
        )

    return {
        "folders": folders,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


def list_materials_by_sku(
    db: Session,
    sku: str,
    *,
    media_type: str = "all",
) -> dict:
    """All materials for one SKU (detail page)."""
    sku_norm = normalize_sku(sku).upper()
    if not sku_norm:
        raise ValueError("SKU_REQUIRED")

    key = _sku_key(sku_norm)
    q = db.query(BrandMaterial).filter(BrandMaterial.sku_key == key)

    mt = (media_type or "all").strip().lower()
    if mt in ("photo", "video"):
        q = q.filter(BrandMaterial.media_type == mt)

    order_cat = case((BrandMaterial.category == "main", 0), else_=1)
    rows = (
        q.order_by(
            BrandMaterial.media_type.asc(),
            order_cat.asc(),
            BrandMaterial.sub_index.asc().nullsfirst(),
            BrandMaterial.id.asc(),
        )
        .all()
    )

    return {
        "sku": rows[0].sku if rows else sku_norm,
        "items": [_row_to_dict(r) for r in rows],
    }


def _coverage_counts_template() -> dict:
    return {
        "videoMain": 0,
        "videoSub": 0,
        "photoMain": 0,
        "photoSub": 0,
    }


def _build_sku_status_map() -> dict[str, str]:
    """SKU → raw Status from SKU_Detail (e.g. Zero Sales = discontinued)."""
    from services.public_catalog_logic import _get_sku_detail_rows

    out: dict[str, str] = {}
    for row in _get_sku_detail_rows():
        sku = str(row.get("SKU", "")).strip().upper()
        if not sku:
            continue
        status = str(row.get("Status", "")).strip()
        out[sku] = status
    return out


def _is_discontinued_sku(sku: str, status_map: dict[str, str]) -> bool:
    from services.public_catalog_logic import _norm_status

    status = status_map.get((sku or "").strip().upper(), "")
    return _norm_status(status) == "zerosales"


def _build_sku_category_map(lang: str = "EN") -> dict[str, str]:
    """SKU → catalog category (L2 preferred, else L1) — aligned with product catalog."""
    from services.public_catalog_logic import _get_sku_detail_rows, _pick_lang_value

    out: dict[str, str] = {}
    for row in _get_sku_detail_rows():
        sku = str(row.get("SKU", "")).strip().upper()
        if not sku:
            continue
        l2 = _pick_lang_value(row, "Level_2_Category", lang)
        l1 = _pick_lang_value(row, "Level_1_Category", lang)
        out[sku] = (l2 or l1 or "Other").strip() or "Other"
    return out


def _coverage_category_key(sku: str, category_map: dict[str, str]) -> str:
    return category_map.get((sku or "").strip().upper(), "Other")


def _sort_coverage_names(
    names: list,
    category_map: dict[str, str],
) -> list:
    """Category groups with most SKUs first (product catalog), then SKU A–Z within group."""
    counts = Counter(_coverage_category_key(n.sku, category_map) for n in names)

    def sort_key(row) -> tuple:
        sku = (row.sku or "").strip().upper()
        cat = _coverage_category_key(sku, category_map)
        return (-counts[cat], cat, sku)

    return sorted(names, key=sort_key)


def list_material_coverage(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 50,
    sku_filter: str = "",
) -> dict:
    """SKU_Info catalog vs Material Library — counts per SKU."""
    category_map, status_map, search_index = _get_coverage_meta(db)
    q = db.query(FreemirName)
    q = _apply_coverage_search(q, db, sku_filter, search_index)

    page = max(1, int(page or 1))
    page_size = min(max(1, int(page_size or 50)), 200)

    if not (sku_filter or "").strip():
        sorted_names = _get_sorted_all_coverage_names(q, category_map)
    else:
        sorted_names = _sort_coverage_names(q.all(), category_map)

    total = len(sorted_names)
    offset = (page - 1) * page_size
    names = sorted_names[offset : offset + page_size]

    sku_keys = [_sku_key(n.sku) for n in names if n.sku]
    stats: dict[str, dict] = {k: _coverage_counts_template() for k in sku_keys}
    main_photo_by_key: dict[str, str] = {}

    if sku_keys:
        materials = (
            db.query(BrandMaterial)
            .filter(BrandMaterial.sku_key.in_(sku_keys))
            .all()
        )
        materials_by_key: dict[str, list[BrandMaterial]] = defaultdict(list)
        for row in materials:
            materials_by_key[row.sku_key].append(row)

        for key, rows in materials_by_key.items():
            if key not in stats:
                stats[key] = _coverage_counts_template()
            for row in rows:
                mt = _row_media_type(row)
                cat = (row.category or "").lower()
                if mt == "video":
                    if cat == "main":
                        stats[key]["videoMain"] += 1
                    else:
                        stats[key]["videoSub"] += 1
                else:
                    if cat == "main":
                        stats[key]["photoMain"] += 1
                    else:
                        stats[key]["photoSub"] += 1

            main_photo = next(
                (
                    row for row in sorted(rows, key=lambda r: r.id or "")
                    if row.category == "main" and _row_media_type(row) == "photo"
                ),
                None,
            )
            if main_photo:
                main_photo_by_key[key] = main_photo.id

    items = []
    for n in names:
        key = _sku_key(n.sku)
        counts = stats.get(key, _coverage_counts_template())
        has_materials = sum(counts.values()) > 0
        items.append(
            {
                "sku": n.sku,
                "productName": (n.product_name or "").strip(),
                "category": _coverage_category_key(n.sku, category_map),
                "skuInfoImageUrl": (n.link or "").strip(),
                "mainPhotoMaterialId": main_photo_by_key.get(key),
                **counts,
                "hasMaterials": has_materials,
                "isDiscontinued": _is_discontinued_sku(n.sku, status_map),
            }
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


def reorder_sub_materials(
    db: Session,
    *,
    sku: str,
    media_type: str,
    ordered_ids: list[str],
) -> dict:
    """Persist drag-and-drop order for Sub items of one SKU + media type."""
    sku_norm = normalize_sku(sku).upper()
    if not sku_norm:
        raise ValueError("SKU_REQUIRED")

    mt = normalize_media_type(media_type)
    if mt not in ("photo", "video"):
        raise ValueError("INVALID_MEDIA_TYPE")

    if not ordered_ids:
        raise ValueError("REORDER_EMPTY")

    key = _sku_key(sku_norm)
    rows = (
        db.query(BrandMaterial)
        .filter(
            BrandMaterial.sku_key == key,
            BrandMaterial.category == "sub",
            BrandMaterial.media_type == mt,
        )
        .all()
    )
    existing_ids = {r.id for r in rows}
    if len(ordered_ids) != len(existing_ids) or set(ordered_ids) != existing_ids:
        raise ValueError("REORDER_MISMATCH")

    id_to_row = {r.id: r for r in rows}
    for idx, mid in enumerate(ordered_ids, start=1):
        id_to_row[mid].sub_index = idx
    db.commit()

    return {"ok": True, "sku": sku_norm, "mediaType": mt}


def _renumber_subs(db: Session, sku: str, media_type: str) -> None:
    key = _sku_key(sku)
    mt = normalize_media_type(media_type)
    subs = (
        db.query(BrandMaterial)
        .filter(
            BrandMaterial.sku_key == key,
            BrandMaterial.category == "sub",
            BrandMaterial.media_type == mt,
        )
        .order_by(BrandMaterial.sub_index.asc(), BrandMaterial.id.asc())
        .all()
    )
    for idx, row in enumerate(subs, start=1):
        if row.sub_index != idx:
            row.sub_index = idx
    db.commit()


def _demote_main_to_sub(db: Session, main_row: BrandMaterial) -> None:
    key = main_row.sku_key
    mt = getattr(main_row, "media_type", None) or media_type_from_mime(main_row.mime_type)
    max_idx = (
        db.query(BrandMaterial.sub_index)
        .filter(
            BrandMaterial.sku_key == key,
            BrandMaterial.category == "sub",
            BrandMaterial.media_type == mt,
        )
        .order_by(BrandMaterial.sub_index.desc())
        .first()
    )
    next_idx = (max_idx[0] if max_idx and max_idx[0] else 0) + 1
    main_row.category = "sub"
    main_row.sub_index = next_idx


def _preview_object_path(sku: str, material_id: str) -> str:
    safe_sku = re.sub(r"[^\w\-]+", "_", normalize_sku(sku))
    return f"{GCS_PREFIX}/{safe_sku}/.preview_{material_id}.jpg"


def _compression_meta(original: int, compressed: int, *, crf: int) -> dict:
    return {
        "applied": True,
        "originalBytes": original,
        "sizeBytes": compressed,
        "codec": "h264",
        "crf": crf,
    }


def _compression_skipped(original: int, reason: str) -> dict:
    return {
        "applied": False,
        "originalBytes": original,
        "sizeBytes": original,
        "reason": reason,
    }


def _resolve_ffmpeg_path() -> str | None:
    env = os.getenv("FFMPEG_PATH", "").strip()
    if env and os.path.isfile(env):
        return env
    found = shutil.which("ffmpeg")
    if found:
        return found
    if sys.platform != "win32":
        return None
    local = os.environ.get("LOCALAPPDATA", "")
    candidates = [
        os.path.join(local, "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
    ]
    winget_pkg = os.path.join(local, "Microsoft", "WinGet", "Packages")
    if os.path.isdir(winget_pkg):
        for name in os.listdir(winget_pkg):
            if "ffmpeg" not in name.lower():
                continue
            for sub in ("bin", "ffmpeg-8.1.1-full_build/bin", "ffmpeg-7.1-full_build/bin"):
                exe = os.path.join(winget_pkg, name, sub, "ffmpeg.exe")
                if os.path.isfile(exe):
                    candidates.append(exe)
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


def _video_compress_crf(size_bytes: int) -> int:
    """Slightly stronger settings for larger sources — still visually clean."""
    if size_bytes > 80 * 1024 * 1024:
        return min(28, VIDEO_COMPRESS_CRF + 6)
    if size_bytes > 50 * 1024 * 1024:
        return min(26, VIDEO_COMPRESS_CRF + 4)
    if size_bytes > 40 * 1024 * 1024:
        return min(23, VIDEO_COMPRESS_CRF + 2)
    return VIDEO_COMPRESS_CRF


def _ffmpeg_compress_video_file(
    input_path: str,
    output_path: str,
    *,
    crf: int | None = None,
) -> bool:
    """Re-encode to H.264/AAC MP4 — CRF keeps visual quality while shrinking large uploads."""
    ffmpeg = _resolve_ffmpeg_path()
    if not ffmpeg:
        return False
    use_crf = crf if crf is not None else VIDEO_COMPRESS_CRF
    base = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        input_path,
        "-c:v",
        "libx264",
        "-crf",
        str(use_crf),
        "-preset",
        VIDEO_COMPRESS_PRESET,
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
    ]
    for audio_args in (["-c:a", "aac", "-b:a", "128k", "-ac", "2"], ["-an"]):
        cmd = base + audio_args + [output_path]
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                timeout=VIDEO_COMPRESS_TIMEOUT_SEC,
            )
            if (
                proc.returncode == 0
                and os.path.isfile(output_path)
                and os.path.getsize(output_path) > 0
            ):
                return True
        except (subprocess.TimeoutExpired, OSError):
            return False
    return False


def compress_video_bytes_if_large(
    file_bytes: bytes,
    mime_type: str,
) -> tuple[bytes, str, dict | None]:
    """Compress large videos in-memory (multipart upload path)."""
    original = len(file_bytes or b"")
    if original <= VIDEO_COMPRESS_MIN_BYTES:
        return file_bytes, mime_type, None
    if media_type_from_mime(mime_type) != "video":
        return file_bytes, mime_type, None

    crf = _video_compress_crf(original)
    with tempfile.TemporaryDirectory() as tmp:
        ext = MIME_EXT.get((mime_type or "").lower(), "mp4")
        inp = os.path.join(tmp, f"src.{ext}")
        out = os.path.join(tmp, "out.mp4")
        with open(inp, "wb") as fh:
            fh.write(file_bytes)
        if not _ffmpeg_compress_video_file(inp, out, crf=crf):
            print(f"[brand-material] ffmpeg compress skipped — binary not found or encode failed ({original} bytes)")
            return file_bytes, mime_type, _compression_skipped(original, "FFMPEG_UNAVAILABLE")
        new_size = os.path.getsize(out)
        if new_size >= original:
            print(f"[brand-material] ffmpeg output not smaller ({original} → {new_size} bytes), keeping original")
            return file_bytes, mime_type, _compression_skipped(original, "ALREADY_OPTIMIZED")
        with open(out, "rb") as fh:
            compressed = fh.read()
        print(f"[brand-material] video compressed {original} → {new_size} bytes (crf={crf})")
        return compressed, "video/mp4", _compression_meta(original, new_size, crf=crf)


def compress_gcs_video_blob_if_large(
    bucket,
    blob,
    mime_type: str,
) -> tuple[int, str, dict | None]:
    """Compress a pending/final GCS video blob in place when it exceeds the threshold."""
    blob.reload()
    original = int(blob.size or 0)
    if original <= VIDEO_COMPRESS_MIN_BYTES:
        return original, mime_type, None
    if media_type_from_mime(mime_type) != "video":
        return original, mime_type, None

    crf = _video_compress_crf(original)
    with tempfile.TemporaryDirectory() as tmp:
        ext = MIME_EXT.get((mime_type or "").lower(), "mp4")
        inp = os.path.join(tmp, f"src.{ext}")
        out = os.path.join(tmp, "out.mp4")
        blob.download_to_filename(inp)
        if not _ffmpeg_compress_video_file(inp, out, crf=crf):
            print(f"[brand-material] gcs ffmpeg compress skipped ({original} bytes)")
            return original, mime_type, _compression_skipped(original, "FFMPEG_UNAVAILABLE")
        new_size = os.path.getsize(out)
        if new_size >= original:
            print(f"[brand-material] gcs output not smaller ({original} → {new_size}), keeping original")
            return original, mime_type, _compression_skipped(original, "ALREADY_OPTIMIZED")
        with open(out, "rb") as fh:
            payload = fh.read()
        blob.upload_from_string(payload, content_type="video/mp4")
        print(f"[brand-material] gcs video compressed {original} → {new_size} bytes (crf={crf})")
        return new_size, "video/mp4", _compression_meta(original, new_size, crf=crf)


def _pending_upload_path(sku: str, material_id: str, mime_type: str) -> str:
    safe_sku = re.sub(r"[^\w\-]+", "_", normalize_sku(sku))
    ext = MIME_EXT.get((mime_type or "").lower(), "bin")
    return f"{GCS_PREFIX}/{safe_sku}/.pending_{material_id}.{ext}"


def init_direct_material_upload(
    *,
    sku: str,
    category: str,
    media_type: str,
    mime_type: str,
    size_bytes: int,
) -> dict:
    """Issue a signed GCS PUT URL for files that exceed Cloud Run's HTTP body limit."""
    sku_norm = normalize_sku(sku)
    if not sku_norm:
        raise ValueError("SKU_REQUIRED")
    if category not in ("main", "sub"):
        raise ValueError("INVALID_CATEGORY")
    if not mime_type or not is_allowed_media_mime(mime_type):
        raise ValueError("MEDIA_REQUIRED")

    size = int(size_bytes or 0)
    if size <= 0:
        raise ValueError("MEDIA_REQUIRED")
    if size > MAX_UPLOAD_BYTES:
        raise ValueError("FILE_TOO_LARGE")
    if size < DIRECT_UPLOAD_THRESHOLD_BYTES:
        raise ValueError("USE_REGULAR_UPLOAD")

    mt = normalize_media_type(media_type, mime_type)
    assert_type_matches_mime(mt, mime_type)

    ensure_gcs_upload_cors()

    material_id = f"bm_{uuid.uuid4().hex[:16]}"
    pending_path = _pending_upload_path(sku_norm, material_id, mime_type)
    signed_url = brand_material_signed_write_url(pending_path, mime_type)
    if not signed_url:
        raise ValueError("SIGNED_URL_FAILED")

    return {
        "materialId": material_id,
        "signedUrl": signed_url,
        "objectPath": pending_path,
        "contentType": mime_type,
    }


def complete_direct_material_upload(
    db: Session,
    *,
    material_id: str,
    pending_path: str,
    sku: str,
    category: str,
    media_type: str,
    mime_type: str,
    uploaded_by: str = "",
    preview_bytes: bytes | None = None,
    note: str | None = None,
) -> dict:
    """Finalize a direct GCS upload — copy pending blob to final path and create DB row."""
    sku_norm = normalize_sku(sku)
    if not sku_norm:
        raise ValueError("SKU_REQUIRED")
    if category not in ("main", "sub"):
        raise ValueError("INVALID_CATEGORY")
    if not mime_type or not is_allowed_media_mime(mime_type):
        raise ValueError("MEDIA_REQUIRED")

    mid = (material_id or "").strip()
    path = (pending_path or "").strip()
    if not mid or f".pending_{mid}." not in path:
        raise ValueError("INVALID_UPLOAD_SESSION")

    mt = normalize_media_type(media_type, mime_type)
    assert_type_matches_mime(mt, mime_type)

    client = get_storage_client()
    bucket = client.bucket(GCS_BUCKET)
    pending_blob = bucket.blob(path)
    if not pending_blob.exists():
        raise ValueError("GCS_OBJECT_MISSING")
    pending_blob.reload()
    size_bytes = int(pending_blob.size or 0)
    if size_bytes <= 0:
        pending_blob.delete()
        raise ValueError("MEDIA_REQUIRED")
    if size_bytes > MAX_UPLOAD_BYTES:
        pending_blob.delete()
        raise ValueError("FILE_TOO_LARGE")

    compression_meta = None
    if mt == "video":
        size_bytes, mime_type, compression_meta = compress_gcs_video_blob_if_large(
            bucket, pending_blob, mime_type,
        )
        if size_bytes > MAX_UPLOAD_BYTES:
            pending_blob.delete()
            raise ValueError("FILE_TOO_LARGE")

    sku_k = _sku_key(sku_norm)
    sub_index = None

    if category == "main":
        existing_mains = (
            db.query(BrandMaterial)
            .filter(
                BrandMaterial.sku_key == sku_k,
                BrandMaterial.category == "main",
                BrandMaterial.media_type == mt,
            )
            .all()
        )
        for row in existing_mains:
            _demote_main_to_sub(db, row)
        db.flush()
    else:
        max_idx = (
            db.query(BrandMaterial.sub_index)
            .filter(
                BrandMaterial.sku_key == sku_k,
                BrandMaterial.category == "sub",
                BrandMaterial.media_type == mt,
            )
            .order_by(BrandMaterial.sub_index.desc())
            .first()
        )
        sub_index = (max_idx[0] if max_idx and max_idx[0] else 0) + 1

    file_name = storage_file_name(sku_norm, category, sub_index, mime_type)
    final_path = _gcs_object_path(sku_norm, file_name)

    preview_payload = preview_bytes
    if mt == "photo" and not preview_payload:
        try:
            preview_payload = _thumbnail_image_bytes(pending_blob.download_as_bytes())
        except (UnidentifiedImageError, OSError, ValueError):
            preview_payload = None

    bucket.copy_blob(pending_blob, bucket, final_path)
    pending_blob.delete()

    now = datetime.now(timezone.utc)
    preview_path = None
    if preview_payload:
        preview_path = _preview_object_path(sku_norm, mid)
        bucket.blob(preview_path).upload_from_string(
            preview_payload, content_type="image/jpeg",
        )

    row = BrandMaterial(
        id=mid,
        sku=sku_norm,
        sku_key=sku_k,
        category=category,
        media_type=mt,
        sub_index=sub_index,
        gcs_object_path=final_path,
        preview_gcs_object_path=preview_path,
        mime_type=mime_type,
        size_bytes=size_bytes,
        uploaded_at=now,
        uploaded_by=uploaded_by or "",
        note=normalize_note(note),
    )
    db.add(row)
    db.commit()

    if category == "main":
        _renumber_subs(db, sku_norm, mt)

    db.refresh(row)
    result = _row_to_dict(row)
    if compression_meta is not None:
        result["compression"] = compression_meta
    return result


def upload_material(
    db: Session,
    *,
    sku: str,
    category: str,
    media_type: str,
    file_bytes: bytes,
    mime_type: str,
    uploaded_by: str = "",
    preview_bytes: bytes | None = None,
    note: str | None = None,
) -> dict:
    sku_norm = normalize_sku(sku)
    if not sku_norm:
        raise ValueError("SKU_REQUIRED")
    if category not in ("main", "sub"):
        raise ValueError("INVALID_CATEGORY")
    if not mime_type or not is_allowed_media_mime(mime_type):
        raise ValueError("MEDIA_REQUIRED")
    if not file_bytes:
        raise ValueError("MEDIA_REQUIRED")

    mt = normalize_media_type(media_type, mime_type)
    assert_type_matches_mime(mt, mime_type)

    compression_meta = None
    if mt == "video" and len(file_bytes) > VIDEO_COMPRESS_MIN_BYTES:
        file_bytes, mime_type, compression_meta = compress_video_bytes_if_large(
            file_bytes, mime_type,
        )
        if len(file_bytes) > MAX_UPLOAD_BYTES:
            raise ValueError("FILE_TOO_LARGE")

    sku_k = _sku_key(sku_norm)
    sub_index = None

    if category == "main":
        existing_mains = (
            db.query(BrandMaterial)
            .filter(
                BrandMaterial.sku_key == sku_k,
                BrandMaterial.category == "main",
                BrandMaterial.media_type == mt,
            )
            .all()
        )
        for row in existing_mains:
            _demote_main_to_sub(db, row)
        db.flush()
    else:
        max_idx = (
            db.query(BrandMaterial.sub_index)
            .filter(
                BrandMaterial.sku_key == sku_k,
                BrandMaterial.category == "sub",
                BrandMaterial.media_type == mt,
            )
            .order_by(BrandMaterial.sub_index.desc())
            .first()
        )
        sub_index = (max_idx[0] if max_idx and max_idx[0] else 0) + 1

    file_name = storage_file_name(sku_norm, category, sub_index, mime_type)
    object_path = _gcs_object_path(sku_norm, file_name)

    client = get_storage_client()
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob(object_path)
    blob.upload_from_string(file_bytes, content_type=mime_type)

    row_id = f"bm_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)
    preview_path = None
    preview_payload = preview_bytes
    if mt == "photo" and not preview_payload:
        try:
            preview_payload = _thumbnail_image_bytes(file_bytes)
        except (UnidentifiedImageError, OSError, ValueError):
            preview_payload = None
    if preview_payload:
        preview_path = _preview_object_path(sku_norm, row_id)
        bucket.blob(preview_path).upload_from_string(
            preview_payload, content_type="image/jpeg",
        )

    row = BrandMaterial(
        id=row_id,
        sku=sku_norm,
        sku_key=sku_k,
        category=category,
        media_type=mt,
        sub_index=sub_index,
        gcs_object_path=object_path,
        preview_gcs_object_path=preview_path,
        mime_type=mime_type,
        size_bytes=len(file_bytes),
        uploaded_at=now,
        uploaded_by=uploaded_by or "",
        note=normalize_note(note),
    )
    db.add(row)
    db.commit()

    if category == "main":
        _renumber_subs(db, sku_norm, mt)

    db.refresh(row)
    result = _row_to_dict(row)
    if compression_meta is not None:
        result["compression"] = compression_meta
    return result


def update_material(
    db: Session,
    material_id: str,
    *,
    sku: str,
    category: str,
    media_type: str,
    note: str | None = None,
) -> dict:
    sku_norm = normalize_sku(sku)
    if not sku_norm:
        raise ValueError("SKU_REQUIRED")
    if category not in ("main", "sub"):
        raise ValueError("INVALID_CATEGORY")

    row = db.query(BrandMaterial).filter(BrandMaterial.id == material_id).first()
    if not row:
        raise ValueError("NOT_FOUND")

    mt = normalize_media_type(media_type, row.mime_type)
    assert_type_matches_mime(mt, row.mime_type)

    old_sku = row.sku
    old_key = row.sku_key
    old_mt = getattr(row, "media_type", None) or media_type_from_mime(row.mime_type)
    new_key = _sku_key(sku_norm)

    if category == "main":
        others = (
            db.query(BrandMaterial)
            .filter(
                BrandMaterial.sku_key == new_key,
                BrandMaterial.category == "main",
                BrandMaterial.media_type == mt,
                BrandMaterial.id != material_id,
            )
            .all()
        )
        for other in others:
            _demote_main_to_sub(db, other)
        db.flush()

    old_category = row.category
    row.sku = sku_norm
    row.sku_key = new_key
    row.category = category
    row.media_type = mt
    if note is not None:
        row.note = normalize_note(note)

    if category == "main":
        row.sub_index = None
    else:
        if old_category != "sub" or old_key != new_key or old_mt != mt or row.sub_index is None:
            max_idx = (
                db.query(BrandMaterial.sub_index)
                .filter(
                    BrandMaterial.sku_key == new_key,
                    BrandMaterial.category == "sub",
                    BrandMaterial.media_type == mt,
                    BrandMaterial.id != material_id,
                )
                .order_by(BrandMaterial.sub_index.desc())
                .first()
            )
            row.sub_index = (max_idx[0] if max_idx and max_idx[0] else 0) + 1

    db.commit()
    _renumber_subs(db, sku_norm, mt)
    if old_key != new_key or old_mt != mt:
        _renumber_subs(db, old_sku, old_mt)

    db.refresh(row)
    return _row_to_dict(row)


def _delete_gcs_objects_parallel(object_paths: list[str]) -> None:
    paths = [p for p in object_paths if p]
    if not paths:
        return
    try:
        client = get_storage_client()
        bucket = client.bucket(GCS_BUCKET)
    except Exception as e:
        print(f"[BrandMaterial] GCS client unavailable for bulk delete: {e}")
        return

    def _delete_one(path: str) -> None:
        try:
            bucket.blob(path).delete()
        except Exception as e:
            print(f"[BrandMaterial] GCS delete warning for {path}: {e}")

    workers = min(12, max(1, len(paths)))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        list(executor.map(_delete_one, paths))


def delete_materials_bulk(db: Session, material_ids: list[str]) -> dict:
    """Delete many materials in one request — parallel GCS, single DB commit."""
    ids = list(dict.fromkeys(i.strip() for i in material_ids if i and str(i).strip()))
    if not ids:
        return {"deleted": 0, "notFound": []}

    rows = db.query(BrandMaterial).filter(BrandMaterial.id.in_(ids)).all()
    if not rows:
        return {"deleted": 0, "notFound": ids}

    found_ids = {r.id for r in rows}
    paths = []
    for r in rows:
        paths.append(r.gcs_object_path)
        if getattr(r, "preview_gcs_object_path", None):
            paths.append(r.preview_gcs_object_path)
    _delete_gcs_objects_parallel(paths)

    affected: set[tuple[str, str]] = set()
    for row in rows:
        mt = getattr(row, "media_type", None) or media_type_from_mime(row.mime_type)
        affected.add((row.sku, mt))
        db.delete(row)

    db.commit()

    for sku, mt in affected:
        _renumber_subs(db, sku, mt)

    return {
        "deleted": len(rows),
        "notFound": [i for i in ids if i not in found_ids],
    }


def delete_material(db: Session, material_id: str) -> None:
    row = db.query(BrandMaterial).filter(BrandMaterial.id == material_id).first()
    if not row:
        raise ValueError("NOT_FOUND")

    sku = row.sku
    mt = getattr(row, "media_type", None) or media_type_from_mime(row.mime_type)
    paths = [row.gcs_object_path]
    if getattr(row, "preview_gcs_object_path", None):
        paths.append(row.preview_gcs_object_path)
    _delete_gcs_objects_parallel(paths)

    db.delete(row)
    db.commit()
    _renumber_subs(db, sku, mt)


PREVIEW_MAX_PX = 420


def _thumbnail_image_bytes(raw: bytes, max_px: int = PREVIEW_MAX_PX) -> bytes:
    with Image.open(io.BytesIO(raw)) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=82, optimize=True)
        return out.getvalue()


def _ffmpeg_video_frame_jpeg(gcs_object_path: str, bucket) -> bytes | None:
    """Extract one JPEG frame via ffmpeg + signed GCS URL (optional; needs ffmpeg in PATH)."""
    if not shutil.which("ffmpeg"):
        return None
    blob = bucket.blob(gcs_object_path)
    if not blob.exists():
        return None
    try:
        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=10),
            method="GET",
        )
    except Exception:
        return None
    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            "0.5",
            "-i",
            signed_url,
            "-vframes",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "pipe:1",
        ],
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0 or not proc.stdout:
        return None
    return proc.stdout


def _persist_video_preview(db: Session, row: BrandMaterial, frame_bytes: bytes, bucket) -> str:
    preview_path = _preview_object_path(row.sku, row.id)
    bucket.blob(preview_path).upload_from_string(frame_bytes, content_type="image/jpeg")
    row.preview_gcs_object_path = preview_path
    db.commit()
    return preview_path


def get_material_preview(db: Session, material_id: str) -> tuple[bytes, str]:
    """Small JPEG for grid — uses stored video poster or resized photo."""
    row = db.query(BrandMaterial).filter(BrandMaterial.id == material_id).first()
    if not row:
        raise ValueError("NOT_FOUND")

    client = get_storage_client()
    bucket = client.bucket(GCS_BUCKET)
    preview_path = getattr(row, "preview_gcs_object_path", None)

    if preview_path:
        try:
            data = bucket.blob(preview_path).download_as_bytes()
        except Exception:
            raise ValueError("FILE_NOT_FOUND") from None
        return data, "image/jpeg"

    mime = (row.mime_type or "").lower()
    mt = getattr(row, "media_type", None) or media_type_from_mime(mime)
    if mt == "video" or mime.startswith("video/"):
        frame = _ffmpeg_video_frame_jpeg(row.gcs_object_path, bucket)
        if frame:
            _persist_video_preview(db, row, frame, bucket)
            return frame, "image/jpeg"
        raise ValueError("NO_PREVIEW")

    blob = bucket.blob(row.gcs_object_path)
    try:
        raw = blob.download_as_bytes()
    except Exception:
        raise ValueError("FILE_NOT_FOUND") from None
    if not mime.startswith("image/"):
        raise ValueError("NO_PREVIEW")

    try:
        thumb = _thumbnail_image_bytes(raw)
    except (UnidentifiedImageError, OSError, ValueError):
        return raw, mime or "application/octet-stream"

    try:
        ppath = _preview_object_path(row.sku, row.id)
        bucket.blob(ppath).upload_from_string(thumb, content_type="image/jpeg")
        row.preview_gcs_object_path = ppath
        db.commit()
    except Exception:
        pass
    return thumb, "image/jpeg"


def get_material_file(db: Session, material_id: str) -> tuple[bytes, str]:
    row = db.query(BrandMaterial).filter(BrandMaterial.id == material_id).first()
    if not row:
        raise ValueError("NOT_FOUND")

    client = get_storage_client()
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob(row.gcs_object_path)
    if not blob.exists():
        raise ValueError("FILE_NOT_FOUND")

    data = blob.download_as_bytes()
    return data, row.mime_type or "application/octet-stream"
