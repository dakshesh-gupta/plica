import { Hero, Hood, Limits, Links, Problem, Proof, Roadmap, How, XraySection } from '../sections';

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
      <Roadmap />
      <Links onVideo={onVideo} />
    </>
  );
}
