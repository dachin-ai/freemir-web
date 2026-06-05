from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from services.auth_logic import verify_token
from services.permission_guard import require_tool_access
from services import apify_token_vault_logic as token_vault
from services import social_media_analytics_logic as logic

router = APIRouter(
    prefix="/api/social-media-analytics",
    tags=["Social Media Analytics"],
    dependencies=[Depends(require_tool_access("social_media_analytics"))],
)


class AnalyzeRequest(BaseModel):
    url: str
    apify_token: Optional[str] = Field(None, description="Apify API token")
    apify_token_id: Optional[int] = Field(None, description="Saved Apify token id (owner only)")
    download_video: bool = False


class ExportExcelRequest(BaseModel):
    items: list = []


class ProfilesListExportRequest(BaseModel):
    profile_ids: Optional[List[int]] = None


class NoteUpdateRequest(BaseModel):
    note: str = Field("", max_length=500)


class AddVideoRequest(BaseModel):
    url: str
    apify_token: Optional[str] = None
    apify_token_id: Optional[int] = None


class ManualVideoRequest(BaseModel):
    url: str
    views: Optional[int] = None
    likes: Optional[int] = None
    comments: Optional[int] = None
    shares: Optional[int] = None
    saves: Optional[int] = None
    author_username: Optional[str] = ""
    caption: Optional[str] = ""


class BulkUrlsRequest(BaseModel):
    urls: List[str] = []
    raw_text: Optional[str] = None
    apify_token: Optional[str] = None
    apify_token_id: Optional[int] = None


class RefreshRequest(BaseModel):
    apify_token: Optional[str] = None
    apify_token_id: Optional[int] = None


class BatchRefreshRequest(BaseModel):
    apify_token: Optional[str] = None
    apify_token_id: Optional[int] = None
    video_ids: Optional[List[int]] = None
    platform: Optional[str] = None
    username: Optional[str] = None


class ProfileFetchRequest(BaseModel):
    input: str = Field(..., description="Profile URL or @username")
    platform: Optional[str] = Field(None, description="tiktok | instagram (required if input is username only)")
    apify_token: Optional[str] = None
    apify_token_id: Optional[int] = None


class ProfileRefreshRequest(BaseModel):
    apify_token: Optional[str] = None
    apify_token_id: Optional[int] = None


class ApifyTokenCreateRequest(BaseModel):
    label: str = Field("", max_length=120)
    token: str = Field(..., min_length=8)
    is_default: bool = False


class ApifyTokenUpdateRequest(BaseModel):
    label: Optional[str] = Field(None, max_length=120)
    token: Optional[str] = Field(None, min_length=8)
    is_default: Optional[bool] = None


def _username(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return ""
    payload = verify_token(auth[7:]) or {}
    return (payload.get("username") or payload.get("sub") or "").strip()


def _resolve_token(
    db: Session,
    request: Request,
    *,
    apify_token: Optional[str] = None,
    apify_token_id: Optional[int] = None,
) -> Optional[str]:
    try:
        return token_vault.resolve_apify_token(
            db,
            _username(request),
            apify_token=apify_token,
            apify_token_id=apify_token_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/config")
def get_config():
    return logic.tool_config()


@router.get("/apify-tokens")
def list_apify_tokens(request: Request, db: Session = Depends(get_db)):
    return {"tokens": token_vault.list_user_tokens(db, _username(request))}


@router.post("/apify-tokens")
def create_apify_token(body: ApifyTokenCreateRequest, request: Request, db: Session = Depends(get_db)):
    try:
        row = token_vault.create_user_token(
            db,
            _username(request),
            label=body.label,
            token=body.token,
            is_default=body.is_default,
        )
        return row
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/apify-tokens/{token_id}")
def update_apify_token(
    token_id: int,
    body: ApifyTokenUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        return token_vault.update_user_token(
            db,
            _username(request),
            token_id,
            label=body.label,
            token=body.token,
            is_default=body.is_default,
        )
    except ValueError as e:
        raise HTTPException(status_code=404 if "not found" in str(e).lower() else 400, detail=str(e)) from e


@router.delete("/apify-tokens/{token_id}")
def delete_apify_token(token_id: int, request: Request, db: Session = Depends(get_db)):
    if not token_vault.delete_user_token(db, _username(request), token_id):
        raise HTTPException(status_code=404, detail="Saved Apify token not found.")
    return {"ok": True}


@router.post("/videos/manual")
def add_manual_video(body: ManualVideoRequest, request: Request, db: Session = Depends(get_db)):
    try:
        return logic.add_manual_video(
            db,
            body.url,
            _username(request),
            views=body.views,
            likes=body.likes,
            comments=body.comments,
            shares=body.shares,
            saves=body.saves,
            author_username=body.author_username or "",
            caption=body.caption or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/videos")
def list_videos(
    db: Session = Depends(get_db),
    platform: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    fetch_status: Optional[str] = Query(None),
    note: Optional[str] = Query(None),
):
    return {
        "videos": logic.list_videos(
            db,
            platform=platform,
            username=username,
            search=search,
            fetch_status=fetch_status,
            note=note,
        ),
    }


@router.get("/creators")
def list_creators(db: Session = Depends(get_db)):
    return {"creators": logic.list_creators(db)}


@router.get("/videos/{video_id}/history")
def video_history(video_id: int, db: Session = Depends(get_db)):
    try:
        return logic.get_video_history(db, video_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/creators/{username}/history")
def creator_history(username: str, db: Session = Depends(get_db)):
    try:
        return logic.get_creator_history(db, username)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/import/template")
def import_template():
    return logic.build_import_template_excel()


@router.post("/analyze")
def analyze_post(body: AnalyzeRequest, request: Request, db: Session = Depends(get_db)):
    try:
        return logic.analyze_video_url(
            body.url,
            _resolve_token(db, request, apify_token=body.apify_token, apify_token_id=body.apify_token_id),
            download_video=body.download_video,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export/excel")
def export_excel(body: ExportExcelRequest):
    try:
        return logic.build_excel_export(body.items or [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/excel")
def export_tracked_excel(
    db: Session = Depends(get_db),
    platform: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    fetch_status: Optional[str] = Query(None),
    note: Optional[str] = Query(None),
):
    try:
        items = logic.list_videos(
            db,
            platform=platform,
            username=username,
            search=search,
            fetch_status=fetch_status,
            note=note,
        )
        return logic.build_excel_export(items)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/videos")
def add_video(body: AddVideoRequest, request: Request, db: Session = Depends(get_db)):
    try:
        return logic.add_and_fetch(
            db,
            body.url,
            _username(request),
            _resolve_token(db, request, apify_token=body.apify_token, apify_token_id=body.apify_token_id),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/videos/bulk")
def bulk_videos(body: BulkUrlsRequest, request: Request, db: Session = Depends(get_db)):
    parts = list(body.urls or [])
    if body.raw_text:
        parts.append(body.raw_text)
    urls = logic.parse_urls_from_bulk_text("\n".join(parts))
    if not urls:
        raise HTTPException(status_code=400, detail="No valid links found.")
    try:
        return logic.bulk_add_and_fetch(
            db,
            urls,
            _username(request),
            _resolve_token(db, request, apify_token=body.apify_token, apify_token_id=body.apify_token_id),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/videos/parse-excel")
async def parse_excel_urls(file: UploadFile = File(...)):
    """Parse Excel links only (no Apify) — for progressive import UI."""
    try:
        raw = await file.read()
        urls = logic.parse_urls_from_excel(raw)
        if not urls:
            raise HTTPException(
                status_code=400,
                detail='Excel must have a "link" column with video URLs.',
            )
        return {"urls": urls, "total": len(urls)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/videos/import-excel")
async def import_excel(
    request: Request,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    apify_token: Optional[str] = Form(None),
    apify_token_id: Optional[int] = Form(None),
):
    try:
        raw = await file.read()
        urls = logic.parse_urls_from_excel(raw)
        if not urls:
            raise HTTPException(
                status_code=400,
                detail='Excel must have a "link" column with video URLs.',
            )
        return logic.bulk_add_and_fetch(
            db,
            urls,
            _username(request),
            _resolve_token(db, request, apify_token=apify_token, apify_token_id=apify_token_id),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/videos/batch-refresh")
def batch_refresh(body: BatchRefreshRequest, request: Request, db: Session = Depends(get_db)):
    try:
        return logic.batch_refresh_videos(
            db,
            _resolve_token(db, request, apify_token=body.apify_token, apify_token_id=body.apify_token_id),
            video_ids=body.video_ids,
            platform=body.platform,
            username=body.username,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/videos/{video_id}/refresh")
def refresh_video(video_id: int, body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    try:
        return logic.refresh_video(
            db,
            video_id,
            _resolve_token(db, request, apify_token=body.apify_token, apify_token_id=body.apify_token_id),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/videos/{video_id}/note")
def update_video_note(video_id: int, body: NoteUpdateRequest, db: Session = Depends(get_db)):
    try:
        return logic.update_video_note(db, video_id, body.note)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/videos/{video_id}")
def remove_video(video_id: int, db: Session = Depends(get_db)):
    if not logic.delete_video(db, video_id):
        raise HTTPException(status_code=404, detail="Video not found.")
    return {"ok": True}


@router.get("/profiles")
def list_profiles(
    platform: Optional[str] = Query(None),
    note: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return {"profiles": logic.list_profiles(db, platform=platform, note=note)}


@router.get("/profiles/fields")
def profile_fields():
    return {"fields": logic.PROFILE_AVAILABLE_FIELDS}


@router.post("/profiles/fetch")
def fetch_profile(body: ProfileFetchRequest, request: Request, db: Session = Depends(get_db)):
    try:
        return logic.add_or_refresh_profile(
            db,
            body.input,
            _username(request),
            _resolve_token(db, request, apify_token=body.apify_token, apify_token_id=body.apify_token_id),
            platform=body.platform,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/profiles/{profile_id}/refresh")
def refresh_profile(profile_id: int, body: ProfileRefreshRequest, request: Request, db: Session = Depends(get_db)):
    try:
        return logic.refresh_profile(
            db,
            profile_id,
            _resolve_token(db, request, apify_token=body.apify_token, apify_token_id=body.apify_token_id),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profiles/{profile_id}/history")
def profile_history(profile_id: int, db: Session = Depends(get_db)):
    try:
        return logic.get_profile_history(db, profile_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/profiles/export/list-excel")
def export_profiles_list_excel(body: ProfilesListExportRequest, db: Session = Depends(get_db)):
    try:
        return logic.export_profiles_list_excel(db, profile_ids=body.profile_ids)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profiles/{profile_id}/export/excel")
def export_profile_excel(profile_id: int, db: Session = Depends(get_db)):
    try:
        return logic.export_profile_excel(db, profile_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/profiles/{profile_id}/note")
def update_profile_note(profile_id: int, body: NoteUpdateRequest, db: Session = Depends(get_db)):
    try:
        return logic.update_profile_note(db, profile_id, body.note)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/profiles/{profile_id}")
def remove_profile(profile_id: int, db: Session = Depends(get_db)):
    if not logic.delete_profile(db, profile_id):
        raise HTTPException(status_code=404, detail="Profile not found.")
    return {"ok": True}
