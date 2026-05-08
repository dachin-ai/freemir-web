import io
import re
import zipfile
from urllib.parse import urlparse

import pandas as pd
import requests
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from services.permission_guard import require_tool_access

router = APIRouter(prefix="/api/photo-downloader", tags=["photo-downloader"])

IMAGE_CT_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
    "image/svg+xml": ".svg",
}


class DirectDownloadBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=5, max_length=2000)


def _safe_filename(name: str, fallback: str = "image") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", (name or "").strip())
    cleaned = cleaned.strip("._")
    return cleaned[:120] or fallback


def _detect_extension(url: str, content_type: str | None) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in IMAGE_CT_TO_EXT:
        return IMAGE_CT_TO_EXT[ct]

    path = urlparse(url).path or ""
    lower = path.lower()
    for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg"):
        if lower.endswith(ext):
            return ".jpg" if ext == ".jpeg" else ext
    return ".png"


def _download_image_bytes(url: str, timeout_sec: int = 30) -> tuple[bytes, str]:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only http/https links are supported.")

    resp = requests.get(url, timeout=timeout_sec)
    if resp.status_code != 200:
        raise ValueError(f"Failed to download (status {resp.status_code}).")

    content = resp.content
    if not content:
        raise ValueError("Empty response body.")

    ext = _detect_extension(url, resp.headers.get("content-type"))
    return content, ext


@router.get("/template", dependencies=[Depends(require_tool_access("photo_downloader"))])
def download_template():
    df = pd.DataFrame(
        [
            {"name": "kucing", "url": "https://example.com/cat.png"},
            {"name": "anjing", "url": "https://example.com/dog.jpg"},
        ]
    )
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="photos")
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="photo_downloader_template.xlsx"'},
    )


@router.post("/direct", dependencies=[Depends(require_tool_access("photo_downloader"))])
def download_direct(body: DirectDownloadBody):
    try:
        img_bytes, ext = _download_image_bytes(body.url)
        filename = f"{_safe_filename(body.name)}{ext}"
        return Response(
            content=img_bytes,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/batch", dependencies=[Depends(require_tool_access("photo_downloader"))])
async def download_batch(file: UploadFile = File(...)):
    name = (file.filename or "").lower()
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        if name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(raw))
        elif name.endswith(".xlsx") or name.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(raw))
        else:
            raise HTTPException(status_code=400, detail="Only .xlsx, .xls, or .csv files are supported.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    if df.shape[1] < 2:
        raise HTTPException(status_code=400, detail="Template must have at least 2 columns: name and url.")

    rows = []
    for _, row in df.iterrows():
        raw_name = "" if pd.isna(row.iloc[0]) else str(row.iloc[0]).strip()
        raw_url = "" if pd.isna(row.iloc[1]) else str(row.iloc[1]).strip()
        if not raw_name or not raw_url:
            continue
        rows.append((raw_name, raw_url))

    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found. Fill column A (name) and B (url).")

    mem_zip = io.BytesIO()
    errors = []
    success = 0

    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        used_names = set()
        for idx, (photo_name, url) in enumerate(rows, start=1):
            try:
                img_bytes, ext = _download_image_bytes(url)
                base = _safe_filename(photo_name, fallback=f"image_{idx}")
                filename = f"{base}{ext}"
                suffix = 2
                while filename.lower() in used_names:
                    filename = f"{base}_{suffix}{ext}"
                    suffix += 1
                used_names.add(filename.lower())
                zf.writestr(filename, img_bytes)
                success += 1
            except Exception as e:
                errors.append(f"Row {idx} ({photo_name}): {e}")

        summary_lines = [
            "Photo Downloader batch result",
            f"Total rows: {len(rows)}",
            f"Success: {success}",
            f"Failed: {len(errors)}",
            "",
        ]
        if errors:
            summary_lines.append("Errors:")
            summary_lines.extend(errors)
        zf.writestr("download_report.txt", "\n".join(summary_lines))

    mem_zip.seek(0)
    return StreamingResponse(
        mem_zip,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="photo_downloader_results.zip"'},
    )
