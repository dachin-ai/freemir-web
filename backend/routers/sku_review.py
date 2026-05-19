from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Body, Depends
from fastapi.responses import JSONResponse
import base64
import hashlib
import json
import traceback
import math
import time
from collections import OrderedDict
from typing import Any, Dict, Optional, Tuple
import pandas as pd

from services.sku_review_logic import (
    process_sku_review,
    export_sku_review_excel,
    resolve_sku_photos,
)
from services.sku_review_ai import generate_sku_review_ai_summary
from services.permission_guard import require_tool_access


# ---------------------------------------------------------------------------
# In-memory LRU cache: MD5(file_bytes) → (expanded_df, summaries, ts)
# Avoids re-running process_sku_review on every /export call.
# ---------------------------------------------------------------------------
_CACHE_MAX = 5
_CACHE_TTL = 1800  # 30 minutes

class _AnalysisCache:
    def __init__(self, maxsize: int = _CACHE_MAX, ttl: int = _CACHE_TTL):
        self._store: OrderedDict[str, Tuple] = OrderedDict()
        self._maxsize = maxsize
        self._ttl = ttl

    def _key(self, content: bytes) -> str:
        return hashlib.md5(content).hexdigest()

    def get(self, content: bytes):
        k = self._key(content)
        entry = self._store.get(k)
        if not entry:
            return None, None
        df, summ, ts = entry
        if time.time() - ts > self._ttl:
            del self._store[k]
            return None, None
        self._store.move_to_end(k)
        return df, summ

    def put(self, content: bytes, df, summ):
        k = self._key(content)
        self._store[k] = (df, summ, time.time())
        self._store.move_to_end(k)
        while len(self._store) > self._maxsize:
            self._store.popitem(last=False)


_analysis_cache = _AnalysisCache()


def _sanitize(obj):
    """Recursively replace NaN/Inf so JSONResponse never fails."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return 0
    return obj


router = APIRouter(prefix="/api/sku-review", tags=["SKU Review Analysis"])


def _summaries_payload(summaries: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "stats": summaries.get("stats", {}),
        "top_issues": summaries.get("top_issues", []),
        "top_parts": summaries.get("top_parts", []),
        "sku_matrix": summaries.get("sku_matrix", {}),
        "store_matrix": summaries.get("store_matrix", {}),
        "business_types": summaries.get("business_types", []),
        "after_sales_types": summaries.get("after_sales_types", []),
        "sentiment_by_mention": summaries.get("sentiment_by_mention", {"parts": [], "issues": []}),
    }


def _form_bool(value: str) -> bool:
    return str(value or "").strip().lower() in ("true", "1", "yes", "on")


def _load_analysis(content: bytes, filename: str):
    expanded_df, summaries = _analysis_cache.get(content)
    if expanded_df is None:
        expanded_df, summaries, _col_map = process_sku_review(content, filename)
        _analysis_cache.put(content, expanded_df, summaries)
    return expanded_df, summaries


def _excel_b64(
    expanded_df,
    summaries,
    *,
    include_photos: bool = False,
    ai_insights: Optional[Dict[str, Any]] = None,
) -> str:
    photo_by_sku: dict = {}
    if include_photos:
        skus = [r.get("sku") for r in summaries.get("sku_matrix", {}).get("rows", [])]
        photo_by_sku = resolve_sku_photos(skus)
    excel_bytes = export_sku_review_excel(
        expanded_df,
        summaries,
        include_photos=include_photos,
        photo_by_sku=photo_by_sku,
        ai_insights=ai_insights,
    )
    return base64.b64encode(excel_bytes).decode("utf-8")


@router.post("/analyze", dependencies=[Depends(require_tool_access("sku_review"))])
async def analyze_sku_review(
    file: UploadFile = File(...),
    include_photos: str = Form("false"),
):
    """Analyze + Excel (optional SKU photos — same pattern as Price Checker batch)."""
    try:
        content = await file.read()
        filename = file.filename or "upload.xlsx"
        with_photos = _form_bool(include_photos)

        expanded_df, summaries = _load_analysis(content, filename)
        b64_str = _excel_b64(expanded_df, summaries, include_photos=with_photos)
        preview = expanded_df.head(20).fillna("").to_dict(orient="records")

        payload = {
            **_summaries_payload(summaries),
            "preview": preview,
            "file_base64": b64_str,
            "include_photos": with_photos,
        }
        return JSONResponse(_sanitize(payload))
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/ai-summary", dependencies=[Depends(require_tool_access("sku_review"))])
async def sku_review_ai_summary(
    body: Dict[str, Any] = Body(...),
):
    """Generate executive summary & recommendations via SumoPod (gpt-4o-mini)."""
    try:
        summaries = body.get("summaries") or body
        locale = str(body.get("locale") or "id")[:2].lower()
        if locale not in ("id", "en", "zh"):
            locale = "id"
        ai = generate_sku_review_ai_summary(summaries, locale=locale)
        return JSONResponse(_sanitize(ai))
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except RuntimeError as run_err:
        raise HTTPException(status_code=503, detail=str(run_err))
    except Exception as e:
        print(traceback.format_exc())
        from services.sku_review_ai import _friendly_ai_error
        raise HTTPException(status_code=500, detail=_friendly_ai_error(e))


@router.post("/export", dependencies=[Depends(require_tool_access("sku_review"))])
async def export_sku_review(
    file: UploadFile = File(...),
    include_photos: str = Form("false"),
    ai_summary_json: str = Form(""),
):
    """Regenerate Excel — optional SKU photos and AI insights sheet."""
    try:
        content = await file.read()
        filename = file.filename or "upload.xlsx"
        with_photos = _form_bool(include_photos)

        expanded_df, summaries = _load_analysis(content, filename)

        ai_insights: Optional[Dict[str, Any]] = None
        if ai_summary_json and ai_summary_json.strip():
            try:
                ai_insights = json.loads(ai_summary_json)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid ai_summary_json")

        b64_str = _excel_b64(
            expanded_df,
            summaries,
            include_photos=with_photos,
            ai_insights=ai_insights,
        )
        return JSONResponse({"file_base64": b64_str, "include_photos": with_photos})
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except HTTPException:
        raise
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
