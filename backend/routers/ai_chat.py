import os
import re
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from openai import OpenAI
from routers.price_checker import get_db, calculate_prices
from services.auth_logic import verify_token

router = APIRouter(prefix="/api/chat", tags=["ai-chat"])

ROOT_DIR = Path(__file__).resolve().parents[2]
CONTEXT_DIR = ROOT_DIR / "context"
MAX_CONTEXT_CHARS = 7000

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto").lower()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://ai.sumopod.com/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

openai_client = None
if OPENAI_API_KEY:
    openai_client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z0-9_/-]+", text.lower()))


def _load_knowledge_docs():
    docs = []
    if not CONTEXT_DIR.exists():
        return docs
    for md_file in sorted(CONTEXT_DIR.glob("*.md")):
        try:
            content = md_file.read_text(encoding="utf-8", errors="replace").strip()
            if not content:
                continue
            docs.append({"name": md_file.name, "content": content, "tokens": _tokenize(content)})
        except Exception as e:
            print(f"[AI Chat] Warning: failed to read {md_file.name}: {e}")
    return docs


KNOWLEDGE_DOCS = _load_knowledge_docs()


def _retrieve_context(query: str, top_k: int = 4) -> tuple[str, list[str]]:
    if not KNOWLEDGE_DOCS:
        return "", []
    q_tokens = _tokenize(query)
    if not q_tokens:
        return "", []

    scored = []
    for doc in KNOWLEDGE_DOCS:
        overlap = len(q_tokens.intersection(doc["tokens"]))
        if overlap > 0:
            scored.append((overlap, doc))
    scored.sort(key=lambda x: x[0], reverse=True)
    selected = [doc for _, doc in scored[:top_k]]

    context_parts = []
    sources = []
    total_chars = 0
    for doc in selected:
        chunk = f"[Source: {doc['name']}]\n{doc['content']}\n"
        if total_chars + len(chunk) > MAX_CONTEXT_CHARS:
            remaining = MAX_CONTEXT_CHARS - total_chars
            if remaining > 200:
                context_parts.append(chunk[:remaining])
                sources.append(doc["name"])
            break
        context_parts.append(chunk)
        sources.append(doc["name"])
        total_chars += len(chunk)

    return "\n---\n".join(context_parts), sources


def _extract_sku_candidate(text: str) -> str | None:
    candidates = re.findall(r"\b[A-Za-z0-9]{6,}\b", text or "")
    if not candidates:
        return None
    for c in candidates:
        if any(ch.isdigit() for ch in c) and any(ch.isalpha() for ch in c):
            return c
    return candidates[0]


def _extract_bundle_skus(text: str) -> list[str]:
    candidates = re.findall(r"\b[A-Za-z0-9]{6,}\b", text or "")
    skus = []
    for c in candidates:
        if any(ch.isdigit() for ch in c) and any(ch.isalpha() for ch in c):
            skus.append(c)
    # Preserve order while removing duplicates.
    seen = set()
    ordered = []
    for sku in skus:
        if sku not in seen:
            ordered.append(sku)
            seen.add(sku)
    return ordered


def _is_price_intent(text: str) -> bool:
    q = (text or "").lower()
    return any(k in q for k in ["price", "harga", "sku", "margin", "safe", "bundle", "direct input"])


def _intent_type(text: str) -> str:
    q = (text or "").lower()
    if any(k in q for k in ["stok", "stock", "available", "ready", "lock", "otw"]):
        return "stock"
    if any(k in q for k in ["margin", "aman", "safe", "warning"]):
        return "margin"
    if any(k in q for k in ["bundle"]):
        return "bundle_price"
    return "price"


def _to_num(val):
    if isinstance(val, (int, float)):
        return float(val)
    return None


def _format_num(n: float) -> str:
    return f"{int(round(n)):,}".replace(",", ".")


def _pick_price_fields(result: dict, intent: str) -> list[str]:
    if intent == "stock":
        return ["IDR-Ready", "SBY-Ready", "IDR-Lock", "SBY-Lock", "IDR-OTW", "SBY-OTW", "Available Stock"]
    if intent == "margin":
        return ["Warning", "Daily-Discount", "Daily-Livestream", "Daily-FS", "Available Stock"]
    # price / bundle_price
    return ["Warning", "Daily-Discount", "Daily-Livestream", "Daily-FS"]


def _format_direct_price_result(title: str, result: dict, intent: str = "price") -> str:
    fields = _pick_price_fields(result, intent)
    lines = []
    for field in fields:
        if field not in result:
            continue
        v = result.get(field)
        n = _to_num(v)
        if n is not None:
            lines.append(f"- __{field}__: {_format_num(n)}")
        elif isinstance(v, str) and v not in ("", "None", "Invalid"):
            lines.append(f"- __{field}__: {v}")

    # If key fields are missing, provide minimal fallback.
    if not lines:
        warning_val = result.get("Warning")
        warning_num = _to_num(warning_val)
        if warning_num is not None:
            lines.append(f"- __Warning__: {_format_num(warning_num)}")
        else:
            lines.append("- Data harga tidak tersedia.")

    return "\n".join([title, *lines])


def _direct_price_answer(user_prompt: str) -> str | None:
    if not _is_price_intent(user_prompt):
        return None

    skus = _extract_bundle_skus(user_prompt)
    intent = _intent_type(user_prompt)
    if not skus:
        return (
            "Untuk cek sesuai sistem __Direct Input__, kirim SKU yang jelas.\n"
            "Contoh: `FR0208A47801` atau `SKU_A + SKU_B`."
        )

    price_db, name_map, link_map = get_db()
    if not price_db:
        return "Database price checker belum termuat. Coba klik sync/refresh di tool __Price Checker__."

    try:
        if len(skus) >= 2:
            bundle_expr = " + ".join(skus)
            bundle_result = calculate_prices(bundle_expr, price_db, name_map, link_map)
            parts = [
                f"Perhitungan __Direct Input Bundle__ untuk: {bundle_expr}",
                _format_direct_price_result("Bundle summary:", bundle_result, intent=intent),
            ]
            # Keep output concise: include per-item detail only for stock/margin intent.
            if intent in ("stock", "margin"):
                for sku in skus:
                    item_result = calculate_prices(sku, price_db, name_map, link_map)
                    parts.append(_format_direct_price_result(f"Item {sku}:", item_result, intent=intent))
            return "\n\n".join(parts)

        sku = skus[0]
        result = calculate_prices(sku, price_db, name_map, link_map)
        return _format_direct_price_result(f"Perhitungan __Direct Input__ untuk {sku}:", result, intent=intent)
    except Exception as e:
        return f"Gagal hitung via Direct Input backend: {e}"


def _fallback_answer(user_prompt: str, sources: list[str]) -> str:
    text = (user_prompt or "").lower()
    if any(k in text for k in ["price", "harga", "sku", "margin", "safe"]):
        body = (
            "Untuk kebutuhan cek harga/margin, buka tool **Price Checker**.\n"
            "Langkah cepat:\n"
            "1) Pilih **Direct Input**.\n"
            "2) SKU bisa dipisah dengan `+`, koma, atau spasi.\n"
            "3) Isi target price/stock lalu klik hitung.\n"
            "4) Bandingkan tier, terutama `Warning` sebagai acuan dasar aman.\n"
        )
    else:
        body = "Saya bisa bantu pilih tool BI yang tepat dan jelaskan langkah pakainya."
    if sources:
        body += f"\n\nRujukan internal: {', '.join(sources[:4])}"
    body += "\n\nCatatan: mode AI generatif sedang fallback karena provider LLM belum valid."
    return body


def _get_optional_user(request: Request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    payload = verify_token(token)
    if not payload:
        return None
    return payload


def _build_system_prompt() -> str:
    return (
        "You are freemir AI, assistant for Freemir BI tools. "
        "Give practical, concise steps. "
        "Do not invent numbers. For SKU price answer, rely on provided price payload if present. "
        "When using provided context, mention source filenames briefly. "
        "Do not use markdown bold (**text**). Use __text__ markers for highlights."
    )


class ChatMessage(BaseModel):
    role: str
    text: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


def _llm_answer_openai(user_prompt: str, context_text: str, price_payload: str) -> str:
    if not openai_client:
        raise RuntimeError("OPENAI client not configured.")

    user_content = user_prompt
    if context_text:
        user_content += f"\n\nInternal knowledge context:\n{context_text}"
    if price_payload:
        user_content += f"\n\nLive price payload:\n{price_payload}"

    completion = openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": _build_system_prompt()},
            {"role": "user", "content": user_content},
        ],
        temperature=0.4,
        max_tokens=700,
    )
    return (completion.choices[0].message.content or "").strip()


@router.post("/ask")
async def ask_assistant(request: ChatRequest, http_request: Request):
    try:
        _ = _get_optional_user(http_request)
        user_prompt = next((msg.text for msg in reversed(request.messages) if msg.role == "user"), None)
        if not user_prompt:
            raise HTTPException(status_code=400, detail="No user message found")

        # Deterministic path for price/SKU questions, matching Direct Input backend logic.
        direct_answer = _direct_price_answer(user_prompt)
        if direct_answer is not None:
            return {"response": direct_answer, "sources": ["price_checker_logic"], "mode": "tool"}

        context_text, sources = _retrieve_context(user_prompt)

        # Optional live SKU price payload from local logic
        price_payload = ""
        sku = _extract_sku_candidate(user_prompt)
        skus = _extract_bundle_skus(user_prompt)
        is_price_question = any(k in user_prompt.lower() for k in ["price", "harga", "sku", "margin", "safe", "bundle"])
        if is_price_question and (sku or skus):
            price_db, name_map, link_map = get_db()
            if price_db:
                try:
                    if len(skus) >= 2:
                        bundle_expr = " + ".join(skus)
                        bundle_result = calculate_prices(bundle_expr, price_db, name_map, link_map)
                        single_results = {s: calculate_prices(s, price_db, name_map, link_map) for s in skus}
                        price_payload = str({
                            "bundle_input": bundle_expr,
                            "bundle_result": bundle_result,
                            "items": single_results,
                        })
                    else:
                        price_payload = str({"sku": sku, "result": calculate_prices(sku, price_db, name_map, link_map)})
                except Exception as e:
                    price_payload = str({"sku_or_bundle": skus if skus else sku, "error": str(e)})

        try:
            if LLM_PROVIDER in ("auto", "sumopod", "openai") and OPENAI_API_KEY:
                text = _llm_answer_openai(user_prompt, context_text, price_payload)
                return {"response": text, "sources": sources, "mode": "llm"}
            raise RuntimeError("No valid LLM provider configured.")
        except Exception:
            return {"response": _fallback_answer(user_prompt, sources), "sources": sources, "mode": "fallback"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[AI Chat Error] {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
