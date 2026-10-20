import type { PlicaApi, PlicaState } from '../core/types';

/** Panel-side proxy: every PlicaApi call becomes a message to the background service worker, which owns the vault and keys. */
export function createRemoteEngine(): PlicaApi {
  const listeners = new Set<(s: PlicaState) => void>();
  chrome.runtime.onMessage.addListener((m) => {
    if (m?.t === 'state') listeners.forEach((l) => l(m.state as PlicaState));
  });
  const call = async (method: string, args: unknown[]) => {
    const r = await chrome.runtime.sendMessage({ t: 'rpc', method, args });
    if (r?.error) throw new Error(r.error);
    return r?.result;
  };
  const api = new Proxy({} as PlicaApi, {
    get(_t, prop: string) {
      if (prop === 'subscribe') {
        return (cb: (s: PlicaState) => void) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        };
      }
      return (...args: unknown[]) => call(prop, args);
    },
  });
  return api;
}
