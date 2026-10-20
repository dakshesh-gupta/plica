import type { ReactNode } from 'react';
import type { Scope } from '../core/types';
import { Icon, type IconName } from './icons';

export function Chip({ children, tone = 'neutral', icon }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'bad' | 'warn'; icon?: IconName }) {
  return (
    <span className={`pl-chip pl-chip--${tone}`}>
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}
export function ScopeChip({ scope }: { scope?: Scope }) {
  if (!scope) return null;
  return <Chip tone={scope === 'work' ? 'accent' : 'neutral'}>{scope}</Chip>;
}
export function Btn({
  children, onClick, kind = 'ghost', icon, disabled, title, small, type = 'button',
}: { children?: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'soft'; icon?: IconName; disabled?: boolean; title?: string; small?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button type={type} className={`pl-btn pl-btn--${kind}${small ? ' pl-btn--sm' : ''}`} onClick={onClick} disabled={disabled} title={title}>
      {icon && <Icon name={icon} size={small ? 13 : 15} />}
      {children}
    </button>
  );
}
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="pl-seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className={value === o.v ? 'is-on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="pl-skel" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ width: `${95 - i * 14}%` }} />
      ))}
    </div>
  );
}
export function Spinner() {
  return <span className="pl-spin" aria-label="Running" />;
}
export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="pl-empty">
      <Icon name={icon} size={22} />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="pl-sectitle">
      <h3>{children}</h3>
      {right}
    </div>
  );
}
