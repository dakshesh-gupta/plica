import { useState } from 'react';
import type { CoachState, PlicaApi, Suggestion } from '../core/types';
import { Icon } from './icons';
import { Btn, Chip, Empty } from './ui';

function ScoreRing({ score }: { score: number }) {
  const r = 30, c = 2 * Math.PI * r;
  return (
    <svg width="78" height="78" viewBox="0 0 78 78" className="pl-ring" role="img" aria-label={`Personalization score ${score} out of 100`}>
      <circle cx="39" cy="39" r={r} className="pl-ring__bg" />
      <circle cx="39" cy="39" r={r} className="pl-ring__fg" strokeDasharray={c} strokeDashoffset={c - (c * score) / 100} transform="rotate(-90 39 39)" />
      <text x="39" y="38" textAnchor="middle" className="pl-ring__n">{score}</text>
      <text x="39" y="52" textAnchor="middle" className="pl-ring__s">/ 100</text>
    </svg>
  );
}

function SuggestionCard({ s, api }: { s: Suggestion; api: PlicaApi }) {
  const needsText = s.action.type === 'add' || s.action.type === 'refine';
  const [text, setText] = useState(s.action.prefill ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <li className="pl-card pl-sugg">
      <div className="pl-row"><Chip tone="accent" icon="spark">{s.kind}</Chip><b>{s.title}</b></div>
      <p>{s.body}</p>
      {s.note && <p className="pl-note pl-note--warn">{s.note}</p>}
      {needsText && <input className="pl-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the memory in your own words" aria-label="Memory text" />}
      {err && <p className="pl-note pl-note--bad">{err}</p>}
      <div className="pl-row">
        <Btn kind="primary" small disabled={busy || (needsText && !text.trim())} onClick={async () => { setBusy(true); setErr(''); try { await api.applySuggestion(s.id, text); } catch (e) { setErr((e as Error).message); setBusy(false); } }}>{s.action.label}</Btn>
        <Btn small onClick={() => api.dismissSuggestion(s.id)}>Dismiss</Btn>
      </div>
    </li>
  );
}

const COMP: { k: keyof CoachState['components']; label: string; w: number }[] = [
  { k: 'hitRate', label: 'Hit rate', w: 40 },
  { k: 'specificity', label: 'Specificity', w: 25 },
  { k: 'freshness', label: 'Freshness', w: 20 },
  { k: 'consistency', label: 'Consistency', w: 15 },
];

export function CoachPanel({ coach, api, demoControls }: { coach: CoachState; api: PlicaApi; demoControls?: boolean }) {
  return (
    <div className="pl-stack">
      <div className="pl-card pl-coach">
        <ScoreRing score={coach.score} />
        <div className="pl-coach__txt">
          <b>Improve your results</b>
          <small>Personalization Score. Runs locally on memories you have already unlocked. Nothing here is required.</small>
        </div>
      </div>
      <ul className="pl-bars">
        {COMP.map((c) => (
          <li key={c.k}>
            <span>{c.label} <i>{c.w}%</i></span>
            <div className="pl-bar"><div style={{ width: `${Math.round(coach.components[c.k] * 100)}%` }} /></div>
            <em>{Math.round(coach.components[c.k] * 100)}%</em>
          </li>
        ))}
      </ul>
      <div className="pl-sectitle"><h3>Suggestions</h3><span className="pl-faint">{coach.suggestions.length}</span></div>
      {coach.suggestions.length === 0 ? (
        <Empty icon="spark" title="Nothing to suggest right now">Ask a few questions and Plica will look for gaps. Dismissed suggestions stay dismissed.</Empty>
      ) : (
        <ul className="pl-list">{coach.suggestions.map((s) => <SuggestionCard key={s.id} s={s} api={api} />)}</ul>
      )}
      {demoControls && <Btn small icon="plus" onClick={() => api.seedCoachSamples()}>Load sample issues (conflict, vague, stale)</Btn>}
    </div>
  );
}
