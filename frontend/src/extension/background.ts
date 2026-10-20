// MV3 service worker: owns keys, hashing, signing and the vault. The panel and content script talk to it by message.
import { Engine } from '../core/engine';
import { ChromeKV } from '../core/kv';
import { SITE_ID, APPROVAL_TIMEOUT_MS, hostMatches } from './config';
import type { AnswerReply, InterceptReply, ToBackground } from './messages';
import { badgeStatusFromReport } from '../core/verify';

const engine = new Engine(new ChromeKV(), { site: SITE_ID });
const waiters = new Map<string, (r: { approvedIds: string[]; contextBlock: string; skipped: boolean }) => void>();

engine.subscribe((state) => {
  chrome.runtime.sendMessage({ t: 'state', state }).catch(() => undefined); // no panel open is fine
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => undefined);
});

async function handle(msg: ToBackground, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.t) {
    case 'rpc': {
      if (msg.method === 'subscribe' || msg.method.startsWith('_')) throw new Error('Not allowed');
      const fn = (engine as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[msg.method];
      if (typeof fn !== 'function') throw new Error('Unknown method ' + msg.method);
      const result = await fn.apply(engine, msg.args);
      if (msg.method === 'resolve') {
        const id = msg.args[0] as string;
        const w = waiters.get(id);
        if (w) {
          waiters.delete(id);
          const r = result as { approvedIds: string[]; contextBlock: string };
          w({ ...r, skipped: msg.args[1] === null });
        }
      }
      return { result };
    }
    case 'intercept': {
      const proposal = await engine.propose(msg.prompt, SITE_ID);
      if (proposal.status !== 'pending') return { proposalId: proposal.id, decision: 'none' } satisfies InterceptReply;
      const decided = await new Promise<{ approvedIds: string[]; contextBlock: string; skipped: boolean } | null>((resolve) => {
        waiters.set(proposal.id, resolve);
        setTimeout(() => {
          if (waiters.delete(proposal.id)) resolve(null);
        }, APPROVAL_TIMEOUT_MS);
      });
      if (!decided) {
        await engine.resolve(proposal.id, null); // timeout counts as Skip: nothing is inserted
        return { proposalId: proposal.id, decision: 'timeout' } satisfies InterceptReply;
      }
      const keyUnavailable = !decided.skipped && decided.approvedIds.length === 0; // approved, but every key was destroyed meanwhile
      return { proposalId: proposal.id, decision: decided.skipped || !decided.approvedIds.length ? 'skipped' : 'approved', contextBlock: decided.contextBlock, keyUnavailable } satisfies InterceptReply;
    }
    case 'answer': {
      const run = await engine.complete(msg.proposalId, { answer: msg.answer, model: msg.model });
      const report = await engine.verifyRun(run.id);
      return { ok: true, runId: run.id, receiptId: run.receipt.receiptId, status: badgeStatusFromReport(report) } satisfies AnswerReply;
    }
    case 'open-panel': {
      if (msg.runId) await chrome.storage.session.set({ focusRun: { id: msg.runId, at: Date.now() } });
      if (sender.tab?.id !== undefined) await chrome.sidePanel.open({ tabId: sender.tab.id });
      return { ok: true };
    }
    case 'site-status': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return { supported: hostMatches(tab?.url) };
    }
  }
}

chrome.runtime.onMessage.addListener((msg: ToBackground, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object' || !('t' in msg)) return false;
  if ((msg as { t: string }).t === 'state') return false;
  handle(msg, sender)
    .then(sendResponse)
    .catch((e: Error) => sendResponse({ error: e.message, decision: 'error', ok: false }));
  return true; // async response
});
