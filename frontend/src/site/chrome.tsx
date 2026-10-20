import { useEffect, useState } from 'react';
import { Icon, Logo } from '../panel/icons';
import { SITE, isPlaceholder } from './site.config';
import { go, goSection, type Route } from './router';

const LINKS: { id: string; label: string }[] = [
  { id: 'problem', label: 'Problem' },
  { id: 'how', label: 'How it works' },
  { id: 'xray', label: 'X-ray' },
  { id: 'proof', label: 'Proof' },
  { id: 'limits', label: 'Limits' },
  { id: 'hood', label: 'Under the hood' },
];

export function Nav({ route, onVideo }: { route: Route['path']; onVideo: () => void }) {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => setOpen(false), [route]);
  return (
    <header className={`nav${solid ? ' nav--solid' : ''}${open ? ' nav--open' : ''}`}>
      <a className="nav__brand" href="#/" aria-label="Plica home"><Logo size={26} /><span>Plica</span></a>
      <nav className="nav__links" aria-label="Sections">
        {LINKS.map((l) => (
          <button key={l.id} onClick={() => goSection(l.id)}>{l.label}</button>
        ))}
      </nav>
      <div className="nav__cta">
        <a className={`pill pill--ghost${route === '/verify' ? ' is-on' : ''}`} href="#/verify">Verify a receipt</a>
        <a className={`pill pill--solid${route === '/demo' ? ' is-on' : ''}`} href="#/demo">Try the demo <Icon name="chev" size={13} /></a>
      </div>
      <button className="nav__burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><span /><span /></button>
      {open && (
        <div className="nav__sheet">
          {LINKS.map((l) => <button key={l.id} onClick={() => goSection(l.id)}>{l.label}</button>)}
          <a href="#/verify">Verify a receipt</a>
          <a href="#/demo">Try the demo</a>
          <button onClick={onVideo}>Watch the 3-minute demo</button>
        </div>
      )}
    </header>
  );
}

/** Left: scroll meter with percentage (a nod to the reference reel). Right: quick links. */
export function Rails({ onVideo }: { onVideo: () => void }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const on = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setPct(max > 0 ? Math.round((h.scrollTop / max) * 100) : 0);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, []);
  const ticks = 26;
  return (
    <>
      <aside className="rail rail--l" aria-hidden="true">
        <div className="meter">
          {Array.from({ length: ticks }, (_, i) => <i key={i} className={i < Math.round((pct / 100) * ticks) ? 'on' : ''} />)}
        </div>
        <span className="rail__pct">{pct}%</span>
      </aside>
      <aside className="rail rail--r">
        <a href={SITE.links.github} target="_blank" rel="noreferrer" aria-label="GitHub repository" title="GitHub"><Icon name="link" size={15} /></a>
        <button onClick={onVideo} aria-label="Watch the demo video" title="Demo video"><Icon name="play" size={15} /></button>
        <a href={SITE.links.guide} target="_blank" rel="noreferrer" aria-label="Product and technical guide" title="Guide"><Icon name="receipt" size={15} /></a>
      </aside>
    </>
  );
}

export function Footer({ onVideo }: { onVideo: () => void }) {
  return (
    <footer className="foot">
      <div className="foot__arc" aria-hidden="true" />
      <div className="foot__grid">
        <div className="foot__brand">
          <div className="nav__brand"><Logo size={30} /><span>Plica</span></div>
          <p>Every AI answer comes with a receipt: what it remembered about you.</p>
          <small>Built for {SITE.hackathon}. Demo mode uses sample data and a stub model.</small>
        </div>
        <div><h5>Product</h5><button onClick={() => goSection('how')}>How it works</button><button onClick={() => goSection('xray')}>Memory X-ray</button></div>
        <div><h5>Proof</h5><a href="#/verify">Verify a receipt</a><a href="#/demo">Try the demo</a><button onClick={() => goSection('limits')}>Honest limits</button></div>
        <div><h5>Resources</h5><a href={SITE.links.github} target="_blank" rel="noreferrer">GitHub</a><button onClick={onVideo}>Demo video</button><a href={SITE.links.guide} target="_blank" rel="noreferrer">Technical guide</a></div>
      </div>
      <div className="foot__legal">
        <span>© 2026 Plica. Hackathon prototype.</span>
        <span className="foot__status"><i /> All systems simulated</span>
      </div>
    </footer>
  );
}

export function VideoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  const missing = isPlaceholder(SITE.links.demoVideoEmbed);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Demo video" onClick={onClose}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <button className="modal__x" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        {missing ? (
          <div className="modal__empty">
            <Icon name="play" size={34} />
            <h3>Your 3-minute demo goes here</h3>
            <p>Set <code>links.demoVideoEmbed</code> and <code>links.demoVideoWatch</code> in <code>src/site/site.config.ts</code>. Meanwhile, the interactive demo runs the same story in your browser.</p>
            <button className="pill pill--solid" onClick={() => { onClose(); go('/demo'); }}>Try the demo <Icon name="chev" size={13} /></button>
          </div>
        ) : (
          <iframe src={SITE.links.demoVideoEmbed} title="Plica demo" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        )}
      </div>
    </div>
  );
}