# Plica 🔐

### Every AI answer comes with a receipt: what it ran on, and what it remembered about you.

**Plica is a user-sovereign AI memory and provenance layer that makes AI interactions more transparent, privacy-preserving, and reproducible using Web3.**

Plica introduces a **Memory-Aware Provenance Receipt** for AI-generated answers, creating a verifiable record of the model, parameters, inputs, execution environment, outputs, and memory items that influenced a response — without exposing the actual contents of private memories.

Our mission is simple: **make AI accountable, reproducible, and controlled by its users.**

---

## 🚨 The Problem

Modern AI systems face three fundamental challenges:

- **Lack of reproducibility:** Model versions, prompts, datasets, and parameters can change silently, making AI outputs difficult to verify or reproduce.
- **Uncontrolled AI memory:** Users have limited control over what AI remembers, how long it is retained, and whether it can truly be deleted.
- **No memory provenance:** There is no reliable audit trail showing which memories influenced a particular AI-generated answer.

Plica addresses these challenges by combining AI memory management, cryptographic verification, and Web3-based provenance into one unified system.

## 💡 Our Solution

Plica provides two core capabilities:

### 1. Memory Vault

A privacy-focused memory management system that gives users control over how AI agents access and retain their information.

- **User-controlled consent:** Obtain explicit authorization before saving memories.
- **Scoped memory access:** Allow agents to access only memories permitted for a specific purpose.
- **Retention policies:** Define expiration times, usage limits, and access scopes.
- **Cryptographic deletion:** Destroy or revoke encryption keys so deleted memory ciphertext becomes unreadable.
- **Memory X-ray:** Inspect which memory items influenced an AI response.
- **Time-travel audit:** Track memory history and changes through versioned cryptographic commitments.
- **Emergency revocation:** Revoke access permissions and keys for an application or the entire vault.

### 2. Memory-Aware Provenance Receipts

Every tracked AI execution can produce a signed receipt containing verifiable metadata about how the output was generated.

A receipt can include:

- Experiment or execution ID
- Model identifier and version
- Generation parameters and random seed
- Prompt and input hashes
- Execution environment and dependency metadata
- Cryptographic commitments to memory items used
- Output and log hashes
- Trust tier and available attestations
- Digital signature and blockchain anchor

**Privacy by design:** Receipts record cryptographic commitments to memory items rather than exposing their contents.

These receipts help users and researchers inspect, verify, and reproduce AI executions to the extent supported by the model and execution environment.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🔏 Memory Vault | Encrypted storage and user-controlled memory access |
| 🧾 Provenance Receipts | Signed records of AI execution metadata |
| 🧠 Memory X-ray | Identify the memories associated with an AI response |
| 🗑️ Cryptographic Forgetting | Revoke or destroy encryption keys to make stored ciphertext unreadable |
| 🔍 Reproducibility Explorer | Inspect experiment metadata and verify execution records |
| 🪪 Decentralized Identity | Support wallet-based identity and digital signatures |
| ⏳ Scoped Delegation | Grant purpose-limited, time-bound access to AI agents |
| 🛡️ Trust Tiers | Distinguish self-attested records from hardware-attested and verifiable-compute approaches |
| 🔄 Drift Detection | Compare current model behavior with previously recorded executions |
| 🔌 MCP Integration | Enable integration with compatible AI assistants through a Model Context Protocol server |

*These features describe the project vision; availability depends on the current implementation.*

---

## 🏗️ System Architecture

Plica is designed as a modular system connecting AI execution, encrypted memory, cryptographic verification, and decentralized infrastructure.

```text
                ┌──────────────────────────┐
                │     User / Researcher    │
                │      Wallet + DID        │
                └────────────┬─────────────┘
                             │
                ┌────────────▼─────────────┐
                │        Plica SDK         │
                │     Python / JS / MCP    │
                └────────────┬─────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
   ┌──────────▼──────────┐      ┌───────────▼──────────┐
   │    Memory Vault     │      │   AI Agent / LLM     │
   │ Encryption & Access │      │   Model Execution    │
   └──────────┬──────────┘      └───────────┬──────────┘
              │                             │
              └──────────────┬──────────────┘
                             │
                ┌────────────▼─────────────┐
                │  Provenance Receipt      │
                │ Metadata + Memory Proofs │
                └────────────┬─────────────┘
                             │
                ┌────────────▼─────────────┐
                │     Verification Layer   │
                │ Smart Contracts + Hashes │
                └────────────┬─────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
   ┌──────────▼──────────┐      ┌───────────▼──────────┐
   │ Off-chain Storage   │      │ Dashboard & Explorer │
   │ Encrypted Data      │      │ Audit & Verification │
   └─────────────────────┘      └──────────────────────┘
```

### Architecture principles

- Store sensitive memory content off-chain in encrypted form.
- Use blockchain storage for hashes, commitments, policy references, and timestamps rather than raw private memories.
- Use wallet signatures and decentralized identifiers to establish authorization and provenance.
- Keep memory access scoped, revocable, and auditable.
- Separate claims made by a system from guarantees backed by independent verification.

---

## 🛠️ Technology Stack

Plica's proposed technology stack includes:

| Layer | Technologies |
|---|---|
| Blockchain | EVM-compatible Layer 2 networks such as Base, Optimism, or Arbitrum |
| Smart Contracts | Solidity, Foundry or Hardhat |
| Identity | DIDs, SIWE, ENS, wallet signatures |
| Storage | IPFS, Pinata, web3.storage, Arweave |
| Encryption | AES-GCM, threshold key management, Lit Protocol |
| AI Models | Llama, Mistral, Qwen, Ollama, vLLM |
| AI Integration | Python, JavaScript/TypeScript, MCP |
| Memory Frameworks | LangChain, LlamaIndex |
| Backend | Python, FastAPI |
| Frontend | Next.js or SvelteKit |
| Verification | Cryptographic hashes, Merkle trees, digital signatures |
| Advanced Verification | AWS Nitro Enclaves, Intel TDX, zkML and verifiable compute |

*The final stack may vary as the implementation evolves.*

---

## 🔐 How It Works

A typical Plica workflow follows these steps:

1. **Authorize memory:** The user explicitly approves a memory before it is saved.
2. **Encrypt and store:** The memory is encrypted, with its access policy and encryption key managed separately from its ciphertext.
3. **Request access:** An AI agent requests relevant memories for a specific purpose and scope.
4. **Validate permissions:** The memory system checks authorization, expiration, and usage limits before releasing permitted data.
5. **Generate a response:** The AI model uses the authorized context to produce an answer.
6. **Create a receipt:** The SDK records execution metadata and cryptographic commitments to the memories used.
7. **Anchor and verify:** The signed manifest can be stored off-chain and its cryptographic reference anchored on-chain.
8. **Inspect or forget:** The user can inspect memory influence, revoke access, or initiate cryptographic deletion.

The resulting receipt provides an audit trail connecting an AI answer to its execution metadata and the memory commitments associated with it.

---

## 📜 Smart Contract Design

The proposed smart contract architecture consists of the following components:

### `ProvenanceRegistry`

Registers experiment manifests, signatures, trust tiers, and replication records.

### `MemoryVault`

Maintains memory commitments, access grants, revocations, and deletion tombstones.

### `PolicyEngine`

Supports memory retention rules, expiration, usage limits, and access policies.

### `VerifierRegistry`

Supports independent verification, verifier reputation, and potential replication incentives.

### `AttestationVerifier`

Validates supported trusted-execution-environment attestations.

---

## 🧪 Reproducibility and Trust

AI systems do not always produce identical outputs. Plica therefore distinguishes different levels of reproducibility and verification.

| Trust tier | Approach |
|---|---|
| Tier 0 | Self-attested execution manifest signed by the experimenter or agent |
| Tier 1 | Execution supported by trusted execution environment attestation |
| Tier 2 | Advanced verifiable-compute or zero-knowledge ML techniques, where supported |

Plica can support multiple reproducibility modes:

- **Exact:** Compare output hashes when deterministic execution is achievable.
- **Tolerant:** Compare outputs using defined metrics and tolerances.
- **Observational:** Record provider metadata and monitor behavior changes for hosted models.

A reproducibility score can communicate the strength of a match without incorrectly treating every execution as a simple pass or fail.

---

## 🛡️ Security and Privacy

Plica is designed around user control, data minimization, and verifiable claims.

- **Encrypted memory:** Keep sensitive memory content off-chain and encrypted.
- **Minimal on-chain data:** Use cryptographic commitments instead of publishing raw memories or tags.
- **Scoped permissions:** Limit memory access by purpose, expiration, and usage count.
- **Cryptographic forgetting:** Destroy or revoke the relevant encryption key to make ciphertext unreadable.
- **Auditable deletion:** Preserve a tombstone or commitment that records the deletion event without revealing the deleted content.
- **Verifiable provenance:** Use hashes, signatures, and optional attestations to support verification.

### Important limitations

Blockchain records alone do not prove that every recorded claim is true. Self-attested receipts depend on the honesty of their issuer, and stronger guarantees require trusted execution or suitable verifiable-compute mechanisms.

Cryptographic deletion does not automatically erase plaintext copies, backups, or data retained independently by an AI provider. Plica must clearly distinguish key destruction from complete deletion across every system.

---

## 🗺️ Roadmap

### Phase 1 — Core Prototype
- [ ] Encrypted Memory Vault
- [ ] Scoped memory recall and revocation
- [ ] Provenance SDK and signed receipts
- [ ] On-chain provenance registry
- [ ] Memory X-ray interface
- [ ] Receipt verification page

### Phase 2 — AI Integrations
- [ ] Model Context Protocol (MCP) server
- [ ] LangChain and LlamaIndex adapters
- [ ] Reproducibility Explorer
- [ ] Experiment identifiers and shareable receipts
- [ ] Model drift detection

### Phase 3 — Stronger Verification
- [ ] Trusted execution environment attestations
- [ ] Independent experiment replication
- [ ] Reproducibility scoring
- [ ] Enhanced deletion audit reports

### Phase 4 — Ecosystem
- [ ] Portable cross-model memory standard
- [ ] Verifiable compute for supported models
- [ ] Decentralized verifier network
- [ ] Enterprise audit and compliance tooling

*Roadmap items are planned milestones, not claims of currently completed functionality.*

---

## 🚀 Getting Started

Plica's SDK and deployment instructions should be added here as the repository implementation becomes available.

### Prerequisites

Depending on the modules you intend to run, development may require:

- Node.js and npm
- Python
- A compatible EVM wallet and test network
- Access to an AI model or inference provider
- An IPFS-compatible storage provider
- Environment variables for configured services

### Installation

Clone the repository:

```bash
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_REPOSITORY_NAME>
```

Install dependencies according to the package manager and instructions for the relevant project module.

> **Note:** Replace the placeholders above with your repository URL and name, and add the actual setup commands once the project structure is finalized.

---

## 🎯 Use Cases

### AI Assistants
Let users inspect which memories influenced an answer and control future memory access.

### AI Research and Reproducibility
Record model configurations, inputs, environment metadata, and outputs to make experiments easier to audit and reproduce.

### Privacy-Conscious Applications
Implement consent-based memory retention, scoped access, and cryptographic deletion workflows.

### Research Publications
Provide verifiable execution records that can accompany papers, datasets, and model cards.

### Enterprise AI Governance
Support auditable records of AI execution and memory usage for internal governance and compliance workflows.

---

## 🌍 Vision

Plica envisions a future where AI systems do not ask users to trust them blindly.

Every answer should have a verifiable history. Every memory should have an explicit purpose and access policy. Every user should have meaningful control over what an AI system can remember.

By connecting AI reproducibility, privacy-preserving memory, and Web3 verification, Plica aims to establish a foundation for **transparent, accountable, and user-sovereign AI**.

---

## 🤝 Contributing

Contributions, ideas, feedback, and collaborations are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes and add appropriate tests.
4. Submit a pull request describing your contribution.

Please follow the repository's contribution guidelines when available.

---

## 📄 License

A license has not yet been specified. Add a `LICENSE` file before distributing the project under an open-source license.

---

## 💬 Contact

For questions, suggestions, or collaboration opportunities, open an issue or discussion in this repository.

---

**Plica — Your memory. Your AI. Your proof.** 🔐s on the website only; the extension panel uses system fonts and makes no network requests.
