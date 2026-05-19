"""
SKU Review — executive summary via SumoPod (OpenAI-compatible API).
"""
from __future__ import annotations

import json
import os
import pathlib
import re
from typing import Any, Dict

_BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv

    load_dotenv(_BACKEND_DIR / ".env")
except ImportError:
    pass

_DEFAULT_BASE_URL = "https://ai.sumopod.com/v1"
_DEFAULT_MODEL = "gpt-4o-mini"

_LOCALE_INSTRUCTIONS = {
    "id": "Tulis semua teks dalam Bahasa Indonesia yang jelas dan profesional.",
    "en": "Write all text in clear, professional English.",
    "zh": "请用简洁专业的中文撰写所有内容。",
}


def _openai_config() -> tuple[str, str, str]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    base_url = (os.getenv("OPENAI_BASE_URL", _DEFAULT_BASE_URL) or _DEFAULT_BASE_URL).strip().rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"
    model_name = (os.getenv("OPENAI_MODEL", _DEFAULT_MODEL) or _DEFAULT_MODEL).strip()
    return api_key, base_url, model_name


def _issue_label(key: str) -> str:
    return (key or "").replace("_", " ").title()


def build_analysis_context(summaries: Dict[str, Any], *, max_skus: int = 15, max_stores: int = 10) -> str:
    """Compact JSON for LLM — no raw complaint text."""
    sku_rows = summaries.get("sku_matrix", {}).get("rows", []) or []
    store_rows = summaries.get("store_matrix", {}).get("rows", []) or []

    def _slim_sku(row: Dict[str, Any]) -> Dict[str, Any]:
        highlights = row.get("highlight_issues") or []
        return {
            "sku": row.get("sku"),
            "orders": row.get("orders"),
            "mentions": row.get("mentions"),
            "top_issues": [_issue_label(k) for k in highlights],
        }

    def _slim_store(row: Dict[str, Any]) -> Dict[str, Any]:
        highlights = row.get("highlight_issues") or []
        return {
            "store": row.get("store"),
            "total_orders": row.get("total_orders"),
            "problem_orders": row.get("problem_orders"),
            "problem_pct": row.get("problem_pct"),
            "top_issues": [_issue_label(k) for k in highlights],
        }

    payload = {
        "stats": summaries.get("stats", {}),
        "top_issues": summaries.get("top_issues", [])[:12],
        "top_parts": summaries.get("top_parts", [])[:12],
        "business_types": summaries.get("business_types", []),
        "after_sales_types": summaries.get("after_sales_types", []),
        "top_skus_by_volume": [_slim_sku(r) for r in sku_rows[:max_skus]],
        "top_stores_by_problems": [_slim_store(r) for r in store_rows[:max_stores]],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _friendly_ai_error(exc: Exception) -> str:
    msg = str(exc).lower()
    if "429" in msg or "quota" in msg or "rate limit" in msg:
        return "Kuota SumoPod habis. Coba lagi nanti atau hubungi admin SumoPod."
    if "401" in msg or "authentication" in msg or "token_not_found" in msg:
        return "API key SumoPod tidak valid. Perbarui OPENAI_API_KEY di backend/.env."
    if "404" in msg and "model" in msg:
        return "Model tidak ditemukan. Periksa OPENAI_MODEL di backend/.env (mis. gpt-4o-mini)."
    return f"Gagal memanggil AI: {exc}"


def _build_prompts(summaries: Dict[str, Any], locale: str) -> tuple[str, str]:
    lang = _LOCALE_INSTRUCTIONS.get(locale, _LOCALE_INSTRUCTIONS["id"])
    context = build_analysis_context(summaries)
    system = (
        "You are a quality & after-sales analyst for e-commerce SKU complaints. "
        "You only use the JSON data provided — never invent counts, SKUs, or percentages. "
        "If data is insufficient, say so briefly. "
        f"{lang} "
        "Respond with valid JSON only, no markdown, using this schema:\n"
        "{\n"
        '  "executive_summary": "2-4 short paragraphs as one string",\n'
        '  "key_findings": ["bullet 1", "bullet 2", ...],\n'
        '  "recommendations": ["action 1", "action 2", ...],\n'
        '  "priority_skus": ["SKU1", "SKU2"],\n'
        '  "priority_stores": ["store1", "store2"]\n'
        "}"
    )
    user = (
        "Analyze this SKU review / bad-review dataset summary and give operational insights.\n"
        "Focus on: dominant issues, parts, business types, which SKUs/stores need attention first.\n"
        "Recommendations must be practical (QC, packaging, listing accuracy, customer service).\n\n"
        f"DATA:\n{context}"
    )
    return system, user


def _format_ai_result(parsed: Dict[str, Any], model_name: str) -> Dict[str, Any]:
    return {
        "executive_summary": str(parsed.get("executive_summary", "")).strip(),
        "key_findings": [str(x).strip() for x in (parsed.get("key_findings") or []) if str(x).strip()],
        "recommendations": [
            str(x).strip() for x in (parsed.get("recommendations") or []) if str(x).strip()
        ],
        "priority_skus": [str(x).strip() for x in (parsed.get("priority_skus") or []) if str(x).strip()],
        "priority_stores": [
            str(x).strip() for x in (parsed.get("priority_stores") or []) if str(x).strip()
        ],
        "model": model_name,
        "disclaimer": "Generated by AI (SumoPod) from aggregated metrics only. Verify against raw data.",
    }


def _parse_json_response(text: str) -> Dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        raise ValueError("Empty model response")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            return json.loads(match.group(0))
        raise


def _call_sumopod(system: str, user: str, api_key: str, base_url: str, model_name: str) -> Dict[str, Any]:
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=base_url)
    completion = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.35,
        max_tokens=900,
        response_format={"type": "json_object"},
    )
    text = (completion.choices[0].message.content or "").strip()
    parsed = _parse_json_response(text)
    return _format_ai_result(parsed, f"{model_name} (SumoPod)")


def generate_sku_review_ai_summary(
    summaries: Dict[str, Any],
    *,
    locale: str = "id",
) -> Dict[str, Any]:
    """
    Call SumoPod (OpenAI-compatible) for executive summary, findings, and recommendations.
    """
    api_key, base_url, model_name = _openai_config()
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not configured on the server (SumoPod).")

    system, user = _build_prompts(summaries, locale)
    try:
        return _call_sumopod(system, user, api_key, base_url, model_name)
    except Exception as exc:
        raise RuntimeError(_friendly_ai_error(exc)) from exc
