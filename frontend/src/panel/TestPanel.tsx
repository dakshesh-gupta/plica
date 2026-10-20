import { useState } from 'react';
import { ALL_TESTS, COACH_TESTS, CORE_TESTS, runTest, type TestDef, type TestResult } from '../core/tests';
import { Icon } from './icons';
import { Btn, Spinner } from './ui';

function Badge({ r }: { r?: TestResult }) {
  if (!r) return <span className="pl-tbadge pl-tbadge--idle">Not run</span>;
  if (r.status === 'running') return <span className="pl-tbadge pl-tbadge--run"><Spinner /> Running</span>;
  if (r.status === 'pass') return <span className="pl-tbadge pl-tbadge--pass"><Icon name="check" size={12} /> Pass</span>;
  return <span className="pl-tbadge pl-tbadge--fail"><Icon name="x" size={12} /> Fail</span>;
}

export function TestPanel({ autoRun = false }: { autoRun?: boolean }) {
  const [res, setRes] = useState<Record<string, TestResult>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [showCoach, setShowCoach] = useState(false);

  async function runOne(t: TestDef) {
    setRes((r) => ({ ...r, [t.id]: { status: 'running', log: [] } }));
    await new Promise((x) => setTimeout(x, 250));
    const out = await runTest(t);
    setRes((r) => ({ ...r, [t.id]: out }));
    return out;
  }
  async function runAll(list: TestDef[]) {
    for (const t of list) await runOne(t);
  }
  const done = CORE_TESTS.filter((t) => res[t.id]?.status === 'pass').length;
  const ran = CORE_TESTS.filter((t) => res[t.id] && res[t.id].status !== 'running').length;
  const running = Object.values(res).some((r) => r.status === 'running');

  const Row = ({ t }: { t: TestDef }) => (
    <li className="pl-test">
      <div className="pl-test__main" onClick={() => setOpen(open === t.id ? null : t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(open === t.id ? null : t.id)}>
        <span className="pl-test__n">{t.n}</span>
        <div className="pl-test__txt"><b>{t.name}</b><small>{t.condition}</small></div>
        <Badge r={res[t.id]} />
        <button className="pl-iconbtn" aria-label={`Run ${t.name}`} onClick={(e) => { e.stopPropagation(); runOne(t); }} disabled={running}><Icon name="play" size={13} /></button>
      </div>
      {open === t.id && (
        <pre className="pl-test__log">{res[t.id]?.log.length ? res[t.id].log.join('\n') : 'Run this test to see its steps.'}{res[t.id]?.ms !== undefined ? `\n(${res[t.id].ms} ms)` : ''}</pre>
      )}
    </li>
  );

  return (
    <div className="pl-stack">
      <div className="pl-card pl-testhead">
        <div>
          <b>Verification tests</b>
          <small>{ran === 0 ? '5 checks that Plica claims only what it can prove' : `${done} of 5 passed`}</small>
        </div>
        <Btn kind="primary" icon="play" onClick={() => runAll(CORE_TESTS)} disabled={running}>{running ? 'Running…' : 'Run all'}</Btn>
      </div>
      <ul className="pl-list pl-list--tight">{CORE_TESTS.map((t) => <Row key={t.id} t={t} />)}</ul>
      <button className="pl-linkbtn pl-linkbtn--block" onClick={() => setShowCoach((s) => !s)}>
        <Icon name={showCoach ? 'chevd' : 'chev'} size={13} /> Coach tests ({COACH_TESTS.length})
      </button>
      {showCoach && (
        <>
          <ul className="pl-list pl-list--tight">{COACH_TESTS.map((t) => <Row key={t.id} t={t} />)}</ul>
          <Btn small onClick={() => runAll(COACH_TESTS)} disabled={running}>Run Coach tests</Btn>
        </>
      )}
      <p className="pl-faint pl-note">Tests run on a throwaway vault with the demo model, in this browser. They never touch your memories.</p>
    </div>
  );
}
export { ALL_TESTS };
