import { useEffect, useState } from 'react';
import { Footer, Nav, Rails, VideoModal } from './chrome';
import { consumePendingSection, useRoute } from './router';
import { Demo } from './pages/Demo';
import { Landing } from './pages/Landing';
import { Verify } from './pages/Verify';

export function App() {
  const route = useRoute();
  const [video, setVideo] = useState(false);

  useEffect(() => {
    const sec = consumePendingSection();
    if (sec) setTimeout(() => document.getElementById(sec)?.scrollIntoView({ behavior: 'smooth' }), 60);
    else window.scrollTo({ top: 0 });
    document.title = route.path === '/verify' ? 'Verify a receipt — Plica' : route.path === '/demo' ? 'Try the demo — Plica' : 'Plica — every AI answer comes with a receipt';
  }, [route.path]);

  // Scroll-reveal for everything marked data-reveal
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('is-in'), io.unobserve(e.target))), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    const t = setTimeout(() => document.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => io.observe(el)), 30);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [route.path]);

  return (
    <>
      <Nav route={route.path} onVideo={() => setVideo(true)} />
      <Rails onVideo={() => setVideo(true)} />
      <main>
        {route.path === '/' && <Landing onVideo={() => setVideo(true)} />}
        {route.path === '/verify' && <Verify query={route.query} />}
        {route.path === '/demo' && <Demo />}
      </main>
      <Footer onVideo={() => setVideo(true)} />
      {video && <VideoModal onClose={() => setVideo(false)} />}
    </>
  );
}
