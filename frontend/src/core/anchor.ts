import { sha256Hex } from './crypto';
import type { ReceiptAnchor } from './types';

/**
 * Anchoring. Hackathon default is SIMULATED: a deterministic pseudo-transaction hash derived from the receipt,
 * so any verifier can recompute it. Flip ANCHOR_CONFIG.mode to 'testnet' and fill in the contract once
 * ProvenanceRegistry is deployed; the UI always says which mode is active.
 */
export const ANCHOR_CONFIG = {
  mode: 'simulated' as 'simulated' | 'testnet',
  chain: 'Base Sepolia',
  contract: '0x0000000000000000000000000000000000000000',
  explorerTx: 'https://sepolia.basescan.org/tx/',
  explorerAddress: 'https://sepolia.basescan.org/address/',
};

export function anchorLabel(a: ReceiptAnchor): string {
  return a.mode === 'simulated' ? `${a.chain} (simulated)` : a.chain;
}

export async function simulatedTxHash(receiptId: string, signature: string, timestamp: string): Promise<string> {
  return sha256Hex(`plica-anchor|${receiptId}|${signature}|${timestamp}`);
}

export async function makeAnchor(receiptId: string, signature: string, now = new Date()): Promise<ReceiptAnchor> {
  const timestamp = now.toISOString();
  return {
    chain: ANCHOR_CONFIG.chain,
    mode: ANCHOR_CONFIG.mode,
    contract: ANCHOR_CONFIG.contract,
    txHash: await simulatedTxHash(receiptId, signature, timestamp),
    timestamp,
  };
}

export async function makeTombstoneTx(commitment: string, now = Date.now()): Promise<string> {
  return sha256Hex(`plica-tombstone|${commitment}|${now}`);
}

export function txUrl(a: { txHash: string }): string {
  return ANCHOR_CONFIG.explorerTx + a.txHash;
}
export function shortHash(h: string, n = 6): string {
  return h.length > 2 * n + 2 ? `${h.slice(0, n + 2)}…${h.slice(-n)}` : h;
}
