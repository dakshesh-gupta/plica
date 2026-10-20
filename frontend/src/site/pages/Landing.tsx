import { Hero, Hood, Limits, Links, Problem, Proof, How, XraySection } from '../sections';

export function Landing({ onVideo }: { onVideo: () => void }) {
  return (
    <>
      <Hero onVideo={onVideo} />
      <Problem />
      <How />
      <XraySection />
      <Proof />
      <Limits />
      <Hood />
      <Links />
    </>
  );
}