"""Thin Gemini REST client built for the free tier: client-side RPM throttle, 429/503 backoff,
JSON mode, and a clearly-labelled stub fallback so demos never break."""
import json
import re
import threading
import time
from collections import deque

from .config import settings

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
STUB_LABEL = "Demo model, not a real AI provider"


class GeminiError(Exception):
    pass


class _Throttle:
    def __init__(self) -> None:
        self.stamps: deque[float] = deque()
        self.lock = threading.Lock()

    def wait(self, rpm: int, max_wait: float = 20.0) -> None:
        start = time.time()
        while True:
            with self.lock:
                now = time.time()
                while self.stamps and now - self.stamps[0] > 60:
                    self.stamps.popleft()
                if len(self.stamps) < max(1, rpm):
                    self.stamps.append(now)
                    return
                sleep_for = 60 - (now - self.stamps[0]) + 0.05
            if time.time() - start + sleep_for > max_wait:
                raise GeminiError("Local rate limit reached (free-tier protection). Try again shortly.")
            time.sleep(min(sleep_for, 2.0))


_throttle = _Throttle()


def available() -> bool:
    return bool(settings.gemini_api_key)


def model_label() -> str:
    return settings.gemini_model if available() else STUB_LABEL


def generate(prompt: str, system: str | None = None, history: list[dict] | None = None,
             json_mode: bool = False, temperature: float = 0.7, max_tokens: int = 1024) -> str:
    if not available():
        raise GeminiError("GEMINI_API_KEY is not set")
    import httpx

    contents = []
    for h in (history or [])[-10:]:
        role = "model" if h.get("role") in ("model", "assistant") else "user"
        contents.append({"role": role, "parts": [{"text": str(h.get("text", ""))[:4000]}]})
    contents.append({"role": "user", "parts": [{"text": prompt}]})
    gen_cfg: dict = {"temperature": temperature, "maxOutputTokens": max_tokens}
    if json_mode:
        gen_cfg["responseMimeType"] = "application/json"
    if settings.gemini_model.startswith("gemini-2.5-flash"):
        gen_cfg["thinkingConfig"] = {"thinkingBudget": 0}  # faster, fewer tokens against the free quota
    body: dict = {"contents": contents, "generationConfig": gen_cfg}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    url = API.format(model=settings.gemini_model)
    headers = {"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"}
    last = "unknown error"
    for attempt in range(3):
        _throttle.wait(settings.gemini_rpm)
        try:
            r = httpx.post(url, headers=headers, json=body, timeout=settings.gemini_timeout)
        except httpx.HTTPError as e:
            last = f"network error: {e}"
            time.sleep(1.5 * (attempt + 1))
            continue
        if r.status_code == 200:
            return _extract(r.json())
        if r.status_code in (429, 500, 503):
            last = f"HTTP {r.status_code}"
            delay = 2.0 * (attempt + 1)
            m = re.search(r'"retryDelay":\s*"(\d+)', r.text)
            if m:
                delay = min(float(m.group(1)), 15.0)
            if r.status_code == 429 and attempt == 2:
                break
            time.sleep(delay)
            continue
        raise GeminiError(f"Gemini HTTP {r.status_code}: {r.text[:300]}")
    raise GeminiError(f"Gemini unavailable after retries ({last}). Free-tier quota may be exhausted.")


def _extract(data: dict) -> str:
    fb = data.get("promptFeedback", {})
    if fb.get("blockReason"):
        raise GeminiError(f"Prompt blocked by Gemini: {fb['blockReason']}")
    cands = data.get("candidates") or []
    if not cands:
        raise GeminiError("Gemini returned no candidates")
    parts = (cands[0].get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise GeminiError(f"Gemini returned empty text (finishReason={cands[0].get('finishReason')})")
    return text


def generate_json(prompt: str, system: str | None = None, max_tokens: int = 800):
    """Returns parsed JSON or None on any failure (callers always have a heuristic fallback)."""
    try:
        text = generate(prompt, system=system, json_mode=True, temperature=0.1, max_tokens=max_tokens)
        text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
        return json.loads(text)
    except Exception:
        return None


def answer(prompt: str, system: str, history: list[dict] | None = None) -> tuple[str, str]:
    """Returns (answer_text, model_label). Falls back to a labelled stub when allowed."""
    if available():
        try:
            return generate(prompt, system=system, history=history), settings.gemini_model
        except GeminiError:
            if not settings.gemini_fallback_stub:
                raise
    elif not settings.gemini_fallback_stub:
        raise GeminiError("GEMINI_API_KEY is not set and stub fallback is disabled")
    return stub_answer(prompt), STUB_LABEL


def stub_answer(prompt: str) -> str:
    low = prompt.lower()
    ctx = ""
    if "vegetarian" in low:
        ctx = " Since you are vegetarian: a chickpea and spinach curry with rice is a good start."
    if any(w in low for w in ("dinner", "meal", "lunch", "recipe")):
        return "Here are a few dinner ideas: a vegetable stir-fry, a lentil soup, or a pasta with roasted vegetables." + ctx
    return "This is a canned reply from the demo model." + ctx
