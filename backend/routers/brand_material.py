import re

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import SessionLocal
from models import BrandMaterial
from services.brand_material_logic import (
    MAX_UPLOAD_BYTES,
    complete_direct_material_upload,
    delete_material,
    delete_materials_bulk,
    get_material_file,
    get_material_preview,
    init_direct_material_upload,
    list_material_coverage,
    list_material_folders,
    list_materials,
    list_materials_by_sku,
    reorder_sub_materials,
    search_materials_detail,
    storage_file_name,
    update_material,
    upload_material,
)
from services.auth_logic import get_user_auth_claims_from_db
from services.permission_guard import require_tool_access

router = APIRouter(prefix="/api/brand-material", tags=["brand-material"])

SKU_PATTERN = re.compile(r"^[A-Z]{2}\d{4}[A-Z]\d{5}$")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class UpdateBody(BaseModel):
    sku: str = Field(min_length=1, max_length=32)
    category: str = Field(pattern=r"^(main|sub)$")
    mediaType: str = Field(pattern=r"^(photo|video)$")
    note: str | None = Field(default=None, max_length=500)


class BulkDeleteBody(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=200)


class ReorderBody(BaseModel):
    sku: str = Field(min_length=1, max_length=32)
    mediaType: str = Field(pattern=r"^(photo|video)$")
    orderedIds: list[str] = Field(..., min_length=1, max_length=200)


class DirectUploadInitBody(BaseModel):
    sku: str = Field(min_length=1, max_length=32)
    category: str = Field(default="sub", pattern=r"^(main|sub)$")
    mediaType: str = Field(default="photo", pattern=r"^(photo|video)$")
    mimeType: str = Field(min_length=1, max_length=128)
    sizeBytes: int = Field(ge=1)
    note: str | None = Field(default=None, max_length=500)


def _uploader_display_name(user: dict) -> str:
    """Admin-assigned display name from DB; not login username."""
    username = (user.get("username") or "").strip()
    if username:
        claims = get_user_auth_claims_from_db(username)
        if claims:
            name = (claims.get("name") or "").strip()
            if name:
                return name
    return (user.get("name") or user.get("username") or "").strip()


def _validate_sku(sku: str) -> str:
    s = (sku or "").strip().upper()
    if not SKU_PATTERN.match(s):
        raise HTTPException(status_code=400, detail="Invalid SKU format (12 characters, e.g. FR0208A00001)")
    return s


@router.get("/coverage", dependencies=[Depends(require_tool_access("brand_material"))])
def list_coverage(
    page: int = 1,
    page_size: int = 50,
    sku: str = "",
    include_discontinued: bool = False,
    db: Session = Depends(get_db),
):
    try:
        return list_material_coverage(
            db,
            page=page,
            page_size=page_size,
            sku_filter=sku,
            include_discontinued=include_discontinued,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/folders", dependencies=[Depends(require_tool_access("brand_material"))])
def list_folders(
    page: int = 1,
    page_size: int = 24,
    sku: str = "",
    media_type: str = "all",
    db: Session = Depends(get_db),
):
    try:
        return list_material_folders(
            db,
            page=page,
            page_size=page_size,
            sku_filter=sku,
            media_type=media_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/search-detail", dependencies=[Depends(require_tool_access("brand_material"))])
def search_detail(
    q: str = "",
    page: int = 1,
    page_size: int = 24,
    include_discontinued: bool = False,
    db: Session = Depends(get_db),
):
    try:
        return search_materials_detail(
            db,
            query=q,
            page=page,
            page_size=page_size,
            include_discontinued=include_discontinued,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/sku/{sku}", dependencies=[Depends(require_tool_access("brand_material"))])
def get_sku_catalog(
    sku: str,
    media_type: str = "all",
    db: Session = Depends(get_db),
):
    try:
        return list_materials_by_sku(db, sku, media_type=media_type)
    except ValueError as e:
        if str(e) == "SKU_REQUIRED":
            raise HTTPException(status_code=400, detail="SKU_REQUIRED") from e
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("", dependencies=[Depends(require_tool_access("brand_material"))])
def list_catalog(
    page: int = 1,
    page_size: int = 30,
    sku: str = "",
    category: str = "all",
    media_type: str = "all",
    db: Session = Depends(get_db),
):
    try:
        return list_materials(
            db,
            page=page,
            page_size=page_size,
            sku_filter=sku,
            category=category,
            media_type=media_type,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.post("/upload")
async def upload(
    sku: str = Form(...),
    category: str = Form("sub"),
    mediaType: str = Form("photo"),
    note: str = Form(""),
    file: UploadFile = File(...),
    poster: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user=Depends(require_tool_access("brand_material")),
):
    sku_norm = _validate_sku(sku)
    cat = (category or "sub").lower()
    if cat not in ("main", "sub"):
        raise HTTPException(status_code=400, detail="category must be main or sub")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="FILE_TOO_LARGE")
    mime = file.content_type or "image/jpeg"
    uploader_name = _uploader_display_name(user)
    preview_bytes = None
    if poster:
        preview_bytes = await poster.read()

    try:
        item = upload_material(
            db,
            sku=sku_norm,
            category=cat,
            media_type=mediaType,
            file_bytes=content,
            mime_type=mime,
            uploaded_by=uploader_name,
            preview_bytes=preview_bytes or None,
            note=note,
        )
        return {"item": item}
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        code = str(e)
        if code in (
            "SKU_REQUIRED", "MEDIA_REQUIRED", "IMAGE_REQUIRED", "INVALID_CATEGORY",
            "TYPE_MIME_MISMATCH",
        ):
            raise HTTPException(status_code=400, detail=code) from e
        raise HTTPException(status_code=400, detail=code) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e) or "UPLOAD_FAILED") from e


@router.post("/upload/direct/init", dependencies=[Depends(require_tool_access("brand_material"))])
def upload_direct_init(body: DirectUploadInitBody):
    sku_norm = _validate_sku(body.sku)
    try:
        return init_direct_material_upload(
            sku=sku_norm,
            category=body.category,
            media_type=body.mediaType,
            mime_type=body.mimeType,
            size_bytes=body.sizeBytes,
        )
    except ValueError as e:
        code = str(e)
        if code == "FILE_TOO_LARGE":
            raise HTTPException(status_code=413, detail=code) from e
        if code in (
            "SKU_REQUIRED", "MEDIA_REQUIRED", "INVALID_CATEGORY",
            "TYPE_MIME_MISMATCH", "USE_REGULAR_UPLOAD", "SIGNED_URL_FAILED",
        ):
            raise HTTPException(status_code=400, detail=code) from e
        raise HTTPException(status_code=400, detail=code) from e
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e) or "UPLOAD_FAILED") from e


@router.post("/upload/direct/complete")
async def upload_direct_complete(
    materialId: str = Form(...),
    objectPath: str = Form(...),
    sku: str = Form(...),
    category: str = Form("sub"),
    mediaType: str = Form("photo"),
    mimeType: str = Form(...),
    note: str = Form(""),
    poster: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user=Depends(require_tool_access("brand_material")),
):
    sku_norm = _validate_sku(sku)
    cat = (category or "sub").lower()
    if cat not in ("main", "sub"):
        raise HTTPException(status_code=400, detail="category must be main or sub")

    preview_bytes = None
    if poster:
        preview_bytes = await poster.read()

    try:
        item = complete_direct_material_upload(
            db,
            material_id=materialId,
            pending_path=objectPath,
            sku=sku_norm,
            category=cat,
            media_type=mediaType,
            mime_type=mimeType,
            uploaded_by=_uploader_display_name(user),
            preview_bytes=preview_bytes or None,
            note=note,
        )
        return {"item": item}
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        code = str(e)
        if code == "FILE_TOO_LARGE":
            raise HTTPException(status_code=413, detail=code) from e
        if code in (
            "SKU_REQUIRED", "MEDIA_REQUIRED", "INVALID_CATEGORY",
            "TYPE_MIME_MISMATCH", "GCS_OBJECT_MISSING", "INVALID_UPLOAD_SESSION",
        ):
            raise HTTPException(status_code=400, detail=code) from e
        raise HTTPException(status_code=400, detail=code) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e) or "UPLOAD_FAILED") from e


@router.post("/reorder", dependencies=[Depends(require_tool_access("brand_material"))])
def reorder_subs(body: ReorderBody, db: Session = Depends(get_db)):
    sku_norm = _validate_sku(body.sku)
    try:
        return reorder_sub_materials(
            db,
            sku=sku_norm,
            media_type=body.mediaType,
            ordered_ids=body.orderedIds,
        )
    except ValueError as e:
        code = str(e)
        if code in ("SKU_REQUIRED", "INVALID_MEDIA_TYPE", "REORDER_EMPTY", "REORDER_MISMATCH"):
            raise HTTPException(status_code=400, detail=code) from e
        raise HTTPException(status_code=400, detail=code) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/bulk-delete", dependencies=[Depends(require_tool_access("brand_material"))])
def bulk_remove(body: BulkDeleteBody, db: Session = Depends(get_db)):
    try:
        return delete_materials_bulk(db, body.ids)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.patch("/{material_id}", dependencies=[Depends(require_tool_access("brand_material"))])
def patch_material(material_id: str, body: UpdateBody, db: Session = Depends(get_db)):
    sku_norm = _validate_sku(body.sku)
    try:
        item = update_material(
            db,
            material_id,
            sku=sku_norm,
            category=body.category,
            media_type=body.mediaType,
            note=body.note,
        )
        return {"item": item}
    except ValueError as e:
        code = str(e)
        if code == "NOT_FOUND":
            raise HTTPException(status_code=404, detail=code) from e
        raise HTTPException(status_code=400, detail=code) from e


@router.delete("/{material_id}", dependencies=[Depends(require_tool_access("brand_material"))])
def remove_material(material_id: str, db: Session = Depends(get_db)):
    try:
        delete_material(db, material_id)
        return {"ok": True}
    except ValueError as e:
        if str(e) == "NOT_FOUND":
            raise HTTPException(status_code=404, detail=str(e)) from e
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/{material_id}/preview", dependencies=[Depends(require_tool_access("brand_material"))])
def preview_file(material_id: str, db: Session = Depends(get_db)):
    try:
        data, mime = get_material_preview(db, material_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        code = str(e)
        if code == "NOT_FOUND":
            raise HTTPException(status_code=404, detail=code) from e
        if code in ("FILE_NOT_FOUND", "NO_PREVIEW"):
            raise HTTPException(status_code=404, detail=code) from e
        raise HTTPException(status_code=400, detail=code) from e

    return Response(
        content=data,
        media_type=mime,
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.get("/{material_id}/file", dependencies=[Depends(require_tool_access("brand_material"))])
def download_file(material_id: str, db: Session = Depends(get_db)):
    try:
        data, mime = get_material_file(db, material_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        if str(e) == "NOT_FOUND":
            raise HTTPException(status_code=404, detail=str(e)) from e
        if str(e) == "FILE_NOT_FOUND":
            raise HTTPException(status_code=404, detail="File missing in storage") from e
        raise HTTPException(status_code=400, detail=str(e)) from e

    row = db.query(BrandMaterial).filter(BrandMaterial.id == material_id).first()
    filename = "download.jpg"
    if row:
        filename = storage_file_name(row.sku, row.category, row.sub_index, row.mime_type)

    return Response(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
