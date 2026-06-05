"""
Social Media Analytics — fetch video/reel performance via Apify.
Reuses URL helpers from socmed_scraping_logic; token manual or APIFY_API_TOKEN env.
No TikTok/Instagram username/password — only Apify API token.
"""
import base64
import io
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

JAKARTA_TZ = ZoneInfo("Asia/Jakarta")


def socmed_now() -> datetime:
    """Current time in Jakarta (WIB), stored naive for DB DateTime columns."""
    return datetime.now(JAKARTA_TZ).replace(tzinfo=None, microsecond=0)


def socmed_dt_iso(dt: Optional[datetime]) -> Optional[str]:
    """ISO-8601 with +07:00 for API responses (naive DB values are WIB)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=JAKARTA_TZ)
    return dt.astimezone(JAKARTA_TZ).isoformat(timespec="seconds")

import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import (
    SocmedAnalyticsProfile,
    SocmedAnalyticsProfileSnapshot,
    SocmedAnalyticsSnapshot,
    SocmedAnalyticsVideo,
)

try:
    from apify_client import ApifyClient
except Exception:
    ApifyClient = None

from services.socmed_scraping_logic import (
    ACTOR_IG_PROFILE_POSTS,
    ACTOR_IG_SCRAPER,
    ACTOR_TT_PRODUCTS,
    ACTOR_TT_SCRAPER,
    ACTOR_TT_VIDEO,
    _tiktok_cookies_json,
    apify_run,
    parse_links_from_textarea,
    ig_extract_owner_username,
    ig_fetch_post,
    ig_fetch_profile_bundle,
    ig_parse_post,
    resolve_tiktok_shortlink,
    sanitize_ig_url,
    sanitize_tt_url,
    safe_get,
    safe_get_path,
    tiktok_fetch_failure_message,
    to_int,
    tt_fetch_video,
    tt_fetch_profile_bundle,
    tt_item_usable,
    tt_parse_video,
)

# Recommended actors (documented for ops / future switch)
APIFY_ACTORS = {
    "tiktok_video": "clockworks/tiktok-video-scraper",
    "tiktok_profile": "clockworks/tiktok-profile-scraper",
    "instagram_post": "apify/instagram-scraper",
    "instagram_reel": "apify/instagram-reel-scraper",
    "instagram_profile": ACTOR_IG_SCRAPER,
    "instagram_profile_posts": ACTOR_IG_PROFILE_POSTS,
}

def get_apify_token(override: Optional[str] = None) -> str:
    token = (override or "").strip() or (os.environ.get("APIFY_API_TOKEN") or "").strip()
    if not token:
        raise ValueError(
            "Masukkan Token API Apify (dari console.apify.com → Settings → Integrations → API tokens). "
            "Bukan username/password TikTok atau Instagram."
        )
    return token


def _apify_common_error_hints(raw: str) -> Optional[str]:
    low = (raw or "").lower()
    if "undefinedcolumn" in low or "video_download_url" in low or "url_key" in low:
        return (
            "Database belum di-update. Restart backend (deploy ulang) agar migrasi kolom "
            "Social Media Analytics jalan, lalu coba lagi."
        )
    if any(k in low for k in ("login", "password", "cookie", "session", "credential", "sign in", "sign-in")):
        return (
            "Gagal mengambil data. Tool ini tidak memakai login TikTok/Instagram. "
            "Pastikan Token API Apify Anda benar (console.apify.com → API tokens), lalu coba lagi."
        )
    if "apify" in low and "token" in low:
        return "Token API Apify tidak valid atau kedaluwarsa. Periksa token di Apify Console."
    return None


def friendly_apify_error(exc: Exception) -> str:
    """User-facing hint for single-video / bulk video scrape failures."""
    raw = str(exc).strip()
    common = _apify_common_error_hints(raw)
    if common:
        return common
    low = raw.lower()
    if "keranjang kuning" in low or "tiktok shop" in low:
        return raw
    if "profile" in low:
        return raw
    if "not found" in low or "restricted" in low or "empty_result" in low:
        return (
            "Video TikTok tidak bisa di-scrape (sering pada posting TikTok Shop / keranjang kuning). "
            "Coba URL tanpa parameter ?is_from_webapp… dan pastikan video masih publik."
        )
    return raw or "Gagal mengambil data dari Apify."


def friendly_apify_profile_error(exc: Exception, platform: str = "") -> str:
    """User-facing hint for creator profile fetch (not single-video scrape)."""
    raw = str(exc).strip()
    common = _apify_common_error_hints(raw)
    if common:
        return common
    low = raw.lower()
    plat = (platform or "").strip().lower()
    if "profile_private" in low or ("private" in low and "profile" in low):
        if plat == "tiktok":
            return "Profil TikTok privat atau tidak bisa diakses."
        return "Profil privat atau tidak bisa diakses. Pastikan akun publik."
    if "instagram profile not found" in low or (plat == "instagram" and "not found" in low):
        return (
            "Profil Instagram tidak ditemukan atau tidak bisa diakses. "
            "Pastikan username benar, akun publik, lalu coba lagi."
        )
    if "tiktok profile not found" in low or (plat == "tiktok" and "not found" in low):
        return "Profil TikTok tidak ditemukan. Pastikan username benar dan akun tidak privat."
    if "not found" in low:
        return "Profil tidak ditemukan. Pastikan username/URL benar dan akun publik."
    if plat == "instagram":
        return raw or "Gagal mengambil profil Instagram dari Apify."
    if plat == "tiktok":
        return raw or "Gagal mengambil profil TikTok dari Apify."
    return raw or "Gagal mengambil profil dari Apify."


def _extract_tt_download_url(raw: Dict[str, Any]) -> str:
    if not isinstance(raw, dict):
        return ""
    candidates = [
        safe_get_path(raw, ["videoMeta.downloadAddr"], None),
        safe_get_path(raw, ["videoMeta.playAddr"], None),
        safe_get(raw, ["videoDownloadUrl", "downloadAddr", "downloadURL", "videoUrl"], None),
    ]
    media = raw.get("mediaUrls") or raw.get("media_urls")
    if isinstance(media, list) and media:
        candidates.append(media[0])
    video_obj = raw.get("video")
    if isinstance(video_obj, dict):
        candidates.append(safe_get(video_obj, ["downloadAddr", "playAddr", "url"], None))
    for c in candidates:
        s = str(c or "").strip()
        if s.startswith("http"):
            return s
    return ""


def apify_client(override: Optional[str] = None) -> ApifyClient:
    if ApifyClient is None:
        raise RuntimeError("apify-client package is not installed.")
    return ApifyClient(get_apify_token(override))


def detect_platform(url: str) -> Optional[str]:
    u = (url or "").lower()
    if "tiktok.com" in u or "vt.tiktok.com" in u or "vm.tiktok.com" in u:
        return "tiktok"
    if "instagram.com" in u or "instagr.am" in u:
        return "instagram"
    return None


def _engagement_rate(views: Optional[int], likes: Optional[int], comments: Optional[int], shares: Optional[int]) -> Optional[float]:
    if not views or views <= 0:
        return None
    total = (likes or 0) + (comments or 0) + (shares or 0)
    return round((total / views) * 100, 2)


def _first_int(*values) -> Optional[int]:
    for v in values:
        n = to_int(v)
        if n is not None:
            return n
    return None


def format_platform_label(platform: str) -> str:
    p = (platform or "").strip().lower()
    if p == "tiktok":
        return "TikTok"
    if p == "instagram":
        return "Instagram"
    return (platform or "").strip().title()


def _first_http_url(*values) -> str:
    for v in values:
        if isinstance(v, list) and v:
            v = v[0]
        if isinstance(v, dict):
            v = v.get("url") or v.get("src") or v.get("displayUrl")
        s = str(v or "").strip()
        if s.startswith("http"):
            return s
    return ""


def _extract_ig_thumbnail(raw: Dict[str, Any]) -> str:
    """Instagram CDN URLs often need multiple field fallbacks."""
    if not isinstance(raw, dict):
        return ""
    images = raw.get("images")
    if isinstance(images, list) and images:
        u = _first_http_url(images)
        if u:
            return u
    child = raw.get("childPosts") or raw.get("children") or raw.get("sidecarChildren")
    if isinstance(child, list) and child and isinstance(child[0], dict):
        u = _extract_ig_thumbnail(child[0])
        if u:
            return u
    display_resources = raw.get("displayResources") or raw.get("display_resources")
    if isinstance(display_resources, list):
        for res in display_resources:
            if isinstance(res, dict):
                u = _first_http_url(res.get("src"), res.get("url"))
                if u:
                    return u
    return _first_http_url(
        safe_get(raw, ["displayUrl", "display_url", "thumbnailUrl", "thumbnail_src"], None),
        safe_get(raw, ["imageUrl", "image_url", "url"], None),
        safe_get_path(raw, ["videoUrl"], None),
        safe_get(raw, ["previewUrl", "preview_url"], None),
    )


def fetch_instagram_metrics(client: ApifyClient, url: str) -> Dict[str, Any]:
    post_url = sanitize_ig_url(url, "post")
    raw = ig_fetch_post(client, post_url)
    if not raw:
        raise RuntimeError("Instagram post not found or restricted.")
    parsed = ig_parse_post(raw)
    shares = _first_int(
        safe_get(raw, ["sharesCount", "shareCount", "shares"], None),
    )
    saves = _first_int(
        safe_get(raw, ["saveCount", "savesCount", "collectCount"], None),
    )
    views = _first_int(
        parsed.get("Video View Count"),
        parsed.get("Video Play Count"),
        safe_get(raw, ["videoViewCount", "videoPlayCount", "playCount"], None),
    )
    likes = parsed.get("likes")
    comments = parsed.get("comment_count")
    username = ig_extract_owner_username(raw)
    return {
        "platform": "instagram",
        "platform_label": "Instagram",
        "url": url,
        "canonical_url": parsed.get("post_link") or post_url,
        "post_id": safe_get(raw, ["id", "shortCode"], "") or "",
        "author_username": username or "",
        "author_display_name": safe_get(raw, ["ownerFullName"], "") or "",
        "caption": parsed.get("caption") or "",
        "thumbnail_url": _extract_ig_thumbnail(raw) or parsed.get("display_url") or "",
        "posted_at": str(parsed.get("timestamp") or ""),
        "duration_sec": parsed.get("video_duration_sec"),
        "metrics": {
            "views": views,
            "likes": likes,
            "comments": comments,
            "shares": shares,
            "saves": saves,
            "clicks": None,
        },
        "engagement_rate": _engagement_rate(views, likes, comments, shares),
    }


def fetch_tiktok_metrics(
    client: ApifyClient,
    url: str,
    *,
    download_video: bool = False,
) -> Dict[str, Any]:
    post_url = resolve_tiktok_shortlink(url)
    raw = tt_fetch_video(client, post_url)
    if not tt_item_usable(raw):
        raise RuntimeError(tiktok_fetch_failure_message(raw, url))
    parsed = tt_parse_video(raw)
    video_download_url = ""
    views = parsed.get("Video Play Count")
    likes = parsed.get("likes")
    comments = parsed.get("comment_count")
    shares = parsed.get("shares")
    saves = _first_int(safe_get(raw, ["collectCount"], None))
    username = (
        safe_get_path(raw, ["authorMeta.name", "authorMeta.uniqueId", "author.uniqueId"], "")
        or ""
    )
    post_id = safe_get(raw, ["id"], "") or ""
    if not post_id and post_url:
        m = re.search(r"/video/(\d+)", post_url)
        if m:
            post_id = m.group(1)
    return {
        "platform": "tiktok",
        "url": url,
        "canonical_url": parsed.get("post_link") or post_url,
        "post_id": str(post_id),
        "author_username": username,
        "author_display_name": safe_get_path(raw, ["authorMeta.nickName", "authorMeta.nickname"], "") or "",
        "caption": parsed.get("caption") or "",
        "thumbnail_url": parsed.get("display_url") or "",
        "posted_at": str(parsed.get("timestamp") or ""),
        "duration_sec": parsed.get("video_duration_sec"),
        "metrics": {
            "views": views,
            "likes": likes,
            "comments": comments,
            "shares": shares,
            "saves": saves,
            "clicks": None,
        },
        "engagement_rate": _engagement_rate(views, likes, comments, shares),
        "video_download_url": video_download_url,
        "platform_label": "TikTok",
    }


def analyze_video_url(
    url: str,
    apify_token: Optional[str] = None,
    *,
    download_video: bool = False,
) -> Dict[str, Any]:
    url = (url or "").strip()
    if not url:
        raise ValueError("URL is required.")
    platform = detect_platform(url)
    if not platform:
        raise ValueError("Unsupported URL. Paste a TikTok or Instagram video/reel link.")
    try:
        client = apify_client(apify_token)
        if platform == "tiktok":
            return fetch_tiktok_metrics(client, url, download_video=download_video)
        data = fetch_instagram_metrics(client, url)
        data["video_download_url"] = ""
        data["platform_label"] = "Instagram"
        return data
    except ValueError:
        raise
    except Exception as e:
        raise RuntimeError(friendly_apify_error(e)) from e


def video_to_dict(row: SocmedAnalyticsVideo) -> Dict[str, Any]:
    return {
        "id": row.id,
        "platform": row.platform,
        "platform_label": format_platform_label(row.platform),
        "url": row.url,
        "canonical_url": row.canonical_url,
        "post_id": row.post_id,
        "author_username": row.author_username,
        "author_display_name": row.author_display_name,
        "caption": row.caption,
        "thumbnail_url": row.thumbnail_url,
        "posted_at": row.posted_at,
        "duration_sec": row.duration_sec,
        "metrics": {
            "views": row.views,
            "likes": row.likes,
            "comments": row.comments,
            "shares": row.shares,
            "saves": row.saves,
            "clicks": None,
        },
        "engagement_rate": _engagement_rate(row.views, row.likes, row.comments, row.shares),
        "video_download_url": row.video_download_url or "",
        "last_fetched_at": socmed_dt_iso(row.last_fetched_at),
        "fetch_status": row.fetch_status,
        "fetch_error": row.fetch_error or "",
        "note": row.note or "",
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def normalize_url_key(url: str) -> str:
    s = (url or "").strip()
    if not s:
        return ""
    s = s.split("#")[0].split("?")[0].rstrip("/").lower()
    return s


def find_video_by_url(db: Session, url: str) -> Optional[SocmedAnalyticsVideo]:
    key = normalize_url_key(url)
    if not key:
        return None
    row = db.query(SocmedAnalyticsVideo).filter(SocmedAnalyticsVideo.url_key == key).first()
    if row:
        return row
    return (
        db.query(SocmedAnalyticsVideo)
        .filter(SocmedAnalyticsVideo.url == url.strip())
        .first()
    )


def record_snapshot(db: Session, row: SocmedAnalyticsVideo) -> None:
    er = _engagement_rate(row.views, row.likes, row.comments, row.shares)
    snap = SocmedAnalyticsSnapshot(
        video_id=row.id,
        fetched_at=row.last_fetched_at or socmed_now(),
        views=row.views,
        likes=row.likes,
        comments=row.comments,
        shares=row.shares,
        saves=row.saves,
        engagement_rate="" if er is None else str(er),
    )
    db.add(snap)


def apply_analysis_to_row(db: Session, row: SocmedAnalyticsVideo, data: Dict[str, Any]) -> None:
    m = data.get("metrics") or {}
    row.canonical_url = data.get("canonical_url") or row.url
    row.url_key = normalize_url_key(row.canonical_url or row.url)
    row.post_id = str(data.get("post_id") or "")
    row.author_username = data.get("author_username") or ""
    row.author_display_name = data.get("author_display_name") or ""
    row.caption = (data.get("caption") or "")[:2000]
    row.thumbnail_url = data.get("thumbnail_url") or ""
    row.posted_at = str(data.get("posted_at") or "")
    row.duration_sec = data.get("duration_sec")
    row.views = m.get("views")
    row.likes = m.get("likes")
    row.comments = m.get("comments")
    row.shares = m.get("shares")
    row.saves = m.get("saves")
    row.video_download_url = (data.get("video_download_url") or "")[:1024]
    row.last_fetched_at = socmed_now()
    row.fetch_status = "ok"
    row.fetch_error = ""
    record_snapshot(db, row)


def list_videos(
    db: Session,
    *,
    platform: Optional[str] = None,
    username: Optional[str] = None,
    search: Optional[str] = None,
    fetch_status: Optional[str] = None,
    note: Optional[str] = None,
    limit: int = 500,
) -> List[Dict[str, Any]]:
    """All tracked videos in DB (team history), newest first."""
    q = db.query(SocmedAnalyticsVideo).order_by(
        SocmedAnalyticsVideo.updated_at.desc(),
        SocmedAnalyticsVideo.id.desc(),
    )
    if platform:
        q = q.filter(SocmedAnalyticsVideo.platform == platform.strip().lower())
    if username:
        u = username.strip().lower().lstrip("@")
        q = q.filter(SocmedAnalyticsVideo.author_username.ilike(f"%{u}%"))
    if fetch_status:
        q = q.filter(SocmedAnalyticsVideo.fetch_status == fetch_status.strip().lower())
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (SocmedAnalyticsVideo.caption.ilike(s))
            | (SocmedAnalyticsVideo.url.ilike(s))
            | (SocmedAnalyticsVideo.author_username.ilike(s))
        )
    if note:
        q = q.filter(SocmedAnalyticsVideo.note.ilike(f"%{note.strip()}%"))
    return [video_to_dict(r) for r in q.limit(limit).all()]


def update_video_note(db: Session, video_id: int, note: str) -> Dict[str, Any]:
    row = db.query(SocmedAnalyticsVideo).filter(SocmedAnalyticsVideo.id == video_id).first()
    if not row:
        raise ValueError("Video not found.")
    row.note = (note or "").strip()[:500]
    db.commit()
    db.refresh(row)
    return video_to_dict(row)


def _fetch_and_persist(
    db: Session,
    row: SocmedAnalyticsVideo,
    apify_token: Optional[str] = None,
) -> Dict[str, Any]:
    try:
        data = analyze_video_url(row.url, apify_token)
        apply_analysis_to_row(db, row, data)
    except Exception as e:
        row.fetch_status = "error"
        row.fetch_error = str(e)[:500]
        row.last_fetched_at = socmed_now()
        db.commit()
        db.refresh(row)
        raise
    db.commit()
    db.refresh(row)
    return video_to_dict(row)


def _username_from_post_url(url: str) -> str:
    m = re.search(r"@([^/?#]+)", url or "")
    return (m.group(1).strip() if m else "")[:120]


def add_manual_video(
    db: Session,
    url: str,
    created_by: str,
    *,
    views: Optional[int] = None,
    likes: Optional[int] = None,
    comments: Optional[int] = None,
    shares: Optional[int] = None,
    saves: Optional[int] = None,
    author_username: str = "",
    caption: str = "",
) -> Dict[str, Any]:
    """Track TikTok Shop / restricted videos with metrics typed from TikTok Studio or app."""
    url = url.strip()
    platform = detect_platform(url)
    if not platform:
        raise ValueError("Unsupported URL.")
    canonical = resolve_tiktok_shortlink(url) if platform == "tiktok" else url
    existing = find_video_by_url(db, url)
    row = existing or SocmedAnalyticsVideo(
        created_by=created_by,
        platform=platform,
        url=url,
        url_key=normalize_url_key(canonical),
        fetch_status="pending",
    )
    if not existing:
        db.add(row)
        db.flush()
    row.canonical_url = canonical
    row.url_key = normalize_url_key(canonical)
    uname = (author_username or "").strip().lstrip("@") or _username_from_post_url(canonical) or _username_from_post_url(url)
    row.author_username = uname[:120]
    row.caption = (caption or "")[:2000]
    row.views = views
    row.likes = likes
    row.comments = comments
    row.shares = shares
    row.saves = saves
    row.last_fetched_at = socmed_now()
    row.fetch_status = "manual"
    row.fetch_error = ""
    record_snapshot(db, row)
    db.commit()
    db.refresh(row)
    return video_to_dict(row)


def tool_config() -> Dict[str, Any]:
    return {
        "apify_configured": apify_configured(),
        "supported_platforms": ["tiktok", "instagram"],
        "metrics": ["views", "likes", "comments", "shares", "saves"],
        "tiktok_video_download": False,
        "tiktok_shop": {
            "clockworks_video_scraper_supports_product_links": False,
            "products_scraper_actor": ACTOR_TT_PRODUCTS,
            "products_scraper_configured": bool(_tiktok_cookies_json()),
            "manual_metrics_enabled": True,
        },
        "profile": {
            "enabled": True,
            "actors": {
                "tiktok": APIFY_ACTORS["tiktok_profile"],
                "instagram": APIFY_ACTORS["instagram_profile"],
            },
            "fields": PROFILE_AVAILABLE_FIELDS,
        },
        "actors": recommended_actors_doc(),
    }


def add_and_fetch(
    db: Session,
    url: str,
    created_by: str,
    apify_token: Optional[str] = None,
) -> Dict[str, Any]:
    url = url.strip()
    platform = detect_platform(url)
    if not platform:
        raise ValueError("Unsupported URL.")
    existing = find_video_by_url(db, url)
    row = existing or SocmedAnalyticsVideo(
        created_by=created_by,
        platform=platform,
        url=url,
        url_key=normalize_url_key(url),
        fetch_status="pending",
    )
    if not existing:
        db.add(row)
        db.flush()
    return _fetch_and_persist(db, row, apify_token)


def refresh_video(db: Session, video_id: int, apify_token: Optional[str] = None) -> Dict[str, Any]:
    row = db.query(SocmedAnalyticsVideo).filter(SocmedAnalyticsVideo.id == video_id).first()
    if not row:
        raise ValueError("Video not found.")
    return _fetch_and_persist(db, row, apify_token)


def parse_urls_from_bulk_text(raw: str) -> List[str]:
    links = parse_links_from_textarea(raw or "")
    seen = set()
    out = []
    for link in links:
        key = normalize_url_key(link)
        if key and key not in seen:
            seen.add(key)
            out.append(link.strip())
    return out


def parse_urls_from_excel(file_bytes: bytes) -> List[str]:
    df = pd.read_excel(io.BytesIO(file_bytes), header=0)
    if df.empty:
        return []
    col = None
    for c in df.columns:
        if str(c).strip().lower() == "link":
            col = c
            break
    if col is None:
        col = df.columns[0]
    seen = set()
    out = []
    for val in df[col].tolist():
        s = str(val or "").strip()
        if not s or s.lower() in ("link", "nan", "none"):
            continue
        if not s.lower().startswith("http"):
            continue
        key = normalize_url_key(s)
        if key and key not in seen:
            seen.add(key)
            out.append(s)
    return out


def build_import_template_excel() -> Dict[str, str]:
    """Empty template: navy header, wide link column, no dummy URLs."""
    out = io.BytesIO()
    navy = "#0B1A2E"
    with pd.ExcelWriter(out, engine="xlsxwriter") as writer:
        wb = writer.book
        ws = wb.add_worksheet("links")
        writer.sheets["links"] = ws
        header_fmt = wb.add_format({
            "bold": True,
            "font_color": "#FFFFFF",
            "bg_color": navy,
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": navy,
        })
        ws.write(0, 0, "link", header_fmt)
        ws.set_column(0, 0, 80)
        ws.set_row(0, 22)
    data = out.getvalue()
    return {
        "filename": "freemir_socmed_import_template.xlsx",
        "file_base64": base64.b64encode(data).decode("utf-8"),
    }


def bulk_add_and_fetch(
    db: Session,
    urls: List[str],
    created_by: str,
    apify_token: Optional[str] = None,
) -> Dict[str, Any]:
    results = {"success": [], "errors": [], "total": len(urls)}
    for url in urls:
        try:
            row = add_and_fetch(db, url, created_by, apify_token)
            results["success"].append({"url": url, "video": row})
        except Exception as e:
            results["errors"].append({"url": url, "error": friendly_apify_error(e)})
    results["success_count"] = len(results["success"])
    results["error_count"] = len(results["errors"])
    return results


def batch_refresh_videos(
    db: Session,
    apify_token: Optional[str] = None,
    *,
    video_ids: Optional[List[int]] = None,
    platform: Optional[str] = None,
    username: Optional[str] = None,
) -> Dict[str, Any]:
    q = db.query(SocmedAnalyticsVideo)
    if video_ids:
        q = q.filter(SocmedAnalyticsVideo.id.in_(video_ids))
    if platform:
        q = q.filter(SocmedAnalyticsVideo.platform == platform.strip().lower())
    if username:
        u = username.strip().lower().lstrip("@")
        q = q.filter(SocmedAnalyticsVideo.author_username.ilike(f"%{u}%"))
    rows = q.order_by(SocmedAnalyticsVideo.updated_at.desc()).all()
    results = {"success": [], "errors": [], "total": len(rows)}
    for row in rows:
        try:
            item = _fetch_and_persist(db, row, apify_token)
            results["success"].append({"id": row.id, "video": item})
        except Exception as e:
            results["errors"].append({"id": row.id, "url": row.url, "error": friendly_apify_error(e)})
    results["success_count"] = len(results["success"])
    results["error_count"] = len(results["errors"])
    return results


def snapshot_to_dict(s: SocmedAnalyticsSnapshot) -> Dict[str, Any]:
    er = s.engagement_rate
    try:
        er_f = float(er) if er not in (None, "") else None
    except (TypeError, ValueError):
        er_f = None
    return {
        "fetched_at": socmed_dt_iso(s.fetched_at),
        "views": s.views,
        "likes": s.likes,
        "comments": s.comments,
        "shares": s.shares,
        "saves": s.saves,
        "engagement_rate": er_f,
        "metrics": {
            "views": s.views,
            "likes": s.likes,
            "comments": s.comments,
            "shares": s.shares,
            "saves": s.saves,
        },
    }


def get_video_history(db: Session, video_id: int) -> Dict[str, Any]:
    row = db.query(SocmedAnalyticsVideo).filter(SocmedAnalyticsVideo.id == video_id).first()
    if not row:
        raise ValueError("Video not found.")
    snaps = (
        db.query(SocmedAnalyticsSnapshot)
        .filter(SocmedAnalyticsSnapshot.video_id == video_id)
        .order_by(SocmedAnalyticsSnapshot.fetched_at.asc())
        .all()
    )
    return {
        "video": video_to_dict(row),
        "snapshots": [snapshot_to_dict(s) for s in snaps],
    }


def list_creators(db: Session) -> List[Dict[str, Any]]:
    rows = (
        db.query(
            SocmedAnalyticsVideo.author_username,
            SocmedAnalyticsVideo.platform,
        )
        .filter(SocmedAnalyticsVideo.author_username != "")
        .distinct()
        .all()
    )
    creators = {}
    for username, platform in rows:
        u = (username or "").strip()
        if not u:
            continue
        if u not in creators:
            creators[u] = {"username": u, "platforms": set()}
        creators[u]["platforms"].add(platform)
    out = []
    for u, data in sorted(creators.items(), key=lambda x: x[0].lower()):
        out.append({
            "username": data["username"],
            "platforms": [format_platform_label(p) for p in sorted(data["platforms"])],
        })
    return out


def get_creator_history(db: Session, username: str) -> Dict[str, Any]:
    u = username.strip().lstrip("@")
    videos = (
        db.query(SocmedAnalyticsVideo)
        .filter(func.lower(SocmedAnalyticsVideo.author_username) == u.lower())
        .order_by(SocmedAnalyticsVideo.updated_at.desc())
        .all()
    )
    if not videos:
        raise ValueError("Creator not found in tracked videos.")
    video_ids = [v.id for v in videos]
    snaps = (
        db.query(SocmedAnalyticsSnapshot)
        .filter(SocmedAnalyticsSnapshot.video_id.in_(video_ids))
        .order_by(SocmedAnalyticsSnapshot.fetched_at.asc())
        .all()
    )
    by_time: Dict[str, Dict[str, Any]] = {}
    for s in snaps:
        key = socmed_dt_iso(s.fetched_at) or ""
        if key not in by_time:
            by_time[key] = {
                "fetched_at": key,
                "views": 0,
                "likes": 0,
                "comments": 0,
                "shares": 0,
                "saves": 0,
            }
        bucket = by_time[key]
        bucket["views"] += s.views or 0
        bucket["likes"] += s.likes or 0
        bucket["comments"] += s.comments or 0
        bucket["shares"] += s.shares or 0
        bucket["saves"] += s.saves or 0
    timeline = []
    for key in sorted(by_time.keys()):
        b = by_time[key]
        b["engagement_rate"] = _engagement_rate(b["views"], b["likes"], b["comments"], b["shares"])
        timeline.append(b)
    per_video = []
    for v in videos:
        v_snaps = [s for s in snaps if s.video_id == v.id]
        per_video.append({
            "video": video_to_dict(v),
            "snapshots": [snapshot_to_dict(s) for s in v_snaps],
        })
    return {
        "username": u,
        "video_count": len(videos),
        "videos": [video_to_dict(v) for v in videos],
        "timeline": timeline,
        "per_video": per_video,
    }


def delete_video(db: Session, video_id: int) -> bool:
    row = db.query(SocmedAnalyticsVideo).filter(SocmedAnalyticsVideo.id == video_id).first()
    if not row:
        return False
    db.query(SocmedAnalyticsSnapshot).filter(SocmedAnalyticsSnapshot.video_id == video_id).delete()
    db.delete(row)
    db.commit()
    return True


# ── Profile analytics ────────────────────────────────────

PROFILE_SCRAPE_POOL = 30
PROFILE_TOP_VIDEOS_LIMIT = 15

PROFILE_HANDLE_RE = re.compile(r"^@?([A-Za-z0-9._]+)$")


def parse_profile_input(raw: str, platform: Optional[str] = None) -> Dict[str, str]:
    s = (raw or "").strip()
    if not s:
        raise ValueError("Username or profile URL is required.")
    if not re.match(r"^https?://", s, re.IGNORECASE) and re.search(
        r"(instagram\.com|instagr\.am|tiktok\.com)", s, re.IGNORECASE
    ):
        s = f"https://{s.lstrip('/')}"
    low = s.lower()
    detected = platform
    if not detected:
        if "instagram.com" in low or "instagr.am" in low:
            detected = "instagram"
        elif "tiktok.com" in low:
            detected = "tiktok"
    if "instagram.com" in low or "instagr.am" in low:
        detected = detected or "instagram"
        m = re.search(r"instagram\.com/([^/?#]+)", low)
        if m and m.group(1) not in ("p", "reel", "reels", "stories", "explore"):
            return {"platform": "instagram", "username": m.group(1).strip("@")}
    if "tiktok.com" in low:
        detected = detected or "tiktok"
        m = re.search(r"tiktok\.com/@([^/?#]+)", low)
        if m:
            return {"platform": "tiktok", "username": m.group(1)}
        m2 = re.search(r"tiktok\.com/([^/?#]+)", low)
        if m2 and m2.group(1) not in ("video", "music", "tag", "discover", "live"):
            return {"platform": "tiktok", "username": m2.group(1).strip("@")}
    if PROFILE_HANDLE_RE.match(s):
        if not detected:
            raise ValueError(
                "Paste URL profil lengkap yang berisi instagram.com atau tiktok.com "
                "(contoh: https://www.instagram.com/username)."
            )
        return {"platform": detected, "username": s.lstrip("@")}
    raise ValueError(
        "URL profil tidak valid. Gunakan link Instagram atau TikTok, "
        "misalnya https://www.instagram.com/username atau https://www.tiktok.com/@username."
    )


def normalize_profile_key(platform: str, username: str) -> str:
    return f"{(platform or '').strip().lower()}:{(username or '').strip().lower().lstrip('@')}"


def _avg_recent_metrics(posts: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not posts:
        return {"views": None, "likes": None, "comments": None, "engagement_rate": None}
    views = [p.get("views") for p in posts if p.get("views") is not None]
    likes = [p.get("likes") for p in posts if p.get("likes") is not None]
    comments = [p.get("comments") for p in posts if p.get("comments") is not None]
    avg_views = int(sum(views) / len(views)) if views else None
    avg_likes = int(sum(likes) / len(likes)) if likes else None
    avg_comments = int(sum(comments) / len(comments)) if comments else None
    er = None
    if avg_views and avg_views > 0:
        er = round(((avg_likes or 0) + (avg_comments or 0)) / avg_views * 100, 2)
    return {
        "views": avg_views,
        "likes": avg_likes,
        "comments": avg_comments,
        "engagement_rate": er,
    }


def _rank_top_posts(posts: List[Dict[str, Any]], limit: int = PROFILE_TOP_VIDEOS_LIMIT) -> List[Dict[str, Any]]:
    """Keep top N posts for DB — prefer items with view counts, then likes."""
    ranked = sorted(
        posts or [],
        key=lambda p: (
            p.get("views") is not None and (p.get("views") or 0) > 0,
            p.get("views") is not None,
            p.get("views") or 0,
            p.get("likes") or 0,
        ),
        reverse=True,
    )
    return ranked[:limit]


def fetch_profile_from_apify(
    platform: str,
    username: str,
    apify_token: Optional[str] = None,
    *,
    scrape_pool: int = PROFILE_SCRAPE_POOL,
    save_limit: int = PROFILE_TOP_VIDEOS_LIMIT,
) -> Dict[str, Any]:
    client = apify_client(apify_token)
    pool = max(save_limit, int(scrape_pool))
    save_n = max(1, int(save_limit))
    try:
        if platform == "tiktok":
            bundle = tt_fetch_profile_bundle(client, username, pool)
        elif platform == "instagram":
            bundle = ig_fetch_profile_bundle(client, username, pool, save_target=save_n)
        else:
            raise ValueError("Unsupported platform.")
    except ValueError:
        raise
    except Exception as e:
        raise RuntimeError(friendly_apify_profile_error(e, platform)) from e
    prof = bundle.get("profile") or {}
    pool_posts = bundle.get("recent_posts") or []
    raw_count = bundle.get("videos_fetched_raw") or len(pool_posts)
    recent = _rank_top_posts(pool_posts, save_n)
    avgs = _avg_recent_metrics(recent)
    uname = (prof.get("username") or username).strip().lstrip("@")
    return {
        "platform": platform,
        "username": uname,
        "profile_url": prof.get("profile_url") or "",
        "display_name": prof.get("display_name") or "",
        "biography": prof.get("biography") or "",
        "avatar_url": prof.get("avatar_url") or "",
        "followers": prof.get("followers"),
        "following": prof.get("following"),
        "posts_count": prof.get("posts_count"),
        "total_likes": prof.get("total_likes"),
        "is_verified": bool(prof.get("is_verified")),
        "recent_posts": recent,
        "recent_posts_count": len(recent),
        "recent_avg": avgs,
        "available_fields": PROFILE_AVAILABLE_FIELDS.get(platform, []),
        "scrape_meta": {
            "videos_fetch_target": pool,
            "videos_save_target": save_n,
            "videos_target": save_n,
            "videos_fetched_raw": raw_count,
            "videos_saved": len(recent),
            "videos_with_views": sum(1 for p in recent if p.get("views") is not None),
            "actors_used": bundle.get("actors_used") or [],
        },
    }


PROFILE_AVAILABLE_FIELDS = {
    "tiktok": [
        "followers", "following", "posts_count", "total_likes", "bio", "display_name",
        "verified",
        f"top {PROFILE_TOP_VIDEOS_LIMIT} videos saved (fetches up to {PROFILE_SCRAPE_POOL}; views/likes/comments/shares)",
    ],
    "instagram": [
        "followers", "following", "posts_count", "bio", "display_name", "verified",
        f"top {PROFILE_TOP_VIDEOS_LIMIT} posts/reels saved (1–2 fast Apify reels/posts calls; views on reels)",
    ],
}


def profile_to_dict(row: SocmedAnalyticsProfile) -> Dict[str, Any]:
    return {
        "id": row.id,
        "platform": row.platform,
        "platform_label": format_platform_label(row.platform),
        "username": row.username,
        "profile_url": row.profile_url,
        "display_name": row.display_name,
        "biography": row.biography,
        "avatar_url": row.avatar_url,
        "followers": row.followers,
        "following": row.following,
        "posts_count": row.posts_count,
        "total_likes": row.total_likes,
        "is_verified": row.is_verified == "1" or row.is_verified is True,
        "recent_posts": row.recent_posts_json or [],
        "recent_posts_count": len(row.recent_posts_json or []),
        "scrape_meta": {
            "videos_fetch_target": PROFILE_SCRAPE_POOL,
            "videos_save_target": PROFILE_TOP_VIDEOS_LIMIT,
            "videos_target": PROFILE_TOP_VIDEOS_LIMIT,
            "videos_saved": len(row.recent_posts_json or []),
        },
        "recent_avg": {
            "views": row.recent_avg_views,
            "likes": row.recent_avg_likes,
            "comments": row.recent_avg_comments,
            "engagement_rate": float(row.recent_avg_engagement_rate)
            if row.recent_avg_engagement_rate not in (None, "") else None,
        },
        "last_fetched_at": socmed_dt_iso(row.last_fetched_at),
        "fetch_status": row.fetch_status,
        "fetch_error": row.fetch_error or "",
        "note": row.note or "",
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _apply_profile_data(row: SocmedAnalyticsProfile, data: Dict[str, Any]) -> None:
    avgs = data.get("recent_avg") or {}
    row.platform = data.get("platform") or row.platform
    row.username = (data.get("username") or row.username).strip().lstrip("@")
    row.profile_key = normalize_profile_key(row.platform, row.username)
    row.profile_url = (data.get("profile_url") or "")[:512]
    row.display_name = (data.get("display_name") or "")[:200]
    row.biography = (data.get("biography") or "")[:2000]
    row.avatar_url = (data.get("avatar_url") or "")[:1024]
    row.followers = data.get("followers")
    row.following = data.get("following")
    row.posts_count = data.get("posts_count")
    row.total_likes = data.get("total_likes")
    row.is_verified = "1" if data.get("is_verified") else "0"
    row.recent_posts_json = data.get("recent_posts") or []
    row.recent_avg_views = avgs.get("views")
    row.recent_avg_likes = avgs.get("likes")
    row.recent_avg_comments = avgs.get("comments")
    er = avgs.get("engagement_rate")
    row.recent_avg_engagement_rate = "" if er is None else str(er)
    row.last_fetched_at = socmed_now()
    row.fetch_status = "ok"
    row.fetch_error = ""


def _record_profile_snapshot(db: Session, row: SocmedAnalyticsProfile) -> None:
    db.add(SocmedAnalyticsProfileSnapshot(
        profile_id=row.id,
        fetched_at=row.last_fetched_at or socmed_now(),
        followers=row.followers,
        following=row.following,
        posts_count=row.posts_count,
        total_likes=row.total_likes,
        recent_avg_views=row.recent_avg_views,
        recent_avg_likes=row.recent_avg_likes,
        recent_avg_engagement_rate=row.recent_avg_engagement_rate or "",
    ))


def find_profile(db: Session, platform: str, username: str) -> Optional[SocmedAnalyticsProfile]:
    key = normalize_profile_key(platform, username)
    row = db.query(SocmedAnalyticsProfile).filter(SocmedAnalyticsProfile.profile_key == key).first()
    if row:
        return row
    uname = username.strip().lstrip("@").lower()
    return (
        db.query(SocmedAnalyticsProfile)
        .filter(
            SocmedAnalyticsProfile.platform == platform,
            func.lower(SocmedAnalyticsProfile.username) == uname,
        )
        .first()
    )


def list_profiles(db: Session, platform: Optional[str] = None, note: Optional[str] = None) -> List[Dict[str, Any]]:
    q = db.query(SocmedAnalyticsProfile).order_by(SocmedAnalyticsProfile.updated_at.desc())
    if platform:
        q = q.filter(SocmedAnalyticsProfile.platform == platform.strip().lower())
    if note:
        q = q.filter(SocmedAnalyticsProfile.note.ilike(f"%{note.strip()}%"))
    return [profile_to_dict(r) for r in q.all()]


def update_profile_note(db: Session, profile_id: int, note: str) -> Dict[str, Any]:
    row = db.query(SocmedAnalyticsProfile).filter(SocmedAnalyticsProfile.id == profile_id).first()
    if not row:
        raise ValueError("Profile not found.")
    row.note = (note or "").strip()[:500]
    db.commit()
    db.refresh(row)
    return profile_to_dict(row)


def add_or_refresh_profile(
    db: Session,
    raw_input: str,
    created_by: str,
    apify_token: Optional[str] = None,
    *,
    platform: Optional[str] = None,
) -> Dict[str, Any]:
    parsed = parse_profile_input(raw_input, platform)
    data = fetch_profile_from_apify(parsed["platform"], parsed["username"], apify_token)
    existing = find_profile(db, data["platform"], data["username"])
    row = existing or SocmedAnalyticsProfile(
        created_by=created_by,
        platform=data["platform"],
        username=data["username"],
        profile_key=normalize_profile_key(data["platform"], data["username"]),
        fetch_status="pending",
    )
    if not existing:
        db.add(row)
        db.flush()
    _apply_profile_data(row, data)
    _record_profile_snapshot(db, row)
    db.commit()
    db.refresh(row)
    return profile_to_dict(row)


def refresh_profile(db: Session, profile_id: int, apify_token: Optional[str] = None) -> Dict[str, Any]:
    row = db.query(SocmedAnalyticsProfile).filter(SocmedAnalyticsProfile.id == profile_id).first()
    if not row:
        raise ValueError("Profile not found.")
    try:
        data = fetch_profile_from_apify(row.platform, row.username, apify_token)
        _apply_profile_data(row, data)
        _record_profile_snapshot(db, row)
        db.commit()
        db.refresh(row)
        return profile_to_dict(row)
    except Exception as e:
        row.fetch_status = "error"
        row.fetch_error = str(e)[:500]
        row.last_fetched_at = socmed_now()
        db.commit()
        db.refresh(row)
        raise


def delete_profile(db: Session, profile_id: int) -> bool:
    row = db.query(SocmedAnalyticsProfile).filter(SocmedAnalyticsProfile.id == profile_id).first()
    if not row:
        return False
    db.query(SocmedAnalyticsProfileSnapshot).filter(
        SocmedAnalyticsProfileSnapshot.profile_id == profile_id
    ).delete()
    db.delete(row)
    db.commit()
    return True


def get_profile_history(db: Session, profile_id: int) -> Dict[str, Any]:
    row = db.query(SocmedAnalyticsProfile).filter(SocmedAnalyticsProfile.id == profile_id).first()
    if not row:
        raise ValueError("Profile not found.")
    snaps = (
        db.query(SocmedAnalyticsProfileSnapshot)
        .filter(SocmedAnalyticsProfileSnapshot.profile_id == profile_id)
        .order_by(SocmedAnalyticsProfileSnapshot.fetched_at.asc())
        .all()
    )
    timeline = [{
        "fetched_at": socmed_dt_iso(s.fetched_at),
        "followers": s.followers,
        "following": s.following,
        "posts_count": s.posts_count,
        "total_likes": s.total_likes,
        "recent_avg_views": s.recent_avg_views,
        "recent_avg_likes": s.recent_avg_likes,
        "engagement_rate": s.recent_avg_engagement_rate,
    } for s in snaps]
    return {"profile": profile_to_dict(row), "snapshots": timeline}


def apify_configured() -> bool:
    return bool((os.environ.get("APIFY_API_TOKEN") or "").strip())


EXCEL_EXPORT_COLUMNS = [
    ("note", "Note / Campaign"),
    ("platform_label", "Platform"),
    ("author_username", "Username"),
    ("author_display_name", "Display Name"),
    ("caption", "Caption"),
    ("url", "Post URL"),
    ("views", "Views"),
    ("likes", "Likes"),
    ("comments", "Comments"),
    ("shares", "Shares"),
    ("saves", "Saves"),
    ("engagement_rate", "Engagement Rate (%)"),
    ("posted_at", "Posted At"),
    ("last_fetched_at", "Last Updated"),
]


def _flatten_for_export(item: Dict[str, Any]) -> Dict[str, Any]:
    m = item.get("metrics") or {}
    platform = item.get("platform", "")
    return {
        "note": item.get("note", ""),
        "platform_label": item.get("platform_label") or format_platform_label(platform),
        "platform": platform,
        "url": item.get("canonical_url") or item.get("url", ""),
        "canonical_url": item.get("canonical_url", ""),
        "author_username": item.get("author_username", ""),
        "author_display_name": item.get("author_display_name", ""),
        "caption": item.get("caption", ""),
        "posted_at": item.get("posted_at", ""),
        "views": m.get("views"),
        "likes": m.get("likes"),
        "comments": m.get("comments"),
        "shares": m.get("shares"),
        "saves": m.get("saves"),
        "engagement_rate": item.get("engagement_rate"),
        "last_fetched_at": item.get("last_fetched_at", ""),
    }


def build_excel_export(items: List[Dict[str, Any]]) -> Dict[str, str]:
    rows = [_flatten_for_export(x) for x in (items or [])]
    if not rows:
        rows = [{}]

    keys = [k for k, _ in EXCEL_EXPORT_COLUMNS]
    headers = [h for _, h in EXCEL_EXPORT_COLUMNS]
    data_rows = []
    for row in rows:
        data_rows.append([row.get(k) if row.get(k) is not None else "" for k in keys])

    out = io.BytesIO()
    navy = "#0B1A2E"
    with pd.ExcelWriter(out, engine="xlsxwriter") as writer:
        wb = writer.book
        ws = wb.add_worksheet("Social Media Analytics")
        writer.sheets["Social Media Analytics"] = ws

        header_fmt = wb.add_format({
            "bold": True,
            "font_color": "#FFFFFF",
            "bg_color": navy,
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": navy,
            "text_wrap": True,
        })
        cell_fmt = wb.add_format({
            "valign": "top",
            "text_wrap": False,
            "border": 1,
            "border_color": "#D1D5DB",
        })
        num_fmt = wb.add_format({
            "valign": "top",
            "num_format": "#,##0",
            "border": 1,
            "border_color": "#D1D5DB",
        })
        pct_fmt = wb.add_format({
            "valign": "top",
            "num_format": "0.00",
            "border": 1,
            "border_color": "#D1D5DB",
        })

        for col, title in enumerate(headers):
            ws.write(0, col, title, header_fmt)

        numeric_cols = {"views", "likes", "comments", "shares", "saves"}
        for r_idx, row_vals in enumerate(data_rows, start=1):
            for c_idx, (key, val) in enumerate(zip(keys, row_vals)):
                if key in numeric_cols and val != "":
                    try:
                        ws.write_number(r_idx, c_idx, int(val), num_fmt)
                    except (TypeError, ValueError):
                        ws.write(r_idx, c_idx, val, cell_fmt)
                elif key == "engagement_rate" and val != "":
                    try:
                        ws.write_number(r_idx, c_idx, float(val), pct_fmt)
                    except (TypeError, ValueError):
                        ws.write(r_idx, c_idx, val, cell_fmt)
                else:
                    ws.write(r_idx, c_idx, str(val) if val != "" else "", cell_fmt)

        widths = [12, 14, 18, 40, 36, 10, 10, 10, 10, 10, 16, 18, 18, 36]
        for c_idx, w in enumerate(widths[: len(headers)]):
            ws.set_column(c_idx, c_idx, w)

        ws.freeze_panes(1, 0)

    data = out.getvalue()
    return {
        "filename": f"freemir_socmed_analytics_{socmed_now().strftime('%Y%m%d_%H%M%S')}.xlsx",
        "file_base64": base64.b64encode(data).decode("utf-8"),
    }


PROFILE_VIDEO_EXPORT_COLUMNS = [
    ("rank", "Rank"),
    ("url", "Post URL"),
    ("caption", "Caption"),
    ("views", "Views"),
    ("likes", "Likes"),
    ("comments", "Comments"),
    ("shares", "Shares"),
    ("posted_at", "Posted At"),
]

PROFILE_SUMMARY_FIELDS = [
    ("note", "Note / Campaign"),
    ("platform_label", "Platform"),
    ("username", "Username"),
    ("display_name", "Display Name"),
    ("profile_url", "Profile URL"),
    ("followers", "Followers"),
    ("following", "Following"),
    ("posts_count", "Posts Count"),
    ("total_likes", "Total Likes"),
    ("recent_posts_count", "Videos Saved"),
    ("recent_avg_views", "Avg Views (top videos)"),
    ("recent_avg_likes", "Avg Likes (top videos)"),
    ("recent_avg_engagement", "Avg Engagement Rate (%)"),
    ("last_fetched_at", "Last Fetched"),
]

PROFILE_HISTORY_EXPORT_COLUMNS = [
    ("fetched_at", "Fetched At"),
    ("followers", "Followers"),
    ("following", "Following"),
    ("posts_count", "Posts Count"),
    ("total_likes", "Total Likes"),
    ("recent_avg_views", "Avg Views"),
    ("recent_avg_likes", "Avg Likes"),
    ("engagement_rate", "Engagement Rate (%)"),
]


def _write_sheet_table(ws, wb, headers: List[str], rows: List[List[Any]]):
    navy = "#0B1A2E"
    numeric_headers = {
        "Rank", "Views", "Likes", "Comments", "Shares", "Followers", "Following",
        "Posts Count", "Total Likes", "Avg Views", "Avg Likes", "Videos Saved",
    }
    header_fmt = wb.add_format({
        "bold": True, "font_color": "#FFFFFF", "bg_color": navy,
        "align": "center", "valign": "vcenter", "border": 1, "border_color": navy,
    })
    cell_fmt = wb.add_format({"valign": "top", "border": 1, "border_color": "#D1D5DB"})
    num_fmt = wb.add_format({"valign": "top", "num_format": "#,##0", "border": 1, "border_color": "#D1D5DB"})
    for col, title in enumerate(headers):
        ws.write(0, col, title, header_fmt)
    for r_idx, row_vals in enumerate(rows, start=1):
        for c_idx, val in enumerate(row_vals):
            if headers[c_idx] in numeric_headers and val not in (None, ""):
                try:
                    ws.write_number(r_idx, c_idx, float(val), num_fmt)
                    continue
                except (TypeError, ValueError):
                    pass
            ws.write(r_idx, c_idx, "" if val is None else str(val), cell_fmt)
    ws.freeze_panes(1, 0)


def build_profile_excel_export(profile: Dict[str, Any], snapshots: Optional[List[Dict[str, Any]]] = None) -> Dict[str, str]:
    """Excel with Summary, Top Videos, and History sheets."""
    avgs = profile.get("recent_avg") or {}
    er = avgs.get("engagement_rate")
    summary_row = {
        "note": profile.get("note", ""),
        "platform_label": profile.get("platform_label") or format_platform_label(profile.get("platform", "")),
        "username": profile.get("username", ""),
        "display_name": profile.get("display_name", ""),
        "profile_url": profile.get("profile_url", ""),
        "followers": profile.get("followers"),
        "following": profile.get("following"),
        "posts_count": profile.get("posts_count"),
        "total_likes": profile.get("total_likes"),
        "recent_posts_count": profile.get("recent_posts_count") or len(profile.get("recent_posts") or []),
        "recent_avg_views": avgs.get("views"),
        "recent_avg_likes": avgs.get("likes"),
        "recent_avg_engagement": er,
        "last_fetched_at": profile.get("last_fetched_at", ""),
    }

    video_rows = []
    for i, post in enumerate(profile.get("recent_posts") or [], start=1):
        video_rows.append([
            i,
            post.get("url") or "",
            (post.get("caption") or "")[:500],
            post.get("views"),
            post.get("likes"),
            post.get("comments"),
            post.get("shares"),
            post.get("posted_at") or "",
        ])

    history_rows = []
    for s in snapshots or []:
        history_rows.append([
            s.get("fetched_at") or "",
            s.get("followers"),
            s.get("following"),
            s.get("posts_count"),
            s.get("total_likes"),
            s.get("recent_avg_views"),
            s.get("recent_avg_likes"),
            s.get("engagement_rate"),
        ])

    out = io.BytesIO()
    uname = (profile.get("username") or "profile").replace("@", "")
    with pd.ExcelWriter(out, engine="xlsxwriter") as writer:
        wb = writer.book

        ws_sum = wb.add_worksheet("Summary")
        writer.sheets["Summary"] = ws_sum
        navy = "#0B1A2E"
        lbl_fmt = wb.add_format({"bold": True, "bg_color": navy, "font_color": "#FFFFFF", "border": 1})
        val_fmt = wb.add_format({"border": 1, "border_color": "#D1D5DB"})
        for r, (key, label) in enumerate(PROFILE_SUMMARY_FIELDS):
            ws_sum.write(r, 0, label, lbl_fmt)
            val = summary_row.get(key)
            ws_sum.write(r, 1, "" if val is None else val, val_fmt)
        ws_sum.set_column(0, 0, 28)
        ws_sum.set_column(1, 1, 48)

        ws_vid = wb.add_worksheet("Top Videos")
        writer.sheets["Top Videos"] = ws_vid
        vid_headers = [h for _, h in PROFILE_VIDEO_EXPORT_COLUMNS]
        _write_sheet_table(ws_vid, wb, vid_headers, video_rows or [[""] * len(vid_headers)])
        widths = [6, 40, 36, 12, 12, 12, 10, 20]
        for c_idx, w in enumerate(widths[: len(vid_headers)]):
            ws_vid.set_column(c_idx, c_idx, w)

        ws_hist = wb.add_worksheet("History")
        writer.sheets["History"] = ws_hist
        hist_headers = [h for _, h in PROFILE_HISTORY_EXPORT_COLUMNS]
        _write_sheet_table(ws_hist, wb, hist_headers, history_rows or [[""] * len(hist_headers)])
        for c_idx, w in enumerate([22, 12, 12, 12, 12, 12, 12, 18][: len(hist_headers)]):
            ws_hist.set_column(c_idx, c_idx, w)

    data = out.getvalue()
    ts = socmed_now().strftime("%Y%m%d_%H%M%S")
    return {
        "filename": f"freemir_profile_{uname}_{ts}.xlsx",
        "file_base64": base64.b64encode(data).decode("utf-8"),
    }


def export_profile_excel(db: Session, profile_id: int) -> Dict[str, str]:
    hist = get_profile_history(db, profile_id)
    return build_profile_excel_export(hist["profile"], hist.get("snapshots") or [])


def _flatten_profile_list_row(profile: Dict[str, Any]) -> Dict[str, Any]:
    avgs = profile.get("recent_avg") or {}
    er = avgs.get("engagement_rate")
    return {
        "note": profile.get("note", ""),
        "platform_label": profile.get("platform_label") or format_platform_label(profile.get("platform", "")),
        "username": profile.get("username", ""),
        "display_name": profile.get("display_name", ""),
        "profile_url": profile.get("profile_url", ""),
        "followers": profile.get("followers"),
        "following": profile.get("following"),
        "posts_count": profile.get("posts_count"),
        "total_likes": profile.get("total_likes"),
        "recent_posts_count": profile.get("recent_posts_count") or len(profile.get("recent_posts") or []),
        "recent_avg_views": avgs.get("views"),
        "recent_avg_likes": avgs.get("likes"),
        "recent_avg_engagement": er,
        "last_fetched_at": profile.get("last_fetched_at", ""),
    }


def build_profiles_list_excel_export(profiles: List[Dict[str, Any]]) -> Dict[str, str]:
    """Excel summary of multiple saved creator profiles."""
    rows = [_flatten_profile_list_row(p) for p in (profiles or [])]
    if not rows:
        rows = [{}]

    keys = [k for k, _ in PROFILE_SUMMARY_FIELDS]
    headers = [h for _, h in PROFILE_SUMMARY_FIELDS]
    data_rows = [[row.get(k) if row.get(k) is not None else "" for k in keys] for row in rows]

    out = io.BytesIO()
    with pd.ExcelWriter(out, engine="xlsxwriter") as writer:
        wb = writer.book
        ws = wb.add_worksheet("Saved Creators")
        writer.sheets["Saved Creators"] = ws
        _write_sheet_table(ws, wb, headers, data_rows)
        widths = [14, 18, 22, 40, 12, 12, 12, 12, 12, 16, 16, 16, 22]
        for c_idx, w in enumerate(widths[: len(headers)]):
            ws.set_column(c_idx, c_idx, w)

    data = out.getvalue()
    return {
        "filename": f"freemir_socmed_creators_{socmed_now().strftime('%Y%m%d_%H%M%S')}.xlsx",
        "file_base64": base64.b64encode(data).decode("utf-8"),
    }


def export_profiles_list_excel(db: Session, profile_ids: Optional[List[int]] = None) -> Dict[str, str]:
    if profile_ids:
        rows = (
            db.query(SocmedAnalyticsProfile)
            .filter(SocmedAnalyticsProfile.id.in_(profile_ids))
            .order_by(SocmedAnalyticsProfile.updated_at.desc())
            .all()
        )
        items = [profile_to_dict(r) for r in rows]
    else:
        items = list_profiles(db)
    return build_profiles_list_excel_export(items)


def recommended_actors_doc() -> Dict[str, Any]:
    """Reference for Apify actor selection (video + future profile)."""
    return {
        "video": {
            "tiktok": {
                "primary": APIFY_ACTORS["tiktok_video"],
                "fallback": ACTOR_TT_SCRAPER,
                "why": "Regular TikTok videos. Does NOT support TikTok Shop product-link videos (Clockworks open issue).",
                "shop_fallback": ACTOR_TT_PRODUCTS,
                "shop_fallback_requires": "TIKTOK_COOKIES_JSON env on server",
                "manual_metrics": "POST /videos/manual for Shop videos",
            },
            "instagram": {
                "primary": APIFY_ACTORS["instagram_post"],
                "why": "Works for /p/ and many reel URLs via directUrls.",
                "reel_enhanced": APIFY_ACTORS["instagram_reel"],
                "why_reel": "Better sharesCount + playCount on Reels; use when shares missing.",
                "url_rich": "data-slayer/instagram-post-details",
                "why_url": "128 fields incl. share_count, save_count, repost_count (paid tier).",
            },
        },
        "profile_future": {
            "implemented": True,
            "tiktok": {
                "actor": APIFY_ACTORS["tiktok_profile"],
                "metrics": PROFILE_AVAILABLE_FIELDS["tiktok"],
            },
            "instagram": {
                "actor": APIFY_ACTORS["instagram_profile"],
                "metrics": PROFILE_AVAILABLE_FIELDS["instagram"],
            },
        },
        "notes": {
            "clicks": "Neither platform exposes link clicks on public scrape; use platform Ads/Insights APIs if needed.",
            "instagram_shares": "Often premium or reel-only; reel scraper or data-slayer actor if missing.",
            "cost": "Prefer per-URL actors for analytics refresh; batch profile scrapes on schedule.",
        },
    }
