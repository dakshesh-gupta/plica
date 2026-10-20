import { Fragment, useMemo, useState } from 'react';
import { shortHash } from '../core/anchor';
import type { MemoryView, PlicaApi, Run, Scope } from '../core/types';
import { rel } from './hooks';
import { Icon } from './icons';
import { Skeleton, Btn, Chip, Empty, ScopeChip } from './ui';

function HighlightedAnswer({ run, hover, setHover }: { run: Run; hover: string | null; setHover: (c: string | null) => void }) {
  const parts = useMemo(() => {
    const out: { text: string; commitment?: string }[] = [];
    let i = 0;
    for (const h of run.highlights) {
      if (h.start > i) out.push({ text: run.answer.slice(i, h.start) });
      out.push({ text: run.answer.slice(h.start, h.end), commitment: h.commitment });
      i = h.end;
    }
    if (i < run.answer.length) out.push({ text: run.answer.slice(i) });
    return out;
  }, [run]);
  return (
    <p className="pl-xr__answer">
      {parts.map((p, i) =>
        p.commitment ? (
          <mark key={i} className={hover === p.commitment ? 'is-hot' : ''} onMouseEnter={() => setHover(p.commitment!)} onMouseLeave={() => setHover(null)}>
            {p.text}
          </mark>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </p>
  );
}

interface CardProps {
  tone: 'used' | 'excluded' | 'available';
  title: string;
  gone?: boolean;
  scope?: Scope;
  chip?: string;
  commitment: string;
  hot?: boolean;
  onHover?: (c: string | null) => void;
  actions?: React.ReactNode;
}
function MemCard({ tone, title, gone, scope, chip, commitment, hot, onHover, actions }: CardProps) {
  return (
    <li className={`pl-xcard pl-xcard--${tone}${hot ? ' is-hot' : ''}`} onMouseEnter={() => onHover?.(commitment)} onMouseLeave={() => onHover?.(null)}>
      <div className="pl-xcard__top">
        <span className="pl-xcard__title">{gone ? <><Icon name="tomb" size={13} /> Forgotten memory</> : title}</span>
        <ScopeChip scope={scope} />
        {chip && <Chip tone={tone === 'used' ? 'ok' : 'neutral'}>{chip}</Chip>}
      </div>
      <code>{shortHash(commitment, 5)}</code>
      {tone === 'used' && <small className="pl-xcard__label">Supplied to the model</small>}
      {actions}
    </li>
  );
}

export function XRay({
  runs, memories, api, runId, onSelectRun, onRegenerate, capturing, onOpenReceipt,
}: {
  runs: Run[]; memories: MemoryView[]; api: PlicaApi; runId?: string; onSelectRun?: (id: string) => void;
  onRegenerate?: (prompt: string) => void; capturing?: boolean; onOpenReceipt?: (id: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const run = runs.find((r) => r.id === runId) ?? runs[0];
  if (!run && !capturing) return <Empty icon="scan" title="Memory X-ray">Ask something on the chat site. After the first answer, you will see which memories were supplied to the model.</Empty>;
  const byId = (id: string) => memories.find((m) => m.id === id);
  const label = (id: string, fallback = '') => byId(id)?.content ?? fallback;

  const forgetAndRegen = async (id: string) => {
    await api.forget(id);
    onRegenerate?.(run!.prompt);
  };

  return (
    <div className="pl-xr">
      <div className="pl-xr__left">
        <div className="pl-xr__head">
          <div>
            <span className="pl-eyebrow">Answer as captured</span>
            {run && <small className="pl-faint">{rel(run.createdAt)}</small>}
          </div>
          {runs.length > 1 && run && (
            <select aria-label="Choose answer" value={run.id} onChange={(e) => onSelectRun?.(e.target.value)}>
              {runs.map((r, i) => <option key={r.id} value={r.id}>{runs.length - i}. {r.prompt.slice(0, 34)}{r.prompt.length > 34 ? '…' : ''}</option>)}
            </select>
          )}
        </div>
        {capturing || !run ? (
          <Skeleton lines={4} />
        ) : (
          <>
            <div className="pl-xr__prompt"><Icon name="chev" size={12} /> {run.prompt}</div>
            <HighlightedAnswer run={run} hover={hover} setHover={setHover} />
            <p className="pl-xr__honest"><Icon name="shield" size={13} /> <span>Highlights show text that matches memories <b>supplied to the model</b>. They do not prove a memory “caused this sentence”.</span></p>
            <div className="pl-row pl-row--wrap">
              <Chip tone="neutral">Model: {run.model} · unverified</Chip>
              <Btn small icon="receipt" onClick={() => onOpenReceipt?.(run.id)}>Open receipt</Btn>
            </div>
          </>
        )}
      </div>

      {run && !capturing && (
        <div className="pl-xr__right">
          <section>
            <h4><i className="dot dot--ok" /> Used <span>{run.usedIds.length}</span></h4>
            {run.usedIds.length === 0 ? <p className="pl-faint pl-xr__none">No memory was supplied to this answer.</p> : (
              <ul>
                {run.usedIds.map((id, i) => {
                  const m = byId(id);
                  const gone = !m?.keyAvailable;
                  return (
                    <MemCard key={id} tone="used" title={label(id)} gone={gone} scope={m?.scope} chip={gone ? 'used · now forgotten' : undefined} commitment={run.usedCommitments[i]} hot={hover === run.usedCommitments[i]} onHover={setHover}
                      actions={!gone && (
                        <div className="pl-xcard__actions">
                          <Btn small kind="danger" icon="refresh" onClick={() => forgetAndRegen(id)} title="Destroy the key, then ask again">{onRegenerate ? 'Forget & regenerate' : 'Forget'}</Btn>
                          <select aria-label="Change scope" value={m?.scope} onChange={(e) => api.updateMemory(id, { scope: e.target.value as Scope })}>
                            <option value="personal">scope: personal</option><option value="work">scope: work</option><option value="style">scope: style</option>
                          </select>
                          <select aria-label="Set expiry" defaultValue="" onChange={(e) => { const v = e.target.value; if (v) api.updateMemory(id, { expiresInDays: v === 'never' ? null : Number(v) }); e.target.value = ''; }}>
                            <option value="" disabled>Set expiry…</option><option value="never">No expiry</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option>
                          </select>
                        </div>
                      )} />
                  );
                })}
              </ul>
            )}
          </section>
          <section>
            <h4><i className="dot" /> Excluded <span>{run.excluded.length}</span></h4>
            {run.excluded.length === 0 ? <p className="pl-faint pl-xr__none">Nothing was excluded.</p> : (
              <ul>
                {run.excluded.map((x) => {
                  const m = byId(x.id);
                  const gone = !m?.keyAvailable;
                  return <MemCard key={x.id} tone="excluded" title={label(x.id)} gone={gone} scope={m?.scope} chip={x.detail} commitment={x.commitment} />;
                })}
              </ul>
            )}
          </section>
          <section>
            <h4><i className="dot dot--dim" /> Available <span>{run.availableIds.length}</span></h4>
            {run.availableIds.length === 0 ? <p className="pl-faint pl-xr__none">Nothing else was available.</p> : (
              <ul>
                {run.availableIds.map((id) => {
                  const m = byId(id);
                  return <MemCard key={id} tone="available" title={label(id)} gone={!m?.keyAvailable} scope={m?.scope} chip="not relevant here" commitment={m?.commitment ?? id} />;
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
