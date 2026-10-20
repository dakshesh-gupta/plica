"""Scoped recall. Local keyword + topic matching always runs; Gemini semantic selection is added on top when
enabled (never sees sensitive memories). Recall only *proposes*: nothing is inserted until the user approves."""
import re

from . import gemini, vault
from .config import settings

STOP = set("""a an the and or but of to in on at for with about from by is am are was were be been i i'm im me my mine we
you your it its this that these those do does did can could should would will what which who how when where why please
some any give tell make want need like just also as if so than then them they he she his her""".split())

TOPICS = {
    "food": "dinner lunch breakfast meal meals recipe recipes cook cooking eat eating food restaurant snack snacks diet "
            "menu vegetarian vegan allergy allergic allergies halal kosher mushroom dislike dislikes spicy cuisine "
            "grocery groceries".split(),
    "travel": "trip travel flight hotel visit itinerary vacation holiday destination city country passport".split(),
    "study": "study exam exams learn learning course class homework revise revision syllabus college school "
             "university test preparing".split(),
    "fitness": "workout gym run running exercise fitness training weight yoga cardio".split(),
    "work": "project work job career meeting deadline client sprint code coding report team manager".split(),
    "shopping": "buy shopping gift budget product purchase price brand".split(),
    "style": "answer answers reply tone format short brief concise bullet steps example examples".split(),
}
_PERSONAL = re.compile(r"\b(i|i'm|i've|my|me|mine|myself|we|our)\b|\b(recommend\w*|suggest\w*|ideas?|plan\w*|"
                       r"schedule|should i|what should|dinner|lunch|recipes?|meals?|workout|itinerary|gift)\b", re.I)


def stem(t: str) -> str:
    return t[:5]


def tokens(text: str) -> set[str]:
    return {stem(w) for w in re.findall(r"[a-z][a-z'-]+", text.lower()) if w not in STOP and len(w) > 2}


def topics_of(text: str) -> set[str]:
    toks = tokens(text)
    return {name for name, words in TOPICS.items() if toks & {stem(w) for w in words}}


def is_personal_intent(prompt: str) -> bool:
    return bool(_PERSONAL.search(prompt))


def lexical_score(prompt: str, content: str) -> float:
    shared = tokens(prompt) & tokens(content)
    topic = (topics_of(prompt) & topics_of(content)) - {"style"}
    return len(shared) * 2.0 + len(topic) * 1.5


def _semantic(prompt: str, items: list[tuple[str, str]]) -> tuple[bool | None, set[str]]:
    """Ask Gemini which memory ids are relevant. Returns (personal_intent|None, ids)."""
    if not (settings.recall_semantic and gemini.available() and items):
        return None, set()
    listing = "\n".join(f"{i}: {text}" for i, (_, text) in enumerate(items))
    data = gemini.generate_json(
        f"User prompt:\n{prompt}\n\nStored memories about the user:\n{listing}\n\n"
        'Return JSON {"personal_intent": boolean, "relevant": [indices]}. "relevant" lists only memories that would '
        "genuinely change a good answer to the prompt. personal_intent is true when a personalised answer would be better.",
        system="You select which stored user memories are relevant to a prompt. Output JSON only.", max_tokens=300)
    if not isinstance(data, dict):
        return None, set()
    idx = {i for i in data.get("relevant", []) if isinstance(i, int) and 0 <= i < len(items)}
    return (bool(data["personal_intent"]) if "personal_intent" in data else None), {items[i][0] for i in idx}


def recall(user_id: str, prompt: str, scopes: list[str] | None, semantic: bool | None = None) -> dict:
    """Returns candidates (eligible + relevant), excluded (with reasons) and the personal-intent flag."""
    rows = vault.all_rows(user_id)
    personal = is_personal_intent(prompt)
    eligible, excluded, plain = [], [], []
    for r in rows:
        reason = vault.eligibility(r, scopes)
        if reason:
            entry = {"memory_id": r["id"], "commitment": r["commitment"], "scope": r["scope"], "reason": reason,
                     "relevant": False}
            if r["status"] == "active" and reason.startswith("out of scope"):
                try:  # relevance for the Coach's "scope mistake" signal; evaluated locally only
                    entry["relevant"] = lexical_score(prompt, vault.read_payload(r)["content"]) > 0
                except vault.VaultError:
                    pass
            excluded.append(entry)
            continue
        try:
            p = vault.read_payload(r)
        except vault.VaultError:
            continue
        eligible.append((r, p["content"]))
        if not r["sensitivity"]:
            plain.append((r["id"], p["content"]))

    sem_ids: set[str] = set()
    used_semantic = False
    if semantic is not False and (semantic or settings.recall_semantic):
        sem_personal, sem_ids = _semantic(prompt, plain)
        used_semantic = sem_personal is not None or bool(sem_ids)
        if sem_personal is not None:
            personal = personal or sem_personal

    candidates = []
    for r, content in eligible:
        score = lexical_score(prompt, content)
        via = "keyword" if score > 0 else None
        if r["id"] in sem_ids:
            score += 3.0
            via = "semantic" if via is None else "keyword+semantic"
        if r["is_style"] and personal and score == 0:
            score, via = 0.5, "style"
        if score > 0:
            candidates.append({"memory_id": r["id"], "commitment": r["commitment"], "content": content,
                               "scope": r["scope"], "score": round(score, 2), "matched_by": via,
                               "sensitivity": r["sensitivity"]})
    candidates.sort(key=lambda c: -c["score"])
    return {"personal_intent": personal, "candidates": candidates, "excluded": excluded,
            "mode": "hybrid" if used_semantic else "local"}
