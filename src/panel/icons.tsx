import type { SVGProps } from 'react';

const P: Record<string, string> = {
  shield: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  lock: 'M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z',
  key: 'M14.5 9.5a4 4 0 11-1.2-2.8L21 14.5V18h-3v-2h-2v-2h-2l-1.5-1.5',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10 11v6M14 11v6',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  plus: 'M12 5v14M5 12h14',
  play: 'M8 5l11 7-11 7V5z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
  scan: 'M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M7 12h10',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z',
  brain: 'M9 4a3 3 0 00-3 3 3 3 0 00-2 3 3 3 0 001 2.5A3.5 3.5 0 009 18v2h2V4H9zM15 4a3 3 0 013 3 3 3 0 012 3 3 3 0 01-1 2.5A3.5 3.5 0 0115 18v2h-2V4h2z',
  chev: 'M9 6l6 6-6 6',
  chevd: 'M6 9l6 6 6-6',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  download: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  alert: 'M12 4l9 16H3L12 4zM12 10v4M12 17v.5',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  refresh: 'M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5',
  tomb: 'M7 20V9a5 5 0 0110 0v11M5 20h14M12 9v5M10 11h4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
};

export type IconName = keyof typeof P;
export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="plg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9cc2ff" />
          <stop offset="1" stopColor="#3b6cff" />
        </linearGradient>
      </defs>
      <path d="M16 2l12 14-12 14L4 16 16 2z" fill="url(#plg)" />
      <path d="M16 2v28" stroke="#06091a" strokeOpacity=".55" strokeWidth="1.4" />
      <path d="M4 16h24" stroke="#06091a" strokeOpacity=".3" strokeWidth="1" />
      <path d="M16 2l12 14H16V2z" fill="#fff" fillOpacity=".28" />
    </svg>
  );
}
