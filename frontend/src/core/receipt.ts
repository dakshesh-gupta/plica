import { canonicalize, didFromPublicKey, merkleRoot, newId, sha256Hex, sign, verifySignature } from './crypto';
import { makeAnchor } from './anchor';
import type { Receipt, ReceiptBody } from './types';

export const EXTENSION_VERSION = '0.1.0';

export function bodyOf(r: Receipt | ReceiptBody): ReceiptBody {
  const { signature: _s, anchor: _a, ...body } = r as Receipt;
  return body as ReceiptBody;
}
export function signedMessage(r: Receipt | ReceiptBody): string {
  return canonicalize(bodyOf(r));
}

export async function buildReceipt(args: {
  signer: { privateJwk: JsonWebKey; publicJwk: JsonWebKey };
  prompt: string;
  memoryBlock: string;
  answer: string;
  commitments: string[];
  model: string;
  site: string;
  browser?: string;
}): Promise<Receipt> {
  const did = await didFromPublicKey(args.signer.publicJwk);
  const body: ReceiptBody = {
    version: 'plica.receipt/1',
    receiptId: newId('rcpt'),
    createdAt: new Date().toISOString(),
    model: { name: args.model, verified: false },
    inputs: { promptHash: await sha256Hex(args.prompt), memoryContextHash: await sha256Hex(args.memoryBlock) },
    environment: { extension: EXTENSION_VERSION, site: args.site, browser: args.browser ?? detectBrowser() },
    memoryCommitments: [...args.commitments],
    memoryRoot: await merkleRoot(args.commitments),
    outputs: { answerHash: await sha256Hex(args.answer) },
    trustTier: 0,
    signer: { scheme: 'ecdsa-p256-sha256', did, publicKey: args.signer.publicJwk },
  };
  const signature = await sign(args.signer.privateJwk, canonicalize(body));
  const anchor = await makeAnchor(body.receiptId, signature);
  return { ...body, signature, anchor };
}

export function detectBrowser(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const m = /(Edg|Chrome|Firefox|Safari)\/(\d+)/.exec(ua);
  if (!m) return 'Browser';
  return `${m[1] === 'Edg' ? 'Edge' : m[1]} ${m[2]}`;
}

export async function signConsent(privateJwk: JsonWebKey, commitment: string): Promise<string> {
  return sign(privateJwk, `plica:consent:remember:${commitment}`);
}
export async function checkConsent(publicJwk: JsonWebKey, sig: string, commitment: string) {
  return verifySignature(publicJwk, sig, `plica:consent:remember:${commitment}`);
}
