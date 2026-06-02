from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.auth_logic import signup_user, login_user_optimized, verify_token, get_user_auth_claims_from_db, log_activity, sync_users_from_sheet, reset_password, change_password, normalize_permissions
from services.public_catalog_logic import refresh_landing_catalog_data

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class SignupRequest(BaseModel):
    email: str
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class ForgotPasswordRequest(BaseModel):
    username: str
    email: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class LogActivityRequest(BaseModel):
    tool_name: str
    token: str


@router.post("/signup")
def signup(body: SignupRequest):
    success, msg = signup_user(body.email.strip(), body.username.strip(), body.password)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}


@router.post("/login")
def login(body: LoginRequest, request: Request):
    success, msg, token = login_user_optimized(body.username.strip(), body.password)
    if not success:
        raise HTTPException(status_code=401, detail=msg)
    payload = verify_token(token)
    payload_permissions = normalize_permissions(payload.get("permissions", {})) if payload else {}
    return {
        "message": msg,
        "token": token,
        "username": payload.get("username", body.username.strip()) if payload else body.username.strip(),
        "name": payload.get("name", payload.get("username", body.username.strip())) if payload else body.username.strip(),
        "email": payload.get("email", "") if payload else "",
        "permissions": payload_permissions,
    }


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest):
    success, msg = reset_password(body.username.strip(), body.email.strip())
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}


@router.post("/change-password")
def change_pwd(body: ChangePasswordRequest, request: Request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header.split(" ", 1)[1]
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token expired or invalid")
    username = payload["username"]
    success, msg = change_password(username, body.current_password, body.new_password)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}


@router.post("/verify")
def verify(request: Request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No token provided")
    token = auth_header.split(" ", 1)[1]
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token expired or invalid")
    fresh = get_user_auth_claims_from_db(payload.get("username", ""))
    if not fresh:
        raise HTTPException(status_code=401, detail="User not found")
    payload_permissions = normalize_permissions(fresh.get("permissions", {}))
    return {
        "valid": True,
        "username": fresh["username"],
        "name": fresh.get("name") or fresh["username"],
        "email": fresh.get("email", ""),
        "permissions": payload_permissions,
    }


@router.post("/log-activity")
def log_tool_activity(body: LogActivityRequest, request: Request):
    """Called by frontend whenever a tool is used."""
    # Try body token first, then Authorization header
    token = body.token
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]

    payload = verify_token(token) if token else None
    if not payload:
        print(f"[Auth Router] log-activity: token invalid or missing. Token prefix: {str(token)[:20] if token else 'NONE'}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    ip = request.client.host if request.client else ""
    username = payload["username"]
    print(f"[Auth Router] log-activity: {username} used {body.tool_name}")
    log_activity(username, body.tool_name, ip)
    return {"logged": True, "username": username, "tool": body.tool_name}


@router.post("/sync-users")
def sync_users():
    """Sync users and refresh landing catalog data from spreadsheets."""
    success, msg = sync_users_from_sheet()
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    cat = refresh_landing_catalog_data()
    sync_error = cat.get("sync_error")
    extra = (
        f" | Catalog refreshed: SKU_Detail={cat.get('sku_detail_rows', 0)}, "
        f"SKU_Info synced={cat.get('synced_sku_info', 0)}"
    )
    if sync_error:
        extra += " (SKU_Info sync warning)"
    return {
        "message": f"{msg}{extra}",
        "catalog_refresh": cat,
    }


@router.get("/test-sheet")
def test_sheet_access():
    """Debug endpoint - check which sheets are accessible."""
    try:
        from services.auth_logic import get_sheet_client
        sh = get_sheet_client()
        sheets = [s.title for s in sh.worksheets()]
        return {"sheets": sheets, "spreadsheet": sh.title}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
