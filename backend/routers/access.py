from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import case, func
from pydantic import BaseModel
from database import SessionLocal
from models import AccessRequest, AccountUser
from services.user_activity_logic import get_user_activity
from services.auth_logic import (
    verify_token,
    normalize_permissions,
    has_permission,
    hash_password,
    TOOL_KEYS,
    normalize_account_approval_label,
)
from typing import Optional, List
from datetime import datetime

router = APIRouter(prefix="/api/access", tags=["Access"])

class UserActivityQuery(BaseModel):
    start_date: Optional[str] = None  # format: YYYY-MM-DD
    end_date: Optional[str] = None    # format: YYYY-MM-DD
    tool_view: Optional[str] = "specific"  # specific | general
    exclude_admin: Optional[bool] = False

class RequestBody(BaseModel):
    tool_key: str

class PermissionsBody(BaseModel):
    permissions: dict
    name: Optional[str] = None


class ApproveBody(BaseModel):
    name: Optional[str] = None


class ApprovalUpdateBody(BaseModel):
    approval: str


class AdminCreateUserBody(BaseModel):
    email: str
    username: str
    password: str
    name: Optional[str] = None
    approval: Optional[str] = "Approve"
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

def _require_admin(request: Request) -> dict:
    payload = _require_auth(request)

    perms = normalize_permissions(payload.get("permissions", {}) if isinstance(payload, dict) else {})
    if not has_permission(perms, "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload

# Endpoint: User Activity (admin only)
@router.post("/user-activity")
def user_activity(
    body: UserActivityQuery,
    request: Request,
    db: Session = Depends(get_db)
):
    _require_admin(request)
    start_date = body.start_date
    end_date = body.end_date
    tool_view = (body.tool_view or "specific").lower()
    exclude_admin = bool(body.exclude_admin)
    if tool_view not in {"specific", "general"}:
        raise HTTPException(status_code=400, detail="tool_view must be either 'specific' or 'general'")
    return get_user_activity(db, start_date, end_date, tool_view, exclude_admin)

@router.post("/request")
def submit_request(body: RequestBody, request: Request, db: Session = Depends(get_db)):
    payload = _require_auth(request)
    username = payload["username"]
    
    user = db.query(AccountUser).filter(AccountUser.username == username).first()
    if user and has_permission(user.permissions, body.tool_key):
        raise HTTPException(status_code=400, detail="You already have access to this tool.")
    
    existing = db.query(AccessRequest).filter(
        AccessRequest.username == username,
        AccessRequest.tool_key == body.tool_key,
        AccessRequest.status == "pending",
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending request for this tool.")
    
    req = AccessRequest(username=username, tool_key=body.tool_key, status="pending")
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"message": "Request submitted successfully", "id": req.id}

@router.get("/my-requests")
def my_requests(request: Request, db: Session = Depends(get_db)):
    payload = _require_auth(request)
    rows = db.query(AccessRequest).filter(
        AccessRequest.username == payload["username"]
    ).order_by(AccessRequest.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "tool_key": r.tool_key,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]

@router.get("/requests")
def get_requests(request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    rows = db.query(AccessRequest).order_by(AccessRequest.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "username": r.username,
            "tool_key": r.tool_key,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]

@router.put("/requests/{req_id}/approve")
def approve_request(req_id: int, request: Request, body: Optional[ApproveBody] = None, db: Session = Depends(get_db)):
    _require_admin(request)
    req = db.query(AccessRequest).filter(AccessRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status = "approved"
    user = db.query(AccountUser).filter(AccountUser.username == req.username).first()
    if user:
        perms = dict(user.permissions or {})
        perms[req.tool_key] = 1
        user.permissions = perms
        new_name = (body.name.strip() if body and body.name else "")
        if not (user.name and str(user.name).strip()) and not new_name:
            raise HTTPException(status_code=400, detail="Name is required before approving access for this user.")
        if new_name:
            user.name = new_name
    db.commit()
    return {"message": "Request approved"}

@router.put("/requests/{req_id}/reject")
def reject_request(req_id: int, request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    req = db.query(AccessRequest).filter(AccessRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status = "rejected"
    db.commit()
    return {"message": "Request rejected"}

@router.get("/users")
def get_users(request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    # Pending / waiting accounts first (easier to approve), then A–Z by display name (fallback: username).
    ap = func.lower(func.trim(func.coalesce(AccountUser.approval, "")))
    pending_first = case((ap.in_(["waiting", "pending"]), 0), else_=1)
    sort_name = func.lower(
        func.coalesce(
            func.nullif(func.trim(AccountUser.name), ""),
            AccountUser.username,
            "",
        )
    )
    users = db.query(AccountUser).order_by(pending_first, sort_name).all()
    return [
        {
            "username": u.username,
            "name": (u.name or u.username),
            "email": u.email,
            "approval": (u.approval or "").strip(),
            "permissions": normalize_permissions(u.permissions),
        }
        for u in users
    ]

@router.put("/users/{username}/permissions")
def update_permissions(username: str, body: PermissionsBody, request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    user = db.query(AccountUser).filter(AccountUser.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.permissions = normalize_permissions(body.permissions)
    if body.name is not None:
        user.name = body.name.strip() if body.name else None
    db.commit()
    return {"message": "Permissions updated"}


@router.put("/users/{username}/approval")
def update_user_account_approval(
    username: str, body: ApprovalUpdateBody, request: Request, db: Session = Depends(get_db)
):
    _require_admin(request)
    try:
        label = normalize_account_approval_label(body.approval)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    user = db.query(AccountUser).filter(AccountUser.username.ilike(username.strip())).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.approval = label
    db.commit()
    return {"message": "Approval updated", "approval": label}


@router.delete("/users/{username}")
def delete_user_account(username: str, request: Request, db: Session = Depends(get_db)):
    payload = _require_admin(request)
    admin_u = str(payload.get("username", "")).strip().lower()
    if admin_u == username.strip().lower():
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    user = db.query(AccountUser).filter(AccountUser.username.ilike(username.strip())).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return {"message": "User deleted"}


@router.post("/users")
def create_user_account(body: AdminCreateUserBody, request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    try:
        approval_label = normalize_account_approval_label(body.approval or "Approve")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    email = body.email.strip()
    uname = body.username.strip()
    if not email or not uname:
        raise HTTPException(status_code=400, detail="Email and username are required.")

    if db.query(AccountUser).filter(AccountUser.username.ilike(uname)).first():
        raise HTTPException(status_code=400, detail="Username already exists.")
    if db.query(AccountUser).filter(AccountUser.email.ilike(email)).first():
        raise HTTPException(status_code=400, detail="Email already exists.")

    name_clean = (body.name or "").strip() or uname
    hashed = hash_password(body.password)
    perms = {k: 0 for k in TOOL_KEYS}

    new_user = AccountUser(
        email=email,
        username=uname,
        name=name_clean,
        password=hashed,
        approval=approval_label,
        permissions=perms,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {
        "message": "User created",
        "username": new_user.username,
        "email": new_user.email,
        "name": new_user.name,
        "approval": new_user.approval,
        "permissions": normalize_permissions(new_user.permissions),
    }
