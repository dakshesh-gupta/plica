"""The 5-test verification panel (+ 4 Coach tests). Runs against a throwaway user, no Gemini calls."""
import time

from . import coach, receipts, recall, vault


def _stub(prompt: str) -> str:
    return "Test answer based on: " + prompt[:60]


def _t(tid, name, fn):
    try:
        ok, detail = fn()
    except Exception as e:  # a crashing test is a failing test
        ok, detail = False, f"exception: {e!r}"
    return {"id": tid, "name": name, "passed": bool(ok), "detail": detail}


def run_all(include_coach: bool = True) -> dict:
    t0 = time.time()
    _, pub = vault.create_user()
    uid = pub["user_id"]
    user = vault.get_user_by_id(uid)
    results = []
    try:
        def ask(prompt, scopes, approve):
            return receipts.chat(user, prompt, scopes, approve, answer_fn=_stub)

        def t1():
            m = vault.add_memory(uid, "I'm vegetarian", "personal", consent=True)
            r = ask("Give me dinner ideas", ["personal"], [m["id"]])
            ok = m["commitment"] in r["receipt"]["memory"]["commitments"] and "vegetarian" in r["memory_block"]
            return ok, "memory inserted into prompt and its commitment appears in the receipt"
        results.append(_t(1, "Permitted memory", t1))

        def t2():
            w = vault.add_memory(uid, "I'm working on Project X", "work", consent=True)
            rec = recall.recall(uid, "What am I working on? Project X", ["personal"], semantic=False)
            leaked = any(c["memory_id"] == w["id"] for c in rec["candidates"])
            r = ask("What is Project X?", ["personal"], [w["id"]])
            blocked = w["id"] in [x["memory_id"] for x in r["rejected"]] and not r["receipt"]["memory"]["commitments"]
            return (not leaked) and blocked, "a 'personal' agent cannot retrieve or insert a 'work' item"
        results.append(_t(2, "Out-of-scope memory", t2))

        state = {}

        def t3():
            m = vault.add_memory(uid, "I'm working on Project X (deletion test)", "work", consent=True)
            ra = ask("Status of Project X deletion test?", ["work"], [m["id"]])
            vault.forget(uid, m["id"])
            row = vault.get_row(uid, m["id"])
            try:
                vault.read_payload(row)
                dec_fail = False
            except vault.KeyDestroyed:
                dec_fail = True
            rec = recall.recall(uid, "Project X deletion test", ["work"], semantic=False)
            retrieved = any(c["memory_id"] == m["id"] for c in rec["candidates"])
            rb = ask("Status of Project X deletion test?", ["work"], [m["id"]])
            state["a"], state["b"], state["c"] = ra, rb, m["commitment"]
            ok = dec_fail and not retrieved and m["commitment"] in ra["receipt"]["memory"]["commitments"] \
                and m["commitment"] not in rb["receipt"]["memory"]["commitments"]
            return ok, "key destroyed; retrieval and decryption fail; receipt A lists it, receipt B does not"
        results.append(_t(3, "Deleted memory", t3))

        def t4():
            ra = state["a"]["receipt"]
            run = receipts.get_run(uid, ra["receipt_id"])
            good = receipts.verify_receipt(ra, run["prompt"], run["answer"], run["memory_block"])
            bad = receipts.verify_receipt(ra, run["prompt"], run["answer"][:-1] + "!", run["memory_block"])
            return good["ladder"]["hash_verified"] and not bad["ladder"]["hash_verified"], \
                "changing one character flips Hash verified to Failed"
        results.append(_t(4, "Tampered answer", t4))

        def t5():
            ra = dict(state["a"]["receipt"])
            sig = dict(ra["signature"])
            sig["value"] = sig["value"][:-4] + ("AAAA" if not sig["value"].endswith("AAAA") else "BBBB")
            fake = receipts.verify_receipt({**ra, "signature": sig})
            unknown = receipts.verify_receipt({**state["a"]["receipt"], "anchor": {"tx_hash": "0x" + "00" * 32}})
            return (not fake["ladder"]["signature_verified"]) and unknown["checks"]["anchor"]["status"] == "not_found", \
                "bad signature and unknown anchor ID both fail"
        results.append(_t(5, "Fake receipt", t5))

        if include_coach:
            def c1():
                u2 = vault.get_user_by_id(vault.create_user()[1]["user_id"])
                try:
                    receipts.chat(u2, "Give me dinner ideas for tonight", ["personal"], [], answer_fn=_stub)
                    s = coach.analyze(u2["id"])["suggestions"]
                    return any(x["kind"] == "gap" for x in s), "personal prompt with no memory hit -> gap card"
                finally:
                    vault.delete_user(u2["id"])
            results.append(_t(6, "Coach: gap suggestion", c1))

            def c2():
                u2 = vault.get_user_by_id(vault.create_user()[1]["user_id"])
                try:
                    vault.add_memory(u2["id"], "I live in Delhi", consent=True)
                    vault.add_memory(u2["id"], "I live in Bangalore", consent=True)
                    return any(x["kind"] == "conflict" for x in coach.analyze(u2["id"])["suggestions"]), \
                        "two contradictory items -> conflict card"
                finally:
                    vault.delete_user(u2["id"])
            results.append(_t(7, "Coach: conflict card", c2))

            def c3():
                u2 = vault.get_user_by_id(vault.create_user()[1]["user_id"])
                try:
                    receipts.chat(u2, "Give me dinner ideas", ["personal"], [], answer_fn=_stub)
                    before = coach.analyze(u2["id"])["score"]
                    m = vault.add_memory(u2["id"], "I'm vegetarian and I dislike mushrooms", consent=True)
                    r = receipts.chat(u2, "Give me dinner ideas", ["personal"], [m["id"]], answer_fn=_stub)
                    after = coach.analyze(u2["id"])["score"]
                    return after > before and m["commitment"] in r["receipt"]["memory"]["commitments"], \
                        f"score {before} -> {after}; new item appears in next receipt"
                finally:
                    vault.delete_user(u2["id"])
            results.append(_t(8, "Coach: accepting raises score", c3))

            def c4():
                u2 = vault.get_user_by_id(vault.create_user()[1]["user_id"])
                try:
                    receipts.chat(u2, "Give me dinner ideas", ["personal"], [], answer_fn=_stub)
                    gap = next(x for x in coach.analyze(u2["id"])["suggestions"] if x["kind"] == "gap")
                    coach.dismiss(u2["id"], gap["id"])
                    return all(x["id"] != gap["id"] for x in coach.analyze(u2["id"])["suggestions"]), \
                        "dismissed suggestion stays dismissed"
                finally:
                    vault.delete_user(u2["id"])
            results.append(_t(9, "Coach: dismissal persists", c4))
    finally:
        vault.delete_user(uid)
    return {"passed": sum(r["passed"] for r in results), "total": len(results),
            "all_passed": all(r["passed"] for r in results), "duration_ms": int((time.time() - t0) * 1000),
            "results": results}
