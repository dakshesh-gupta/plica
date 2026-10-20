import type { Run } from './types';

function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** The payload lives in the URL fragment, so it is never sent to any server. */
export function encodeShare(data: { receipt: unknown; prompt?: string; answer?: string; memoryBlock?: string }): string {
  return toB64Url(JSON.stringify(data));
}
export function decodeShare(s: string): { receipt: unknown; prompt?: string; answer?: string; memoryBlock?: string } | null {
  try {
    return JSON.parse(fromB64Url(s));
  } catch {
    return null;
  }
}
export function verifyHref(base: string, run: Run): string {
  return `${base}#/verify?s=${encodeShare({ receipt: run.receipt, prompt: run.prompt, answer: run.answer, memoryBlock: run.memoryBlock })}`;
}
