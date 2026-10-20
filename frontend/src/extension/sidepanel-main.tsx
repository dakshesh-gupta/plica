import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Engine } from '../core/engine';
import { MemoryKV } from '../core/kv';
import type { PlicaApi } from '../core/types';
import { PlicaPanel } from '../panel/PlicaPanel';
import { PLICA_SITE_URL, SITE } from './config';
import { createRemoteEngine } from './remoteEngine';

const inExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
// Outside the extension (npm run dev) the panel runs against a local demo vault so it can be previewed.
const api: PlicaApi = inExtension ? createRemoteEngine() : (() => { const e = new Engine(new MemoryKV(), { site: 'preview' }); e.seedDemo(); return e; })();

function App() {
  const [supported, setSupported] = useState<'supported' | 'unsupported' | 'unknown'>('unknown');
  useEffect(() => {
    if (!inExtension) return;
    const check = () => chrome.runtime.sendMessage({ t: 'site-status' }).then((r) => setSupported(r?.supported ? 'supported' : 'unsupported')).catch(() => setSupported('unknown'));
    check();
    chrome.tabs.onActivated.addListener(check);
    chrome.tabs.onUpdated.addListener(check);
    return () => { chrome.tabs.onActivated.removeListener(check); chrome.tabs.onUpdated.removeListener(check); };
  }, []);
  return <PlicaPanel api={api} siteStatus={inExtension ? supported : 'supported'} supportedSite={SITE.name} verifyBase={PLICA_SITE_URL} demoKey={!inExtension} height="100vh" />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
