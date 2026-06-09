"""
Permission Guard — FastAPI dependency for tool access control.

Each tool endpoint can use `require_tool_access("tool_key")` as a dependency
to verify that the logged-in user has permission for that specific tool.

Permissions are read from PostgreSQL on each request (same source as /auth/verify)
so admin grants take effect without forcing a re-login. JWT is only used for
identity after signature/expiry validation.
"""

from fastapi import Request, HTTPException, Depends
from services.auth_logic import verify_token, has_permission, get_user_auth_claims_from_db


def _extract_token(request: Request) -> str:
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header missing or invalid.")
    return auth_header.split(" ", 1)[1]


def require_tool_access(tool_key: str):
    """
    FastAPI dependency factory.

    Usage:
        @router.post("/calculate", dependencies=[Depends(require_tool_access("price_checker"))])
        def calculate(...):
            ...
    """
    def _guard(request: Request):
        token = _extract_token(request)
        payload = verify_token(token)
        if not payload:
            raise HTTPException(status_code=401, detail="Token expired or invalid.")

        username = (payload.get("username") or "").strip()
        fresh = get_user_auth_claims_from_db(username) if username else None
        permissions = (fresh or {}).get("permissions") or payload.get("permissions", {})
        if not has_permission(permissions, tool_key):
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. You do not have permission for '{tool_key}'. Contact admin."
            )
        return payload

    return _guard
