import { useEffect, useState } from 'react';
import { anchorLabel, shortHash, txUrl } from '../core/anchor';
import { DELETION_LIMIT_NOTE, SIGNATURE_NOTE } from '../core/verify';
import { verifyHref } from '../core/share';
import type { LadderLevel, MemoryView, PlicaApi, Run, VerifyReport } from '../core/types';
import { Icon } from './icons';
import { Btn, Chip } from './ui';

export function Ladder({ ladder }: { ladder: LadderLevel[] }) {
  return (
    <ol className="pl-ladder">
      {ladder.map((l) => (
        <li key={l.id} className={`pl-ladder__lvl pl-ladder__lvl--${l.status}`}>
          <span className="pl-ladder__dot">{l.status === 'reached' ? <Icon name="check" size={12} /> : l.status === 'failed' ? <Icon name="x" size={12} /> : l.status === 'unavailable' ? <Icon name="lock" size={11} /> : null}</span>
          <div>
            <b>{l.label}</b>
            <small>{l.meaning}</small>
            {l.status === 'unavailable' && <em>{l.reason}</em>}
          </div>
          <span className="pl-ladder__state">{l.status === 'reached' ? 'Reached' : l.status === 'failed' ? 'Failed' : l.status === 'unavailable' ? 'Not available' : 'Not checked'}</span>
        </li>
      ))}
    </ol>
  );
}

export function ChecksList({ report }: { report: VerifyReport }) {
  return (
    <ul className="pl-checks">
      {report.checks.map((c) => (
        <li key={c.id} className={`is-${c.status}`}>
          <span className="pl-checks__ic">{c.status === 'pass' ? <Icon name="check" size={13} /> : c.status === 'fail' ? <Icon name="x" size={13} /> : <Icon name="clock" size={12} />}</span>
          <div><b>{c.label}</b><small>{c.detail}</small></div>
          <Chip tone={c.status === 'pass' ? 'ok' : c.status === 'fail' ? 'bad' : 'neutral'}>{c.status === 'pass' ? 'Pass' : c.status === 'fail' ? 'Failed' : 'Skipped'}</Chip>
        </li>
      ))}
    </ul>
  );
}

function Row({ k, children, tag }: { k: string; children: React.ReactNode; tag?: React.ReactNode }) {
  return (
    <div className="pl-kv">
      <dt>{k}</dt>
      <dd>{children}{tag}</dd>
    </div>
  );
}

export function ReceiptView({ run, memories, api, verifyBase }: { run: Run; memories: MemoryView[]; api: PlicaApi; verifyBase?: string }) {
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setReport(null), [run.id]);
  const r = run.receipt;
  const json = JSON.stringify(r, null, 2);
  const status = (c: string) => memories.find((m) => m.commitment === c);
  async function verify() {
    setBusy(true);
    await new Promise((x) => setTimeout(x, 350));
    setReport(await api.verifyRun(run.id));
    setBusy(false);
  }
  return (
    <div className="pl-receipt">
      <div className="pl-receipt__hero">
        <div className="pl-anchored"><Icon name="check" size={14} /> Anchored</div>
        <div className="pl-receipt__anchor">
          <span>{anchorLabel(r.anchor)}</span>
          <a className="pl-link" href={txUrl(r.anchor)} target="_blank" rel="noreferrer" title={r.anchor.txHash}>tx {shortHash(r.anchor.txHash, 5)} <Icon name="ext" size={11} /></a>
        </div>
        {r.anchor.mode === 'simulated' && <small className="pl-faint">Simulated anchor for the demo. No real transaction exists at this link.</small>}
      </div>
      <p className="pl-receipt__claim">This receipt claims three things only: what was sent, which memories were <b>supplied to the model</b>, and that the recorded answer has not been altered since. It does not claim which model or settings ran, or that a memory caused a particular sentence.</p>

      <dl className="pl-kvs">
        <Row k="Receipt ID"><code>{r.receiptId}</code></Row>
        <Row k="Model" tag={<Chip tone="warn">Unverified</Chip>}>{r.model.name}</Row>
        <Row k="Parameters" tag={<Chip>Dropped</Chip>}>No access from the page</Row>
        <Row k="Prompt hash"><code title={r.inputs.promptHash}>{shortHash(r.inputs.promptHash, 8)}</code></Row>
        <Row k="Memory context hash"><code title={r.inputs.memoryContextHash}>{shortHash(r.inputs.memoryContextHash, 8)}</code></Row>
        <Row k="Environment">{r.environment.extension} · {r.environment.site} · {r.environment.browser}</Row>
        <Row k="Answer hash"><code title={r.outputs.answerHash}>{shortHash(r.outputs.answerHash, 8)}</code></Row>
        <Row k="Trust tier"><Chip tone="neutral">0 · self-attested</Chip></Row>
        <Row k="Signer"><code title={r.signer.did}>{r.signer.did.slice(0, 22)}…</code></Row>
        <Row k="Signature"><code>{r.signature.slice(0, 18)}…</code></Row>
      </dl>

      <div className="pl-sectitle"><h3>Memory commitments ({r.memoryCommitments.length})</h3></div>
      {r.memoryCommitments.length === 0 ? <p className="pl-faint">No memories were supplied to the model for this answer.</p> : (
        <ul className="pl-commits">
          {r.memoryCommitments.map((c) => {
            const m = status(c);
            return (
              <li key={c}>
                <code title={c}>{shortHash(c, 6)}</code>
                {m?.keyAvailable ? <Chip tone="ok" icon="check">still active</Chip> : <Chip tone="bad" icon="key">forgotten · tombstoned</Chip>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="pl-faint pl-receipt__small">Commitments only, never content or tags. Merkle root <code>{shortHash(r.memoryRoot, 6)}</code>. When a memory is deleted, later receipts show it excluded and earlier receipts still show it used.</p>

      <div className="pl-row pl-row--wrap">
        <Btn kind="primary" icon="shield" onClick={verify} disabled={busy}>{busy ? 'Verifying…' : report ? 'Verify again' : 'Verify'}</Btn>
        <Btn icon="copy" onClick={() => navigator.clipboard?.writeText(json)}>Copy JSON</Btn>
        <Btn icon="download" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `${r.receiptId}.json`; a.click(); }}>Download</Btn>
        {verifyBase !== undefined && <a className="pl-btn pl-btn--ghost" href={verifyHref(verifyBase, run)} target="_blank" rel="noreferrer"><Icon name="ext" size={15} /> Open in Verify page</a>}
      </div>
      {report && (
        <>
          <ChecksList report={report} />
          <Ladder ladder={report.ladder} />
          <p className="pl-note">{SIGNATURE_NOTE}</p>
        </>
      )}
      <p className="pl-note pl-note--limit"><Icon name="alert" size={13} /> {DELETION_LIMIT_NOTE}</p>
    </div>
  );
}

export function ReceiptDrawer({ run, memories, api, onClose, verifyBase }: { run: Run; memories: MemoryView[]; api: PlicaApi; onClose: () => void; verifyBase?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="pl-drawer" role="dialog" aria-label="Receipt">
      <div className="pl-drawer__scrim" onClick={onClose} />
      <aside>
        <header>
          <Icon name="receipt" size={16} />
          <b>Receipt</b>
          <span className="pl-spacer" />
          <button className="pl-iconbtn" onClick={onClose} aria-label="Close receipt"><Icon name="x" size={16} /></button>
        </header>
        <div className="pl-drawer__body"><ReceiptView run={run} memories={memories} api={api} verifyBase={verifyBase} /></div>
      </aside>
    </div>
  );
}
