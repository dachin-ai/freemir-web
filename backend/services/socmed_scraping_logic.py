import io
import os
import re
import base64
from datetime import datetime, timezone
from collections import Counter
from typing import Any, Dict, List, Optional

import pandas as pd
import requests
try:
    from apify_client import ApifyClient
except Exception:
    ApifyClient = None

# ── Actors ──────────────────────────────────────────────
ACTOR_IG_SCRAPER        = "apify/instagram-scraper"
ACTOR_IG_PROFILE_POSTS  = "sones/instagram-posts-scraper-lowcost"
ACTOR_IG_COMMENTS       = "apify/instagram-comment-scraper"
ACTOR_TT_VIDEO     = "clockworks/tiktok-video-scraper"
ACTOR_TT_SCRAPER   = "clockworks/tiktok-scraper"
ACTOR_TT_PRODUCTS  = "scraping_samurai/tiktok-products-scraper"
ACTOR_TT_PROFILE   = "clockworks/tiktok-profile-scraper"
ACTOR_TT_COMMENTS  = "clockworks/tiktok-comments-scraper"

IG_URL_RE   = re.compile(r"^https://(www\.)?instagram\.com/.+", re.IGNORECASE)
TT_LONG_RE  = re.compile(r"^https://(www\.)?tiktok\.com/.+", re.IGNORECASE)
TT_SHORT_RE = re.compile(r"^https://(vt|vm)\.tiktok\.com/.+", re.IGNORECASE)
TT_VIDEO_ID_RE = re.compile(r"/video/(\d+)", re.IGNORECASE)

STOPWORDS = set("""
a an the and or but if then else for to of in on at by with from as is are was were be been being
i you he she it we they me him her us them my your his their our its this that these those
yang dan atau tapi jika maka untuk ke dari pada di sebagai adalah itu ini tersebut nya lah pun saja juga tidak bukan iya ya
""".split())


# ── Helpers ─────────────────────────────────────────────
def safe_get(d: Any, keys: List[str], default=None):
    if not isinstance(d, dict):
        return default
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def safe_get_path(d: Any, paths: List[str], default=None):
    for p in paths:
        cur: Any = d
        ok = True
        for part in p.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                ok = False
                break
        if ok and cur is not None:
            return cur
    return default


def to_int(x) -> Optional[int]:
    try:
        if x is None or x == "":
            return None
        if isinstance(x, (int, float)):
            return int(x)
        s = re.sub(r"[^\d\-]", "", str(x))
        return int(s) if s else None
    except Exception:
        return None


def df_text(df: pd.DataFrame) -> pd.DataFrame:
    if df is None:
        return df
    if df.empty:
        return df.fillna("")
    return df.fillna("").astype(str)


def as_kv_rows_text(d: Dict[str, Any]) -> pd.DataFrame:
    return pd.DataFrame(
        [{"field": str(k), "value": "" if v is None else str(v)} for k, v in d.items()],
        columns=["field", "value"],
    )


def scraped_date_mmddyyyy() -> str:
    return datetime.now().strftime("%m/%d/%Y")


def export_time_hhmmss() -> str:
    return datetime.now().strftime("%H:%M:%S")


def format_post_date_mmddyyyy(raw_ts: Any) -> str:
    if raw_ts is None or raw_ts == "":
        return ""
    try:
        if isinstance(raw_ts, (int, float)):
            v = int(raw_ts)
            if v > 10_000_000_000:
                v //= 1000
            return datetime.fromtimestamp(v, tz=timezone.utc).astimezone().strftime("%m/%d/%Y")
        s = str(raw_ts).strip()
        if s.isdigit():
            v = int(s)
            if v > 10_000_000_000:
                v //= 1000
            return datetime.fromtimestamp(v, tz=timezone.utc).astimezone().strftime("%m/%d/%Y")
        s = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt.astimezone().strftime("%m/%d/%Y")
    except Exception:
        return ""


def keyword_per_comment(text: str, top_k: int = 3) -> str:
    t = (text or "").lower()
    t = re.sub(r"http\S+|www\.\S+", " ", t)
    t = re.sub(r"[^a-z0-9_\s]", " ", t)
    toks = [p for p in t.split() if p and p not in STOPWORDS and len(p) >= 3]
    if not toks:
        return ""
    cnt = Counter(toks).most_common(top_k)
    return ", ".join([w for w, _ in cnt])


# ── URL Helpers ─────────────────────────────────────────
def parse_links_from_textarea(raw_text: str) -> List[str]:
    lines = [x.rstrip() for x in (raw_text or "").splitlines() if x.strip()]
    merged: List[str] = []
    for line in lines:
        s = line.strip()
        if s.lower().startswith("http"):
            merged.append(s)
        else:
            if merged:
                merged[-1] = merged[-1] + s
    return [x.strip() for x in merged if x.strip()]


def sanitize_ig_url(raw: str, kind: str) -> str:
    s = (raw or "").strip()
    if not s:
        raise ValueError("URL/username is empty.")
    s = "".join(ch for ch in s if ch.isprintable()).strip()
    s = s.replace("instagr.am", "instagram.com")
    s = s.replace("m.instagram.com", "instagram.com")
    s = s.replace("www.instagram.com", "instagram.com")
    if not s.startswith("http"):
        if kind == "profile":
            s = f"https://instagram.com/{s.strip('@')}/"
        else:
            s = "https://" + s
    if s.startswith("http://"):
        s = "https://" + s[len("http://"):]
    if s.startswith("https://instagram.com/"):
        s = "https://www.instagram.com/" + s[len("https://instagram.com/"):]
    else:
        s = re.sub(r"^https://[^/]*instagram\.com/", "https://www.instagram.com/", s)
    s = s.split("?")[0].split("#")[0]
    if kind == "profile" and not s.endswith("/"):
        s += "/"
    if not IG_URL_RE.match(s):
        raise ValueError(f"Invalid IG URL: {s}")
    return s


def sanitize_tt_url(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        raise ValueError("URL is empty.")
    s = "".join(ch for ch in s if ch.isprintable()).strip()
    s = s.split("#")[0].split("?")[0].strip()
    if not s.startswith("http"):
        s = "https://" + s
    if s.startswith("http://"):
        s = "https://" + s[len("http://"):]
    s = s.replace("m.tiktok.com", "www.tiktok.com")
    if not (TT_LONG_RE.match(s) or TT_SHORT_RE.match(s)):
        if re.match(r"^https://tiktok\.com/", s, flags=re.IGNORECASE):
            s = re.sub(r"^https://tiktok\.com/", "https://www.tiktok.com/", s, flags=re.IGNORECASE)
        if not (TT_LONG_RE.match(s) or TT_SHORT_RE.match(s)):
            raise ValueError(f"Invalid TikTok URL: {s}")
    return s


def canonicalize_tt_post_url(raw: str) -> str:
    """Stable video URL without tracking query params (helps Apify + TikTok Shop posts)."""
    u = sanitize_tt_url(raw)
    u = re.sub(r"^https://[^/]*tiktok\.com/", "https://www.tiktok.com/", u, flags=re.IGNORECASE)
    m = TT_VIDEO_ID_RE.search(u)
    if not m:
        return u.rstrip("/")
    vid = m.group(1)
    user_m = re.search(r"tiktok\.com/@([^/]+)/video", u, flags=re.IGNORECASE)
    if user_m:
        return f"https://www.tiktok.com/@{user_m.group(1)}/video/{vid}"
    return f"https://www.tiktok.com/video/{vid}"


def resolve_tiktok_shortlink(url: str, timeout: int = 20) -> str:
    bare = (url or "").strip().split("#")[0].split("?")[0].strip()
    u = sanitize_tt_url(bare)
    if not TT_SHORT_RE.match(u):
        return canonicalize_tt_post_url(u)
    try:
        r = requests.get(u, allow_redirects=True, timeout=timeout,
                         headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"})
        final_url = (r.url or "").strip()
        if not final_url:
            return canonicalize_tt_post_url(u)
        final_url = final_url.replace("m.tiktok.com", "www.tiktok.com")
        final_url = re.sub(r"^https://[^/]*tiktok\.com/", "https://www.tiktok.com/", final_url, flags=re.IGNORECASE)
        return canonicalize_tt_post_url(final_url)
    except Exception:
        return canonicalize_tt_post_url(u)


# ── Apify runner ────────────────────────────────────────
def apify_run(client: ApifyClient, actor_id: str, run_input: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Run actor and return all dataset items (paginated — avoids truncated pages)."""
    run = client.actor(actor_id).call(run_input=run_input)
    ds = run.get("defaultDatasetId")
    if not ds:
        return []
    items: List[Dict[str, Any]] = []
    offset = 0
    page_size = 500
    while True:
        page = client.dataset(ds).list_items(limit=page_size, offset=offset, clean=True)
        batch = page.items or []
        if not batch:
            break
        items.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return items


# ── IG fetch/parse ───────────────────────────────────────
def ig_fetch_post(client, post_url):
    items = apify_run(client, ACTOR_IG_SCRAPER, {"directUrls": [post_url], "resultsType": "posts", "resultsLimit": 1})
    return items[0] if items else {}


def _ig_profile_details_usable(row: Dict[str, Any]) -> bool:
    if not isinstance(row, dict) or not row:
        return False
    return bool(
        row.get("username")
        or row.get("followersCount") is not None
        or row.get("followers") is not None
        or row.get("fullName")
        or row.get("biography")
    )


def ig_fetch_profile_by_username(client, username):
    """Single Apify details call (no search fallback — saves ~30–60s)."""
    handle = (username or "").strip().lstrip("@").split("/")[0].split("?")[0]
    prof_url = sanitize_ig_url(handle, "profile")
    items = apify_run(
        client,
        ACTOR_IG_SCRAPER,
        {"directUrls": [prof_url], "resultsType": "details", "resultsLimit": 1},
    )
    return items[0] if items else {}


def ig_fetch_comments(client, post_url, limit):
    if limit <= 0:
        return []
    return apify_run(client, ACTOR_IG_COMMENTS, {"directUrls": [post_url], "resultsLimit": int(limit)})


def ig_extract_owner_username(post_raw):
    return safe_get(post_raw, ["ownerUsername", "username"], "") or safe_get((post_raw.get("owner") or {}), ["username"], "") or ""


def ig_parse_profile(profile):
    username = safe_get(profile, ["username", "userName"], "") or ""
    url_raw = safe_get(profile, ["url"], "") or (username if username else "")
    prof_url = sanitize_ig_url(url_raw, "profile") if url_raw else ""
    return {
        "ig_username": username, "ig_full_name": safe_get(profile, ["fullName", "full_name", "name"], ""),
        "ig_profile_link": prof_url, "followers": to_int(safe_get(profile, ["followersCount", "followers"], None)),
        "following": to_int(safe_get(profile, ["followsCount", "following"], None)),
        "posts_count": to_int(safe_get(profile, ["postsCount", "posts"], None)),
        "is_verified": safe_get(profile, ["verified", "isVerified"], None),
        "is_business": safe_get(profile, ["isBusinessAccount"], None),
        "category": safe_get(profile, ["categoryName", "category"], ""),
        "external_url": safe_get(profile, ["externalUrl", "external_url", "website"], ""),
        "biography": safe_get(profile, ["biography", "bio", "description"], ""),
        "profile_pic_url": safe_get(profile, ["profilePicUrl", "profile_pic_url"], ""),
    }


def ig_parse_post(post):
    caption_obj = post.get("caption")
    if isinstance(caption_obj, dict):
        caption = caption_obj.get("text") or ""
    else:
        caption = safe_get(post, ["caption", "text", "title"], "") or ""
        if not isinstance(caption, str):
            caption = str(caption or "")
    hashtags = safe_get(post, ["hashtags"], None)
    if not isinstance(hashtags, list) or not hashtags:
        hashtags = list(dict.fromkeys(re.findall(r"#([A-Za-z0-9_\.]+)", caption)))
    mentions = safe_get(post, ["mentions"], None)
    if not isinstance(mentions, list) or not mentions:
        mentions = list(dict.fromkeys(re.findall(r"@([A-Za-z0-9_\.]+)", caption)))
    raw_ts = safe_get(post, ["timestamp", "takenAtTimestamp", "takenAt", "taken_at"], "")
    post_link = safe_get(post, ["url", "postUrl", "link", "post_url"], "")
    if not post_link:
        code = safe_get(post, ["shortCode", "code"], "")
        if code and isinstance(code, str):
            post_link = f"https://www.instagram.com/p/{code}/"
    return {
        "post_link": post_link,
        "type": safe_get(post, ["type", "mediaType", "productType", "product_type"], ""),
        "timestamp": raw_ts, "post_date": format_post_date_mmddyyyy(raw_ts),
        "caption": caption, "likes": to_int(safe_get(post, ["likesCount", "likes", "like_count"], None)),
        "comment_count": to_int(safe_get(post, ["commentsCount", "comments", "comment_count"], None)),
        "hashtags_all": ", ".join(hashtags), "mentions_all": ", ".join(mentions),
        "video_duration_sec": to_int(safe_get(post, ["videoDuration", "duration", "video_duration"], None)),
        "Video Play Count": to_int(safe_get(post, ["videoPlayCount", "playCount", "plays", "play_count"], None)),
        "Video View Count": to_int(safe_get(post, ["videoViewCount", "viewCount", "views", "view_count"], None)),
        "display_url": safe_get(post, ["displayUrl", "display_url"], ""),
    }


def ig_parse_comment(item):
    text = safe_get(item, ["text", "comment", "body"], "") or ""
    username = safe_get(item, ["ownerUsername", "username"], "") or ""
    profile_url = safe_get(item, ["ownerProfileUrl", "profileUrl", "profile_url"], "") or (sanitize_ig_url(username, "profile") if username else "")
    return {
        "username": username, "profile_url": profile_url, "text": text,
        "likes": to_int(safe_get(item, ["likesCount", "likes"], None)),
        "keyword": keyword_per_comment(text, top_k=3),
        "timestamp": safe_get(item, ["timestamp", "createdAt", "created_at"], ""),
    }


# ── TikTok fetch/parse ───────────────────────────────────
def _tt_stats_block(video: Dict[str, Any]) -> Dict[str, Any]:
    stats = video.get("stats")
    return stats if isinstance(stats, dict) else {}


def tt_item_usable(video: Any) -> bool:
    if not isinstance(video, dict) or not video:
        return False
    ec = _tt_item_error_code(video)
    if ec in ("POST_NOT_FOUND_OR_PRIVATE", "INVALID_URLS"):
        return False
    stats = _tt_stats_block(video)
    return bool(
        video.get("id")
        or (str(video.get("text") or "").strip())
        or to_int(safe_get(video, ["playCount", "diggCount"], None)) is not None
        or to_int(stats.get("playCount")) is not None
        or to_int(stats.get("diggCount")) is not None
    )


def _tt_item_error_code(video: Dict[str, Any]) -> str:
    if not isinstance(video, dict):
        return ""
    return str(video.get("errorCode") or video.get("error") or "").strip()


def _tt_pick_best_item(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    for item in items or []:
        if tt_item_usable(item):
            return item
    return (items or [{}])[0] if items else {}


def _tt_video_actor_input(post_url: str) -> Dict[str, Any]:
    return {
        "postURLs": [post_url],
        "shouldDownloadVideos": False,
        "shouldDownloadCovers": False,
        "shouldDownloadSubtitles": False,
        "shouldDownloadSlideshowImages": False,
        "scrapeRelatedVideos": False,
    }


def _tt_scraper_actor_input(post_url: str, *, proxy_country: str = "ID") -> Dict[str, Any]:
    return {
        "postURLs": [post_url],
        "resultsPerPage": 1,
        "shouldDownloadVideos": False,
        "shouldDownloadCovers": False,
        "shouldDownloadSubtitles": False,
        "shouldDownloadSlideshowImages": False,
        "proxyCountryCode": proxy_country,
    }


def _tiktok_cookies_json() -> str:
    return (os.environ.get("TIKTOK_COOKIES_JSON") or "").strip()


def tt_normalize_products_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """Map scraping_samurai/tiktok-products-scraper output to clockworks-like shape."""
    if not isinstance(item, dict):
        return {}
    vs = item.get("videoStats") if isinstance(item.get("videoStats"), dict) else {}
    ai = item.get("authorInfo") if isinstance(item.get("authorInfo"), dict) else {}
    username = ai.get("uniqueId") or ""
    return {
        "id": str(item.get("id") or ""),
        "text": item.get("description") or "",
        "createTimeISO": item.get("createTime") or "",
        "webVideoUrl": item.get("url") or "",
        "playCount": vs.get("playCount"),
        "diggCount": vs.get("diggCount"),
        "commentCount": vs.get("commentCount"),
        "shareCount": vs.get("shareCount"),
        "collectCount": vs.get("collectCount"),
        "authorMeta": {
            "name": username,
            "uniqueId": username,
            "nickName": ai.get("nickname") or "",
            "avatar": ai.get("avatarUrl") or "",
        },
        "videoMeta": {"coverUrl": item.get("coverUrl") or ""},
        "_source": "tiktok_products_scraper",
    }


def tt_fetch_via_products_scraper(client: ApifyClient, post_url: str) -> Dict[str, Any]:
    """Optional fallback for TikTok Shop / yellow-cart videos (needs TIKTOK_COOKIES_JSON on server)."""
    cookies = _tiktok_cookies_json()
    if not cookies:
        return {}
    url = canonicalize_tt_post_url(resolve_tiktok_shortlink(post_url))
    try:
        items = apify_run(client, ACTOR_TT_PRODUCTS, {
            "startUrls": [{"url": url}],
            "cookies": cookies,
        })
    except Exception:
        return {}
    for raw in items or []:
        norm = tt_normalize_products_item(raw)
        if tt_item_usable(norm):
            return norm
    return {}


def tt_fetch_video(client, post_url):
    """Fetch one TikTok video; tries video-scraper, tiktok-scraper, then products-scraper (Shop)."""
    url = canonicalize_tt_post_url(resolve_tiktok_shortlink(post_url))

    items = apify_run(client, ACTOR_TT_VIDEO, _tt_video_actor_input(url))
    best = _tt_pick_best_item(items)
    if tt_item_usable(best):
        return best

    for proxy in ("ID", "None"):
        items_fb = apify_run(client, ACTOR_TT_SCRAPER, _tt_scraper_actor_input(url, proxy_country=proxy))
        best_fb = _tt_pick_best_item(items_fb)
        if tt_item_usable(best_fb):
            return best_fb

    shop = tt_fetch_via_products_scraper(client, post_url)
    if tt_item_usable(shop):
        return shop

    return best if isinstance(best, dict) else {}


def tiktok_fetch_failure_message(raw: Dict[str, Any], post_url: str) -> str:
    """User-facing hint when Apify returns empty (common on TikTok Shop / yellow-cart videos)."""
    ec = _tt_item_error_code(raw or {})
    if ec == "POST_NOT_FOUND_OR_PRIVATE":
        return "Video TikTok tidak ditemukan, dihapus, atau bersifat privat."
    if ec == "POST_SENSITIVE":
        return "Video ditandai konten sensitif — TikTok membatasi akses scrape."
    if ec == "INVALID_URLS":
        return "Format URL TikTok tidak valid. Gunakan link video lengkap (bukan profil saja)."
    shop_hint = (
        "Video keranjang kuning (TikTok Shop) tidak didukung actor TikTok Video Scraper Clockworks "
        "(issue resmi: product link). Gunakan input metrik manual di tab Impor, atau set "
        "TIKTOK_COOKIES_JSON di server untuk fallback Products Scraper. "
    )
    if ec:
        return f"{shop_hint}(Apify: {ec})"
    return f"{shop_hint}URL: {canonicalize_tt_post_url(post_url)}"


def tt_fetch_comments(client, post_url, limit):
    if limit <= 0:
        return []
    return apify_run(client, ACTOR_TT_COMMENTS, {"postURLs": [post_url], "commentsPerPost": int(limit), "maxRepliesPerComment": 0})


def _tt_parse_recent_post_item(item: Dict[str, Any]) -> Dict[str, Any]:
    stats = _tt_stats_block(item)
    views = to_int(safe_get(item, ["playCount"], None) or stats.get("playCount"))
    likes = to_int(safe_get(item, ["diggCount"], None) or stats.get("diggCount"))
    comments = to_int(safe_get(item, ["commentCount"], None) or stats.get("commentCount"))
    shares = to_int(safe_get(item, ["shareCount"], None) or stats.get("shareCount"))
    parsed = tt_parse_video(item)
    return {
        "url": parsed.get("post_link") or safe_get(item, ["webVideoUrl"], ""),
        "caption": (parsed.get("caption") or "")[:200],
        "views": views,
        "likes": likes,
        "comments": comments,
        "shares": shares,
        "posted_at": str(parsed.get("timestamp") or ""),
    }


def _tt_profile_actor_input(handle: str, video_count: int) -> Dict[str, Any]:
    n = max(1, int(video_count))
    return {
        "profiles": [handle],
        "resultsPerPage": n,
        "profileScrapeSections": ["videos"],
        "profileSorting": "popular",
        "shouldDownloadVideos": False,
        "shouldDownloadCovers": False,
        "shouldDownloadSubtitles": False,
        "shouldDownloadSlideshowImages": False,
    }


def _tt_extract_profile_and_videos(items: List[Dict[str, Any]], handle: str) -> tuple:
    err = next((i for i in (items or []) if i.get("errorCode")), None)
    author_meta = None
    recent: List[Dict[str, Any]] = []
    seen_keys = set()
    for item in items or []:
        if item.get("errorCode"):
            continue
        if item.get("authorMeta") and not author_meta:
            author_meta = item.get("authorMeta")
        if not (item.get("id") or safe_get(item, ["playCount"], None) or _tt_stats_block(item).get("playCount")):
            continue
        parsed = _tt_parse_recent_post_item(item)
        key = parsed.get("url") or str(item.get("id") or "")
        if key and key in seen_keys:
            continue
        if key:
            seen_keys.add(key)
        recent.append(parsed)
    return err, author_meta, recent


def _tt_build_profile_dict(handle: str, author_meta: Optional[Dict], recent: List[Dict[str, Any]], items: List[Dict]) -> Dict[str, Any]:
    if author_meta:
        return {
            "username": safe_get(author_meta, ["name", "uniqueId"], "") or handle,
            "display_name": safe_get(author_meta, ["nickName", "nickname"], "") or "",
            "profile_url": safe_get(author_meta, ["profileUrl"], "") or f"https://www.tiktok.com/@{handle}",
            "biography": safe_get(author_meta, ["signature"], "") or "",
            "avatar_url": safe_get(author_meta, ["avatar", "avatarThumb"], "") or "",
            "followers": to_int(safe_get(author_meta, ["fans", "followers"], None)),
            "following": to_int(safe_get(author_meta, ["following"], None)),
            "posts_count": to_int(safe_get(author_meta, ["video"], None)),
            "total_likes": to_int(safe_get(author_meta, ["heart", "heartCount"], None)),
            "is_verified": bool(safe_get(author_meta, ["verified"], False)),
        }
    if recent:
        prof = tt_parse_profile_from_video((items or [{}])[0])
        return {
            "username": prof.get("tt_username") or handle,
            "display_name": prof.get("tt_full_name") or "",
            "profile_url": prof.get("tt_profile_link") or f"https://www.tiktok.com/@{handle}",
            "biography": prof.get("biography") or "",
            "avatar_url": prof.get("profile_pic_url") or "",
            "followers": prof.get("followers"),
            "following": prof.get("following"),
            "posts_count": prof.get("posts_count"),
            "total_likes": None,
            "is_verified": bool(prof.get("is_verified")),
        }
    return {}


def tt_fetch_profile_bundle(client, username: str, scrape_pool: int = 30) -> Dict[str, Any]:
    """Profile meta + video pool via tiktok-profile-scraper, fallback tiktok-scraper if < pool."""
    handle = (username or "").strip().lstrip("@").split("/")[0].split("?")[0]
    if not handle:
        raise ValueError("TikTok username is required.")
    target = max(1, int(scrape_pool))
    actors_used: List[str] = []

    items = apify_run(client, ACTOR_TT_PROFILE, _tt_profile_actor_input(handle, target))
    actors_used.append(ACTOR_TT_PROFILE)
    err, author_meta, recent = _tt_extract_profile_and_videos(items, handle)

    if len(recent) < target:
        fb_items = apify_run(client, ACTOR_TT_SCRAPER, _tt_profile_actor_input(handle, target))
        actors_used.append(ACTOR_TT_SCRAPER)
        _, fb_meta, fb_recent = _tt_extract_profile_and_videos(fb_items, handle)
        if fb_meta and not author_meta:
            author_meta = fb_meta
        seen = {p.get("url") for p in recent if p.get("url")}
        for p in fb_recent:
            u = p.get("url")
            if u and u in seen:
                continue
            if u:
                seen.add(u)
            recent.append(p)

    if err and not author_meta and not recent:
        code = err.get("errorCode") or "UNKNOWN"
        if code == "PROFILE_PRIVATE":
            raise RuntimeError("Profil TikTok privat atau tidak bisa diakses.")
        raise RuntimeError(f"TikTok profile scrape failed ({code}).")

    prof = _tt_build_profile_dict(handle, author_meta, recent, items)
    if not prof and not recent:
        raise RuntimeError("TikTok profile not found or empty response.")

    return {
        "profile": prof,
        "recent_posts": recent,
        "videos_fetched_raw": len(recent),
        "videos_target": target,
        "actors_used": actors_used,
    }


def _ig_post_dedupe_key(item: Dict[str, Any]) -> str:
    if not isinstance(item, dict):
        return ""
    post_url = (safe_get(item, ["url", "postUrl", "link", "post_url"], "") or "").strip().lower()
    if post_url:
        return post_url
    code = safe_get(item, ["shortCode", "code"], "")
    if code and isinstance(code, str) and not code.isdigit():
        return f"https://www.instagram.com/p/{code}/".lower()
    p = ig_parse_post(item)
    return (p.get("post_link") or "").strip().lower()


def _ig_is_post_item(item: Dict[str, Any]) -> bool:
    if not isinstance(item, dict) or item.get("error"):
        return False
    if _ig_post_dedupe_key(item):
        return True
    caption = item.get("caption")
    caption_text = caption.get("text") if isinstance(caption, dict) else caption
    return bool(
        caption_text
        or safe_get(item, ["likesCount", "likes", "like_count"], None) is not None
        or safe_get(item, ["type", "mediaType", "productType", "product_type"], "")
        or safe_get(item, ["post_url", "code", "pk"], "")
    )


def _ig_is_reel_or_video(item: Dict[str, Any]) -> bool:
    if not isinstance(item, dict):
        return False
    type_hint = str(
        safe_get(item, ["type", "mediaType", "productType", "product_type", "media_type"], "") or ""
    ).lower()
    if any(k in type_hint for k in ("reel", "video", "clips")):
        return True
    if item.get("videoDuration") or item.get("video_duration") or item.get("video_duration_sec"):
        return True
    if safe_get(item, ["videoPlayCount", "play_count", "view_count", "videoViewCount"], None) is not None:
        return True
    url = (safe_get(item, ["url", "postUrl", "post_url"], "") or "").lower()
    return "/reel/" in url or "/reels/" in url


def _ig_parse_recent_post_item(item: Dict[str, Any]) -> Dict[str, Any]:
    p = ig_parse_post(item)
    views = p.get("Video Play Count") or p.get("Video View Count")
    media_type = (p.get("type") or "")[:40]
    if not media_type and _ig_is_reel_or_video(item):
        media_type = "reel"
    return {
        "url": p.get("post_link") or "",
        "caption": (p.get("caption") or "")[:200],
        "views": views,
        "likes": p.get("likes"),
        "comments": p.get("comment_count"),
        "shares": None,
        "posted_at": str(p.get("timestamp") or ""),
        "media_type": media_type,
    }


def _ig_merge_post_items(merged: List[Dict[str, Any]], seen: set, items: List[Dict[str, Any]]) -> None:
    for item in items or []:
        if not _ig_is_post_item(item):
            continue
        key = _ig_post_dedupe_key(item)
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(_ig_parse_recent_post_item(item))


def _ig_run_scraper_strategy(
    client,
    merged: List[Dict[str, Any]],
    seen: set,
    actors_used: List[str],
    run_input: Dict[str, Any],
) -> int:
    batch = apify_run(client, ACTOR_IG_SCRAPER, run_input)
    if batch and ACTOR_IG_SCRAPER not in actors_used:
        actors_used.append(ACTOR_IG_SCRAPER)
    before = len(merged)
    _ig_merge_post_items(merged, seen, batch)
    return len(merged) - before


def ig_fetch_profile_posts(
    client,
    username: str,
    scrape_pool: int = 30,
    actors_used: Optional[List[str]] = None,
    *,
    seed_count: int = 0,
    save_target: int = 15,
) -> List[Dict[str, Any]]:
    """
    Fast IG post pool: max 2 Apify runs (reels, then posts only if pool still short).
    """
    handle = (username or "").strip().lstrip("@").split("/")[0].split("?")[0]
    prof_url = sanitize_ig_url(handle, "profile")
    pool = max(1, int(scrape_pool))
    save_n = max(1, int(save_target))
    if seed_count >= pool:
        return []

    merged: List[Dict[str, Any]] = []
    seen: set = set()
    actors = actors_used if actors_used is not None else []

    # 1) Reels — one call, best source for view counts
    _ig_run_scraper_strategy(
        client,
        merged,
        seen,
        actors,
        {"directUrls": [prof_url], "resultsType": "reels", "resultsLimit": pool},
    )

    total_after_reels = seed_count + len(merged)
    # 2) Posts tab — only if pool still below save target (skip extra ~30–60s when unnecessary)
    if total_after_reels < save_n:
        _ig_run_scraper_strategy(
            client,
            merged,
            seen,
            actors,
            {
                "directUrls": [prof_url],
                "resultsType": "posts",
                "resultsLimit": pool,
                "addParentData": True,
            },
        )

    return merged[: max(0, pool - seed_count)]


def ig_fetch_profile_bundle(
    client,
    username: str,
    scrape_pool: int = 30,
    *,
    save_target: int = 15,
) -> Dict[str, Any]:
    """Instagram profile meta + post pool — efficient: details + ≤2 post scrapes."""
    handle = (username or "").strip().lstrip("@").split("/")[0].split("?")[0]
    if not handle:
        raise ValueError("Instagram username is required.")
    pool = max(1, int(scrape_pool))
    actors_used: List[str] = []

    details = ig_fetch_profile_by_username(client, handle)
    if not _ig_profile_details_usable(details):
        raise RuntimeError("Instagram profile not found.")
    actors_used.append(ACTOR_IG_SCRAPER)
    parsed = ig_parse_profile(details)

    merged: List[Dict[str, Any]] = []
    seen: set = set()

    latest_embedded = details.get("latestPosts") or details.get("latest_posts") or []
    if isinstance(latest_embedded, list):
        _ig_merge_post_items(merged, seen, latest_embedded)

    seed_count = len(merged)
    posts_pool = ig_fetch_profile_posts(
        client,
        handle,
        pool,
        actors_used,
        seed_count=seed_count,
        save_target=save_target,
    )

    for row in posts_pool:
        key = (row.get("url") or "").strip().lower()
        if key:
            if key in seen:
                continue
            seen.add(key)
        merged.append(row)

    prof = {
        "username": parsed.get("ig_username") or handle,
        "display_name": parsed.get("ig_full_name") or "",
        "profile_url": parsed.get("ig_profile_link") or sanitize_ig_url(handle, "profile"),
        "biography": parsed.get("biography") or "",
        "avatar_url": parsed.get("profile_pic_url") or "",
        "followers": parsed.get("followers"),
        "following": parsed.get("following"),
        "posts_count": parsed.get("posts_count"),
        "total_likes": None,
        "is_verified": bool(parsed.get("is_verified")),
        "category": parsed.get("category") or "",
    }
    pool_posts = merged[:pool]
    return {
        "profile": prof,
        "recent_posts": pool_posts,
        "videos_fetched_raw": len(pool_posts),
        "videos_target": pool,
        "actors_used": actors_used,
    }


def tt_parse_profile_from_video(video):
    username = safe_get_path(video, ["authorMeta.name", "authorMeta.username"], "") or ""
    profile_url = safe_get_path(video, ["authorMeta.profileUrl", "authorMeta.url"], "") or (f"https://www.tiktok.com/@{username}" if username else "")
    return {
        "tt_username": username, "tt_full_name": safe_get_path(video, ["authorMeta.nickName", "authorMeta.nickname"], "") or "",
        "tt_profile_link": profile_url, "followers": to_int(safe_get_path(video, ["authorMeta.fans", "authorMeta.followers"], None)),
        "following": to_int(safe_get_path(video, ["authorMeta.following"], None)),
        "posts_count": to_int(safe_get_path(video, ["authorMeta.video"], None)),
        "is_verified": safe_get_path(video, ["authorMeta.verified"], None),
        "external_url": safe_get_path(video, ["authorMeta.signatureLink"], ""),
        "biography": safe_get_path(video, ["authorMeta.signature"], ""),
        "profile_pic_url": safe_get_path(video, ["authorMeta.avatar", "authorMeta.avatarThumb"], ""),
    }


def tt_parse_video(video):
    caption = safe_get(video, ["text", "title", "caption", "desc"], "") or ""
    hashtags = list(dict.fromkeys(re.findall(r"#([A-Za-z0-9_\.]+)", caption)))
    raw_ts = safe_get(video, ["createTimeISO", "createTime"], "")
    stats = _tt_stats_block(video)
    return {
        "post_link": safe_get(video, ["webVideoUrl", "webVideoURL", "url"], "") or "",
        "type": "tiktok_video", "timestamp": raw_ts, "post_date": format_post_date_mmddyyyy(raw_ts),
        "caption": caption,
        "likes": to_int(safe_get(video, ["diggCount", "likes"], None) or stats.get("diggCount")),
        "comment_count": to_int(safe_get(video, ["commentCount", "comments"], None) or stats.get("commentCount")),
        "shares": to_int(safe_get(video, ["shareCount", "shares"], None) or stats.get("shareCount")),
        "hashtags_all": ", ".join(hashtags),
        "video_duration_sec": to_int(safe_get_path(video, ["videoMeta.duration"], None)),
        "Video Play Count": to_int(
            safe_get(video, ["playCount", "views"], None) or stats.get("playCount") or stats.get("viewCount")
        ),
        "display_url": safe_get_path(
            video, ["videoMeta.coverUrl", "videoMeta.cover", "covers.default", "cover"],
        ) or safe_get(video, ["cover"], ""),
    }


def tt_parse_comment(item):
    text = safe_get(item, ["text"], "") or ""
    username = safe_get_path(item, ["author.uniqueId", "authorMeta.name", "userId"], "") or ""
    profile_url = safe_get_path(item, ["author.profileUrl"], "") or (f"https://www.tiktok.com/@{username}" if username else "")
    return {
        "username": username, "profile_url": profile_url, "text": text,
        "likes": to_int(safe_get(item, ["diggCount", "likeCount"], None)),
        "keyword": keyword_per_comment(text, top_k=3),
        "timestamp": safe_get(item, ["createTimeISO", "createdAt"], ""),
    }


# ── Excel builders ───────────────────────────────────────
def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("utf-8")


def build_excel_specific(kv1, kv2, comments_df) -> bytes:
    out = io.BytesIO()
    with pd.ExcelWriter(out, engine="xlsxwriter") as writer:
        wb = writer.book
        fmt_text = wb.add_format({"num_format": "@"})
        df_text(as_kv_rows_text(kv1)).to_excel(writer, index=False, sheet_name="01_general")
        df_text(as_kv_rows_text(kv2)).to_excel(writer, index=False, sheet_name="02_post")
        df_text(comments_df).to_excel(writer, index=False, sheet_name="03_comments")
        for sn, widths in [("01_general", [26, 90]), ("02_post", [26, 90]), ("03_comments", [22, 55, 70, 10, 28, 22])]:
            ws = writer.sheets[sn]
            ws.freeze_panes(1, 0)
            for i, w in enumerate(widths):
                ws.set_column(i, i, w, fmt_text)
    return out.getvalue()


def build_excel_general(rows: List[Dict]) -> bytes:
    out = io.BytesIO()
    with pd.ExcelWriter(out, engine="xlsxwriter") as writer:
        wb = writer.book
        fmt_text = wb.add_format({"num_format": "@"})
        df = df_text(pd.DataFrame(rows))
        df.to_excel(writer, index=False, sheet_name="general")
        ws = writer.sheets["general"]
        ws.freeze_panes(1, 0)
        for i in range(len(df.columns)):
            ws.set_column(i, i, 34, fmt_text)
    return out.getvalue()


# ── Main process functions ────────────────────────────────
def run_specific(token: str, platform: str, url: str, comments_limit: int) -> Dict:
    client = ApifyClient(token)
    scraped_at = scraped_date_mmddyyyy()
    export_time = export_time_hhmmss()
    empty_comments = pd.DataFrame(columns=["username", "profile_url", "text", "likes", "keyword", "timestamp"])

    if platform == "instagram":
        post_url = sanitize_ig_url(url, "post")
        post_raw = ig_fetch_post(client, post_url)
        if not post_raw:
            raise RuntimeError("Failed to fetch post (private/restricted/rate-limited).")
        post_parsed = ig_parse_post(post_raw)
        owner_username = ig_extract_owner_username(post_raw)
        profile_info = {}
        if owner_username:
            prof_raw = ig_fetch_profile_by_username(client, owner_username)
            if prof_raw:
                profile_info = ig_parse_profile(prof_raw)
        comment_items = ig_fetch_comments(client, post_url, comments_limit) if comments_limit > 0 else []
        comments_df = pd.DataFrame([ig_parse_comment(x) for x in comment_items]) if comment_items else empty_comments
        kv1 = {"platform": "instagram", "post_link": post_url,
                "ig_username": profile_info.get("ig_username") or owner_username,
                "ig_full_name": profile_info.get("ig_full_name", ""),
                "ig_profile_link": profile_info.get("ig_profile_link") or (sanitize_ig_url(owner_username, "profile") if owner_username else ""),
                "followers": profile_info.get("followers"), "following": profile_info.get("following"),
                "posts_count": profile_info.get("posts_count"), "is_verified": profile_info.get("is_verified"),
                "is_business": profile_info.get("is_business"), "category": profile_info.get("category"),
                "external_url": profile_info.get("external_url"), "scraped_at": scraped_at, "export_time": export_time}
        kv2 = {**{k: post_parsed.get(k) for k in ["post_date","caption","type","timestamp","likes","comment_count","hashtags_all","mentions_all","video_duration_sec","Video Play Count","Video View Count","display_url"]}, "export_time": export_time}

    else:
        tt_in = sanitize_tt_url(url)
        post_url = resolve_tiktok_shortlink(tt_in)
        video_raw = tt_fetch_video(client, post_url)
        if not video_raw:
            raise RuntimeError("Failed to fetch TikTok video (private/restricted/rate-limited).")
        post_parsed = tt_parse_video(video_raw)
        profile_info = tt_parse_profile_from_video(video_raw)
        comment_items = tt_fetch_comments(client, post_url, comments_limit) if comments_limit > 0 else []
        comments_df = pd.DataFrame([tt_parse_comment(x) for x in comment_items]) if comment_items else empty_comments
        kv1 = {"post_link": post_url, **{k: profile_info.get(k) for k in ["tt_username","tt_full_name","tt_profile_link","followers","following","posts_count","is_verified","external_url","biography","profile_pic_url"]}, "scraped_at": scraped_at, "export_time": export_time}
        kv2 = {**{k: post_parsed.get(k) for k in ["post_date","caption","type","timestamp","likes","comment_count","shares","hashtags_all","video_duration_sec","Video Play Count","display_url"]}, "export_time": export_time}

    xlsx = build_excel_specific(kv1, kv2, comments_df)
    return {
        "mode": "specific",
        "kv1": {k: ("" if v is None else str(v)) for k, v in kv1.items()},
        "kv2": {k: ("" if v is None else str(v)) for k, v in kv2.items()},
        "comments": df_text(comments_df).to_dict(orient="records"),
        "comments_columns": list(comments_df.columns),
        "file_base64": _b64(xlsx),
    }


def run_general(token: str, platform: str, raw_links: str, dedupe: bool, boost_type: Optional[str] = None) -> Dict:
    client = ApifyClient(token)
    scraped_at = scraped_date_mmddyyyy()
    export_time = export_time_hhmmss()
    lines = parse_links_from_textarea(raw_links)
    if dedupe:
        lines = list(dict.fromkeys(lines))
    rows = []
    errors = []

    for raw in lines:
        try:
            if platform == "instagram":
                post_url = sanitize_ig_url(raw, "post")
                post_raw = ig_fetch_post(client, post_url)
                if not post_raw:
                    errors.append(f"Failed: {raw}")
                    continue
                owner_username = ig_extract_owner_username(post_raw)
                owner_full = safe_get_path(post_raw, ["owner.fullName", "ownerFullName", "fullName"], "") or ""
                raw_ts = safe_get(post_raw, ["timestamp", "takenAtTimestamp", "takenAt"], "")
                post_date = format_post_date_mmddyyyy(raw_ts)
                play_count = to_int(safe_get(post_raw, ["videoPlayCount", "playCount", "plays"], None))
                likes = to_int(safe_get(post_raw, ["likesCount", "likes"], None))
                comment_count = to_int(safe_get(post_raw, ["commentsCount", "comments"], None))
                caption = safe_get(post_raw, ["caption", "text", "title"], "") or ""
                hashtags = safe_get(post_raw, ["hashtags"], None)
                if not isinstance(hashtags, list):
                    hashtags = list(dict.fromkeys(re.findall(r"#([A-Za-z0-9_\.]+)", caption)))
                video_duration_sec = to_int(safe_get(post_raw, ["videoDuration", "duration", "video_duration"], None))
                rows.append({"platform": "instagram", "boost_type": boost_type or "",
                              "account_name": str(owner_full or ""), "username": str(owner_username or ""),
                              "post_date": str(post_date or ""), "post_link": str(post_url),
                              "Video Play Count": str(play_count or ""), "likes": str(likes or ""),
                              "comment_count": str(comment_count or ""), "hashtags_all": ", ".join(hashtags) if isinstance(hashtags, list) else str(hashtags or ""),
                              "video_duration_sec": str(video_duration_sec or ""), "scraped_at": scraped_at, "export_time": export_time})
            else:
                tt_in = sanitize_tt_url(raw)
                post_url = resolve_tiktok_shortlink(tt_in)
                video_raw = tt_fetch_video(client, post_url)
                if not video_raw:
                    errors.append(f"Failed: {raw}")
                    continue
                owner_username = safe_get_path(video_raw, ["authorMeta.name", "authorMeta.username"], "") or ""
                owner_full = safe_get_path(video_raw, ["authorMeta.nickName", "authorMeta.nickname"], "") or ""
                raw_ts = safe_get(video_raw, ["createTimeISO", "createTime"], "")
                post_date = format_post_date_mmddyyyy(raw_ts)
                play_count = to_int(safe_get(video_raw, ["playCount", "views"], None))
                likes = to_int(safe_get(video_raw, ["diggCount", "likes"], None))
                comment_count = to_int(safe_get(video_raw, ["commentCount", "comments"], None))
                caption = safe_get(video_raw, ["text", "title", "caption"], "") or ""
                hashtags = list(dict.fromkeys(re.findall(r"#([A-Za-z0-9_\.]+)", caption)))
                video_duration_sec = to_int(safe_get_path(video_raw, ["videoMeta.duration"], None))
                post_link = safe_get(video_raw, ["webVideoUrl", "webVideoURL", "url"], "") or post_url
                rows.append({"account_name": str(owner_full or ""), "username": str(owner_username or ""),
                              "post_date": str(post_date or ""), "post_link": str(post_link), "input_link": str(raw),
                              "resolved_link": str(post_url), "desc": str(caption or ""),
                              "Video Play Count": str(play_count or ""), "likes": str(likes or ""),
                              "comment_count": str(comment_count or ""), "hashtags_all": ", ".join(hashtags),
                              "video_duration_sec": str(video_duration_sec or ""), "scraped_at": scraped_at, "export_time": export_time})
        except Exception as e:
            errors.append(f"Error on {raw}: {str(e)}")
            continue

    if not rows:
        raise RuntimeError("No data scraped — check links, privacy, or rate limits.")

    xlsx = build_excel_general(rows)
    return {
        "mode": "general",
        "rows": rows,
        "columns": list(rows[0].keys()) if rows else [],
        "errors": errors,
        "count": len(rows),
        "file_base64": _b64(xlsx),
    }
