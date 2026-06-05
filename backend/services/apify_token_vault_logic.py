"""Per-user encrypted storage for Apify API tokens (Social Media Analytics)."""
import base64
import hashlib
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from models import SocmedApifyToken
from services.social_media_analytics_logic import get_apify_token

_VAULT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get("APIFY_TOKEN_VAULT_SECRET") or "freemir_tools_2026_secret_key_change_in_prod"


def _derive_key() -> bytes:
    return hashlib.sha256(_VAULT_SECRET.encode("utf-8")).digest()


def _encrypt_token(plain: str) -> str:
    key = _derive_key()
    data = (plain or "").encode("utf-8")
    xored = bytes(b ^ key[i % len(key)] for i, b in enumerate(data))
    return base64.urlsafe_b64encode(xored).decode("ascii")


def _decrypt_token(enc: str) -> str:
    key = _derive_key()
    xored = base64.urlsafe_b64decode((enc or "").encode("ascii"))
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(xored)).decode("utf-8")


def _token_hint(token: str) -> str:
    t = (token or "").strip()
    if len(t) <= 8:
        return "••••"
    return f"{t[:4]}...{t[-4:]}"


def _normalize_label(label: str) -> str:
    return (label or "").strip()[:120]


def _clear_default(db: Session, owner: str) -> None:
    db.query(SocmedApifyToken).filter(SocmedApifyToken.owner == owner).update(
        {SocmedApifyToken.is_default: "0"},
        synchronize_session=False,
    )


def token_row_to_dict(row: SocmedApifyToken) -> Dict[str, Any]:
    return {
        "id": row.id,
        "label": row.label or "",
        "token_hint": row.token_hint or "",
        "is_default": row.is_default == "1" or row.is_default is True,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def list_user_tokens(db: Session, owner: str) -> List[Dict[str, Any]]:
    if not owner:
        return []
    rows = (
        db.query(SocmedApifyToken)
        .filter(SocmedApifyToken.owner == owner)
        .order_by(SocmedApifyToken.is_default.desc(), SocmedApifyToken.updated_at.desc())
        .all()
    )
    return [token_row_to_dict(r) for r in rows]


def get_user_token_row(db: Session, owner: str, token_id: int) -> Optional[SocmedApifyToken]:
    if not owner or not token_id:
        return None
    return (
        db.query(SocmedApifyToken)
        .filter(SocmedApifyToken.id == token_id, SocmedApifyToken.owner == owner)
        .first()
    )


def get_decrypted_token(db: Session, owner: str, token_id: int) -> str:
    row = get_user_token_row(db, owner, token_id)
    if not row:
        raise ValueError("Saved Apify token not found.")
    return _decrypt_token(row.token_enc).strip()


def get_default_decrypted_token(db: Session, owner: str) -> Optional[str]:
    if not owner:
        return None
    row = (
        db.query(SocmedApifyToken)
        .filter(SocmedApifyToken.owner == owner, SocmedApifyToken.is_default == "1")
        .order_by(SocmedApifyToken.updated_at.desc())
        .first()
    )
    if not row:
        return None
    return _decrypt_token(row.token_enc).strip()


def create_user_token(
    db: Session,
    owner: str,
    *,
    label: str,
    token: str,
    is_default: bool = False,
) -> Dict[str, Any]:
    if not owner:
        raise ValueError("Login diperlukan untuk menyimpan token. Silakan login ulang.")
    plain = (token or "").strip()
    if len(plain) < 8:
        raise ValueError("Apify token is too short.")
    name = _normalize_label(label) or f"Token {_token_hint(plain)}"
    if is_default:
        _clear_default(db, owner)
    row = SocmedApifyToken(
        owner=owner,
        label=name,
        token_enc=_encrypt_token(plain),
        token_hint=_token_hint(plain),
        is_default="1" if is_default else "0",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return token_row_to_dict(row)


def update_user_token(
    db: Session,
    owner: str,
    token_id: int,
    *,
    label: Optional[str] = None,
    token: Optional[str] = None,
    is_default: Optional[bool] = None,
) -> Dict[str, Any]:
    row = get_user_token_row(db, owner, token_id)
    if not row:
        raise ValueError("Saved Apify token not found.")
    if label is not None:
        row.label = _normalize_label(label) or row.label
    if token is not None and token.strip():
        plain = token.strip()
        if len(plain) < 8:
            raise ValueError("Apify token is too short.")
        row.token_enc = _encrypt_token(plain)
        row.token_hint = _token_hint(plain)
    if is_default is True:
        _clear_default(db, owner)
        row.is_default = "1"
    elif is_default is False:
        row.is_default = "0"
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return token_row_to_dict(row)


def delete_user_token(db: Session, owner: str, token_id: int) -> bool:
    row = get_user_token_row(db, owner, token_id)
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def resolve_apify_token(
    db: Session,
    owner: str,
    *,
    apify_token: Optional[str] = None,
    apify_token_id: Optional[int] = None,
) -> Optional[str]:
    """Resolve token: inline body > saved id > owner default > None (caller uses env)."""
    inline = (apify_token or "").strip()
    if inline:
        return inline
    if apify_token_id and owner:
        return get_decrypted_token(db, owner, int(apify_token_id))
    if owner:
        default = get_default_decrypted_token(db, owner)
        if default:
            return default
    return None


def resolve_apify_token_or_env(
    db: Session,
    owner: str,
    *,
    apify_token: Optional[str] = None,
    apify_token_id: Optional[int] = None,
) -> str:
    resolved = resolve_apify_token(db, owner, apify_token=apify_token, apify_token_id=apify_token_id)
    return get_apify_token(resolved)
