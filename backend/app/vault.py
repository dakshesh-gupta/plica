"""Users, encrypted memory vault, crypto-shredding, grants, snapshots (time-travel audit)."""
import hashlib
import json
import re
import secrets
import time
import uuid

from . import anchor
from .config import settings
from .crypto import (aes_decrypt, aes_encrypt, canonical, did_key_p256, gen_keypair, merkle_root, new_key, sha256_hex)
from .db import db

DAY = 86400


class VaultError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class KeyDestroyed(VaultError):
    def __init__(self):
        super().__init__("Key unavailable: this memory was forgotten", 410)


# ---------------------------------------------------------------- users / sessions
def _hash_token(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def create_user() -> tuple[str, dict]:
    """Returns (session_token, public_user). A demo ECDSA key is generated server-side; real wallets
    sign in the browser and submit pre-signed receipts to /api/receipts/anchor."""
    uid = "usr_" + uuid.uuid4().hex[:16]
    token = "plk_" + secrets.token_urlsafe(32)
    pem, jwk = gen_keypair()
    nonce, wrapped = aes_encrypt(settings.master_key, pem, uid.encode())
    now = time.time()
    did = did_key_p256(jwk)
    with db() as c:
        c.execute("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)",
                  (uid, _hash_token(token), did, json.dumps(jwk), wrapped, nonce, now,
                   now + settings.session_ttl_hours * 3600))
    return token, {"user_id": uid, "did": did, "public_key": jwk}


def get_user(token: str) -> dict | None:
    with db() as c:
        r = c.execute("SELECT * FROM users WHERE token_hash=?", (_hash_token(token),)).fetchone()
    if not r or r["expires_at"] < time.time():
        return None
    return _user_row(r)


def get_user_by_id(uid: str) -> dict | None:
    with db() as c:
        r = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return _user_row(r) if r else None


def _user_row(r) -> dict:
    return {"id": r["id"], "did": r["did"], "public_key": json.loads(r["public_jwk"]),
            "_priv": (r["private_wrapped"], r["private_nonce"])}


def private_pem(user: dict) -> bytes:
    wrapped, nonce = user["_priv"]
    return aes_decrypt(settings.master_key, nonce, wrapped, user["id"].encode())


def delete_user(uid: str) -> None:
    """Hard delete of a (test) user and everything attached to them."""
    with db() as c:
        ids = [r["id"] for r in c.execute("SELECT id FROM memories WHERE user_id=?", (uid,))]
        for mid in ids:
            c.execute("DELETE FROM item_keys WHERE memory_id=?", (mid,))
        for t in ("memories", "tombstones", "runs", "snapshots", "dismissals", "grants"):
            c.execute(f"DELETE FROM {t} WHERE user_id=?", (uid,))
        c.execute("DELETE FROM users WHERE id=?", (uid,))


# ---------------------------------------------------------------- sensitivity classifier (local)
_HEALTH = re.compile(r"\b(diagnos\w*|medication|prescription|therap\w+|depress\w+|anxiety|cancer|diabet\w+|"
                     r"pregnan\w+|hiv|surgery|disorder|illness|disease|allerg\w+|asthma|medical|doctor)\b", re.I)
_FINANCE = re.compile(r"\b(salary|income|debt|loan|mortgage|credit score|bank account|net worth|tax(es)?|"
                      r"invest\w*|savings|bankrupt\w*|iban|account number)\b", re.I)


def classify_sensitivity(text: str) -> str | None:
    if _HEALTH.search(text):
        return "health"
    if _FINANCE.search(text):
        return "finance"
    return None


_STYLE = re.compile(r"\b(answers?|replies|responses?|tone|format|concise|brief|short|step[- ]by[- ]step|bullet\w*|"
                    r"examples?|explain\w*)\b", re.I)


def looks_like_style(text: str, tags: list[str]) -> bool:
    return "style" in [t.lower() for t in tags] or (bool(_STYLE.search(text)) and re.search(r"\b(prefer\w*|like|want|always)\b", text, re.I) is not None)


# ---------------------------------------------------------------- crypto helpers
def commitment_for(memory_id: str, version: int, salt: str, content: str) -> str:
    """Salted commitment: hides content from anyone who sees receipts or the registry."""
    return sha256_hex(f"plica.mem.v1|{memory_id}|{version}|{salt}|{content}")


def _read(c, row) -> dict:
    key_row = c.execute("SELECT * FROM item_keys WHERE memory_id=?", (row["id"],)).fetchone()
    if not key_row or row["status"] != "active":
        raise KeyDestroyed()
    key = aes_decrypt(settings.master_key, key_row["nonce"], key_row["wrapped"], row["id"].encode())
    plain = aes_decrypt(key, row["nonce"], row["ciphertext"], row["id"].encode())
    return json.loads(plain)


def read_payload(row) -> dict:
    with db() as c:
        return _read(c, row)


def get_row(user_id: str, memory_id: str):
    with db() as c:
        r = c.execute("SELECT * FROM memories WHERE id=? AND user_id=?", (memory_id, user_id)).fetchone()
    if not r:
        raise VaultError("memory not found", 404)
    return r


def all_rows(user_id: str) -> list:
    with db() as c:
        return c.execute("SELECT * FROM memories WHERE user_id=? ORDER BY created_at", (user_id,)).fetchall()


def eligibility(row, scopes: list[str] | None, now: float | None = None) -> str | None:
    """None if the memory may be supplied; otherwise the human-readable exclusion reason."""
    now = now or time.time()
    if row["status"] != "active":
        return "deleted"
    if row["expires_at"] and row["expires_at"] < now:
        return "expired"
    if scopes is not None and row["scope"] not in scopes:
        return f"out of scope: {row['scope']}"
    if row["max_uses"] and row["uses"] >= row["max_uses"]:
        return "max uses reached"
    return None


def public(row, content: bool = True) -> dict:
    d = {"id": row["id"], "scope": row["scope"], "sensitivity": row["sensitivity"], "commitment": row["commitment"],
         "version": row["version"], "ttl_days": row["ttl_days"], "expires_at": row["expires_at"],
         "max_uses": row["max_uses"], "uses": row["uses"], "is_style": bool(row["is_style"]),
         "created_at": row["created_at"], "confirmed_at": row["confirmed_at"], "status": row["status"],
         "forgotten_at": row["forgotten_at"], "content": None, "tags": [], "readable": False}
    if content and row["status"] == "active":
        try:
            p = read_payload(row)
            d.update(content=p["content"], tags=p.get("tags", []), readable=True)
        except VaultError:
            pass
    return d


# ---------------------------------------------------------------- snapshots / root
def _snapshot(c, user_id: str, reason: str) -> dict:
    rows = c.execute("SELECT id, commitment, scope, status FROM memories WHERE user_id=? ORDER BY created_at",
                     (user_id,)).fetchall()
    active = [r["commitment"] for r in rows if r["status"] == "active"]
    root = merkle_root(active)
    items = [{"id": r["id"], "commitment": r["commitment"], "scope": r["scope"], "status": r["status"]} for r in rows]
    c.execute("INSERT INTO snapshots(user_id,created_at,root,reason,items) VALUES(?,?,?,?,?)",
              (user_id, time.time(), root, reason, json.dumps(items)))
    return {"root": root, "count": len(active), "reason": reason}


def vault_root(user_id: str) -> dict:
    with db() as c:
        rows = c.execute("SELECT commitment FROM memories WHERE user_id=? AND status='active'", (user_id,)).fetchall()
    leaves = [r["commitment"] for r in rows]
    return {"root": merkle_root(leaves), "count": len(leaves)}


def snapshots(user_id: str) -> list[dict]:
    with db() as c:
        rows = c.execute("SELECT id, created_at, root, reason FROM snapshots WHERE user_id=? ORDER BY id",
                         (user_id,)).fetchall()
    return [dict(r) for r in rows]


def snapshot_at(user_id: str, ts: float) -> dict:
    """Time-travel audit: what the vault held (and could supply) at a given moment."""
    with db() as c:
        r = c.execute("SELECT * FROM snapshots WHERE user_id=? AND created_at<=? ORDER BY id DESC LIMIT 1",
                      (user_id, ts)).fetchone()
    if not r:
        return {"root": merkle_root([]), "items": [], "at": ts, "note": "vault did not exist yet"}
    items = json.loads(r["items"])
    return {"root": r["root"], "snapshot_id": r["id"], "taken_at": r["created_at"], "reason": r["reason"],
            "items": [i for i in items if i["status"] == "active"], "at": ts}


# ---------------------------------------------------------------- memory CRUD
def add_memory(user_id: str, content: str, scope: str = "personal", tags: list[str] | None = None,
               ttl_days: int | None = None, max_uses: int | None = None, consent: bool = False,
               consent_signature: str | None = None, supersedes: str | None = None, version: int = 1) -> dict:
    content = (content or "").strip()
    if not consent:
        raise VaultError("consent=true is required before saving a memory", 400)
    if not content or len(content) > 2000:
        raise VaultError("content must be 1-2000 characters", 422)
    scope = re.sub(r"[^a-z0-9_-]", "", (scope or "personal").lower()) or "personal"
    tags = [t.strip()[:32] for t in (tags or []) if t and t.strip()][:10]
    sens = classify_sensitivity(content)
    note = None
    if sens and ttl_days is None:
        ttl_days = 30  # sensitive categories default to short retention
        note = f"Looks like {sens} information. Optional, and short retention is recommended (30 days applied)."
    mid = "mem_" + uuid.uuid4().hex[:16]
    salt = secrets.token_hex(16)
    commit = commitment_for(mid, version, salt, content)
    key = new_key()
    nonce, ct = aes_encrypt(key, canonical({"content": content, "tags": tags, "salt": salt}), mid.encode())
    knonce, wrapped = aes_encrypt(settings.master_key, key, mid.encode())
    now = time.time()
    with db() as c:
        c.execute("INSERT INTO memories(id,user_id,scope,sensitivity,ciphertext,nonce,commitment,version,ttl_days,"
                  "expires_at,max_uses,uses,is_style,created_at,confirmed_at,status,consent_sig,supersedes) "
                  "VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?,?,?, 'active',?,?)",
                  (mid, user_id, scope, sens, ct, nonce, commit, version, ttl_days,
                   now + ttl_days * DAY if ttl_days else None, max_uses, int(looks_like_style(content, tags)),
                   now, now, consent_signature, supersedes))
        c.execute("INSERT INTO item_keys VALUES(?,?,?)", (mid, wrapped, knonce))
        snap = _snapshot(c, user_id, f"add {mid}")
        row = c.execute("SELECT * FROM memories WHERE id=?", (mid,)).fetchone()
    out = public(row)
    out["note"] = note
    out["vault_root"] = snap["root"]
    return out


def forget(user_id: str, memory_id: str, reason: str = "user_forget") -> dict:
    """Crypto-shredding: destroy the per-item key, keep the ciphertext (useless), write a tombstone."""
    row = get_row(user_id, memory_id)
    if row["status"] == "forgotten":
        raise VaultError("memory already forgotten", 409)
    with db() as c:
        c.execute("DELETE FROM item_keys WHERE memory_id=?", (memory_id,))  # the shred
        c.execute("UPDATE memories SET status='forgotten', forgotten_at=?, max_uses=0 WHERE id=?",
                  (time.time(), memory_id))
    anc = anchor.append("tombstone", memory_id, sha256_hex(row["commitment"]))
    with db() as c:
        c.execute("INSERT INTO tombstones VALUES(?,?,?,?,?,?,?)",
                  ("tb_" + uuid.uuid4().hex[:12], user_id, memory_id, row["commitment"], time.time(),
                   json.dumps(anc), reason))
        snap = _snapshot(c, user_id, f"forget {memory_id}")
    return {"memory_id": memory_id, "commitment": row["commitment"], "key_destroyed": True,
            "tombstone_anchor": anc, "vault_root": snap["root"]}


def panic(user_id: str, scope: str | None = None) -> dict:
    forgotten = []
    for r in all_rows(user_id):
        if r["status"] == "active" and (scope is None or r["scope"] == scope):
            forgotten.append(forget(user_id, r["id"], "panic_revoke")["memory_id"])
    with db() as c:
        c.execute("UPDATE grants SET revoked=1 WHERE user_id=?", (user_id,))
    return {"forgotten": forgotten, "grants_revoked": True, "scope": scope}


def update_policy(user_id: str, memory_id: str, scope: str | None = None, ttl_days: int | None = None,
                  max_uses: int | None = None) -> dict:
    row = get_row(user_id, memory_id)
    if row["status"] != "active":
        raise VaultError("memory was forgotten", 410)
    with db() as c:
        if scope:
            c.execute("UPDATE memories SET scope=? WHERE id=?", (re.sub(r"[^a-z0-9_-]", "", scope.lower()), memory_id))
        if ttl_days is not None:
            c.execute("UPDATE memories SET ttl_days=?, expires_at=? WHERE id=?",
                      (ttl_days or None, time.time() + ttl_days * DAY if ttl_days else None, memory_id))
        if max_uses is not None:
            c.execute("UPDATE memories SET max_uses=? WHERE id=?", (max_uses or None, memory_id))
        _snapshot(c, user_id, f"policy {memory_id}")
        r = c.execute("SELECT * FROM memories WHERE id=?", (memory_id,)).fetchone()
    return public(r)


def confirm(user_id: str, memory_id: str) -> dict:
    row = get_row(user_id, memory_id)
    if row["status"] != "active":
        raise VaultError("memory was forgotten", 410)
    now = time.time()
    with db() as c:
        c.execute("UPDATE memories SET confirmed_at=?, expires_at=? WHERE id=?",
                  (now, now + row["ttl_days"] * DAY if row["ttl_days"] else None, memory_id))
        r = c.execute("SELECT * FROM memories WHERE id=?", (memory_id,)).fetchone()
    return public(r)


def refine(user_id: str, memory_id: str, content: str, consent: bool, consent_signature: str | None = None) -> dict:
    old = get_row(user_id, memory_id)
    if old["status"] != "active":
        raise VaultError("memory was forgotten", 410)
    new = add_memory(user_id, content, old["scope"], read_payload(old).get("tags", []), old["ttl_days"],
                     old["max_uses"], consent, consent_signature, supersedes=memory_id, version=old["version"] + 1)
    forget(user_id, memory_id, "refined")
    return new


def erasure_report(user_id: str, memory_id: str) -> dict:
    """GDPR-style proof pack: key gone, ciphertext unreadable, tombstone anchored."""
    row = get_row(user_id, memory_id)
    with db() as c:
        key = c.execute("SELECT 1 FROM item_keys WHERE memory_id=?", (memory_id,)).fetchone()
        tb = c.execute("SELECT * FROM tombstones WHERE memory_id=?", (memory_id,)).fetchone()
    if row["status"] != "forgotten" or not tb:
        raise VaultError("memory has not been forgotten", 409)
    try:
        read_payload(row)
        decrypt_fails = False
    except VaultError:
        decrypt_fails = True
    return {"memory_id": memory_id, "commitment": row["commitment"], "key_present": bool(key),
            "decryption_fails": decrypt_fails, "forgotten_at": row["forgotten_at"],
            "tombstone": {"id": tb["id"], "created_at": tb["created_at"], "anchor": json.loads(tb["anchor"])},
            "limits": "Proves Plica will not supply this memory again. It does not erase copies already sent to "
                      "the chat provider or held in its chat history or memory feature."}


# ---------------------------------------------------------------- grants (UCAN-style capability tokens)
def create_grant(user_id: str, scopes: list[str], purpose: str, ttl_minutes: int = 60, max_uses: int | None = None) -> dict:
    token = "plg_" + secrets.token_urlsafe(24)
    gid = "gr_" + uuid.uuid4().hex[:12]
    now = time.time()
    with db() as c:
        c.execute("INSERT INTO grants(id,user_id,token_hash,scopes,purpose,expires_at,max_uses,uses,revoked,created_at)"
                  " VALUES(?,?,?,?,?,?,?,0,0,?)",
                  (gid, user_id, _hash_token(token), json.dumps(scopes), purpose[:200], now + ttl_minutes * 60,
                   max_uses, now))
    return {"grant_id": gid, "token": token, "scopes": scopes, "purpose": purpose,
            "expires_at": now + ttl_minutes * 60, "max_uses": max_uses}


def use_grant(token: str) -> dict | None:
    """Validates and consumes one use of a grant. Returns {user, scopes, grant_id} or None."""
    with db() as c:
        g = c.execute("SELECT * FROM grants WHERE token_hash=?", (_hash_token(token),)).fetchone()
        if not g or g["revoked"] or g["expires_at"] < time.time() or (g["max_uses"] and g["uses"] >= g["max_uses"]):
            return None
        c.execute("UPDATE grants SET uses=uses+1 WHERE id=?", (g["id"],))
    user = get_user_by_id(g["user_id"])
    return {"user": user, "scopes": json.loads(g["scopes"]), "grant_id": g["id"]} if user else None


def revoke_grant(user_id: str, grant_id: str) -> None:
    with db() as c:
        c.execute("UPDATE grants SET revoked=1 WHERE id=? AND user_id=?", (grant_id, user_id))


def list_grants(user_id: str) -> list[dict]:
    with db() as c:
        rows = c.execute("SELECT id,scopes,purpose,expires_at,max_uses,uses,revoked,created_at FROM grants "
                         "WHERE user_id=? ORDER BY created_at DESC", (user_id,)).fetchall()
    return [{**dict(r), "scopes": json.loads(r["scopes"])} for r in rows]
