// Builds the Chrome extension into ./extension-dist (load it via chrome://extensions → Load unpacked).
//   1. side panel (React, multi-file)   2. content script (IIFE)   3. background service worker (IIFE)
//   4. manifest.json generated from src/extension/selectors.config.json so host permissions never drift.
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'extension-dist');
const cfg = JSON.parse(readFileSync(resolve(root, 'src/extension/selectors.config.json'), 'utf8'));
const site = cfg.sites[cfg.activeSite];

await build({
  root, configFile: false, base: './', plugins: [react()], logLevel: 'warn',
  build: { outDir: out, emptyOutDir: true, rollupOptions: { input: { sidepanel: resolve(root, 'sidepanel.html') } } },
});
for (const [name, entry] of [['content', 'src/extension/content/index.ts'], ['background', 'src/extension/background.ts']]) {
  await build({
    root, configFile: false, logLevel: 'warn',
    build: { outDir: out, emptyOutDir: false, lib: { entry: resolve(root, entry), formats: ['iife'], name: `plica_${name}`, fileName: () => `${name}.js` }, rollupOptions: { output: { inlineDynamicImports: true } } },
  });
}
if (existsSync(resolve(root, 'public/icons'))) cpSync(resolve(root, 'public/icons'), resolve(out, 'icons'), { recursive: true });

const manifest = {
  manifest_version: 3,
  name: 'Plica',
  version: '0.1.0',
  description: 'Every AI answer comes with a receipt: which memories were supplied, and proof they are gone when you forget them.',
  icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  action: { default_title: 'Open Plica', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' } },
  side_panel: { default_path: 'sidepanel.html' },
  background: { service_worker: 'background.js' },
  permissions: ['storage', 'sidePanel'],
  host_permissions: site.matches, // narrow: only the one supported site. No browsing history, no other hosts.
  content_scripts: [{ matches: site.matches, js: ['content.js'], run_at: 'document_idle' }],
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
};
writeFileSync(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Extension built → ${out}\nSupported site: ${site.name} (${site.matches.join(', ')})`);
