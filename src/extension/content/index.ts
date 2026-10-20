// Content script for the ONE supported chat site. All page-specific selectors live in ../selectors.config.json.
import { SITE } from '../config';
import type { AnswerReply, InterceptReply } from '../messages';
import { mountBadge, toast, type BadgeState } from './badge';

const q = (list: string[], root: ParentNode = document): HTMLElement | null => {
  for (const s of list) {
    const el = root.querySelector<HTMLElement>(s);
    if (el) return el;
  }
  return null;
};
const qa = (list: string[]): HTMLElement[] => {
  for (const s of list) {
    const els = Array.from(document.querySelectorAll<HTMLElement>(s));
    if (els.length) return els;
  }
  return [];
};
const send = <T>(msg: unknown): Promise<T> => chrome.runtime.sendMessage(msg) as Promise<T>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let bypass = false; // true while Plica itself re-submits the (approved) prompt
let busy = false;

// ---- composer helpers -------------------------------------------------------------
function composerEl() { return q(SITE.selectors.composer); }
function readComposer(): string {
  const el = composerEl();
  if (!el) return '';
  return (el instanceof HTMLTextAreaElement ? el.value : el.innerText).trim();
}
function writeComposer(text: string) {
  const el = composerEl();
  if (!el) throw new Error('Composer not found. Update selectors.config.json.');
  el.focus();
  if (el instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
  }
}
function submit() {
  const btn = q(SITE.selectors.sendButton) as HTMLButtonElement | null;
  bypass = true;
  if (btn && !btn.disabled) btn.click();
  else composerEl()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  setTimeout(() => (bypass = false), 400);
}

// ---- answer capture ---------------------------------------------------------------
async function captureAnswer(proposalId: string, before: number) {
  const badge = (() => { let b: ReturnType<typeof mountBadge> | null = null; return { get: (el: Element) => (b ??= mountBadge(el)) }; })();
  const started = Date.now();
  let lastText = '';
  let lastChange = Date.now();
  let node: HTMLElement | null = null;
  while (Date.now() - started < SITE.maxAnswerWaitMs) {
    await sleep(300);
    const msgs = qa(SITE.selectors.assistantMessage);
    if (msgs.length <= before) continue;
    node = msgs[msgs.length - 1];
    badge.get(node).set('capturing');
    const text = node.innerText.trim();
    if (text !== lastText) { lastText = text; lastChange = Date.now(); }
    const streaming = !!q(SITE.selectors.stopButton);
    if (text && !streaming && Date.now() - lastChange >= SITE.answerSettleMs) break;
  }
  if (!node || !lastText) return;
  const model = q(SITE.selectors.modelLabel ?? [])?.innerText.trim() || 'Unknown (page-reported)';
  const b = badge.get(node);
  try {
    const r = await send<AnswerReply>({ t: 'answer', proposalId, answer: lastText, model });
    if (!r.ok) throw new Error(r.error);
    b.set(r.status as BadgeState, () => send({ t: 'open-panel', runId: r.runId }));
  } catch (e) {
    b.set('failed');
    toast('Could not record a receipt', (e as Error).message, { error: true, ms: 6000 });
  }
}

// ---- interception -----------------------------------------------------------------
async function handleSend(prompt: string) {
  busy = true;
  const before = qa(SITE.selectors.assistantMessage).length;
  const dismiss = toast('Plica is checking your memories…', 'Nothing is sent until you approve or skip.');
  try {
    const pending = send<InterceptReply>({ t: 'intercept', prompt });
    const hint = setTimeout(() => toast('Waiting for your approval', 'Open the Plica side panel to approve or skip the memories.', { action: { label: 'Open panel', run: () => send({ t: 'open-panel' }) } }), 600);
    const r = await pending;
    clearTimeout(hint);
    dismiss();
    if (r.decision === 'error') throw new Error(r.error ?? 'Plica could not prepare this prompt');
    if (r.keyUnavailable) toast('Key unavailable: this memory was forgotten', 'It was not inserted. Your prompt was sent without it.', { error: true, ms: 6000 });
    if (r.decision === 'approved' && r.contextBlock) writeComposer(`${r.contextBlock}\n\n${prompt}`);
    else if (r.decision === 'timeout') toast('Approval timed out', 'No memories were inserted.', { ms: 4000 });
    await sleep(80);
    submit();
    busy = false; // the next prompt can be intercepted while this answer streams
    if (r.proposalId) await captureAnswer(r.proposalId, before);
  } catch (e) {
    dismiss();
    toast('Plica error', (e as Error).message, { error: true, ms: 6000 });
    submit(); // never block the user's own message
  } finally {
    busy = false;
  }
}

function intercept(e: Event) {
  if (bypass || busy) return;
  const prompt = readComposer();
  if (!prompt) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  handleSend(prompt);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  const c = composerEl();
  if (c && (e.target === c || c.contains(e.target as Node))) intercept(e);
}, true);
document.addEventListener('click', (e) => {
  const btn = q(SITE.selectors.sendButton);
  if (btn && (e.target === btn || btn.contains(e.target as Node))) intercept(e);
}, true);
