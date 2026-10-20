const enc = new TextEncoder();

export const utf8 = (s: string) => enc.encode(s);

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, '0');
  return out;
}

export function b64u(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Deterministic JSON: sorted keys, no whitespace. What gets signed. */
export function canonicalize(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  const o = v as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalize(o[k]))
      .join(',') +
    '}'
  );
}

export function uid(prefix: string): string {
  return prefix + '_' + toHex(crypto.getRandomValues(new Uint8Array(5)));
}

export function shortHash(h: string, n = 6): string {
  if (!h) return '';
  const body = h.startsWith('0x') ? h.slice(2) : h;
  return (h.startsWith('0x') ? '0x' : '') + (body.length > n * 2 + 1 ? body.slice(0, n) + '…' + body.slice(-n) : body);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function timeLabel(t: number): string {
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const DAY = 86_400_000;

export function clsx(...a: (string | false | null | undefined)[]): string {
  return a.filter(Boolean).join(' ');
}

export function flipChar(s: string): string {
  if (!s) return 'x';
  const i = Math.floor(s.length / 2);
  const c = s[i];
  const repl = c === 'a' ? 'e' : c === 'A' ? 'E' : /\d/.test(c) ? String((+c + 1) % 10) : 'a';
  return s.slice(0, i) + repl + s.slice(i + 1);
}
