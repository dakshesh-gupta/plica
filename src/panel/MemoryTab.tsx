import { useMemo, useState } from 'react';
import { classifySensitivity } from '../core/recall';
import { shortHash, txUrl } from '../core/anchor';
import type { MemoryView, PlicaApi, Scope } from '../core/types';
import { rel } from './hooks';
import { Icon } from './icons';
import { StatusBanner } from './StatusBanner';
import { Btn, Chip, Empty, ScopeChip, Segmented } from './ui';

const EXPIRY: { v: string; label: string; days: number | null }[] = [
  { v: 'never', label: 'No expiry', days: null },
  { v: '7', label: '7 days', days: 7 },
  { v: '30', label: '30 days', days: 30 },
  { v: '90', label: '90 days', days: 90 },
];

export function AddForm({ api, initial = '', initialScope = 'personal', onDone }: { api: PlicaApi; initial?: string; initialScope?: Scope; onDone?: () => void }) {
  const [text, setText] = useState(initial);
  const [scope, setScope] = useState<Scope>(initialScope);
  const [exp, setExp] = useState('never');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sens = useMemo(() => classifySensitivity(text), [text]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const days = EXPIRY.find((x) => x.v === exp)!.days;
      await api.addMemory({ content: text, scope, expiresInDays: exp === 'never' && sens !== 'none' ? undefined : days });
      setText('');
      onDone?.();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="pl-card pl-add" onSubmit={submit}>
      <label className="pl-label" htmlFor="pl-add-text">Add a memory</label>
      <textarea id="pl-add-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={'e.g. "I\'m vegetarian, no mushrooms"'} rows={2} />
      <div className="pl-add__row">
        <Segmented<Scope> value={scope} onChange={setScope} options={[{ v: 'personal', label: 'Personal' }, { v: 'work', label: 'Work' }, { v: 'style', label: 'Style' }]} />
        <select aria-label="Expiry" value={exp} onChange={(e) => setExp(e.target.value)}>
          {EXPIRY.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
      </div>
      {sens !== 'none' && (
        <p className="pl-note pl-note--warn"><Icon name="alert" size={13} /> Looks like {sens} information. Optional, and short retention is recommended; this will expire in 30 days unless you change it.</p>
      )}
      {err && <p className="pl-note pl-note--bad">{err}</p>}
      <div className="pl-add__foot">
        <Btn type="submit" kind="primary" icon="lock" disabled={busy || !text.trim()}>{busy ? 'Signing…' : 'Save & sign'}</Btn>
        <small>Encrypted under its own key. Wallet-signed consent.</small>
      </div>
    </form>
  );
}

function MemoryCard({ m, api }: { m: MemoryView; api: PlicaApi }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content ?? '');
  const [confirm, setConfirm] = useState(false);
  const days = m.expiresAt ? Math.ceil((m.expiresAt - Date.now()) / 86_400_000) : null;
  return (
    <li className="pl-card pl-mem">
      {editing ? (
        <form onSubmit={async (e) => { e.preventDefault(); await api.updateMemory(m.id, { content: draft }); setEditing(false); }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} autoFocus />
          <div className="pl-row"><Btn type="submit" kind="primary" small>Save</Btn><Btn small onClick={() => setEditing(false)}>Cancel</Btn></div>
        </form>
      ) : (
        <p className="pl-mem__text">{m.content}</p>
      )}
      <div className="pl-mem__meta">
        <ScopeChip scope={m.scope} />
        {m.sensitivity && m.sensitivity !== 'none' && <Chip tone="warn" icon="alert">{m.sensitivity}</Chip>}
        {days !== null && <Chip icon="clock" tone={m.expired ? 'bad' : 'neutral'}>{m.expired ? 'expired' : `${days}d left`}</Chip>}
        <Chip icon="eye">{m.uses ?? 0} use{(m.uses ?? 0) === 1 ? '' : 's'}</Chip>
        {m.consentSigned && <Chip tone="ok" icon="check">consent signed</Chip>}
      </div>
      <div className="pl-mem__foot">
        <code title={m.commitment}>{shortHash(m.commitment, 5)}</code>
        <span className="pl-spacer" />
        <select aria-label="Scope" value={m.scope} onChange={(e) => api.updateMemory(m.id, { scope: e.target.value as Scope })}>
          <option value="personal">personal</option><option value="work">work</option><option value="style">style</option>
        </select>
        <select aria-label="Set expiry" defaultValue="" onChange={(e) => { const v = e.target.value; if (v) api.updateMemory(m.id, { expiresInDays: v === 'never' ? null : Number(v) }); e.target.value = ''; }}>
          <option value="" disabled>Expiry…</option>
          {EXPIRY.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <Btn small icon="edit" title="Edit" onClick={() => { setDraft(m.content ?? ''); setEditing(true); }} />
        {confirm ? (
          <>
            <Btn small kind="danger" onClick={() => api.forget(m.id)}>Destroy key</Btn>
            <Btn small onClick={() => setConfirm(false)}>Cancel</Btn>
          </>
        ) : (
          <Btn small kind="danger" icon="trash" onClick={() => setConfirm(true)}>Forget</Btn>
        )}
      </div>
    </li>
  );
}

function ForgottenCard({ m, api }: { m: MemoryView; api: PlicaApi }) {
  const [err, setErr] = useState(false);
  return (
    <li className="pl-card pl-mem pl-mem--gone">
      <div className="pl-row">
        <Icon name="tomb" size={16} />
        <b>Forgotten memory</b>
        <span className="pl-spacer" />
        <Chip tone="bad" icon="key">key destroyed</Chip>
      </div>
      <div className="pl-mem__meta">
        <code title={m.commitment}>{shortHash(m.commitment, 5)}</code>
        {m.tombstone && (
          <a className="pl-link" href={txUrl(m.tombstone)} target="_blank" rel="noreferrer">
            tombstone {shortHash(m.tombstone.txHash, 4)} <Icon name="ext" size={11} />
          </a>
        )}
        <span>{m.tombstone ? rel(m.tombstone.at) : ''}</span>
      </div>
      <div className="pl-row">
        <Btn small icon="lock" onClick={async () => { const r = await api.openMemory(m.id); setErr(!r.ok); }}>Try to decrypt</Btn>
      </div>
      {err && <StatusBanner kind="key" onDismiss={() => setErr(false)} />}
    </li>
  );
}

export function MemoryTab({ memories, api }: { memories: MemoryView[]; api: PlicaApi }) {
  const active = memories.filter((m) => m.status === 'active');
  const gone = memories.filter((m) => m.status === 'forgotten');
  return (
    <div className="pl-stack">
      <AddForm api={api} />
      <div className="pl-sectitle"><h3>Your memories</h3><span className="pl-faint">{active.length} active · {gone.length} forgotten</span></div>
      {active.length === 0 ? (
        <Empty icon="brain" title="No memories yet">Add one above. Plica only ever inserts the ones you approve.</Empty>
      ) : (
        <ul className="pl-list">{active.map((m) => <MemoryCard key={m.id} m={m} api={api} />)}</ul>
      )}
      {gone.length > 0 && (
        <>
          <div className="pl-sectitle"><h3>Forgotten</h3></div>
          <ul className="pl-list">{gone.map((m) => <ForgottenCard key={m.id} m={m} api={api} />)}</ul>
        </>
      )}
    </div>
  );
}
