"""
Brand Material — metadata in PostgreSQL, files in Google Cloud Storage.
"""

from __future__ import annotations

import os
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from google.cloud import storage
from google.oauth2 import service_account
from sqlalchemy import case
from sqlalchemy.orm import Session

from models import BrandMaterial

GCS_BUCKET = os.getenv("GCS_BUCKET", "dachin-ai-picture")
GCS_PREFIX = os.getenv("GCS_BRAND_MATERIAL_PREFIX", "brand-material")
JAKARTA_TZ = ZoneInfo("Asia/Jakarta")

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
    }


def _parse_sku_filter_tokens(sku_filter: str) -> list[str]:
    raw = (sku_filter or "").strip()
    if not raw:
        return []
    parts = re.split(r"[\s,;\n\r]+", raw)
    return [p.strip().upper() for p in parts if p.strip()]


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


def upload_material(
    db: Session,
    *,
    sku: str,
    category: str,
    media_type: str,
    file_bytes: bytes,
    mime_type: str,
    uploaded_by: str = "",
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
    row = BrandMaterial(
        id=row_id,
        sku=sku_norm,
        sku_key=sku_k,
        category=category,
        media_type=mt,
        sub_index=sub_index,
        gcs_object_path=object_path,
        mime_type=mime_type,
        size_bytes=len(file_bytes),
        uploaded_at=now,
        uploaded_by=uploaded_by or "",
    )
    db.add(row)
    db.commit()

    if category == "main":
        _renumber_subs(db, sku_norm, mt)

    db.refresh(row)
    return _row_to_dict(row)


def update_material(
    db: Session,
    material_id: str,
    *,
    sku: str,
    category: str,
    media_type: str,
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
    _delete_gcs_objects_parallel([r.gcs_object_path for r in rows])

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
    _delete_gcs_objects_parallel([row.gcs_object_path])

    db.delete(row)
    db.commit()
    _renumber_subs(db, sku, mt)


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
