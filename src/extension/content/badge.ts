// Verification badge + toast rendered in a closed-off shadow root so the chat site's CSS cannot touch them.
export type BadgeState = 'capturing' | 'anchored' | 'recorded' | 'failed' | 'key-error' | 'unsupported';

const CSS = `
:host{all:initial}
.b{display:inline-flex;align-items:center;gap:7px;margin:8px 0 2px;padding:5px 11px 5px 9px;border-radius:99px;font:700 12px/1 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;border:1px solid rgba(143,163,224,.3);background:#0e1322;color:#98a2c3;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.25)}
.b:hover{border-color:#4f8cff}
.b.anchored{color:#3ad29f;border-color:rgba(58,210,159,.45);background:#0b1f1c}
.b.recorded{color:#8db6ff;border-color:rgba(79,140,255,.45);background:#0d1630}
.b.failed,.b.key-error{color:#ff6b7b;border-color:rgba(255,107,123,.5);background:#2a1017}
.b.capturing{cursor:progress}
.sp{width:11px;height:11px;border-radius:50%;border:2px solid rgba(143,163,224,.3);border-top-color:#4f8cff;animation:r .7s linear infinite}
@keyframes r{to{transform:rotate(360deg)}}
svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.t{position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;padding:12px 14px;border-radius:14px;background:#0e1322;color:#e7ebf8;border:1px solid rgba(79,140,255,.5);font:600 13px/1.45 ui-sans-serif,system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.45);display:flex;gap:10px;align-items:flex-start}
.t.err{border-color:rgba(255,107,123,.6)}
.t small{display:block;color:#98a2c3;font-weight:500;margin-top:2px}
.t button{all:unset;cursor:pointer;color:#8db6ff;font-weight:700;margin-top:6px;display:inline-block}
`;
const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3L12 4zM12 10v4M12 17v.5"/></svg>',
};
const LABEL: Record<BadgeState, string> = {
  capturing: 'Plica · capturing answer…',
  anchored: 'Plica · Verified · Anchored',
  recorded: 'Plica · Recorded',
  failed: 'Plica · Verification failed',
  'key-error': 'Key unavailable: this memory was forgotten',
  unsupported: 'Site not supported',
};

function root(host: HTMLElement) {
  const sr = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  if (!sr.querySelector('style')) {
    const st = document.createElement('style');
    st.textContent = CSS;
    sr.appendChild(st);
  }
  return sr;
}

export function mountBadge(after: Element): { set(state: BadgeState, onClick?: () => void): void; el: HTMLElement } {
  const host = document.createElement('plica-badge');
  host.style.display = 'block';
  after.insertAdjacentElement('afterend', host);
  const sr = root(host);
  const btn = document.createElement('button');
  sr.appendChild(btn);
  return {
    el: host,
    set(state, onClick) {
      btn.className = 'b ' + state;
      btn.type = 'button';
      const icon = state === 'capturing' ? '<span class="sp"></span>' : state === 'anchored' ? ICON.check : state === 'recorded' ? ICON.shield : ICON.alert;
      btn.innerHTML = `${icon}<span>${LABEL[state]}</span>`;
      btn.onclick = onClick ?? null;
      btn.title = state === 'anchored' ? 'Open the receipt in the Plica side panel' : LABEL[state];
    },
  };
}

let toastHost: HTMLElement | null = null;
export function toast(title: string, body?: string, opts: { error?: boolean; action?: { label: string; run: () => void }; ms?: number } = {}) {
  toastHost?.remove();
  const host = document.createElement('plica-toast');
  toastHost = host;
  document.documentElement.appendChild(host);
  const sr = root(host);
  const d = document.createElement('div');
  d.className = 't' + (opts.error ? ' err' : '');
  d.innerHTML = `${opts.error ? ICON.alert : ICON.shield}<div><b></b><small></small></div>`;
  (d.querySelector('b') as HTMLElement).textContent = title;
  (d.querySelector('small') as HTMLElement).textContent = body ?? '';
  if (opts.action) {
    const b = document.createElement('button');
    b.textContent = opts.action.label;
    b.onclick = opts.action.run;
    d.querySelector('div')!.appendChild(b);
  }
  sr.appendChild(d);
  if (opts.ms) setTimeout(() => host.remove(), opts.ms);
  return () => host.remove();
}
