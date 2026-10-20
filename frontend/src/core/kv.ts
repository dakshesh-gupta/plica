/** Tiny async key-value store. In-memory for the demo/tests; chrome.storage.local in the extension. */
export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryKV implements KV {
  private m = new Map<string, string>();
  async get<T>(key: string): Promise<T | undefined> {
    const v = this.m.get(key);
    return v === undefined ? undefined : (JSON.parse(v) as T);
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.m.set(key, JSON.stringify(value));
  }
  async remove(key: string): Promise<void> {
    this.m.delete(key);
  }
}

export class ChromeKV implements KV {
  async get<T>(key: string): Promise<T | undefined> {
    const r = await chrome.storage.local.get(key);
    return r[key] as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }
  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }
}
