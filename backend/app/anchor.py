"""Anchoring. Default: a hash-chained append-only ledger that simulates an L2 registry (tx hashes are real
hashes of the entries, so tampering is detectable). Optional: real IPFS pinning through Pinata."""
import time

from .config import settings
from .crypto import canonical, sha256_hex
from .db import db

CHAIN = "plica-sim-l2"


def append(kind: str, ref: str, payload_hash: str) -> dict:
    now = time.time()
    with db() as c:
        row = c.execute("SELECT entry_hash FROM ledger ORDER BY seq DESC LIMIT 1").fetchone()
        prev = row["entry_hash"] if row else "0" * 64
        entry = {"prev": prev, "kind": kind, "ref": ref, "payload_hash": payload_hash, "ts": round(now, 3)}
        entry_hash = sha256_hex(canonical(entry))
        tx = "0x" + entry_hash
        cur = c.execute(
            "INSERT INTO ledger(prev_hash,kind,ref,payload_hash,entry_hash,tx_hash,created_at) VALUES(?,?,?,?,?,?,?)",
            (prev, kind, ref, payload_hash, entry_hash, tx, now),
        )
        seq = cur.lastrowid
    return {"chain": CHAIN, "simulated": True, "tx_hash": tx, "ledger_seq": seq, "timestamp": now, "kind": kind}


def lookup(tx_hash: str) -> dict | None:
    with db() as c:
        r = c.execute("SELECT * FROM ledger WHERE tx_hash=?", (tx_hash,)).fetchone()
    return dict(r) if r else None


def verify_ledger() -> dict:
    """Walk the whole chain and recompute every entry hash."""
    prev = "0" * 64
    with db() as c:
        rows = c.execute("SELECT * FROM ledger ORDER BY seq").fetchall()
    for r in rows:
        entry = {"prev": prev, "kind": r["kind"], "ref": r["ref"], "payload_hash": r["payload_hash"],
                 "ts": round(r["created_at"], 3)}
        if r["prev_hash"] != prev or sha256_hex(canonical(entry)) != r["entry_hash"]:
            return {"ok": False, "broken_at": r["seq"], "length": len(rows)}
        prev = r["entry_hash"]
    return {"ok": True, "length": len(rows), "head": prev}


def pin_json(obj: dict) -> str:
    """Pin to IPFS via Pinata when PINATA_JWT is set; otherwise return a content-addressed local id."""
    local = "local-sha256-" + sha256_hex(canonical(obj))
    if not settings.pinata_jwt:
        return local
    try:
        import httpx
        r = httpx.post(
            "https://api.pinata.cloud/pinning/pinJSONToIPFS",
            headers={"Authorization": f"Bearer {settings.pinata_jwt}"},
            json={"pinataContent": obj, "pinataMetadata": {"name": "plica-receipt"}},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()["IpfsHash"]
    except Exception:
        return local
