import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_MODEL_NAME, stubModelRespond } from '../../core/stubModel';
import type { Proposal, Run } from '../../core/types';
import { Icon, Logo } from '../../panel/icons';
import { usePlicaState } from '../../panel/hooks';
import { PlicaPanel, type TabId } from '../../panel/PlicaPanel';
import type { BannerKind } from '../../panel/StatusBanner';
import { VerifyBadge } from '../../panel/VerifyBadge';
import { Btn } from '../../panel/ui';
import { askDemo, newDemoEngine, ReceiptCompare } from '../components';

interface Msg { id: number; role: 'user' | 'ai' | 'sys'; text: string; inserted?: string; run?: Run; skipped?: boolean }

const PROMPT_DINNER = 'Give me dinner ideas for tonight';
const PROMPT_WORK = 'What should I focus on for my project today?';

export function Demo() {
  const engine = useRef(newDemoEngine('demo-chat')).current;
  const state = usePlicaState(engine);
  const [ready, setReady] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [tab, setTab] = useState<TabId>('memory');
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [forced, setForced] = useState<null | 'loading' | 'key' | 'site'>(null);
  const [visited, setVisited] = useState<{ xray: boolean; tests: boolean }>({ xray: false, tests: false });
  const resolveRef = useRef<(() => void) | null>(null);
  const idRef = useRef(1);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { engine.seedDemo().then(() => setReady(true)); }, [engine]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs.length, capturing]);
  useEffect(() => { if (tab === 'xray' || tab === 'tests') setVisited((v) => ({ ...v, [tab]: true })); }, [tab]);

  const push = (m: Omit<Msg, 'id'>) => { const id = idRef.current++; setMsgs((x) => [...x, { ...m, id }]); return id; };

  const send = useCallback(async (prompt: string) => {
    if (!prompt.trim() || busy) return;
    setBusy(true); setInput('');
    const uid = push({ role: 'user', text: prompt });
    try {
      const p: Proposal = await engine.propose(prompt);
      if (p.status === 'pending') {
        const sid = push({ role: 'sys', text: 'Plica is waiting for your approval in the side panel →' });
        await new Promise<void>((res) => { resolveRef.current = res; });
        setMsgs((x) => x.filter((m) => m.id !== sid));
      }
      const block = p.contextBlock;
      setMsgs((x) => x.map((m) => (m.id === uid ? { ...m, inserted: block || undefined, skipped: p.recall.used.length > 0 && !block } : m)));
      setCapturing(true);
      const answer = await stubModelRespond((block ? block + '\n\n' : '') + prompt);
      const run = await engine.complete(p.id, { answer, model: DEMO_MODEL_NAME });
      push({ role: 'ai', text: answer, run });
    } finally {
      setCapturing(false); setBusy(false);
    }
  }, [busy, engine]);

  // The deletion-proof shortcut for judges in a hurry: runs the whole story against this demo vault.
  async function autoRun() {
    setBusy(true);
    const wm = state?.memories.find((m) => m.keyAvailable && /Project X/.test(m.content ?? ''));
    const a = await askDemo(engine, PROMPT_WORK);
    push({ role: 'user', text: PROMPT_WORK + '  (auto-run)' });
    push({ role: 'ai', text: a.answer, run: a });
    if (wm) await engine.forget(wm.id);
    const b = await askDemo(engine, PROMPT_WORK);
    push({ role: 'user', text: PROMPT_WORK + '  (auto-run, after Forget)' });
    push({ role: 'ai', text: b.answer, run: b });
    setBusy(false);
    setTab('receipts');
  }

  async function reset() {
    setMsgs([]); setVisited({ xray: false, tests: false }); setForced(null); setTab('memory'); setReady(false);
    resolveRef.current?.();
    await engine.seedDemo(); setReady(true);
  }

  // ---- derived: guided steps and receipts A / B ---------------------------------------
  const runsAsc = useMemo(() => [...(state?.runs ?? [])].reverse(), [state?.runs]);
  const mems = state?.memories ?? [];
  const forgotten = mems.filter((m) => !m.keyAvailable);
  const pair = useMemo(() => {
    for (const g of forgotten) {
      const a = [...runsAsc].reverse().find((r) => r.receipt.memoryCommitments.includes(g.commitment));
      const b = [...runsAsc].reverse().find((r) => !r.receipt.memoryCommitments.includes(g.commitment) && r.excluded.some((x) => x.commitment === g.commitment && x.reason === 'deleted'));
      if (a && b && b.createdAt > a.createdAt) return { a, b, c: g.commitment };
    }
    return null;
  }, [runsAsc, forgotten.length]);
  const dinnerRuns = runsAsc.filter((r) => /dinner/i.test(r.prompt));
  const dislike = mems.find((m) => /dislike|allerg|avoid/i.test(m.content ?? ''));
  const projectX = mems.find((m) => m.keyAvailable && /Project X/.test(m.content ?? ''));
  const steps = [
    { done: !!ready && mems.length >= 2, title: 'Memories saved with wallet-signed consent', hint: 'Pre-filled: “I’m vegetarian” (personal), “I’m working on Project X” (work), plus a style preference.', act: <Btn small onClick={() => setTab('memory')}>Open Memory</Btn> },
    { done: dinnerRuns.length > 0, title: 'Ask for dinner ideas', hint: 'Plica’s card offers to insert the vegetarian memory.', act: <Btn small kind="primary" disabled={busy} onClick={() => send(PROMPT_DINNER)}>Ask it for me</Btn> },
    { done: dinnerRuns.some((r) => r.usedIds.length > 0), title: 'Approve the memory card', hint: 'Only approved memories are inserted. The answer arrives with a receipt.', act: null },
    { done: visited.xray, title: 'Open the X-ray', hint: 'The vegetarian memory is highlighted as supplied to the model.', act: <Btn small onClick={() => setTab('xray')}>Open X-ray</Btn> },
    { done: !!dislike && dinnerRuns.some((r) => dislike && r.usedIds.includes(dislike.id)), title: 'Coach: add a dislike, ask again', hint: 'Open Coach, add the suggested memory, ask again, and see it used in the X-ray.', act: <><Btn small onClick={() => setTab('coach')}>Open Coach</Btn><Btn small disabled={busy} onClick={() => send(PROMPT_DINNER)}>Ask again</Btn></> },
    { done: !!pair, title: 'Forget Project X, ask again', hint: 'The key is destroyed, the tombstone anchored, decryption fails. Receipt B excludes it.', act: <><Btn small disabled={busy} onClick={() => send(PROMPT_WORK)}>Ask a Project X question</Btn><Btn small kind="danger" disabled={busy || !projectX} onClick={async () => { if (projectX) { await engine.forget(projectX.id); send(PROMPT_WORK); } }}>Forget Project X</Btn></> },
    { done: visited.tests, title: 'Run the tests and the ladder', hint: 'Five tests with pass/fail badges, then the verification ladder in any receipt.', act: <Btn small onClick={() => setTab('tests')}>Open tests</Btn> },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const banner: BannerKind | null = forced === 'key' ? 'key' : forced === 'site' ? 'site' : null;

  return (
    <div className="page page--demo">
      <div className="wrap wrap--wide">
        <header className="phead">
          <div className="tag"><span className="tag__dot" /> Demo mode · sample data</div>
          <h1>Try the <em className="serif">demo</em></h1>
          <p className="lede">The full flow without installing anything. Memories are pre-filled, the model is a stub, the key is generated in your browser (no wallet needed) and the chain anchor is simulated. The hashing, signing, encryption and key destruction are real.</p>
        </header>

        <div className="demo">
          <div className="demo__left">
            <section className="chat" aria-label="Demo chat site">
              <header className="chat__bar">
                <span className="chat__dots"><i /><i /><i /></span>
                <b>Demo chat</b>
                <span className="chip-model">Demo model, not a real AI provider</span>
              </header>
              <div className="chat__log" ref={logRef}>
                {msgs.length === 0 && (
                  <div className="chat__empty">
                    <Logo size={30} />
                    <h3>Ask something</h3>
                    <p>Plica sits beside the chat. Try one of these:</p>
                    <div className="chips"><button onClick={() => send(PROMPT_DINNER)} disabled={busy || !ready}>{PROMPT_DINNER}</button><button onClick={() => send(PROMPT_WORK)} disabled={busy || !ready}>{PROMPT_WORK}</button></div>
                  </div>
                )}
                {msgs.map((m) => (
                  <div key={m.id} className={`msg msg--${m.role}`}>
                    {m.role === 'sys' ? <span className="msg__sys"><span className="pl-spin" /> {m.text}</span> : (
                      <>
                        <div className="msg__bubble">{m.text}</div>
                        {m.role === 'user' && m.inserted && (
                          <details className="msg__ins"><summary><Icon name="shield" size={12} /> Plica inserted approved memories</summary><pre>{m.inserted}</pre></details>
                        )}
                        {m.role === 'user' && m.skipped && <small className="msg__ins msg__ins--skip">You skipped memory insertion for this prompt.</small>}
                        {m.role === 'ai' && m.run && <VerifyBadge api={engine} run={m.run} onClick={() => setFocus({ id: m.run!.id, nonce: Date.now() })} />}
                      </>
                    )}
                  </div>
                ))}
                {capturing && <div className="msg msg--ai"><div className="msg__bubble msg__bubble--typing"><i /><i /><i /></div><VerifyBadge api={engine} capturing /></div>}
              </div>
              <form className="chat__in" onSubmit={(e) => { e.preventDefault(); send(input); }}>
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={busy ? 'Working…' : 'Message the demo model'} disabled={!ready} aria-label="Message" />
                <button className="pill pill--solid" disabled={busy || !input.trim()} type="submit">Send <Icon name="chev" size={13} /></button>
              </form>
            </section>

            <section className="glass script" aria-label="Demo script">
              <header><h3>Demo script</h3><span>{doneCount} / {steps.length}</span></header>
              <div className="script__bar"><i style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
              <ol>
                {steps.map((s, i) => (
                  <li key={i} className={s.done ? 'is-done' : ''}>
                    <span className="script__n">{s.done ? <Icon name="check" size={12} /> : i + 1}</span>
                    <div><b>{s.title}</b><small>{s.hint}</small>{s.act && <div className="script__act">{s.act}</div>}</div>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <div className="demo__panel">
            <PlicaPanel
              api={engine}
              demoKey demoControls
              siteStatus={forced === 'site' ? 'unsupported' : 'supported'}
              supportedSite="the demo chat"
              capturing={capturing || forced === 'loading'}
              forcedBanner={banner}
              tab={tab} onTabChange={setTab}
              focusRun={focus}
              verifyBase={location.href.split('#')[0]}
              onApprovalResolved={() => { resolveRef.current?.(); resolveRef.current = null; }}
              onRegenerate={(p) => send(p)}
              height="100%"
            />
          </div>
        </div>

        <section className="ab" aria-label="Receipts A and B">
          <header>
            <h2 className="h3">Receipts A and B, side by side</h2>
            {!pair && <Btn kind="soft" icon="play" disabled={busy} onClick={autoRun}>Run the whole deletion story for me</Btn>}
          </header>
          {pair ? <ReceiptCompare a={pair.a} b={pair.b} commitment={pair.c} /> : (
            <div className="dproof__ph"><Icon name="receipt" size={26} /><p>Complete step 6 (or use the shortcut) to see a receipt that lists the Project X memory next to one that excludes it.</p></div>
          )}
        </section>

        <section className="states" aria-label="Preview states">
          <h3>Preview states</h3>
          <p>See the loading and error states the panel can show.</p>
          <div className="states__btns">
            <Btn small onClick={() => { setForced('loading'); setTab('xray'); }}>Loading skeleton</Btn>
            <Btn small onClick={() => setForced('key')}>“Key unavailable: this memory was forgotten”</Btn>
            <Btn small onClick={() => setForced('site')}>“Site not supported”</Btn>
            <Btn small onClick={() => setForced(null)}>Clear</Btn>
            <span className="pl-spacer" />
            <Btn small kind="danger" icon="refresh" onClick={reset}>Reset demo</Btn>
          </div>
        </section>
      </div>
    </div>
  );
}
