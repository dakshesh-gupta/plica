import { useEffect, useState } from 'react';
import type { Proposal } from '../core/types';
import { Icon } from './icons';
import { Btn, ScopeChip } from './ui';

export function ApprovalCard({ proposal, onResolve }: { proposal: Proposal; onResolve: (ids: string[] | null) => void }) {
  const [sel, setSel] = useState<string[]>(proposal.recall.used.map((u) => u.id));
  useEffect(() => setSel(proposal.recall.used.map((u) => u.id)), [proposal.id]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <section className="pl-approval" aria-label="Approve memories for this prompt">
      <header>
        <span className="pl-approval__icon"><Icon name="shield" size={16} /></span>
        <div>
          <b>Plica wants to add {proposal.recall.used.length} memor{proposal.recall.used.length === 1 ? 'y' : 'ies'} to your prompt</b>
          <small title={proposal.prompt}>“{proposal.prompt.length > 70 ? proposal.prompt.slice(0, 70) + '…' : proposal.prompt}”</small>
        </div>
      </header>
      <ul>
        {proposal.recall.used.map((u) => (
          <li key={u.id}>
            <label>
              <input type="checkbox" checked={sel.includes(u.id)} onChange={() => toggle(u.id)} />
              <span className="pl-approval__text">{u.content}</span>
              <ScopeChip scope={u.scope} />
            </label>
            {u.sensitivity !== 'none' && <small className="pl-approval__warn">Sensitive ({u.sensitivity}). Optional, and short retention is recommended.</small>}
          </li>
        ))}
      </ul>
      <footer>
        <Btn kind="primary" icon="check" disabled={!sel.length} onClick={() => onResolve(sel)}>
          Approve{sel.length ? ` (${sel.length})` : ''}
        </Btn>
        <Btn kind="ghost" onClick={() => onResolve(null)}>Skip</Btn>
        <small>Only approved memories are inserted.</small>
      </footer>
    </section>
  );
}
