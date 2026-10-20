"""Personalization Coach: score + suggestion cards. Local by default; Gemini only on ?deep=true.
Rules: never nudges toward health/finance topics, never shames, dismissed suggestions stay dismissed."""
import hashlib
import json
import re
import time

from . import gemini, vault
from .config import settings
from .db import db
from .recall import STOP, topics_of

DAY = 86400
DEFAULT_WINDOW_DAYS = 180
WEIGHTS = {"hit_rate": 0.40, "specificity": 0.25, "freshness": 0.20, "consistency": 0.15}
GENERIC = set("food music movies movie books book sports games game travel stuff things tech coding cooking fitness art "
              "likes like loves love enjoys enjoy interested into".split())
SENSITIVE_RE = vault._HEALTH, vault._FINANCE
TOPIC_COPY = {
    "food": ("meal ideas", "You asked for meal or food ideas {n} time(s) and no diet preference was used. Add one?",
             "Add your allergies or foods you dislike for better meal ideas.", True),
    "travel": ("travel plans", "You asked about travel {n} time(s) with no travel preference used. Add one?",
               "Add how you like to travel: budget, pace, interests.", False),
    "study": ("study help", "You asked for study help {n} time(s) with no study preference used. Add one?",
              "Add what you study and how you learn best.", False),
    "fitness": ("fitness", "You asked about workouts {n} time(s) with no fitness preference used. Add one?",
                "Add your equipment, goals or time available.", False),
    "shopping": ("shopping", "You asked for shopping advice {n} time(s) with no preference used. Add one?",
                 "Add brands, budget style or things you avoid.", False),
}
_FACT = re.compile(r"\b(lives? in|based in|works? at|works? as|studies at|studying at)\s+([A-Za-z][\w .-]{1,40})", re.I)


def sid(kind: str, key: str) -> str:
    return hashlib.sha1(f"{kind}|{key}".encode()).hexdigest()[:12]


def is_vague(text: str) -> bool:
    toks = [w for w in re.findall(r"[a-z']+", text.lower()) if w not in STOP]
    return len(toks) == 0 or all(t in GENERIC for t in toks)


def _conflicts_local(items: list[dict]) -> list[tuple[dict, dict, str]]:
    out = []
    facts: dict[str, list[tuple[dict, str]]] = {}
    for it in items:
        for m in _FACT.finditer(it["content"]):
            facts.setdefault(re.sub(r"s? ", " ", m.group(1).lower()).strip(), []).append((it, m.group(2).strip().lower()))
    for pred, lst in facts.items():
        for i in range(len(lst)):
            for j in range(i + 1, len(lst)):
                if lst[i][1] != lst[j][1] and lst[i][0]["id"] != lst[j][0]["id"]:
                    out.append((lst[i][0], lst[j][0], pred))
    low = {it["id"]: it["content"].lower() for it in items}
    veg = [i for i in items if re.search(r"\b(vegetarian|vegan)\b", low[i["id"]]) and "non" not in low[i["id"]]]
    meat = [i for i in items if re.search(r"\b(non[- ]?veg\w*|eats? meat|love[s]? (steak|chicken|bacon))\b", low[i["id"]])]
    for a in veg:
        for b in meat:
            out.append((a, b, "diet"))
    return out


def _deep(items: list[dict]) -> tuple[set[str], list[tuple[str, str]]]:
    """Gemini pass: returns (vague ids, conflicting id pairs). Silent fallback to nothing."""
    if not (settings.coach_deep and gemini.available() and items):
        return set(), []
    listing = "\n".join(f"{i['id']}: {i['content']}" for i in items if not i["sensitivity"])
    data = gemini.generate_json(
        f"Memories:\n{listing}\n\nReturn JSON {{\"vague\": [ids too general to help an assistant], "
        f"\"conflicts\": [[idA, idB] for pairs that contradict each other]}}. Use only ids shown.",
        system="You audit a personal memory list. Output JSON only.", max_tokens=400)
    if not isinstance(data, dict):
        return set(), []
    ids = {i["id"] for i in items}
    vague = {v for v in data.get("vague", []) if v in ids}
    conf = [(a, b) for a, b in (p for p in data.get("conflicts", []) if isinstance(p, list) and len(p) == 2)
            if a in ids and b in ids and a != b]
    return vague, conf


def analyze(user_id: str, deep: bool = False) -> dict:
    now = time.time()
    rows = [r for r in vault.all_rows(user_id) if r["status"] == "active"]
    items = []
    for r in rows:
        try:
            items.append({**vault.public(r), "content": vault.read_payload(r)["content"]})
        except vault.VaultError:
            pass
    with db() as c:
        runs = c.execute("SELECT id, prompt, personal_intent, used_ids, created_at FROM runs WHERE user_id=? "
                         "ORDER BY created_at", (user_id,)).fetchall()
        dismissed = {r["key"] for r in c.execute("SELECT key FROM dismissals WHERE user_id=?", (user_id,))}

    personal_runs = [r for r in runs if r["personal_intent"]]
    hits = [r for r in personal_runs if json.loads(r["used_ids"])]
    vague_ids = {i["id"] for i in items if is_vague(i["content"])}
    conflicts = [(a, b, p) for a, b, p in _conflicts_local(items)]
    if deep:
        dv, dc = _deep(items)
        vague_ids |= dv
        by_id = {i["id"]: i for i in items}
        for a, b in dc:
            if not any({x[0]["id"], x[1]["id"]} == {a, b} for x in conflicts):
                conflicts.append((by_id[a], by_id[b], "contradiction"))

    def window(i):
        return (i["ttl_days"] or DEFAULT_WINDOW_DAYS) * DAY

    fresh = [i for i in items if now - (i["confirmed_at"] or i["created_at"]) <= window(i)]
    comps = {
        "hit_rate": len(hits) / len(personal_runs) if personal_runs else None,
        "specificity": (len(items) - len(vague_ids)) / len(items) if items else None,
        "freshness": len(fresh) / len(items) if items else None,
        "consistency": max(0.0, 1.0 - 0.5 * len(conflicts)),
    }
    live = {k: v for k, v in comps.items() if v is not None}
    wsum = sum(WEIGHTS[k] for k in live)
    score = round(100 * sum(WEIGHTS[k] * v for k, v in live.items()) / wsum) if wsum and items else 0

    sugg = []
    # Gaps: personal-intent answers that used zero memories, grouped by topic. Sensitive topics are never nudged.
    gaps: dict[str, int] = {}
    for r in personal_runs:
        if json.loads(r["used_ids"]):
            continue
        if any(rx.search(r["prompt"]) for rx in SENSITIVE_RE):
            continue
        for t in topics_of(r["prompt"]) & set(TOPIC_COPY):
            gaps[t] = gaps.get(t, 0) + 1
    for t, n in gaps.items():
        _, body, title, sens = TOPIC_COPY[t]
        s = {"kind": "gap", "action": "add", "title": title, "body": body.format(n=n), "memory_ids": [],
             "topic": t}
        if sens:
            s["note"] = "Optional, and short retention is recommended."
        sugg.append(s)
    for i in items:
        if i["id"] in vague_ids:
            sugg.append({"kind": "vague", "action": "refine", "title": "Make this memory more specific",
                         "body": f"'{i['content']}' is too general to help. Try adding a concrete detail.",
                         "memory_ids": [i["id"]]})
    used_ever = {u for r in runs for u in json.loads(r["used_ids"])}
    for i in items:
        age = now - (i["confirmed_at"] or i["created_at"])
        if i["id"] in used_ever and age > window(i):
            sugg.append({"kind": "stale", "action": "confirm", "title": "Still true?",
                         "body": f"'{i['content']}' was last confirmed {int(age // (30 * DAY))} month(s) ago.",
                         "memory_ids": [i["id"]]})
    for a, b, p in conflicts:
        sugg.append({"kind": "conflict", "action": "remove", "title": "These two memories contradict",
                     "body": f"You have '{a['content']}' and '{b['content']}'. Keep one?",
                     "memory_ids": sorted([a["id"], b["id"]])})
    unused = [i for i in items if i["uses"] == 0 and now - i["created_at"] > settings.unused_after_days * DAY]
    if len(unused) >= 2:
        sugg.append({"kind": "unused", "action": "remove", "title": "Memories never used",
                     "body": f"These {len(unused)} items were never used. Remove or rescope?",
                     "memory_ids": [i["id"] for i in unused]})
    if runs and not any(i["is_style"] for i in items):
        sugg.append({"kind": "style", "action": "add", "title": "Add an answer-style preference",
                     "body": "Add how you like answers: short, step by step, examples?", "memory_ids": []})
    # Scope mistakes: relevant memory repeatedly excluded for being out of scope.
    miss: dict[str, int] = {}
    for r in runs:
        with db() as c:
            x = json.loads(c.execute("SELECT xray FROM runs WHERE id=?", (r["id"],)).fetchone()["xray"])
        for e in x["excluded"]:
            if e.get("relevant") and str(e.get("reason", "")).startswith("out of scope"):
                miss[e["memory_id"]] = miss.get(e["memory_id"], 0) + 1
    for mid, n in miss.items():
        it = next((i for i in items if i["id"] == mid), None)
        if it and n >= 2:
            sugg.append({"kind": "scope", "action": "rescope", "title": "Scope may be too narrow",
                         "body": f"'{it['content']}' was relevant {n} times but only available to the "
                                 f"'{it['scope']}' scope.", "memory_ids": [mid]})

    out = []
    for s in sugg:
        s["id"] = sid(s["kind"], s.get("topic") or ",".join(s["memory_ids"]))
        if s["id"] not in dismissed:
            out.append(s)
    return {"score": score, "components": {k: (None if v is None else round(v, 3)) for k, v in comps.items()},
            "weights": WEIGHTS, "stats": {"memories": len(items), "personal_answers": len(personal_runs),
                                          "answers_using_memory": len(hits)},
            "suggestions": out, "deep": deep and settings.coach_deep and gemini.available(),
            "privacy": "Computed in-session on unlocked memories. Nothing goes on-chain. Never shames, never "
                       "nudges health or finance sharing."}


def dismiss(user_id: str, suggestion_id: str) -> None:
    with db() as c:
        c.execute("INSERT OR IGNORE INTO dismissals VALUES(?,?)", (user_id, suggestion_id))
