import { useCallback, useEffect, useRef, useState } from 'react';
import { shortHash, txUrl } from '../core/anchor';
import { Engine } from '../core/engine';
import { MemoryKV } from '../core/kv';
import { DEMO_MODEL_NAME, stubAnswer } from '../core/stubModel';
import type { Run } from '../core/types';
import { DELETION_LIMIT_NOTE } from '../core/verify';
import { Icon } from '../panel/icons';

/** Ask one question through the real engine (propose → approve everything offered → stub model → signed receipt). */
export async function askDemo(e: Engine, prompt: string): Promise<Run> {
  const p = await e.propose(prompt);
  const r = await e.resolve(p.id, p.recall.used.map((u) => u.id));
  const answer = stubAnswer((r.contextBlock ? r.contextBlock + '\n\n' : '') + prompt);
  return e.complete(p.id, { answer, model: DEMO_MODEL_NAME });
}

export function newDemoEngine(site = 'demo') {
  return new Engine(new MemoryKV(), { site });
}

/** An engine pre-filled with the demo memories and (optionally) one answered question. */
export function useSeededEngine(ask?: string) {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    const e = newDemoEngine('landing');
    (async () => {
      await e.seedDemo();
      if (ask) await askDemo(e, ask);
      if (alive) setEngine(e);
    })();
    return () => { alive = false; };
  }, [nonce]);
  return { engine, reset: useCallback(() => { setEngine(null); setNonce((n) => n + 1); }, []) };
}

/** Animated tile field in the spirit of the reference reel. Pauses off-screen, static for reduced motion. */
export function Mosaic({ cell = 38, className = '' }: { cell?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let w = 0, h = 0, cols = 0, rows = 0, phases: number[] = [], raf = 0, visible = true;
    const mouse = { x: -999, y: -999 };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const size = () => {
      const r = cv.parentElement!.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / cell); rows = Math.ceil(h / cell);
      phases = Array.from({ length: cols * rows }, () => Math.random() * Math.PI * 2);
      draw(0);
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const cx = x * cell + cell / 2, cy = y * cell + cell / 2;
          const d = Math.hypot(cx - mouse.x, cy - mouse.y);
          const near = Math.max(0, 1 - d / 190);
          const v = 0.5 + 0.5 * Math.sin(t * 0.0006 + phases[i] + x * 0.18 - y * 0.12);
          const light = 9 + v * 20 + near * 38;
          ctx.fillStyle = `hsl(${222 + v * 8}, 88%, ${light}%)`;
          ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
        }
      }
    };
    const loop = (t: number) => { if (visible) draw(t); raf = requestAnimationFrame(loop); };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(cv.parentElement!);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(cv);
    const mv = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    window.addEventListener('pointermove', mv);
    if (!reduce) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); window.removeEventListener('pointermove', mv); };
  }, [cell]);
  return <canvas ref={ref} className={`mosaic ${className}`} aria-hidden="true" />;
}

function MiniReceipt({ title, run, commitment, present }: { title: string; run: Run; commitment: string; present: boolean }) {
  const r = run.receipt;
  const others = r.memoryCommitments.filter((c) => c !== commitment);
  return (
    <article className={`rc ${present ? 'rc--a' : 'rc--b'}`}>
      <header>
        <b>{title}</b>
        <span className="anch"><Icon name="check" size={12} /> Anchored</span>
      </header>
      <dl>
        <div><dt>Receipt</dt><dd><code>{r.receiptId}</code></dd></div>
        <div><dt>Prompt</dt><dd className="rc__q">“{run.prompt}”</dd></div>
        <div><dt>Answer hash</dt><dd><code>{shortHash(r.outputs.answerHash, 6)}</code></dd></div>
        <div><dt>Anchor</dt><dd><a href={txUrl(r.anchor)} target="_blank" rel="noreferrer">{shortHash(r.anchor.txHash, 5)} <Icon name="ext" size={10} /></a> <small>simulated</small></dd></div>
      </dl>
      <h6>Memory commitments supplied ({r.memoryCommitments.length})</h6>
      <ul>
        <li className={present ? 'is-hit' : 'is-miss'}>
          <code>{shortHash(commitment, 6)}</code>
          {present ? <span><Icon name="check" size={12} /> supplied to the model</span> : <span><Icon name="x" size={12} /> not supplied · excluded: deleted</span>}
        </li>
        {others.map((c) => <li key={c}><code>{shortHash(c, 6)}</code><span>supplied to the model</span></li>)}
      </ul>
    </article>
  );
}

export function ReceiptCompare({ a, b, commitment }: { a: Run; b: Run; commitment: string }) {
  return (
    <div className="rcmp">
      <div className="rcmp__grid">
        <MiniReceipt title="Receipt A · before Forget" run={a} commitment={commitment} present />
        <div className="rcmp__arrow" aria-hidden="true"><Icon name="key" size={18} /><span>key destroyed<br />tombstone anchored</span></div>
        <MiniReceipt title="Receipt B · after Forget" run={b} commitment={commitment} present={false} />
      </div>
      <p className="rcmp__note"><Icon name="alert" size={14} /> {DELETION_LIMIT_NOTE}</p>
    </div>
  );
}

type StepState = 'todo' | 'run' | 'done' | 'fail';
const PROOF_STEPS = [
  'Save “I’m working on Project X” and encrypt it under its own key.',
  'Ask a question that uses it. Receipt A lists that memory’s commitment.',
  'Delete it: destroy the key and write a tombstone.',
  'Try to retrieve it. This must return nothing or fail to decrypt.',
  'Ask again. Receipt B must not contain the commitment.',
];

/** The deletion-proof test, run live against a throwaway vault, one step at a time. */
export function DeletionProof() {
  const [st, setSt] = useState<StepState[]>(PROOF_STEPS.map(() => 'todo'));
  const [detail, setDetail] = useState<string[]>(PROOF_STEPS.map(() => ''));
  const [runs, setRuns] = useState<{ a: Run; b: Run; c: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, s: StepState, d?: string) => {
    setSt((x) => x.map((v, k) => (k === i ? s : v)));
    if (d !== undefined) setDetail((x) => x.map((v, k) => (k === i ? d : v)));
  };
  const wait = (ms = 650) => new Promise((r) => setTimeout(r, ms));

  async function run() {
    setBusy(true); setRuns(null);
    setSt(PROOF_STEPS.map(() => 'todo')); setDetail(PROOF_STEPS.map(() => ''));
    const e = newDemoEngine('proof');
    const q = 'What should I focus on for my project today?';
    try {
      set(0, 'run'); await wait();
      const m = await e.addMemory({ content: "I'm working on Project X", scope: 'work' });
      set(0, 'done', `AES-GCM ciphertext stored · commitment ${shortHash(m.commitment, 5)}`);
      set(1, 'run'); await wait();
      const a = await askDemo(e, q);
      const inA = a.receipt.memoryCommitments.includes(m.commitment);
      set(1, inA ? 'done' : 'fail', `Receipt ${a.receipt.receiptId} lists ${shortHash(m.commitment, 5)}`);
      set(2, 'run'); await wait();
      await e.forget(m.id);
      const tomb = (await e.getState()).memories.find((x) => x.id === m.id)?.tombstone;
      set(2, 'done', `Key destroyed · tombstone ${tomb ? shortHash(tomb.txHash, 5) : ''}`);
      set(3, 'run'); await wait();
      const open = await e.openMemory(m.id);
      set(3, open.ok ? 'fail' : 'done', open.ok ? 'Unexpectedly readable' : 'Key unavailable: this memory was forgotten');
      set(4, 'run'); await wait();
      const b = await askDemo(e, q);
      const gone = !b.receipt.memoryCommitments.includes(m.commitment);
      set(4, gone ? 'done' : 'fail', gone ? `Receipt ${b.receipt.receiptId} excludes it (reason: deleted)` : 'Commitment still present');
      setRuns({ a, b, c: m.commitment });
    } finally {
      setBusy(false);
    }
  }
  const done = st.every((s) => s === 'done');
  return (
    <div className="dproof">
      <div className="dproof__steps">
        <ol>
          {PROOF_STEPS.map((s, i) => (
            <li key={i} className={`dp-${st[i]}`}>
              <span className="dp__n">{st[i] === 'done' ? <Icon name="check" size={13} /> : st[i] === 'fail' ? <Icon name="x" size={13} /> : st[i] === 'run' ? <span className="pl-spin" /> : i + 1}</span>
              <div><b>{s}</b>{detail[i] && <small>{detail[i]}</small>}</div>
            </li>
          ))}
        </ol>
        <button className="pill pill--solid" onClick={run} disabled={busy}>{busy ? 'Running…' : done ? 'Run it again' : 'Run the deletion test'} <Icon name="play" size={13} /></button>
      </div>
      <div className="dproof__out">
        {runs ? <ReceiptCompare a={runs.a} b={runs.b} commitment={runs.c} /> : <div className="dproof__ph"><Icon name="receipt" size={26} /><p>Receipts A and B appear here, side by side.</p></div>}
      </div>
    </div>
  );
}
