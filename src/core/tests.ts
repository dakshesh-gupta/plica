import { decryptJson, generateItemKey } from './crypto';
import { Engine } from './engine';
import { MemoryKV } from './kv';
import { stubAnswer } from './stubModel';
import { verifyReceipt } from './verify';
import { generateSigner, sign, canonicalize, b64 } from './crypto';
import { bodyOf } from './receipt';
import type { Receipt } from './types';

export type TestStatus = 'idle' | 'running' | 'pass' | 'fail';
export interface TestDef {
  n: number;
  id: string;
  name: string;
  condition: string;
  group: 'core' | 'coach';
  run: (log: (s: string) => void) => Promise<boolean>;
}
export interface TestResult {
  status: TestStatus;
  log: string[];
  ms?: number;
}

async function freshEngine() {
  return new Engine(new MemoryKV(), { site: 'test-harness' });
}
async function ask(e: Engine, prompt: string, approveAll = true) {
  const p = await e.propose(prompt);
  const r = await e.resolve(p.id, approveAll ? p.recall.used.map((u) => u.id) : []);
  const answer = stubAnswer((r.contextBlock ? r.contextBlock + '\n\n' : '') + prompt);
  const run = await e.complete(p.id, { answer, model: 'Demo model' });
  return { p, r, run };
}

export const CORE_TESTS: TestDef[] = [
  {
    n: 1, id: 'permitted', group: 'core', name: 'Permitted memory', condition: 'It is inserted into the prompt and appears in the receipt',
    async run(log) {
      const e = await freshEngine();
      const m = await e.addMemory({ content: "I'm vegetarian", scope: 'personal' });
      log(`Saved personal memory, commitment ${m.commitment.slice(0, 12)}…`);
      const { r, run } = await ask(e, 'Give me dinner ideas for tonight');
      log(`Context block inserted: ${JSON.stringify(r.contextBlock.split('\n')[1])}`);
      const inPrompt = r.contextBlock.includes("I'm vegetarian");
      const inReceipt = run.receipt.memoryCommitments.includes(m.commitment);
      log(`In prompt: ${inPrompt} · commitment in receipt: ${inReceipt}`);
      return inPrompt && inReceipt;
    },
  },
  {
    n: 2, id: 'scope', group: 'core', name: 'Out-of-scope memory', condition: 'A “work” agent cannot retrieve a “personal” item',
    async run(log) {
      const e = await freshEngine();
      const m = await e.addMemory({ content: "I'm vegetarian", scope: 'personal' });
      const p = await e.propose('What should I focus on for my project today?');
      log(`Prompt scope inferred: ${p.recall.promptScope}`);
      const retrieved = p.recall.used.some((u) => u.id === m.id) || p.recall.available.some((u) => u.id === m.id);
      const ex = p.recall.excluded.find((x) => x.id === m.id);
      log(`Personal memory retrieved: ${retrieved} · excluded as: ${ex?.detail ?? 'n/a'}`);
      return !retrieved && ex?.reason === 'out of scope';
    },
  },
  {
    n: 3, id: 'deleted', group: 'core', name: 'Deleted memory', condition: 'Retrieval fails and decryption fails',
    async run(log) {
      const e = await freshEngine();
      const m = await e.addMemory({ content: "I'm working on Project X", scope: 'work' });
      const before = await e._peek(m.id);
      await e.forget(m.id);
      log('Forgot memory: key destroyed, tombstone written');
      const after = await e._peek(m.id);
      const open = await e.openMemory(m.id);
      log(`Retrieval: ${open.ok ? 'returned content (BAD)' : (open as { error: string }).error}`);
      let decryptFailed = false;
      try {
        await decryptJson(await generateItemKey(), after.item.ciphertext);
      } catch {
        decryptFailed = true;
      }
      log(`Ciphertext still stored (${after.item.ciphertext.length} chars) but decrypt with any other key fails: ${decryptFailed}`);
      const p = await e.propose('What should I focus on for my project today?');
      const stillUsed = p.recall.used.some((u) => u.id === m.id);
      log(`Recall now: ${stillUsed ? 'still supplied (BAD)' : 'excluded: ' + p.recall.excluded.find((x) => x.id === m.id)?.detail}`);
      return !!before.key && !after.key && !open.ok && decryptFailed && !stillUsed;
    },
  },
  {
    n: 4, id: 'tampered', group: 'core', name: 'Tampered answer', condition: 'Changing one character makes hash verification fail',
    async run(log) {
      const e = await freshEngine();
      await e.addMemory({ content: "I'm vegetarian", scope: 'personal' });
      const { run } = await ask(e, 'Give me dinner ideas for tonight');
      const json = JSON.stringify(run.receipt);
      const good = await verifyReceipt(json, { prompt: run.prompt, answer: run.answer });
      log(`Untouched answer: hash ${good.checks.find((c) => c.id === 'hash')!.status}`);
      const tampered = run.answer.replace('three', 'tree');
      const bad = await verifyReceipt(json, { prompt: run.prompt, answer: tampered });
      const h = bad.checks.find((c) => c.id === 'hash')!;
      log(`One character changed (“three” → “tree”): hash ${h.status}`);
      return good.checks.find((c) => c.id === 'hash')!.status === 'pass' && h.status === 'fail';
    },
  },
  {
    n: 5, id: 'fake', group: 'core', name: 'Fake receipt', condition: 'A bad signature or unknown ID fails verification',
    async run(log) {
      const e = await freshEngine();
      await e.addMemory({ content: "I'm vegetarian", scope: 'personal' });
      const { run } = await ask(e, 'Give me dinner ideas for tonight');
      // (a) bad signature: signed by a different key
      const impostor = await generateSigner();
      const forged: Receipt = { ...run.receipt, signature: await sign(impostor.privateJwk, canonicalize(bodyOf(run.receipt))) };
      const a = await verifyReceipt(JSON.stringify(forged), { prompt: run.prompt, answer: run.answer });
      log(`Signed by an impostor key: signature ${a.checks.find((c) => c.id === 'signature')!.status}`);
      // (b) unknown ID: receipt ID not in the registry
      const unknown: Receipt = { ...run.receipt, receiptId: 'rcpt_000000000000' };
      const b = await verifyReceipt(JSON.stringify(unknown), { prompt: run.prompt, answer: run.answer });
      log(`Unknown receipt ID: signature ${b.checks.find((c) => c.id === 'signature')!.status}, anchor ${b.checks.find((c) => c.id === 'anchor')!.status}`);
      // (c) garbage signature bytes
      const garbage: Receipt = { ...run.receipt, signature: b64(new Uint8Array(64)) };
      const c = await verifyReceipt(JSON.stringify(garbage), { prompt: run.prompt, answer: run.answer });
      log(`Garbage signature: ${c.checks.find((x) => x.id === 'signature')!.status}`);
      return a.checks.find((x) => x.id === 'signature')!.status === 'fail' && b.checks.find((x) => x.id === 'anchor')!.status === 'fail' && c.checks.find((x) => x.id === 'signature')!.status === 'fail';
    },
  },
];

export const COACH_TESTS: TestDef[] = [
  {
    n: 6, id: 'coach-gap', group: 'coach', name: 'Gap suggestion', condition: 'A prompt with no memory hit generates a gap suggestion',
    async run(log) {
      const e = await freshEngine();
      await e.addMemory({ content: 'Prefers short answers', scope: 'style' });
      await ask(e, 'Plan my workout for the weekend');
      const s = (await e.getState()).coach.suggestions;
      log(`Suggestions: ${s.map((x) => x.id).join(', ') || 'none'}`);
      return s.some((x) => x.kind === 'gap');
    },
  },
  {
    n: 7, id: 'coach-conflict', group: 'coach', name: 'Conflict card', condition: 'Two contradictory items generate a conflict card',
    async run(log) {
      const e = await freshEngine();
      await e.addMemory({ content: 'I live in Delhi', scope: 'personal' });
      await e.addMemory({ content: 'I live in Bangalore', scope: 'personal' });
      const s = (await e.getState()).coach.suggestions;
      log(`Suggestions: ${s.map((x) => x.kind).join(', ')}`);
      return s.some((x) => x.kind === 'conflict');
    },
  },
  {
    n: 8, id: 'coach-accept', group: 'coach', name: 'Accept raises score', condition: 'Accepting a suggestion raises the score; the new item shows in the next receipt',
    async run(log) {
      const e = await freshEngine();
      await e.addMemory({ content: "I'm vegetarian", scope: 'personal' });
      await e.addMemory({ content: 'Prefers short answers', scope: 'style' });
      await ask(e, 'Give me dinner ideas for tonight');
      const s1 = await e.getState();
      const card = s1.coach.suggestions.find((x) => x.id === 'gap:food-detail');
      if (!card) return false;
      await e.applySuggestion(card.id, 'I dislike mushrooms');
      const added = (await e.getState()).memories.find((m) => m.content === 'I dislike mushrooms')!;
      const { run } = await ask(e, 'Give me dinner ideas for tonight');
      const s2 = await e.getState();
      log(`Score ${s1.coach.score} → ${s2.coach.score}; new commitment in next receipt: ${run.receipt.memoryCommitments.includes(added.commitment)}`);
      return s2.coach.score >= s1.coach.score && run.receipt.memoryCommitments.includes(added.commitment) && !s2.coach.suggestions.some((x) => x.id === 'gap:food-detail');
    },
  },
  {
    n: 9, id: 'coach-dismiss', group: 'coach', name: 'Dismissed stays dismissed', condition: "A dismissed suggestion doesn't reappear",
    async run(log) {
      const e = await freshEngine();
      await e.addMemory({ content: "I'm vegetarian", scope: 'personal' });
      await ask(e, 'Give me dinner ideas for tonight');
      await e.dismissSuggestion('gap:food-detail');
      await ask(e, 'Another dinner idea please');
      const s = (await e.getState()).coach.suggestions;
      log(`After dismissing and asking again: ${s.some((x) => x.id === 'gap:food-detail') ? 'reappeared (BAD)' : 'stays hidden'}`);
      return !s.some((x) => x.id === 'gap:food-detail');
    },
  },
];

export const ALL_TESTS = [...CORE_TESTS, ...COACH_TESTS];

export async function runTest(t: TestDef): Promise<TestResult> {
  const log: string[] = [];
  const t0 = performance.now();
  try {
    const ok = await t.run((s) => log.push(s));
    return { status: ok ? 'pass' : 'fail', log, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    log.push('Error: ' + (e as Error).message);
    return { status: 'fail', log, ms: Math.round(performance.now() - t0) };
  }
}
