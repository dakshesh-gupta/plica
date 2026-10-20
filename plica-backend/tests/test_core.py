"""Run with: pytest -q   (uses a temp DB, stub model, no network)"""
import os
import tempfile

os.environ["DATABASE_PATH"] = tempfile.mkdtemp() + "/test.db"
os.environ["GEMINI_API_KEY"] = ""
os.environ["GEMINI_FALLBACK_STUB"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def test_full_flow():
    with TestClient(app) as c:
        tok = c.post("/api/session").json()["token"]
        h = {"X-Session-Token": tok}
        assert c.post("/api/memories", json={"content": "x"}, headers=h).status_code == 400  # consent required
        veg = c.post("/api/memories", json={"content": "I'm vegetarian", "consent": True}, headers=h).json()
        px = c.post("/api/memories", json={"content": "I'm working on Project X", "scope": "work", "consent": True},
                    headers=h).json()
        rec = c.post("/api/recall", json={"prompt": "dinner ideas"}, headers=h).json()
        assert [x["memory_id"] for x in rec["candidates"]] == [veg["id"]]
        a = c.post("/api/chat", json={"prompt": "dinner ideas", "approved_memory_ids": [veg["id"]]}, headers=h).json()
        assert veg["commitment"] in a["receipt"]["memory"]["commitments"]
        assert c.get(f"/api/receipts/{a['receipt']['receipt_id']}/verify", headers=h).json()["overall"] == "pass"
        assert c.delete(f"/api/memories/{veg['id']}", headers=h).json()["key_destroyed"]
        b = c.post("/api/chat", json={"prompt": "dinner ideas", "approved_memory_ids": [veg["id"]]}, headers=h).json()
        assert not b["receipt"]["memory"]["commitments"]
        cmp_ = c.get("/api/receipts/compare", params={"a": a["receipt"]["receipt_id"], "b": b["receipt"]["receipt_id"]},
                     headers=h).json()
        assert cmp_["only_in_a"] == [veg["commitment"]]
        assert c.get(f"/api/memories/{veg['id']}", headers=h).json()["content"] is None
        # grant scoped to personal cannot reach work memory
        g = c.post("/api/grants", json={"scopes": ["personal"]}, headers=h).json()
        r = c.post("/api/recall", json={"prompt": "Project X", "scope": ["work"]}, headers={"X-Grant-Token": g["token"]}).json()
        assert r["candidates"] == []
        assert px["id"]


def test_public_verify_and_tests():
    with TestClient(app) as c:
        s = c.get("/api/samples/valid").json()
        ok = c.post("/api/verify", json={"receipt": s["receipt"], "prompt": s["texts"]["prompt"],
                                         "answer": s["texts"]["answer"], "memory_block": s["texts"]["memory_block"]}).json()
        assert ok["overall"] == "pass"
        t = c.get("/api/samples/tampered").json()
        bad = c.post("/api/verify", json={"receipt": t["receipt"], "answer": t["texts"]["answer"]}).json()
        assert bad["overall"] == "fail"
        assert c.post("/api/tests/run").json()["all_passed"]
