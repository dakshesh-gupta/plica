import { useCallback, useEffect, useRef, useState } from 'react';
import { canonicalize, generateSigner, sign } from '../../core/crypto';
import { bodyOf } from '../../core/receipt';
import { decodeShare } from '../../core/share';
import type { Receipt, VerifyReport } from '../../core/types';
import { SIGNATURE_NOTE, parseReceipt, verifyReceipt } from '../../core/verify';
import { Icon } from '../../panel/icons';
import { ChecksList, Ladder } from '../../panel/ReceiptDrawer';
import { askDemo, newDemoEngine } from '../components';
import { anchorLabel, shortHash, txUrl } from '../../core/anchor';

interface Sample { json: string; prompt: string; answer: string; memoryBlock: string }

async function makeSample(kind: 'valid' | 'tampered' | 'forged'): Promise<Sample> {
  const e = newDemoEngine('verify-sample');
  await e.addMemory({ content: "I'm vegetarian", scope: 'personal' });
  await e.addMemory({ content: 'Prefers short answers', scope: 'style' });
  const run = await askDemo(e, 'Give me dinner ideas for tonight');
  let receipt: Receipt = run.receipt;
  let answer = run.answer;
  if (kind === 'tampered') answer = answer.replace('three', 'tree'); // one character removed
  if (kind === 'forged') {
    const impostor = await generateSigner();
    receipt = { ...receipt, signature: await sign(impostor.privateJwk, canonicalize(bodyOf(receipt))) };
  }
  return { json: JSON.stringify(receipt, null, 2), prompt: run.prompt, answer, memoryBlock: run.memoryBlock };
}

const REVEAL_MS = 220;

export function Verify({ query }: { query: URLSearchParams }) {
  const [json, setJson] = useState('');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [memoryBlock, setMemoryBlock] = useState('');
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [shown, setShown] = useState(0);
  const [loaded, setLoaded] = useState<string>('');
  const timers = useRef<number[]>([]);

  const load = useCallback((s: Sample, label: string) => {
    setJson(s.json); setPrompt(s.prompt); setAnswer(s.answer); setMemoryBlock(s.memoryBlock); setLoaded(label);
  }, []);

  useEffect(() => {
    const s = query.get('s');
    if (!s) return;
    const d = decodeShare(s);
    if (d) load({ json: JSON.stringify(d.receipt, null, 2), prompt: d.prompt ?? '', answer: d.answer ?? '', memoryBlock: d.memoryBlock ?? '' }, 'Loaded from the extension');
  }, [query, load]);

  // Re-run on every edit. Everything below happens locally in the page.
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    if (!json.trim()) { setReport(null); setShown(0); return; }
    let alive = true;
    const t = window.setTimeout(async () => {
      const r = await verifyReceipt(json, { prompt, answer, memoryBlock });
      if (!alive) return;
      setReport(r); setShown(0);
      timers.current = [1, 2, 3, 4, 5].map((n) => window.setTimeout(() => alive && setShown(n), n * REVEAL_MS));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [json, prompt, answer, memoryBlock]);

  const parsed = json.trim() ? parseReceipt(json) : null;
  const receipt = parsed?.receipt as Receipt | undefined;
  const visible: VerifyReport | null = report && { ...report, checks: report.checks.slice(0, Math.min(shown, 4)) };
  const done = shown >= 5;
  const failed = report?.checks.some((c) => c.status === 'fail');

  return (
    <div className="page page--verify">
      <div className="wrap">
        <header className="phead">
          <div className="tag"><span className="tag__dot" /> Runs in your browser · no request to Plica’s server</div>
          <h1>Verify a <em className="serif">receipt</em></h1>
          <p className="lede">Paste a receipt and its texts. The page recomputes SHA-256 hashes, checks the ECDSA P-256 signature against the signer’s public key and checks the anchor. Demo receipts use a browser-generated key; real receipts use the user’s wallet signature.</p>
        </header>

        <div className="vgrid">
          <section className="glass vin" aria-label="Inputs">
            <div className="vin__btns">
              <button className="pill pill--solid" onClick={async () => load(await makeSample('valid'), 'Valid sample')}><Icon name="check" size={14} /> Load a valid sample</button>
              <button className="pill pill--ghost" onClick={async () => load(await makeSample('tampered'), 'Tampered sample')}><Icon name="alert" size={14} /> Load a tampered sample</button>
              <button className="pill pill--ghost" onClick={async () => load(await makeSample('forged'), 'Forged receipt')}><Icon name="x" size={14} /> Load a forged receipt</button>
            </div>
            {loaded && <p className="vin__loaded"><Icon name="check" size={13} /> {loaded}</p>}
            <label>Receipt JSON
              <textarea className="mono" rows={11} spellCheck={false} value={json} onChange={(e) => { setJson(e.target.value); setLoaded(''); }} placeholder='{ "version": "plica.receipt/1", "receiptId": "rcpt_…", … }' />
            </label>
            <label>Prompt text
              <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="The prompt as you typed it" />
            </label>
            <label>Edit the answer
              <textarea rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="The captured answer text. Change one character and watch Hash verified flip to Failed." />
            </label>
            <details>
              <summary>Memory context block (optional)</summary>
              <textarea className="mono" rows={4} value={memoryBlock} onChange={(e) => setMemoryBlock(e.target.value)} placeholder="[Plica memory context …]" />
            </details>
          </section>

          <section className="glass vout" aria-live="polite" aria-label="Result">
            {!report ? (
              <div className="vout__empty"><Icon name="shield" size={30} /><h3>Waiting for a receipt</h3><p>Load a sample on the left, or paste your own.</p></div>
            ) : (
              <>
                <div className={`verdict ${!done ? 'verdict--run' : failed ? 'verdict--bad' : 'verdict--ok'}`}>
                  {!done ? <span className="pl-spin" /> : failed ? <Icon name="x" size={18} /> : <Icon name="check" size={18} />}
                  <div><b>{!done ? 'Checking…' : failed ? 'Verification failed' : report.ok ? 'Receipt verified' : 'Partly checked'}</b>
                    <small>{!done ? 'Recomputing hashes locally' : failed ? 'At least one check failed. Do not trust this record.' : report.ok ? 'Hash and signature checks passed.' : 'Add the prompt and answer text to complete the hash check.'}</small></div>
                </div>
                <h4 className="vh">Checks</h4>
                {visible && <ChecksList report={visible} />}
                {done && (
                  <>
                    <h4 className="vh">Assurance ladder</h4>
                    <Ladder ladder={report.ladder} />
                    <p className="vnote">{SIGNATURE_NOTE}</p>
                    {receipt?.anchor && (
                      <div className="vanchor">
                        <b>Anchor</b>
                        <span>{anchorLabel(receipt.anchor)}</span>
                        <a href={txUrl(receipt.anchor)} target="_blank" rel="noreferrer">tx {shortHash(receipt.anchor.txHash, 5)} <Icon name="ext" size={11} /></a>
                        {receipt.anchor.mode === 'simulated' && <small>Demo anchor: the hash is recomputed from the receipt, but no real chain was queried and no transaction exists at this link.</small>}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
