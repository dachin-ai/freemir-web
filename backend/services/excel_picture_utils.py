"""
Framed JPEG thumbnails for Excel embeds — shared by Price Checker & SKU Review.
"""
from __future__ import annotations

import io
from typing import Dict, Optional
from urllib.parse import unquote

import requests
from PIL import Image, ImageOps, UnidentifiedImageError

from services.brand_material_logic import GCS_BUCKET, download_gcs_object_bytes

# Match Price Checker Listing export cell / frame size
FRAME_W_PX = 56
FRAME_H_PX = 56
IMAGE_CELL_W_PX = 68
IMAGE_CELL_H_PX = 64
JPEG_QUALITY = 88


def make_framed_thumbnail(
    raw_bytes: bytes,
    frame_w_px: int = FRAME_W_PX,
    frame_h_px: int = FRAME_H_PX,
    quality: int = JPEG_QUALITY,
) -> Optional[bytes]:
    """Fit image into a small bordered frame and return JPEG bytes."""
    try:
        with Image.open(io.BytesIO(raw_bytes)) as img:
            img = img.convert("RGB")
            inner_w = frame_w_px - 8
            inner_h = frame_h_px - 8
            fitted = ImageOps.contain(img, (inner_w, inner_h), method=Image.Resampling.LANCZOS)

            canvas = Image.new("RGB", (frame_w_px, frame_h_px), color=(245, 248, 252))
            x = (frame_w_px - fitted.width) // 2
            y = (frame_h_px - fitted.height) // 2
            canvas.paste(fitted, (x, y))

            border_color = (180, 188, 200)
            canvas.paste(border_color, [0, 0, frame_w_px, 1])
            canvas.paste(border_color, [0, frame_h_px - 1, frame_w_px, frame_h_px])
            canvas.paste(border_color, [0, 0, 1, frame_h_px])
            canvas.paste(border_color, [frame_w_px - 1, 0, frame_w_px, frame_h_px])

            out = io.BytesIO()
            canvas.save(out, format="JPEG", quality=quality, optimize=True)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, ValueError):
        return None


def fetch_framed_image_bytes(
    url: str = "",
    cache: Optional[Dict[str, Optional[bytes]]] = None,
    *,
    gcs_object_path: str = "",
    timeout: int = 3,
) -> Optional[bytes]:
    """
    Download image (GCS path preferred — usually small preview), cache framed JPEG.
    """
    from services.price_checker_logic import _is_image_url

    cache = cache if cache is not None else {}
    cache_key = (gcs_object_path or url or "").strip()
    if not cache_key:
        return None
    if cache_key in cache:
        return cache[cache_key]

    raw: Optional[bytes] = None
    if gcs_object_path:
        raw = download_gcs_object_bytes(gcs_object_path)

    if raw is None and url:
        if _is_image_url(url):
            try:
                resp = requests.get(url, timeout=timeout)
                if resp.status_code == 200 and resp.content:
                    raw = resp.content
            except Exception:
                raw = None
        prefix = f"https://storage.googleapis.com/{GCS_BUCKET}/"
        if raw is None and url.startswith(prefix):
            raw = download_gcs_object_bytes(unquote(url[len(prefix):]))

    if raw:
        cache[cache_key] = make_framed_thumbnail(raw)
    else:
        cache[cache_key] = None
    return cache[cache_key]
