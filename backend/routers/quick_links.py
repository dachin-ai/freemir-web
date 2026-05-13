import json
from typing import Any, List

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import SessionLocal
from models import SharedQuickLinks
from services.auth_logic import verify_token

router = APIRouter(prefix="/api/quick-links", tags=["Quick Links"])

MAX_PAYLOAD_BYTES = 512 * 1024  # 512 KB


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _require_auth(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_token(auth.split(" ", 1)[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Token expired or invalid")
    return payload


class QuickLinksBody(BaseModel):
    groups: List[Any] = Field(default_factory=list)


def _extract_groups(payload: Any) -> list:
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        g = payload.get("groups")
        if isinstance(g, list):
            return g
    return []


@router.get("")
def get_quick_links(request: Request, db: Session = Depends(get_db)):
    _require_auth(request)
    row = db.query(SharedQuickLinks).filter(SharedQuickLinks.id == 1).first()
    if not row:
        return {"groups": []}
    return {"groups": _extract_groups(row.payload)}


@router.put("")
def put_quick_links(body: QuickLinksBody, request: Request, db: Session = Depends(get_db)):
    _require_auth(request)
    raw = json.dumps(body.groups, ensure_ascii=False)
    if len(raw.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Quick Links data is too large.")
    row = db.query(SharedQuickLinks).filter(SharedQuickLinks.id == 1).first()
    wrapped = {"groups": body.groups}
    if row:
        row.payload = wrapped
    else:
        db.add(SharedQuickLinks(id=1, payload=wrapped))
    db.commit()
    return {"ok": True, "groups": body.groups}
