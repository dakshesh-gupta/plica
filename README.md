# Plica — front end

Every AI answer comes with a receipt: what it remembered about you.

This repo is the complete front end for Plica:

| Part | Where | What |
|---|---|---|
| **Hackathon website** | `index.html`, `src/site/` | Landing page (all 9 sections), **Verify a receipt**, **Try the demo** |
| **Extension side panel** | `sidepanel.html`, `src/panel/` | Memory list + add form, approval card, Memory X-ray, receipt drawer ("Anchored" + tx link), timeline, 5-test panel, Coach, verification badge, loading/error states |
| **Content script + service worker** | `src/extension/` | Inserts approved memories into the prompt, captures the answer, injects the verification badge. **All page selectors live in one file:** `src/extension/selectors.config.json` |
| **Core (shared)** | `src/core/` | Real WebCrypto: SHA-256, ECDSA P-256 signing, per-memory AES-GCM keys, Merkle commitments, crypto-shredding, receipts, verifier, Coach, the 5 tests |

The website demo and the extension run the **same** panel components and the **same** engine, so what judges see in the browser is what the extension does.

## Run it

```bash
npm install
npm run dev          # website at http://localhost:5173  (panel preview at /sidepanel.html)
npm run build        # website → dist/  (static; hash routing, no server rewrites needed)
npm run build:ext    # extension → extension-dist/  (manifest is generated from selectors.config.json)
npm run test:core    # runs the 9 automated tests (5 core + 4 Coach) in Node
npm run typecheck
```

A prebuilt copy of both is in `prebuilt/` (built with Bun, not Vite) if you want to look before installing anything:
`prebuilt/website/index.html` (serve the folder with any static server) and `prebuilt/extension/` (load unpacked).

## Install the extension

1. `npm run build:ext`
2. Chrome → `chrome://extensions` → enable *Developer mode* → **Load unpacked** → pick `extension-dist/`
3. Open the supported chat site, click the Plica toolbar icon to open the side panel.

## Before you submit (things only you can fill in)

- `src/site/site.config.ts` — GitHub URL, demo video, guide link, contract addresses (set `chain.deployed: true` once live), team. Placeholders show an "add the link" state on the page.
- `src/extension/selectors.config.json` — **the supported chat site.** It ships pointing at ChatGPT with selectors I could not test against the live site from my sandbox; open DevTools and fix `composer`, `sendButton`, `stopButton`, `assistantMessage` if anything is off. Also set `plicaSiteUrl` to your deployed website so "Open in Verify page" works. Check that site's terms allow user-approved, user-initiated automation.
- `src/core/anchor.ts` — `ANCHOR_CONFIG.mode` is `simulated`. Every receipt, drawer and verify result says so. Switch to `testnet` and add the registry call once the contracts are deployed.

## How the pieces fit

```
chat site ── content script ──► background service worker (Engine: keys, vault, hashing, signing)
                                   ▲  chrome.runtime messages
                                   └── side panel (React) – approval card, X-ray, receipts, tests, Coach
```

- Memories are encrypted per item under their own AES-GCM key. **Forget** deletes the key, keeps the ciphertext (now unreadable) and writes a tombstone.
- A receipt records commitments (never content), prompt/answer/memory-block hashes, a Merkle root, trust tier 0, a signature and an anchor. Model and parameters are marked unverified/dropped.
- The Verify page and the in-panel Verify button recompute everything in the browser. No server calls.
- Hackathon shortcut from the guide is used: wallet-less demo key + client-side AES-GCM (Lit Protocol and wallet signing are drop-in replacements behind `src/core/crypto.ts` / `engine.ts`).

## Honest limits (also on the site)

Plica will not supply a deleted memory again, but cannot erase copies the chat provider already holds, and cannot prove which model answered. A signature proves who signed, not that the content is true.

## Known limits of this build

- MV3 service workers can be suspended; an approval left pending across a worker restart is dropped (treated as Skip, nothing is inserted).
- The demo's "Open in Verify page" link carries the receipt in the URL **fragment**, which browsers never send to a server.
- Fonts (Manrope, Instrument Serif, JetBrains Mono) load from Google Fonts on the website only; the extension panel uses system fonts and makes no network requests.
