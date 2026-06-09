"""Shared Store_Info sheet helpers (Google Sheets Admin Base)."""

from __future__ import annotations

import time
import traceback

from services.auth_logic import call_with_timeout, get_sheet_client

_STORE_INFO_HEADER_TOKENS = frozenset({"code", "store code", "kode", "store_code"})
_STORE_CACHE_TTL = 300
_STORE_STALE_MAX = 86_400

_tiktok_store_cache: dict = {
    "stores": [],
    "ts": 0.0,
    "error": "",
}


def _norm_header(value) -> str:
    return str(value or "").strip().lower().replace("_", " ")


def _resolve_store_info_columns(header_row: list) -> tuple[int, int, int]:
    """Return (platform_idx, code_idx, name_idx); fall back to B/C/E."""
    platform_idx = None
    code_idx = None
    name_idx = None
    for idx, cell in enumerate(header_row):
        h = _norm_header(cell)
        if not h:
            continue
        if h in {"platform", "plat", "channel", "marketplace"}:
            platform_idx = idx
        elif h in {"code", "store code", "kode"}:
            code_idx = idx
        elif h in {"full name", "fullname", "name", "store name", "nama", "display name"}:
            name_idx = idx
    return (
        platform_idx if platform_idx is not None else 1,
        code_idx if code_idx is not None else 2,
        name_idx if name_idx is not None else 4,
    )


def _is_tiktok_row(platform: str, code: str) -> bool:
    plat = str(platform or "").strip().lower()
    store_code = str(code or "").strip()
    if not store_code or store_code.lower() in _STORE_INFO_HEADER_TOKENS:
        return False
    if "tiktok" in plat or "tik tok" in plat:
        return True
    return store_code.upper().startswith("TT")


def _parse_tiktok_stores(rows: list[list]) -> list[dict]:
    if not rows:
        return []
    platform_idx, code_idx, name_idx = _resolve_store_info_columns(rows[0])
    stores: list[dict] = []
    seen: set[str] = set()
    for row in rows[1:]:
        platform = str(row[platform_idx]).strip() if len(row) > platform_idx else ""
        code = str(row[code_idx]).strip() if len(row) > code_idx else ""
        name = str(row[name_idx]).strip() if len(row) > name_idx else ""
        if not _is_tiktok_row(platform, code):
            continue
        if code in seen:
            continue
        seen.add(code)
        stores.append({"code": code, "name": name or code})
    return sorted(stores, key=lambda item: item["code"])


def _fetch_store_info_rows() -> tuple[list[list], str | None]:
    def _read_rows():
        sh = get_sheet_client()
        ws = sh.worksheet("Store_Info")
        return ws.get_all_values()

    ok, result = call_with_timeout(_read_rows, timeout_sec=25)
    if not ok:
        return [], str(result)
    if not isinstance(result, list):
        return [], "Unexpected Store_Info response."
    return result, None


def get_tiktok_stores_payload(*, force_refresh: bool = False) -> dict:
    """
    TikTok stores from Admin Base > Store_Info.
    Uses TTL cache + stale fallback when Google Sheets is slow/unavailable.
    """
    now = time.time()
    cache_age = now - float(_tiktok_store_cache.get("ts") or 0)
    if (
        not force_refresh
        and _tiktok_store_cache.get("stores")
        and cache_age < _STORE_CACHE_TTL
    ):
        return {
            "stores": list(_tiktok_store_cache["stores"]),
            "ok": True,
            "source": "cache",
            "warning": None,
        }

    rows, fetch_error = _fetch_store_info_rows()
    if fetch_error:
        stale_age = now - float(_tiktok_store_cache.get("ts") or 0)
        if _tiktok_store_cache.get("stores") and stale_age < _STORE_STALE_MAX:
            return {
                "stores": list(_tiktok_store_cache["stores"]),
                "ok": True,
                "source": "stale_cache",
                "warning": f"Store list from cache ({fetch_error})",
            }
        print(f"[Store_Info] TikTok stores fetch failed: {fetch_error}")
        return {
            "stores": [],
            "ok": False,
            "source": "error",
            "warning": fetch_error,
        }

    try:
        stores = _parse_tiktok_stores(rows)
    except Exception as exc:
        print(f"[Store_Info] TikTok stores parse failed: {exc}")
        traceback.print_exc()
        stale_age = now - float(_tiktok_store_cache.get("ts") or 0)
        if _tiktok_store_cache.get("stores") and stale_age < _STORE_STALE_MAX:
            return {
                "stores": list(_tiktok_store_cache["stores"]),
                "ok": True,
                "source": "stale_cache",
                "warning": f"Store list from cache (parse error: {exc})",
            }
        return {
            "stores": [],
            "ok": False,
            "source": "error",
            "warning": f"Failed to parse Store_Info: {exc}",
        }

    _tiktok_store_cache["stores"] = stores
    _tiktok_store_cache["ts"] = now
    _tiktok_store_cache["error"] = ""

    if not stores:
        return {
            "stores": [],
            "ok": False,
            "source": "sheet",
            "warning": "No TikTok stores found in Store_Info. Check platform column and store codes.",
        }

    return {
        "stores": stores,
        "ok": True,
        "source": "sheet",
        "warning": None,
    }


def get_tiktok_stores() -> list[dict]:
    """Backward-compatible list return for internal validation."""
    return get_tiktok_stores_payload().get("stores") or []
