import { ANCHOR_CONFIG, makeTombstoneTx } from './anchor';
import { computeCoach } from './coach';
import { decryptJson, didFromPublicKey, encryptJson, generateItemKey, generateSigner, newId, randomHex, sha256Hex } from './crypto';
import type { KV } from './kv';
import { buildContextBlock, classifySensitivity, findHighlights, recall } from './recall';
import { buildReceipt, signConsent } from './receipt';
import { verifyReceipt } from './verify';
import type {
  ExcludedItem, EventKind, MemoryPayload, MemoryView, PlicaApi, PlicaState, Proposal, Run, Scope, StoredItem, TimelineEvent, VerifyReport,
} from './types';

const DAY = 86_400_000;
const SENSITIVE_DEFAULT_DAYS = 30;

type Keys = Record<string, JsonWebKey>;

export class Engine implements PlicaApi {
  private kv: KV;
  private site: string;
  private listeners = new Set<(s: PlicaState) => void>();
  private signer!: { privateJwk: JsonWebKey; publicJwk: JsonWebKey; did: string };
  private items: StoredItem[] = [];
  private keys: Keys = {};
  private runs: Run[] = [];
  private events: TimelineEvent[] = [];
  private dismissed: string[] = [];
  private pending: Proposal | null = null;
  private proposals = new Map<string, Proposal>();
  private tick = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private readyP: Promise<void>;

  constructor(kv: KV, opts: { site?: string } = {}) {
    this.kv = kv;
    this.site = opts.site ?? 'demo-chat';
    this.readyP = this.load();
  }

  // ---- plumbing -------------------------------------------------------------
  private async load() {
    this.items = (await this.kv.get<StoredItem[]>('items')) ?? [];
    this.keys = (await this.kv.get<Keys>('keys')) ?? {};
    this.runs = (await this.kv.get<Run[]>('runs')) ?? [];
    this.events = (await this.kv.get<TimelineEvent[]>('events')) ?? [];
    this.dismissed = (await this.kv.get<string[]>('dismissed')) ?? [];
    let s = await this.kv.get<{ privateJwk: JsonWebKey; publicJwk: JsonWebKey }>('signer');
    if (!s) {
      s = await generateSigner();
      await this.kv.set('signer', s);
    }
    this.signer = { ...s, did: await didFromPublicKey(s.publicJwk) };
  }
  private lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(() => this.readyP).then(fn);
    this.chain = run.catch(() => undefined);
    return run;
  }
  private async persist() {
    await this.kv.set('items', this.items);
    await this.kv.set('keys', this.keys);
    await this.kv.set('runs', this.runs.slice(-50));
    await this.kv.set('events', this.events.slice(-200));
    await this.kv.set('dismissed', this.dismissed);
  }
  private log(kind: EventKind, text: string, ref?: string) {
    this.events.push({ id: newId('ev'), ts: Date.now(), kind, text, ref });
  }
  private async commit() {
    await this.persist();
    this.tick++;
    const s = await this.snapshot();
    this.listeners.forEach((l) => l(s));
  }
  subscribe(cb: (s: PlicaState) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private async payloadOf(it: StoredItem): Promise<MemoryPayload | null> {
    const k = this.keys[it.id];
    if (!k || it.status === 'forgotten') return null;
    try {
      return await decryptJson<MemoryPayload>(k, it.ciphertext);
    } catch {
      return null;
    }
  }

  private async view(it: StoredItem): Promise<MemoryView> {
    const p = await this.payloadOf(it);
    const base: MemoryView = {
      id: it.id, commitment: it.commitment, status: it.status, createdAt: it.createdAt,
      keyAvailable: !!p, consentSigned: !!it.consentSig, tombstone: it.tombstone,
    };
    if (!p) return base;
    return { ...base, content: p.content, scope: p.scope, tags: p.tags, sensitivity: p.sensitivity, expiresAt: p.expiresAt, maxUses: p.maxUses, uses: p.uses, confirmedAt: p.confirmedAt, expired: !!p.expiresAt && p.expiresAt < Date.now() };
  }

  private async snapshot(): Promise<PlicaState> {
    const memories = await Promise.all(this.items.map((i) => this.view(i)));
    return {
      ready: true,
      signer: { did: this.signer.did, short: this.signer.did.slice(0, 16) + '…' },
      anchorMode: ANCHOR_CONFIG.mode,
      memories,
      pending: this.pending,
      runs: [...this.runs].reverse(),
      events: [...this.events].reverse(),
      coach: computeCoach(memories, this.runs, this.dismissed),
      tick: this.tick,
    };
  }
  async getState(): Promise<PlicaState> {
    await this.readyP;
    await this.chain;
    return this.snapshot();
  }

  // ---- memories -------------------------------------------------------------
  private async addInternal(input: { content: string; scope: Scope; tags?: string[]; expiresInDays?: number | null }, at = Date.now()): Promise<MemoryView> {
    const content = input.content.trim();
    if (!content) throw new Error('Memory cannot be empty');
    const sensitivity = classifySensitivity(content);
    const days = input.expiresInDays === undefined ? (sensitivity !== 'none' ? SENSITIVE_DEFAULT_DAYS : null) : input.expiresInDays;
    const payload: MemoryPayload = { content, scope: input.scope, tags: input.tags ?? [], sensitivity, expiresAt: days ? at + days * DAY : null, maxUses: null, uses: 0, confirmedAt: at, version: 1 };
    const id = newId('mem');
    const salt = randomHex(8);
    const commitment = await sha256Hex(`${salt}|${content}`);
    const key = await generateItemKey();
    const item: StoredItem = { id, commitment, salt, ciphertext: await encryptJson(key, payload), createdAt: at, status: 'active', consentSig: await signConsent(this.signer.privateJwk, commitment) };
    this.items.push(item);
    this.keys[id] = key;
    this.log('saved', `Saved “${content}” (${input.scope}). Consent signed with ${this.signer.did.slice(0, 14)}…`, id);
    return this.view(item);
  }
  addMemory(input: { content: string; scope: Scope; tags?: string[]; expiresInDays?: number | null }) {
    return this.lock(async () => {
      const v = await this.addInternal(input);
      await this.commit();
      return v;
    });
  }
  updateMemory(id: string, patch: { content?: string; scope?: Scope; expiresInDays?: number | null }) {
    return this.lock(async () => {
      const it = this.items.find((i) => i.id === id);
      const key = this.keys[id];
      if (!it || !key || it.status !== 'active') throw new Error('Key unavailable: this memory was forgotten');
      const p = await decryptJson<MemoryPayload>(key, it.ciphertext);
      const next: MemoryPayload = { ...p, version: p.version + 1 };
      if (patch.scope) next.scope = patch.scope;
      if (patch.expiresInDays !== undefined) next.expiresAt = patch.expiresInDays ? Date.now() + patch.expiresInDays * DAY : null;
      if (patch.content !== undefined && patch.content.trim() !== p.content) {
        next.content = patch.content.trim();
        next.sensitivity = classifySensitivity(next.content);
        next.confirmedAt = Date.now();
        it.salt = randomHex(8);
        it.commitment = await sha256Hex(`${it.salt}|${next.content}`);
        it.consentSig = await signConsent(this.signer.privateJwk, it.commitment);
      }
      it.ciphertext = await encryptJson(key, next);
      this.log('edited', `Updated memory “${next.content}”`, id);
      await this.commit();
    });
  }
  confirmMemory(id: string) {
    return this.lock(async () => {
      const it = this.items.find((i) => i.id === id);
      const key = this.keys[id];
      if (!it || !key) throw new Error('Key unavailable: this memory was forgotten');
      const p = await decryptJson<MemoryPayload>(key, it.ciphertext);
      p.confirmedAt = Date.now();
      it.ciphertext = await encryptJson(key, p);
      this.log('edited', `Confirmed still true: “${p.content}”`, id);
      await this.commit();
    });
  }
  /** Crypto-shredding: destroy the key, keep the ciphertext (now permanently unreadable), anchor a tombstone. */
  forget(id: string) {
    return this.lock(async () => {
      const it = this.items.find((i) => i.id === id);
      if (!it || it.status === 'forgotten') return;
      delete this.keys[id];
      it.status = 'forgotten';
      it.tombstone = { txHash: await makeTombstoneTx(it.commitment), at: Date.now() };
      this.log('forgot', `Forgot a memory. Key destroyed, tombstone anchored for ${it.commitment.slice(0, 10)}…`, id);
      await this.commit();
    });
  }
  openMemory(id: string) {
    return this.lock(async () => {
      const it = this.items.find((i) => i.id === id);
      const key = this.keys[id];
      if (!it || !key || it.status === 'forgotten') return { ok: false as const, error: 'Key unavailable: this memory was forgotten' };
      try {
        const p = await decryptJson<MemoryPayload>(key, it.ciphertext);
        return { ok: true as const, content: p.content };
      } catch {
        return { ok: false as const, error: 'Key unavailable: this memory could not be decrypted' };
      }
    });
  }

  // ---- approved recall + receipts --------------------------------------------
  propose(prompt: string, site = this.site) {
    return this.lock(async () => {
      if (this.pending) this.pending.status = 'expired';
      const inputs = await Promise.all(this.items.map(async (i) => ({ id: i.id, commitment: i.commitment, payload: await this.payloadOf(i) })));
      const rc = recall(prompt, inputs);
      const proposal: Proposal = { id: newId('prop'), prompt, site, createdAt: Date.now(), recall: rc, status: 'pending', approvedIds: [], contextBlock: '' };
      this.proposals.set(proposal.id, proposal);
      if (rc.used.length === 0) {
        proposal.status = 'approved';
        this.pending = null;
      } else {
        this.pending = proposal;
        await this.commit();
      }
      return proposal;
    });
  }
  resolve(proposalId: string, approvedIds: string[] | null) {
    return this.lock(async () => {
      const p = this.proposals.get(proposalId);
      if (!p) throw new Error('Unknown proposal');
      const allowed = new Set(p.recall.used.map((u) => u.id));
      const ids = (approvedIds ?? []).filter((i) => allowed.has(i) && this.keys[i]); // a forgotten key can never be approved
      const chosen = p.recall.used.filter((u) => ids.includes(u.id));
      p.approvedIds = ids;
      p.contextBlock = buildContextBlock(chosen);
      p.status = ids.length ? 'approved' : 'skipped';
      for (const id of ids) {
        const it = this.items.find((i) => i.id === id)!;
        const pl = await decryptJson<MemoryPayload>(this.keys[id], it.ciphertext);
        pl.uses += 1;
        it.ciphertext = await encryptJson(this.keys[id], pl);
      }
      if (this.pending?.id === proposalId) this.pending = null;
      if (p.recall.used.length) this.log(ids.length ? 'approved' : 'skipped', ids.length ? `Approved ${ids.length} memor${ids.length > 1 ? 'ies' : 'y'} for the prompt` : 'Skipped memory insertion for the prompt', proposalId);
      await this.commit();
      return { contextBlock: p.contextBlock, approvedIds: ids };
    });
  }
  complete(proposalId: string, input: { answer: string; model: string }) {
    return this.lock(async () => {
      const p = this.proposals.get(proposalId);
      if (!p) throw new Error('Unknown proposal');
      if (p.status === 'pending') throw new Error('Proposal has not been approved or skipped yet');
      const chosen = p.recall.used.filter((u) => p.approvedIds.includes(u.id));
      const receipt = await buildReceipt({ signer: this.signer, prompt: p.prompt, memoryBlock: p.contextBlock, answer: input.answer, commitments: chosen.map((c) => c.commitment), model: input.model, site: p.site });
      const skipped: ExcludedItem[] = p.recall.used.filter((u) => !p.approvedIds.includes(u.id)).map((u) => ({ id: u.id, commitment: u.commitment, reason: 'skipped by you', detail: 'skipped by you' }));
      const run: Run = {
        id: newId('run'), proposalId, createdAt: Date.now(), prompt: p.prompt, answer: input.answer, model: input.model, site: p.site,
        memoryBlock: p.contextBlock, promptScope: p.recall.promptScope, personalIntent: p.recall.personalIntent,
        usedIds: chosen.map((c) => c.id), usedCommitments: chosen.map((c) => c.commitment), contentHits: chosen.filter((c) => c.scope !== 'style').length,
        excluded: [...p.recall.excluded, ...skipped], availableIds: [...p.recall.available.map((a) => a.id), ...skipped.map((s) => s.id)].filter((id) => !skipped.some((s) => s.id === id)),
        highlights: findHighlights(input.answer, chosen), receipt,
      };
      p.status = 'completed';
      this.runs.push(run);
      this.log('receipt', `Receipt ${receipt.receiptId} issued (${chosen.length} memor${chosen.length === 1 ? 'y' : 'ies'} supplied) and anchored`, run.id);
      await this.commit();
      return run;
    });
  }
  async verifyRun(runId: string): Promise<VerifyReport> {
    await this.getState();
    const r = this.runs.find((x) => x.id === runId);
    if (!r) throw new Error('Unknown run');
    return verifyReceipt(JSON.stringify(r.receipt), { prompt: r.prompt, answer: r.answer, memoryBlock: r.memoryBlock });
  }

  // ---- coach ------------------------------------------------------------------
  async applySuggestion(id: string, text?: string) {
    const state = await this.getState();
    const s = state.coach.suggestions.find((x) => x.id === id);
    if (!s) return;
    const a = s.action;
    if (a.type === 'add') {
      if (!text?.trim()) throw new Error('Write the memory text first');
      await this.addMemory({ content: text, scope: a.scope ?? 'personal' });
    } else if (a.type === 'refine') {
      if (!text?.trim() || !a.memoryIds?.[0]) throw new Error('Write the refined memory first');
      await this.updateMemory(a.memoryIds[0], { content: text });
    } else if (a.type === 'rescope' && a.memoryIds?.[0] && a.scope) await this.updateMemory(a.memoryIds[0], { scope: a.scope });
    else if (a.type === 'confirm' && a.memoryIds?.[0]) await this.confirmMemory(a.memoryIds[0]);
    else if (a.type === 'remove') for (const m of a.memoryIds ?? []) await this.forget(m);
    await this.lock(async () => {
      this.log('coach', `Coach: ${s.title} — ${a.label.toLowerCase()}`, id);
      await this.commit();
    });
  }
  dismissSuggestion(id: string) {
    return this.lock(async () => {
      if (!this.dismissed.includes(id)) this.dismissed.push(id);
      await this.commit();
    });
  }

  // ---- demo helpers -------------------------------------------------------------
  reset() {
    return this.lock(async () => {
      this.items = []; this.keys = {}; this.runs = []; this.events = []; this.dismissed = []; this.pending = null; this.proposals.clear();
      await this.commit();
    });
  }
  seedDemo() {
    return this.lock(async () => {
      this.items = []; this.keys = {}; this.runs = []; this.events = []; this.dismissed = []; this.pending = null; this.proposals.clear();
      await this.addInternal({ content: "I'm vegetarian", scope: 'personal' });
      await this.addInternal({ content: "I'm working on Project X", scope: 'work' });
      await this.addInternal({ content: 'Prefers short answers', scope: 'style' });
      await this.addInternal({ content: 'I train for a 10K on weekends', scope: 'personal' });
      await this.commit();
    });
  }
  seedCoachSamples() {
    return this.lock(async () => {
      const old = Date.now() - 215 * DAY;
      await this.addInternal({ content: 'I live in Delhi', scope: 'personal' }, Date.now() - 40 * DAY);
      await this.addInternal({ content: 'I live in Bangalore', scope: 'personal' });
      await this.addInternal({ content: 'Likes food', scope: 'personal' });
      await this.addInternal({ content: 'Preparing for exams', scope: 'work' }, old);
      await this.commit();
    });
  }

  // ---- test hooks (used by core/tests.ts) ------------------------------------------
  async _peek(id: string) {
    await this.getState();
    return { item: this.items.find((i) => i.id === id)!, key: this.keys[id] as JsonWebKey | undefined };
  }
}
