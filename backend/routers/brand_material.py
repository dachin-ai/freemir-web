import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import SessionLocal
from models import BrandMaterial
from services.brand_material_logic import (
    delete_material,
    delete_materials_bulk,
    get_material_file,
    list_materials,
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


class BulkDeleteBody(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=200)


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
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_tool_access("brand_material")),
):
    sku_norm = _validate_sku(sku)
    cat = (category or "sub").lower()
    if cat not in ("main", "sub"):
        raise HTTPException(status_code=400, detail="category must be main or sub")

    content = await file.read()
    mime = file.content_type or "image/jpeg"
    uploader_name = _uploader_display_name(user)

    try:
        item = upload_material(
            db,
            sku=sku_norm,
            category=cat,
            media_type=mediaType,
            file_bytes=content,
            mime_type=mime,
            uploaded_by=uploader_name,
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
