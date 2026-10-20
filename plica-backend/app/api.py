from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from . import anchor, coach, gemini, receipts, recall, selftest, vault
from .config import settings

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------- auth
def user_dep(x_session_token: str | None = Header(default=None)) -> dict:
    u = vault.get_user(x_session_token) if x_session_token else None
    if not u:
        raise HTTPException(401, "Missing or invalid X-Session-Token. Create one with POST /api/session.")
    return u


def actor_dep(x_session_token: str | None = Header(default=None), x_grant_token: str | None = Header(default=None)) -> dict:
    """Session token = full owner. Grant token = scoped, time-boxed capability (recall/chat only)."""
    if x_session_token:
        u = vault.get_user(x_session_token)
        if u:
            return {"user": u, "grant_scopes": None, "grant_id": None}
    if x_grant_token:
        g = vault.use_grant(x_grant_token)
        if g:
            return {"user": g["user"], "grant_scopes": g["scopes"], "grant_id": g["grant_id"]}
        raise HTTPException(403, "Grant is invalid, expired, revoked or out of uses.")
    raise HTTPException(401, "Provide X-Session-Token or X-Grant-Token.")


def resolve_scopes(a: dict, requested: list[str] | None) -> list[str]:
    req = requested or ["personal"]
    return [s for s in req if s in a["grant_scopes"]] if a["grant_scopes"] is not None else req


# ---------------------------------------------------------------- models
class MemoryIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    scope: str = "personal"
    tags: list[str] = []
    ttl_days: int | None = Field(default=None, ge=1, le=3650)
    max_uses: int | None = Field(default=None, ge=1)
    consent: bool = False
    consent_signature: str | None = None  # optional wallet signature over the consent message


class PolicyIn(BaseModel):
    scope: str | None = None
    ttl_days: int | None = Field(default=None, ge=0, le=3650)
    max_uses: int | None = Field(default=None, ge=0)


class RefineIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    consent: bool = False
    consent_signature: str | None = None


class RecallIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    scope: list[str] | None = None
    semantic: bool | None = None


class ChatIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    scope: list[str] | None = None
    approved_memory_ids: list[str] = []
    history: list[dict] = []


class CaptureIn(BaseModel):
    """For the real extension: the chat page produced the answer, we only record it."""
    prompt: str
    answer: str
    approved_memory_ids: list[str] = []
    scope: list[str] | None = None
    memory_block: str | None = None
    model_name: str = "page-reported (unverified)"
    site: str = "chat-site"
    extension_version: str = "0.1.0"
    browser: str = "chrome"


class VerifyIn(BaseModel):
    receipt: dict
    prompt: str | None = None
    memory_block: str | None = None
    answer: str | None = None


class GrantIn(BaseModel):
    scopes: list[str] = Field(min_length=1)
    purpose: str = "agent recall"
    ttl_minutes: int = Field(default=60, ge=1, le=1440)
    max_uses: int | None = Field(default=None, ge=1)


# ---------------------------------------------------------------- meta / session
@router.get("/health")
def health():
    return {"ok": True, "gemini_configured": gemini.available(), "model": gemini.model_label(),
            "recall_semantic": settings.recall_semantic and gemini.available(), "ledger": anchor.verify_ledger()["ok"]}


@router.post("/session")
def new_session():
    token, pub = vault.create_user()
    return {"token": token, **pub, "note": "Keep the token: it is the only way to access this vault."}


@router.get("/me")
def me(u: dict = Depends(user_dep)):
    return {"user_id": u["id"], "did": u["did"], "public_key": u["public_key"], **vault.vault_root(u["id"])}


# ---------------------------------------------------------------- memories
@router.post("/memories", status_code=201)
def add_memory(m: MemoryIn, u: dict = Depends(user_dep)):
    return vault.add_memory(u["id"], m.content, m.scope, m.tags, m.ttl_days, m.max_uses, m.consent, m.consent_signature)


@router.get("/memories")
def list_memories(include_forgotten: bool = True, u: dict = Depends(user_dep)):
    rows = vault.all_rows(u["id"])
    items = [vault.public(r) for r in rows if include_forgotten or r["status"] == "active"]
    return {"items": items, **vault.vault_root(u["id"])}


@router.get("/memories/{memory_id}")
def get_memory(memory_id: str, u: dict = Depends(user_dep)):
    return vault.public(vault.get_row(u["id"], memory_id))


@router.patch("/memories/{memory_id}")
def patch_memory(memory_id: str, p: PolicyIn, u: dict = Depends(user_dep)):
    return vault.update_policy(u["id"], memory_id, p.scope, p.ttl_days, p.max_uses)


@router.post("/memories/{memory_id}/confirm")
def confirm_memory(memory_id: str, u: dict = Depends(user_dep)):
    return vault.confirm(u["id"], memory_id)


@router.post("/memories/{memory_id}/refine", status_code=201)
def refine_memory(memory_id: str, r: RefineIn, u: dict = Depends(user_dep)):
    return vault.refine(u["id"], memory_id, r.content, r.consent, r.consent_signature)


@router.delete("/memories/{memory_id}")
def forget_memory(memory_id: str, u: dict = Depends(user_dep)):
    return vault.forget(u["id"], memory_id)


@router.get("/memories/{memory_id}/erasure-report")
def erasure_report(memory_id: str, u: dict = Depends(user_dep)):
    return vault.erasure_report(u["id"], memory_id)


# ---------------------------------------------------------------- vault-level
@router.get("/vault/root")
def vault_root(u: dict = Depends(user_dep)):
    return vault.vault_root(u["id"])


@router.get("/vault/snapshots")
def vault_snapshots(u: dict = Depends(user_dep)):
    return {"snapshots": vault.snapshots(u["id"])}


@router.get("/vault/at")
def vault_at(ts: float = Query(description="Unix timestamp"), u: dict = Depends(user_dep)):
    return vault.snapshot_at(u["id"], ts)


@router.post("/vault/panic")
def panic(scope: str | None = None, u: dict = Depends(user_dep)):
    return vault.panic(u["id"], scope)


@router.post("/grants", status_code=201)
def create_grant(g: GrantIn, u: dict = Depends(user_dep)):
    return vault.create_grant(u["id"], g.scopes, g.purpose, g.ttl_minutes, g.max_uses)


@router.get("/grants")
def list_grants(u: dict = Depends(user_dep)):
    return {"grants": vault.list_grants(u["id"])}


@router.delete("/grants/{grant_id}")
def revoke_grant(grant_id: str, u: dict = Depends(user_dep)):
    vault.revoke_grant(u["id"], grant_id)
    return {"revoked": grant_id}


# ---------------------------------------------------------------- recall / chat / receipts
@router.post("/recall")
def do_recall(r: RecallIn, a: dict = Depends(actor_dep)):
    """Proposes memories. Nothing is inserted until the user approves them (send ids to /chat or /receipts/capture)."""
    return recall.recall(a["user"]["id"], r.prompt, resolve_scopes(a, r.scope), r.semantic)


@router.post("/chat")
def chat(c: ChatIn, a: dict = Depends(actor_dep)):
    return receipts.chat(a["user"], c.prompt, resolve_scopes(a, c.scope), c.approved_memory_ids, c.history)


@router.post("/receipts/capture", status_code=201)
def capture(c: CaptureIn, a: dict = Depends(actor_dep)):
    return receipts.record(a["user"], c.prompt, c.answer, c.approved_memory_ids, resolve_scopes(a, c.scope),
                           c.model_name, c.site, c.extension_version, c.browser, mem_block=c.memory_block)


@router.post("/receipts/anchor", status_code=201)
def anchor_receipt(body: dict[str, Any]):
    """Wallet-signed receipts built in the browser: verified, anchored and pinned. No auth needed."""
    return receipts.anchor_client_receipt(body.get("receipt", body))


@router.get("/receipts")
def list_receipts(limit: int = Query(50, le=200), u: dict = Depends(user_dep)):
    return {"receipts": receipts.list_runs(u["id"], limit)}


@router.get("/receipts/compare")
def compare(a: str, b: str, u: dict = Depends(user_dep)):
    return receipts.compare(u["id"], a, b)


@router.get("/receipts/{receipt_id}")
def get_receipt(receipt_id: str, u: dict = Depends(user_dep)):
    return receipts.get_run(u["id"], receipt_id)


@router.get("/receipts/{receipt_id}/verify")
def verify_stored(receipt_id: str, u: dict = Depends(user_dep)):
    return receipts.verify_stored(u["id"], receipt_id)


@router.get("/receipts/{receipt_id}/xray")
def xray(receipt_id: str, u: dict = Depends(user_dep)):
    return receipts.xray(u["id"], receipt_id)


# ---------------------------------------------------------------- public verification
@router.post("/verify")
def verify(v: VerifyIn):
    """Public, no auth. The website's Verify page does the same checks in-browser; this is the reference."""
    return receipts.verify_receipt(v.receipt, v.prompt, v.answer, v.memory_block)


@router.get("/samples/{kind}")
def samples(kind: str):
    if kind not in ("valid", "tampered", "bad_signature"):
        raise HTTPException(404, "kind must be valid, tampered or bad_signature")
    return receipts.sample(kind)


@router.get("/ledger/verify")
def ledger_verify():
    return anchor.verify_ledger()


@router.get("/ledger/{tx_hash}")
def ledger_entry(tx_hash: str):
    e = anchor.lookup(tx_hash)
    if not e:
        raise HTTPException(404, "unknown transaction")
    return e


# ---------------------------------------------------------------- coach / tests / demo
@router.get("/coach")
def coach_get(deep: bool = False, u: dict = Depends(user_dep)):
    return coach.analyze(u["id"], deep)


@router.post("/coach/dismiss/{suggestion_id}")
def coach_dismiss(suggestion_id: str, u: dict = Depends(user_dep)):
    coach.dismiss(u["id"], suggestion_id)
    return {"dismissed": suggestion_id}


@router.post("/tests/run")
def run_tests(include_coach: bool = True):
    return selftest.run_all(include_coach)


@router.post("/demo/seed", status_code=201)
def seed_demo(u: dict = Depends(user_dep)):
    """Pre-filled memories for the judge-facing 'Try the demo' mode."""
    out = [vault.add_memory(u["id"], t, s, tags=tags, consent=True)
           for t, s, tags in [("I'm vegetarian", "personal", []), ("I'm working on Project X", "work", []),
                              ("Prefers short answers", "personal", ["style"])]]
    return {"items": out, "model_label": gemini.model_label()}
