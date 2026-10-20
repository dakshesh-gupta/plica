import { useEffect, useState } from 'react';
import { PlicaPanel } from '../panel/PlicaPanel';
import { TestPanel } from '../panel/TestPanel';
import { XRay } from '../panel/XRay';
import { ApiContext, usePlicaState } from '../panel/hooks';
import { Icon, Logo } from '../panel/icons';
import { Btn } from '../panel/ui';
import { DeletionProof, Mosaic, useSeededEngine } from './components';
import { go } from './router';
import { SITE, isPlaceholder } from './site.config';

const S = ({ children }: { children: React.ReactNode }) => <em className="serif">{children}</em>;
const Eyebrow = ({ n, children }: { n: string; children: React.ReactNode }) => <div className="eyebrow" data-reveal><span>{n}</span>{children}</div>;

/* 1 ─ Hero ─────────────────────────────────────────────── */
export function Hero({ onVideo }: { onVideo: () => void }) {
  const [t, setT] = useState({ x: 0, y: 0 });
  return (
    <section className="hero" id="top" onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setT({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 }); }}>
      <div className="hero__bg" aria-hidden="true">
        <svg className="hero__beams" viewBox="0 0 1200 700" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bm" x1="0" x2="1"><stop offset="0" stopColor="#6aa2ff" stopOpacity="0" /><stop offset=".6" stopColor="#bcd4ff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity=".2" /></linearGradient>
            <filter id="bl"><feGaussianBlur stdDeviation="1.2" /></filter>
          </defs>
          <path d="M-20 80 C 380 120, 560 260, 760 350" stroke="url(#bm)" strokeWidth="2" fill="none" filter="url(#bl)" />
          <path d="M-20 640 C 380 600, 560 440, 760 350" stroke="url(#bm)" strokeWidth="2" fill="none" filter="url(#bl)" />
        </svg>
        <div className="hero__glow" />
        <div className="hero__diamond" style={{ transform: `translate(${t.x * -26}px, ${t.y * -18}px) rotate(45deg)` }}>
          <i /><b />
        </div>
      </div>
      <div className="wrap hero__grid">
        <div className="hero__copy">
          <div className="tag" data-reveal><span className="tag__dot" /> Browser extension · Manifest V3 · {SITE.hackathon}</div>
          <h1 data-reveal>Every AI answer comes with a receipt: <S>what it remembered about you.</S></h1>
          <p className="lede" data-reveal>Plica gives the AI chat tools you already use a memory you control. See which memories were supplied to every answer, and delete one with proof that Plica will not supply it again.</p>
          <div className="hero__btns" data-reveal>
            <button className="pill pill--solid pill--lg" onClick={onVideo}><Icon name="play" size={15} /> Watch the 3-minute demo</button>
            <a className="pill pill--ghost pill--lg" href={SITE.links.install} target="_blank" rel="noreferrer">Install the extension <Icon name="ext" size={14} /></a>
            <a className="pill pill--ghost pill--lg" href="#/demo">Try the demo <Icon name="chev" size={14} /></a>
          </div>
          <ul className="hero__facts" data-reveal>
            <li><Icon name="lock" size={14} /> Encrypted under keys you own</li>
            <li><Icon name="shield" size={14} /> Signed receipt per answer</li>
            <li><Icon name="key" size={14} /> Forget destroys the key</li>
          </ul>
        </div>
        <div className="hero__card" data-reveal style={{ transform: `translate(${t.x * 14}px, ${t.y * 10}px)` }}>
          <div className="glass hc">
            <header><Logo size={18} /><b>Receipt</b><span className="anch"><Icon name="check" size={12} /> Anchored</span></header>
            <p className="hc__q">“Dinner ideas for tonight”</p>
            <ul>
              <li><i className="dot dot--ok" /> <b>I’m vegetarian</b><em>supplied to the model</em></li>
              <li><i className="dot dot--ok" /> <b>Prefers short answers</b><em>supplied to the model</em></li>
              <li className="off"><i className="dot" /> <b>Project X</b><em>excluded · out of scope: work</em></li>
            </ul>
            <div className="hc__ladder"><span className="on">Recorded</span><span className="on">Hash verified</span><span className="on">Signature verified</span><span className="no">Execution attested · not available</span></div>
            <code>0x9f3a…c41e · Base Sepolia (simulated)</code>
          </div>
        </div>
      </div>
      <button className="scrollcue" onClick={() => document.getElementById('problem')?.scrollIntoView({ behavior: 'smooth' })} aria-label="Scroll to the problem"><Icon name="chevd" size={18} /></button>
    </section>
  );
}

/* 2 ─ Problem ───────────────────────────────────────────── */
export function Problem() {
  return (
    <section className="sec" id="problem">
      <div className="wrap">
        <Eyebrow n="01">The problem</Eyebrow>
        <h2 className="quote" data-reveal>“AI assistants remember things about me, but I can’t <S>see</S>, <S>limit</S>, or truly <S>delete</S> what they remember.”</h2>
        <div className="trio">
          {[
            ['eye', 'See', 'Which of my facts did that answer actually use? Today there is no way to tell.'],
            ['lock', 'Limit', 'Work context should not leak into a dinner question. Scope and expiry should be mine to set.'],
            ['trash', 'Delete', '“Deleted” usually means hidden. There is no proof the memory will not be used again.'],
          ].map(([i, t, d]) => (
            <article className="glass card" data-reveal key={t}>
              <span className="card__ic"><Icon name={i as 'eye'} size={20} /></span>
              <h3>{t}</h3><p>{d}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 3 ─ How it works ──────────────────────────────────────── */
export function How() {
  const [active, setActive] = useState(1);
  useEffect(() => { const t = setInterval(() => setActive((a) => (a + 1) % 3), 4200); return () => clearInterval(t); }, []);
  const steps = [
    { n: '1', title: <>Approve what’s <S>remembered</S></>, body: 'Plica shows the memories it wants to add to your prompt. Only the ones you approve are inserted.', vis: (
      <div className="mock mock--approve"><b>Plica wants to add 2 memories</b><label><i className="chk" /> I’m vegetarian <em>personal</em></label><label><i className="chk" /> Prefers short answers <em>style</em></label><div><span className="btnx btnx--p">Approve (2)</span><span className="btnx">Skip</span></div></div>) },
    { n: '2', title: <>Every answer gets a <S>signed receipt</S></>, body: 'A receipt records the prompt, the memories supplied (by commitment, never by content) and the answer hash. It is signed and anchored.', vis: (
      <div className="mock mock--receipt"><span className="anch"><Icon name="check" size={12} /> Anchored</span><code>rcpt_7f21a9c0</code><code>prompt 0x41be…9a</code><code>memories 0x9f3a… · 0xd1c0…</code><code>answer 0xe07c…52</code><code>sig ecdsa-p256 ✓</code></div>) },
    { n: '3', title: <>Forget <S>destroys the key</S></>, body: 'Deleting crypto-shreds the memory: its key is destroyed, so the ciphertext is permanently unreadable. A tombstone keeps the audit trail without exposing content.', vis: (
      <div className="mock mock--shred"><Icon name="key" size={28} /><div className="shred"><i /><i /><i /><i /><i /></div><b>Key unavailable</b><small>this memory was forgotten</small></div>) },
  ];
  return (
    <section className="sec" id="how">
      <div className="wrap">
        <Eyebrow n="02">How it works</Eyebrow>
        <h2 className="h2" data-reveal>Three steps. <S>You hold the keys.</S></h2>
        <div className="steps" data-reveal>
          {steps.map((s, i) => (
            <article key={s.n} className={`glass step${active === i ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} tabIndex={0}>
              <div className="step__vis">{s.vis}</div>
              <span className="step__n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 4 ─ Memory X-ray ──────────────────────────────────────── */
export function XraySection() {
  const { engine, reset } = useSeededEngine('Give me dinner ideas for tonight');
  const state = usePlicaState(engine ?? ({ getState: () => new Promise(() => undefined), subscribe: () => () => undefined } as never));
  return (
    <section className="sec" id="xray">
      <div className="wrap">
        <Eyebrow n="03">Memory X-ray</Eyebrow>
        <h2 className="h2" data-reveal>See exactly what <S>shaped</S> the answer.</h2>
        <p className="lede lede--c" data-reveal>Left: the answer captured from the chat page, with matching phrases highlighted. Right: memories <b>used</b>, <b>excluded</b> (with the reason) and <b>available</b> but unused. The label is honest: “supplied to the model”, not “caused this sentence”.</p>
        <div className="frame" data-reveal>
          <div className="frame__bar"><i /><i /><i /><span>Live X-ray · demo data, real cryptography</span><Btn small onClick={reset}>Reset</Btn></div>
          <div className="plica-panel plica-panel--inline frame__body">
            {engine && state ? (
              <ApiContext.Provider value={engine}>
                <XRay runs={state.runs} memories={state.memories} api={engine} />
              </ApiContext.Provider>
            ) : <div className="pl-skel" style={{ padding: 24 }}><span /><span /><span /></div>}
          </div>
        </div>
        <p className="hint" data-reveal>Hover a highlight or a green card to link them. Try “Forget” on a card, then open the Proof section.</p>
      </div>
    </section>
  );
}

/* 5 ─ Proof ─────────────────────────────────────────────── */
export function Proof() {
  return (
    <section className="sec sec--proof" id="proof">
      <div className="proof__band"><Mosaic /><div className="proof__fade" /><div className="wrap proof__head">
        <Eyebrow n="04">Proof</Eyebrow>
        <h2 className="h2" data-reveal>Proof, <S>not promises.</S></h2>
        <p className="lede lede--c" data-reveal>Run the deletion test and the five automated tests right here. Every check uses real WebCrypto in your browser: SHA-256, ECDSA P-256 and AES-GCM.</p>
      </div></div>
      <div className="wrap">
        <h3 className="h3" data-reveal>Deletion proof: receipts A and B</h3>
        <div data-reveal><DeletionProof /></div>

        <h3 className="h3" data-reveal style={{ marginTop: 72 }}>Five tests, pass or fail</h3>
        <div className="frame frame--narrow" data-reveal>
          <div className="frame__bar"><i /><i /><i /><span>Verification tests · live</span></div>
          <div className="plica-panel plica-panel--inline frame__body"><TestPanel /></div>
        </div>

        <div className="ringcta" data-reveal>
          <div className="ring" aria-hidden="true"><i /><i /><i /></div>
          <div className="ringcta__in">
            <h3>Check a receipt <S>yourself</S></h3>
            <p>Paste one, edit a single character of the answer, and watch hash verification flip to Failed. No request is made to Plica’s server.</p>
            <a className="pill pill--solid pill--lg" href="#/verify">Verify a receipt <Icon name="chev" size={14} /></a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* 6 ─ Honest limits ─────────────────────────────────────── */
export function Limits() {
  const yes = [
    ['A receipt existed at a given time', 'On-chain anchor'],
    ['The recorded answer was not altered', 'Hash check against the receipt'],
    ['The receipt came from the user’s key', 'Signature check; says nothing about truth of content'],
    ['Deleted memory is unreadable in Plica', 'Via key destruction; ciphertext may persist but is useless'],
    ['The extension reads only the supported site', 'If host permissions are scoped'],
  ];
  const no = [
    ['Which model or settings produced the answer', 'Page-reported only; unverified'],
    ['The chat provider did not keep a memory after it was inserted', 'Provider logs and built-in memory are outside Plica'],
    ['Tags and access patterns are fully private', 'Mostly: only roots on-chain; timing metadata still visible'],
  ];
  return (
    <section className="sec" id="limits">
      <div className="wrap">
        <Eyebrow n="05">Honest limits</Eyebrow>
        <h2 className="h2" data-reveal>Plica claims only <S>what it can prove.</S></h2>
        <p className="callout" data-reveal><Icon name="alert" size={18} /> Plica will not supply a deleted memory again. It cannot erase copies already held by the chat provider, and it cannot prove which model answered. Switch off the provider’s built-in memory.</p>
        <div className="duo">
          <div className="glass lim lim--yes" data-reveal>
            <h3><Icon name="check" size={16} /> Guaranteed</h3>
            <ul>{yes.map(([a, b]) => <li key={a}><b>{a}</b><small>{b}</small></li>)}</ul>
          </div>
          <div className="glass lim lim--no" data-reveal>
            <h3><Icon name="x" size={16} /> Not guaranteed</h3>
            <ul>{no.map(([a, b]) => <li key={a}><b>{a}</b><small>{b}</small></li>)}</ul>
            <p className="lim__note">A signature proves who signed, not that the content is true.</p>
          </div>
        </div>
        <h3 className="h3" data-reveal style={{ marginTop: 56 }}>Assurance ladder</h3>
        <div className="ladder" data-reveal>
          {[
            ['Recorded', 'A receipt exists', 'Something was logged', 'Ships', true],
            ['Hash verified', 'Recomputed hashes match', 'The text wasn’t altered after the fact', 'Ships', true],
            ['Signature verified', 'Signature matches the signer’s key', 'The record came from that key holder', 'Ships', true],
            ['Execution attested', 'A TEE certificate or provider signature', 'The run happened as described', 'Roadmap. Not possible from an extension alone', false],
          ].map(([a, b, c, d, ok]) => (
            <div key={a as string} className={`rung ${ok ? 'rung--on' : 'rung--off'}`}>
              <span className="rung__dot">{ok ? <Icon name="check" size={13} /> : <Icon name="lock" size={12} />}</span>
              <b>{a as string}</b><small>{b as string}</small><em>{c as string}</em><span className="rung__st">{d as string}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 7 ─ Under the hood ────────────────────────────────────── */
function Node({ x, y, w = 250, h = 62, title, sub, hl }: { x: number; y: number; w?: number; h?: number; title: string; sub: string; hl?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="14" className={hl ? 'ar-node ar-node--hl' : 'ar-node'} />
      <text x={x + w / 2} y={y + 26} textAnchor="middle" className="ar-t">{title}</text>
      <text x={x + w / 2} y={y + 45} textAnchor="middle" className="ar-s">{sub}</text>
    </g>
  );
}
export function Hood() {
  const stack = [
    ['Extension', 'Chrome Manifest V3; TypeScript; background service worker, content script, side panel'],
    ['Chat site', 'One supported site for the demo, read and written through the page DOM'],
    ['Hashing and signing', 'WebCrypto SHA-256; wallet signatures (SIWE) in the service worker'],
    ['Blockchain', 'EVM L2 (Base, Optimism or Arbitrum); Solidity; Foundry or Hardhat'],
    ['Identity', 'did:pkh, did:key, ENS; SpruceID / SIWE'],
    ['Account abstraction', 'ERC-4337 session keys, so chat has no signature popups'],
    ['Storage', 'IPFS via Pinata or web3.storage; Arweave for permanence'],
    ['Encryption and keys', 'Lit Protocol threshold keys; fallback client-side AES-GCM with wallet-derived keys'],
    ['Delegation', 'UCAN / capability tokens for scoped recall'],
    ['Memory recall', 'Local retrieval inside the extension; local sensitivity classifier'],
    ['Side panel UI', 'React; wagmi + RainbowKit; timeline UI for memory'],
  ];
  return (
    <section className="sec" id="hood">
      <div className="wrap">
        <Eyebrow n="06">Under the hood</Eyebrow>
        <h2 className="h2" data-reveal>Only hashes and roots go on-chain. <S>Content stays encrypted.</S></h2>
        <div className="arch glass" data-reveal>
          <div className="arch__scroll">
            <svg viewBox="0 0 900 470" role="img" aria-label="Plica architecture: wallet and DID, Plica extension, AI chat site; key management, off-chain storage, EVM L2 contracts; side panel and independent verifiers">
              <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#5d86ff" /></marker></defs>
              <g className="ar-l" markerEnd="url(#ah)">
                <path d="M272 62 H318" /><path d="M582 62 H628" />
                <path d="M450 124 V170" /><path d="M450 150 H140 V196" /><path d="M450 150 H760 V196" /><path d="M450 150 V196" />
                <path d="M140 258 V332 " /><path d="M450 258 V332" /><path d="M760 258 V332" />
              </g>
              <Node x={22} y={32} w={250} title="User wallet + DID" sub="did:pkh, ENS, session keys" />
              <Node x={322} y={32} w={260} title="Plica extension" sub="Content script, side panel" hl />
              <Node x={632} y={32} w={250} title="AI chat site" sub="One supported site first" />
              <Node x={22} y={196} w={250} title="Key management" sub="Lit threshold keys · AES-GCM fallback" />
              <Node x={322} y={196} w={260} title="Off-chain storage" sub="IPFS or Arweave · manifests, logs, ciphertext" />
              <Node x={632} y={196} w={250} title="EVM L2 contracts" sub="Registry, Vault, Policy · hashes and roots only" />
              <Node x={22} y={332} w={560} h={70} title="Side panel and verification explorer" sub="Memory X-ray, Verify button, test panel, Coach" />
              <Node x={632} y={332} w={250} h={70} title="Independent verifiers" sub="Check receipts themselves" />
              <text x="450" y="446" textAnchor="middle" className="ar-s">Prompts reach the chat site only after you approve the memories to insert. The model itself is outside Plica’s control.</text>
            </svg>
          </div>
        </div>
        <div className="hood__cols">
          <div data-reveal>
            <h3 className="h3">Smart contracts</h3>
            <ul className="kv">
              <li><b>ProvenanceRegistry</b><span>registerExperiment, attachAttestation, getExperiment</span></li>
              <li><b>MemoryVault</b><span>updateMemoryRoot, grantScope, revokeScope, tombstone, panicRevoke</span></li>
              <li><b>PolicyEngine</b><span>optional · retention, TTL, usage caps, GDPR preset</span></li>
            </ul>
            <h3 className="h3" style={{ marginTop: 28 }}>Receipt flow</h3>
            <ol className="flow">
              <li>Content script captures the prompt, the memory block inserted and the answer.</li>
              <li>Service worker hashes them, builds the receipt with memory commitments and signs it.</li>
              <li>Receipt goes to IPFS or Arweave; its CID is registered on-chain.</li>
              <li>Anyone verifies by recomputing hashes, checking the signature and querying the registry.</li>
            </ol>
          </div>
          <div data-reveal>
            <h3 className="h3">Tech stack</h3>
            <ul className="stack">{stack.map(([a, b]) => <li key={a}><b>{a}</b><span>{b}</span></li>)}</ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* 8 ─ Roadmap ───────────────────────────────────────────── */
export function Roadmap() {
  const phases = [
    { w: 'Hackathon', now: true, items: ['Extension for one chat site', 'Vault, approved recall', 'Receipts with Verify', 'Test panel, optional Coach'] },
    { w: '0–3 months', items: ['Second and third chat sites', 'MCP server', 'Store-ready permissions review'] },
    { w: '3–6 months', items: ['Memory Passport: portable memory across sites', 'GDPR erasure reports'] },
    { w: '6–12 months', items: ['Provider-signed receipts or TEE tier', 'Research Mode as a separate product'] },
    { w: 'Long term', items: ['Replication staking, zk proofs, data licensing', 'Enterprise compliance suite'] },
  ];
  return (
    <section className="sec" id="roadmap">
      <div className="wrap">
        <Eyebrow n="07">Roadmap</Eyebrow>
        <h2 className="h2" data-reveal>More sites. <S>Stronger proof.</S></h2>
      </div>
      <div className="road" data-reveal>
        <div className="road__track">
          {phases.map((p) => (
            <article key={p.w} className={`road__ph${p.now ? ' is-now' : ''}`}>
              <span className="road__dot" />
              <h4>{p.w}{p.now && <em>building now</em>}</h4>
              <ul>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 9 ─ Links ─────────────────────────────────────────────── */
export function Links({ onVideo }: { onVideo: () => void }) {
  const L = SITE.links;
  const linkCard = (icon: 'link' | 'play' | 'receipt' | 'download', title: string, sub: string, href?: string, onClick?: () => void) => {
    const inner = (<><span className="card__ic"><Icon name={icon} size={18} /></span><div><b>{title}</b><small>{isPlaceholder(href ?? '') && href !== undefined ? 'Add the link in site.config.ts' : sub}</small></div><Icon name="ext" size={14} /></>);
    return onClick ? <button className="glass lcard" onClick={onClick}>{inner}</button> : <a className="glass lcard" href={href} target="_blank" rel="noreferrer">{inner}</a>;
  };
  return (
    <section className="sec" id="links">
      <div className="wrap">
        <Eyebrow n="08">Links</Eyebrow>
        <h2 className="h2" data-reveal>Everything to <S>check our work.</S></h2>
        <div className="lgrid" data-reveal>
          {linkCard('link', 'GitHub repo', 'Source, build and install instructions', L.github)}
          {linkCard('play', 'Demo video', 'The 3-minute walkthrough', undefined, onVideo)}
          {linkCard('receipt', 'Product & technical guide', 'This document', L.guide)}
          <a className="glass lcard" href="#/verify"><span className="card__ic"><Icon name="shield" size={18} /></span><div><b>Verify a receipt</b><small>Paste, hash-check, signature-check</small></div><Icon name="chev" size={14} /></a>
          <a className="glass lcard" href="#/demo"><span className="card__ic"><Icon name="play" size={18} /></span><div><b>Try the demo</b><small>Full flow in your browser, no install</small></div><Icon name="chev" size={14} /></a>
        </div>
        <div className="duo duo--links">
          <div className="glass lim" data-reveal>
            <h3><Icon name="link" size={16} /> Contracts · {SITE.chain.name}</h3>
            {!SITE.chain.deployed && <p className="lim__note">Not deployed yet. Anchors in this build are <b>simulated</b>, and every receipt says so. Set <code>chain.deployed</code> and the addresses in <code>site.config.ts</code> after deploying.</p>}
            <ul className="kv">
              {SITE.chain.contracts.map((c) => (
                <li key={c.name}><b>{c.name}</b>
                  {SITE.chain.deployed ? <a href={SITE.chain.explorerAddress + c.address} target="_blank" rel="noreferrer"><code>{c.address.slice(0, 10)}…{c.address.slice(-6)}</code> view on explorer <Icon name="ext" size={11} /></a> : <span>{c.purpose}</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass lim" data-reveal>
            <h3><Icon name="brain" size={16} /> Team</h3>
            <ul className="team">{SITE.team.map((m, i) => <li key={i}><span className="avatar">{m.name.slice(0, 1)}</span><div><b>{m.name}</b><small>{m.role}</small></div></li>)}</ul>
          </div>
        </div>
        <div className="finalcta" data-reveal>
          <Mosaic cell={30} />
          <div className="finalcta__in">
            <h2 className="h2">Ask. Approve. <S>Verify. Forget.</S></h2>
            <button className="pill pill--solid pill--lg" onClick={() => go('/demo')}>Try the demo <Icon name="chev" size={14} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
