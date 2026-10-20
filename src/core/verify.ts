import { merkleRoot, sha256Hex, verifySignature } from './crypto';
import { simulatedTxHash } from './anchor';
import { signedMessage } from './receipt';
import type { LadderLevel, Receipt, VerifyCheck, VerifyReport } from './types';

export const REQUIRED_FIELDS = ['receiptId', 'inputs.promptHash', 'outputs.answerHash', 'memoryCommitments', 'signer.publicKey', 'signature', 'anchor'] as const;

function get(obj: any, path: string): unknown {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export interface ParseResult {
  ok: boolean;
  receipt?: Receipt;
  missing: string[];
  error?: string;
}
export function parseReceipt(json: string): ParseResult {
  let data: any;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { ok: false, missing: [], error: 'Not valid JSON: ' + (e as Error).message };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, missing: [], error: 'Receipt must be a JSON object.' };
  const missing = REQUIRED_FIELDS.filter((f) => {
    const v = get(data, f);
    return v === undefined || v === null || v === '' || (Array.isArray(v) && f !== 'memoryCommitments');
  });
  if (!Array.isArray(data.memoryCommitments)) missing.push('memoryCommitments' as any);
  const uniq = Array.from(new Set(missing));
  return uniq.length ? { ok: false, missing: uniq, receipt: data } : { ok: true, missing: [], receipt: data as Receipt };
}

export interface VerifyInput {
  prompt?: string;
  answer?: string;
  memoryBlock?: string;
}

const EXEC_REASON = 'Not available. A browser extension cannot see or control the model, so it cannot prove which model or settings ran. That needs a provider-signed receipt or a TEE (roadmap).';

export async function verifyReceipt(json: string, input: VerifyInput): Promise<VerifyReport> {
  const checks: VerifyCheck[] = [];
  const parsed = parseReceipt(json);

  // 1. Parse
  checks.push({
    id: 'parse',
    label: 'Parse',
    status: parsed.ok ? 'pass' : 'fail',
    detail: parsed.ok ? 'All required fields present: receipt ID, prompt hash, answer hash, memory commitments, signer public key, signature, anchor.' : parsed.error ?? `Missing: ${parsed.missing.join(', ')}`,
  });
  if (!parsed.ok || !parsed.receipt) {
    for (const [id, label] of [['hash', 'Hash check'], ['signature', 'Signature check'], ['anchor', 'Anchor check']] as const)
      checks.push({ id, label, status: 'skipped', detail: 'Skipped: the receipt could not be parsed.' });
    return { checks, ladder: ladder(checks, false), ok: false };
  }
  const r = parsed.receipt;

  // 2. Hashes
  const parts: string[] = [];
  let hashFail = false;
  let hashSkipped = false;
  if (input.prompt !== undefined && input.prompt !== '') {
    const ok = (await sha256Hex(input.prompt)) === r.inputs.promptHash;
    parts.push(`prompt hash ${ok ? 'matches' : 'DOES NOT match'}`);
    if (!ok) hashFail = true;
  } else {
    parts.push('prompt text not provided');
    hashSkipped = true;
  }
  if (input.answer !== undefined && input.answer !== '') {
    const ok = (await sha256Hex(input.answer)) === r.outputs.answerHash;
    parts.push(`answer hash ${ok ? 'matches' : 'DOES NOT match'}`);
    if (!ok) hashFail = true;
  } else {
    parts.push('answer text not provided');
    hashSkipped = true;
  }
  if (input.memoryBlock) {
    const ok = (await sha256Hex(input.memoryBlock)) === r.inputs.memoryContextHash;
    parts.push(`memory block ${ok ? 'matches' : 'DOES NOT match'}`);
    if (!ok) hashFail = true;
  }
  const rootOk = (await merkleRoot(r.memoryCommitments)) === r.memoryRoot;
  parts.push(`Merkle root ${rootOk ? 'recomputes' : 'DOES NOT recompute'}`);
  if (!rootOk) hashFail = true;
  checks.push({
    id: 'hash',
    label: 'Hash check',
    status: hashFail ? 'fail' : hashSkipped ? 'skipped' : 'pass',
    detail: parts.join(' · ') + '.',
  });

  // 3. Signature
  const sigOk = await verifySignature(r.signer.publicKey, r.signature, signedMessage(r));
  checks.push({
    id: 'signature',
    label: 'Signature check',
    status: sigOk ? 'pass' : 'fail',
    detail: sigOk ? `ECDSA P-256 signature matches the signer key (${r.signer.did}).` : 'The signature does not match the signer public key and receipt contents.',
  });

  // 4. Anchor
  let anchorOk = false;
  let anchorDetail = '';
  if (r.anchor?.mode === 'simulated') {
    anchorOk = (await simulatedTxHash(r.receiptId, r.signature, r.anchor.timestamp)) === r.anchor.txHash;
    anchorDetail = anchorOk
      ? 'Simulated anchor: transaction hash recomputes from the receipt. No real chain was queried (demo mode).'
      : 'Unknown receipt: the anchor transaction hash does not match this receipt.';
  } else {
    anchorOk = false;
    anchorDetail = 'Testnet registry lookup is not configured in this build. Set the contract address in site.config.ts to enable it.';
  }
  checks.push({ id: 'anchor', label: 'Anchor check', status: anchorOk ? 'pass' : r.anchor?.mode === 'simulated' ? 'fail' : 'skipped', detail: anchorDetail });

  return { checks, ladder: ladder(checks, true), ok: checks.every((c) => c.status !== 'fail') && !hashSkipped };
}

function ladder(checks: VerifyCheck[], parsed: boolean): LadderLevel[] {
  const s = (id: VerifyCheck['id']) => checks.find((c) => c.id === id)?.status;
  const lvl = (st: VerifyCheck['status'] | undefined, prereq = true): LadderLevel['status'] =>
    !prereq ? 'unchecked' : st === 'pass' ? 'reached' : st === 'fail' ? 'failed' : 'unchecked';
  const recorded = lvl(s('parse'));
  const hash = lvl(s('hash'), parsed);
  const signature = lvl(s('signature'), parsed);
  return [
    { id: 'recorded', label: 'Recorded', meaning: 'A receipt exists', status: recorded },
    { id: 'hash', label: 'Hash verified', meaning: "The text wasn't altered after the fact", status: hash },
    { id: 'signature', label: 'Signature verified', meaning: 'The record came from that key holder', status: signature },
    { id: 'execution', label: 'Execution attested', meaning: 'The run happened as described', status: 'unavailable', reason: EXEC_REASON },
  ];
}

export const SIGNATURE_NOTE = 'A signature proves who signed, not that the content is true.';
export const DELETION_LIMIT_NOTE =
  'This proves Plica will not supply the memory again. It does not erase copies already sent to the chat provider or held in its chat history or its own memory feature. Switch off the provider’s built-in memory.';

/** Collapse a report to what the badge near an answer shows. */
export function badgeStatusFromReport(r: VerifyReport): 'anchored' | 'recorded' | 'failed' {
  const f = (id: string) => r.checks.find((c) => c.id === id)?.status;
  if (f('hash') === 'fail' || f('signature') === 'fail' || f('anchor') === 'fail') return 'failed';
  if (f('hash') === 'pass' && f('signature') === 'pass' && f('anchor') === 'pass') return 'anchored';
  return 'recorded';
}
