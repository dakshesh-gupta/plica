import type { PlicaApi, PlicaState, TimelineEvent } from '../core/types';
import { rel, useNow } from './hooks';
import { Icon, type IconName } from './icons';
import { Empty, Chip } from './ui';
import { VerifyBadge } from './VerifyBadge';
import { shortHash } from '../core/anchor';

const EV: Record<TimelineEvent['kind'], { icon: IconName; label: string }> = {
  saved: { icon: 'lock', label: 'Memory saved' },
  approved: { icon: 'check', label: 'Approved' },
  skipped: { icon: 'x', label: 'Skipped' },
  receipt: { icon: 'receipt', label: 'Receipt' },
  forgot: { icon: 'tomb', label: 'Forgotten' },
  coach: { icon: 'spark', label: 'Coach' },
  edited: { icon: 'edit', label: 'Edited' },
  tests: { icon: 'flask', label: 'Tests' },
};

export function ReceiptsTab({ state, api, onOpen }: { state: PlicaState; api: PlicaApi; onOpen: (runId: string) => void }) {
  const now = useNow();
  return (
    <div className="pl-stack">
      <div className="pl-sectitle"><h3>Receipts</h3><span className="pl-faint">{state.runs.length}</span></div>
      {state.runs.length === 0 ? (
        <Empty icon="receipt" title="No receipts yet">Every answer gets one signed receipt. Ask a question to get your first.</Empty>
      ) : (
        <ul className="pl-list">
          {state.runs.map((r) => (
            <li key={r.id} className="pl-card pl-rcard">
              <div className="pl-rcard__top">
                <code>{r.receipt.receiptId}</code>
                <span className="pl-faint">{rel(r.createdAt, now)}</span>
              </div>
              <p>“{r.prompt.length > 80 ? r.prompt.slice(0, 80) + '…' : r.prompt}”</p>
              <div className="pl-row pl-row--wrap">
                <Chip icon="brain">{r.usedIds.length} supplied</Chip>
                <Chip>{r.excluded.length} excluded</Chip>
                <span className="pl-spacer" />
                <VerifyBadge api={api} run={r} onClick={() => onOpen(r.id)} />
              </div>
              <small className="pl-faint">{r.receipt.memoryCommitments.map((c) => shortHash(c, 3)).join(' · ') || 'no commitments'}</small>
            </li>
          ))}
        </ul>
      )}

      <div className="pl-sectitle"><h3>Timeline</h3></div>
      {state.events.length === 0 ? (
        <p className="pl-faint">Nothing has happened yet.</p>
      ) : (
        <ol className="pl-timeline">
          {state.events.slice(0, 40).map((e) => (
            <li key={e.id} className={`pl-timeline__item pl-timeline__item--${e.kind}`}>
              <span className="pl-timeline__dot"><Icon name={EV[e.kind].icon} size={12} /></span>
              <div>
                <b>{EV[e.kind].label}</b>
                {e.kind === 'receipt' && e.ref ? <button className="pl-linkbtn" onClick={() => onOpen(e.ref!)}>open</button> : null}
                <p>{e.text}</p>
                <small className="pl-faint">{rel(e.ts, now)}</small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
