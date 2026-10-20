import { createContext, useContext, useEffect, useState } from 'react';
import type { PlicaApi, PlicaState } from '../core/types';

export const ApiContext = createContext<PlicaApi | null>(null);
export function useApi(): PlicaApi {
  const a = useContext(ApiContext);
  if (!a) throw new Error('PlicaApi missing');
  return a;
}

export function usePlicaState(api: PlicaApi): PlicaState | null {
  const [s, setS] = useState<PlicaState | null>(null);
  useEffect(() => {
    let alive = true;
    api.getState().then((x) => alive && setS(x));
    const off = api.subscribe((x) => alive && setS(x));
    return () => {
      alive = false;
      off();
    };
  }, [api]);
  return s;
}

export function rel(ts: number, now = Date.now()): string {
  const d = Math.max(0, now - ts) / 1000;
  if (d < 10) return 'just now';
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
export function useNow(ms = 15000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}
