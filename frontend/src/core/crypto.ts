// All crypto is WebCrypto: SHA-256, ECDSA P-256, AES-GCM. No network, no server.
const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
export function fromHex(h: string): Uint8Array {
  const clean = h.startsWith('0x') ? h.slice(2) : h;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}
export function b64(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
export function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const d = await subtle().digest('SHA-256', enc.encode(text));
  return '0x' + toHex(d);
}

export function randomHex(bytes = 16): string {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));
}
export function newId(prefix: string): string {
  return `${prefix}_${randomHex(6)}`;
}

/** Deterministic JSON: keys sorted recursively. The signed form of a receipt. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k]))
      .join(',') +
    '}'
  );
}

/** Binary Merkle tree over 0x… leaves. Empty set has a fixed root. */
export async function merkleRoot(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return sha256Hex('plica:empty');
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1] ?? level[i];
      next.push(await sha256Hex(a + b));
    }
    level = next;
  }
  return level[0];
}

// ---- Signing (ECDSA P-256) -------------------------------------------------
export async function generateSigner(): Promise<{ publicJwk: JsonWebKey; privateJwk: JsonWebKey }> {
  const pair = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    publicJwk: await subtle().exportKey('jwk', pair.publicKey),
    privateJwk: await subtle().exportKey('jwk', pair.privateKey),
  };
}
export async function sign(privateJwk: JsonWebKey, message: string): Promise<string> {
  const key = await subtle().importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(message));
  return b64(sig);
}
export async function verifySignature(publicJwk: JsonWebKey, signature: string, message: string): Promise<boolean> {
  try {
    const key = await subtle().importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await subtle().verify({ name: "ECDSA", hash: "SHA-256" }, key, unb64(signature) as BufferSource, enc.encode(message));
  } catch {
    return false;
  }
}
export async function didFromPublicKey(publicJwk: JsonWebKey): Promise<string> {
  const h = await sha256Hex((publicJwk.x ?? '') + (publicJwk.y ?? ''));
  return 'did:key:z' + h.slice(2, 26);
}

// ---- Per-item encryption (AES-GCM) -----------------------------------------
export async function generateItemKey(): Promise<JsonWebKey> {
  const k = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return subtle().exportKey('jwk', k);
}
async function importItemKey(jwk: JsonWebKey, usage: KeyUsage): Promise<CryptoKey> {
  return subtle().importKey('jwk', jwk, { name: 'AES-GCM' }, false, [usage]);
}
export async function encryptJson(jwk: JsonWebKey, value: unknown): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await importItemKey(jwk, 'encrypt');
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64(out);
}
export async function decryptJson<T>(jwk: JsonWebKey, blob: string): Promise<T> {
  const all = unb64(blob);
  const key = await importItemKey(jwk, 'decrypt');
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
