# Plica backend

FastAPI + SQLite backend for Plica: encrypted memory vault with crypto-shredding, approved recall, signed
Memory-Aware Provenance Receipts, Memory X-ray data, Personalization Coach, the 5-test panel, and Gemini (free API) as the chat model.

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # paste your key into GEMINI_API_KEY
uvicorn app.main:app --reload
```

Open http://localhost:8000/docs for interactive API docs. Get a free key at https://aistudio.google.com/apikey.
Without a key everything still works; answers come from a stub labelled "Demo model, not a real AI provider".

Docker: `docker build -t plica . && docker run -p 8000:8000 --env-file .env -v plica-data:/data plica`
Tests: `pytest -q`

## Gemini free-tier notes

- `GEMINI_MODEL` defaults to `gemini-2.5-flash`. If your key lacks access or you hit quota, try a Flash-Lite model.
  Model names and free limits change; check AI Studio.
- `GEMINI_RPM` (default 8) throttles requests client-side; 429/503 are retried with backoff; if Gemini still fails
  and `GEMINI_FALLBACK_STUB=true`, a labelled stub answer is returned so a live demo never dies.
- One question = 1 call to answer, plus 1 optional call for semantic recall (`RECALL_SEMANTIC`). Coach calls Gemini only with `?deep=true`.
- Free-tier prompts may be used by Google to improve its products. Sensitive (health/finance) memories are never sent
  for semantic recall, but approved memories are inserted into the prompt by design. Use demo data only.
  Set `RECALL_SEMANTIC=false` for fully local matching.

## How it maps to the guide

| Guide feature | Where |
|---|---|
| Per-item encryption, crypto-shredding, tombstone | `vault.py` (AES-256-GCM per item; key wrapped by `MASTER_KEY`; forget deletes the key row) |
| Wallet-signed consent | `consent: true` required; optional `consent_signature` stored |
| Scoped recall, retention (TTL, max uses) | `recall.py`, `vault.eligibility` |
| Approval step | `/api/recall` only proposes; `/api/chat` and `/api/receipts/capture` insert/record only approved ids |
| Receipt, hashes, signature, ladder | `receipts.py`; ES256 (ECDSA P-256, raw r\|\|s, same as WebCrypto) |
| Merkle commitments / vault root / time travel | `crypto.merkle_root`, `/api/vault/*` |
| Anchor | `anchor.py`: hash-chained simulated L2 ledger (`/api/ledger/*`); optional Pinata IPFS pin |
| X-ray | `/api/receipts/{id}/xray` (used / excluded with reasons / available, highlights, "supplied to the model" label) |
| Coach | `coach.py`: gaps, vague, stale, conflicts, scope, unused, style; score = 40/25/20/15 |
| 5 tests (+4 Coach tests) | `selftest.py`, `POST /api/tests/run` |
| Sensitivity classifier, panic button | `vault.classify_sensitivity` (defaults to 30-day TTL), `POST /api/vault/panic` |
| Scoped delegation | `/api/grants` + `X-Grant-Token` |
| GDPR erasure report | `/api/memories/{id}/erasure-report` |
| Public Verify page + samples | `POST /api/verify`, `GET /api/samples/{valid|tampered|bad_signature}` |

## Endpoints (auth: `X-Session-Token` unless noted)

`POST /api/session` (no auth) -> token, DID, public key
`POST /api/demo/seed` -> vegetarian / Project X / short-answers memories
`POST|GET /api/memories`, `GET|PATCH|DELETE /api/memories/{id}`, `POST /api/memories/{id}/confirm|refine`, `GET .../erasure-report`
`POST /api/recall` (session or grant) -> candidates + excluded reasons
`POST /api/chat` (session or grant) -> Gemini answer + receipt + X-ray summary
`POST /api/receipts/capture` -> record an answer captured from a real chat page (extension flow)
`POST /api/receipts/anchor` (no auth) -> verify + anchor a receipt signed in the browser by a wallet
`GET /api/receipts`, `GET /api/receipts/{id}`, `/verify`, `/xray`, `GET /api/receipts/compare?a=&b=`
`POST /api/verify`, `GET /api/samples/{kind}`, `GET /api/ledger/verify`, `GET /api/ledger/{tx}` (no auth)
`GET /api/coach?deep=`, `POST /api/coach/dismiss/{id}`, `POST /api/tests/run` (no auth)
`GET /api/vault/root|snapshots|at?ts=`, `POST /api/vault/panic?scope=`, `POST|GET|DELETE /api/grants`

## 3-minute demo via curl

```bash
B=http://localhost:8000/api
T=$(curl -s -X POST $B/session | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
H="X-Session-Token: $T"
curl -s -X POST $B/demo/seed -H "$H"                                   # note the ids
curl -s -X POST $B/recall -H "$H" -H 'content-type: application/json' -d '{"prompt":"Give me dinner ideas"}'
curl -s -X POST $B/chat   -H "$H" -H 'content-type: application/json' \
     -d '{"prompt":"Give me dinner ideas","approved_memory_ids":["<VEG_ID>"]}'      # receipt A
curl -s $B/receipts/<A>/xray -H "$H"
curl -s $B/coach -H "$H"
curl -s -X DELETE $B/memories/<PROJECT_X_ID> -H "$H"                   # key destroyed + tombstone
curl -s -X POST $B/chat -H "$H" -H 'content-type: application/json' \
     -d '{"prompt":"Give me dinner ideas","approved_memory_ids":["<VEG_ID>"]}'      # receipt B
curl -s "$B/receipts/compare?a=<A>&b=<B>" -H "$H"
curl -s -X POST $B/tests/run
```

## Receipt format

Body (signed): `version, receipt_id, created_at, model{name, verified:false}, inputs{prompt_hash, memory_context_hash}, environment,
memory{commitments, commitments_root}, outputs{answer_hash}, trust_tier:0, signer{did, public_key(JWK)}`.
Signature = ES256 over canonical JSON of the body (sorted keys, no whitespace, UTF-8), base64 raw r||s.
Hashes are SHA-256 hex of the UTF-8 text. `anchor` is added after signing. Commitment = SHA-256 of
`plica.mem.v1|id|version|salt|content` (salted, so receipts never reveal or confirm content).

## Honest limits (also in the product)

- Deleting proves Plica will not supply the memory again; it cannot erase copies already sent to Gemini or any chat provider.
- Model name is reported, not proven. "Execution attested" always reads Not available.
- Demo mode keeps keys server-side (the server decrypts to build prompts). For the real extension, keep keys in the
  browser, sign receipts there, and use `/api/receipts/anchor`; this backend then only stores ciphertext/receipts.
- The anchor is a simulated hash-chained ledger. Swapping `anchor.append` for an EVM L2 call (registerExperiment / tombstone) is the only change needed.
- SQLite + single process is built for a hackathon; use Postgres and a real KMS (or Lit) for production.
