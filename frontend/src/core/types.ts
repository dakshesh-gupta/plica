export type Scope = 'personal' | 'work' | 'style';
export type Sensitivity = 'none' | 'health' | 'finance';

/** Everything inside the encrypted blob of one memory item. */
export interface MemoryPayload {
  content: string;
  scope: Scope;
  tags: string[];
  sensitivity: Sensitivity;
  expiresAt: number | null;
  maxUses: number | null;
  uses: number;
  confirmedAt: number;
  version: number;
}

/** What is persisted (ciphertext + public bookkeeping). Key lives in a separate store. */
export interface StoredItem {
  id: string;
  commitment: string; // 0x… sha256(salt | content)
  salt: string;
  ciphertext: string; // base64(iv | ct)
  createdAt: number;
  status: 'active' | 'forgotten';
  consentSig: string;
  tombstone?: { txHash: string; at: number };
}

/** Decrypted view for the UI. content is undefined once the key is destroyed. */
export interface MemoryView {
  id: string;
  commitment: string;
  status: 'active' | 'forgotten';
  createdAt: number;
  keyAvailable: boolean;
  content?: string;
  scope?: Scope;
  tags?: string[];
  sensitivity?: Sensitivity;
  expiresAt?: number | null;
  maxUses?: number | null;
  uses?: number;
  confirmedAt?: number;
  consentSigned: boolean;
  tombstone?: { txHash: string; at: number };
  expired?: boolean;
}

export interface ReceiptAnchor {
  chain: string;
  txHash: string;
  timestamp: string;
  mode: 'simulated' | 'testnet';
  contract?: string;
}

export interface ReceiptBody {
  version: 'plica.receipt/1';
  receiptId: string;
  createdAt: string;
  model: { name: string; verified: false };
  inputs: { promptHash: string; memoryContextHash: string };
  environment: { extension: string; site: string; browser: string };
  memoryCommitments: string[];
  memoryRoot: string;
  outputs: { answerHash: string };
  trustTier: 0;
  signer: { scheme: 'ecdsa-p256-sha256'; did: string; publicKey: JsonWebKey };
}

export interface Receipt extends ReceiptBody {
  signature: string; // base64 over canonical(body)
  anchor: ReceiptAnchor;
}

export type ExcludedReason = 'out of scope' | 'expired' | 'deleted' | 'max uses reached' | 'skipped by you';

export interface RecallCandidate {
  id: string;
  commitment: string;
  content: string;
  scope: Scope;
  sensitivity: Sensitivity;
}
export interface ExcludedItem {
  id: string;
  commitment: string;
  reason: ExcludedReason;
  detail: string; // e.g. "out of scope: work"
}
export interface RecallResult {
  promptScope: Scope;
  personalIntent: boolean;
  used: RecallCandidate[];
  excluded: ExcludedItem[];
  available: RecallCandidate[];
}

export interface Proposal {
  id: string;
  prompt: string;
  site: string;
  createdAt: number;
  recall: RecallResult;
  status: 'pending' | 'approved' | 'skipped' | 'completed' | 'expired';
  approvedIds: string[];
  contextBlock: string;
}

export interface Highlight {
  start: number;
  end: number;
  commitment: string;
}

export interface Run {
  id: string;
  proposalId: string;
  createdAt: number;
  prompt: string;
  answer: string;
  model: string;
  site: string;
  memoryBlock: string;
  promptScope: Scope;
  personalIntent: boolean;
  usedIds: string[];
  usedCommitments: string[];
  /** Memories used other than style preferences (style items shape every answer, so they don't count as a personalization hit). */
  contentHits: number;
  excluded: ExcludedItem[];
  availableIds: string[];
  highlights: Highlight[];
  receipt: Receipt;
}

export type EventKind = 'saved' | 'approved' | 'skipped' | 'receipt' | 'forgot' | 'coach' | 'edited' | 'tests';
export interface TimelineEvent {
  id: string;
  ts: number;
  kind: EventKind;
  text: string;
  ref?: string;
}

export type SuggestionKind = 'gap' | 'vague' | 'stale' | 'conflict' | 'scope' | 'unused' | 'style';
export type SuggestionActionType = 'add' | 'refine' | 'rescope' | 'confirm' | 'remove';
export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  title: string;
  body: string;
  note?: string;
  action: { type: SuggestionActionType; label: string; memoryIds?: string[]; prefill?: string; scope?: Scope };
}
export interface CoachState {
  score: number;
  components: { hitRate: number; specificity: number; freshness: number; consistency: number };
  suggestions: Suggestion[];
}

export interface PlicaState {
  ready: boolean;
  signer: { did: string; short: string };
  anchorMode: 'simulated' | 'testnet';
  memories: MemoryView[];
  pending: Proposal | null;
  runs: Run[];
  events: TimelineEvent[];
  coach: CoachState;
  tick: number;
}

export interface VerifyCheck {
  id: 'parse' | 'hash' | 'signature' | 'anchor';
  label: string;
  status: 'pass' | 'fail' | 'skipped';
  detail: string;
}
export interface LadderLevel {
  id: 'recorded' | 'hash' | 'signature' | 'execution';
  label: string;
  meaning: string;
  status: 'reached' | 'failed' | 'unavailable' | 'unchecked';
  reason?: string;
}
export interface VerifyReport {
  checks: VerifyCheck[];
  ladder: LadderLevel[];
  ok: boolean;
}

export interface PlicaApi {
  getState(): Promise<PlicaState>;
  subscribe(cb: (s: PlicaState) => void): () => void;
  addMemory(input: { content: string; scope: Scope; tags?: string[]; expiresInDays?: number | null }): Promise<MemoryView>;
  updateMemory(id: string, patch: { content?: string; scope?: Scope; expiresInDays?: number | null }): Promise<void>;
  confirmMemory(id: string): Promise<void>;
  forget(id: string): Promise<void>;
  openMemory(id: string): Promise<{ ok: true; content: string } | { ok: false; error: string }>;
  propose(prompt: string, site?: string): Promise<Proposal>;
  resolve(proposalId: string, approvedIds: string[] | null): Promise<{ contextBlock: string; approvedIds: string[] }>;
  complete(proposalId: string, input: { answer: string; model: string }): Promise<Run>;
  verifyRun(runId: string): Promise<VerifyReport>;
  applySuggestion(id: string, text?: string): Promise<void>;
  dismissSuggestion(id: string): Promise<void>;
  reset(): Promise<void>;
  seedDemo(): Promise<void>;
  seedCoachSamples(): Promise<void>;
}
