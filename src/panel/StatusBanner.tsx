import { Icon } from './icons';
import { Skeleton } from './ui';

export type BannerKind = 'key' | 'site' | 'loading' | 'error';
export function StatusBanner({ kind, text, supportedSite, onDismiss }: { kind: BannerKind; text?: string; supportedSite?: string; onDismiss?: () => void }) {
  if (kind === 'loading')
    return (
      <div className="pl-banner pl-banner--loading" role="status">
        <div className="pl-banner__row"><span className="pl-spin" /> <b>Capturing the answer…</b></div>
        <Skeleton lines={3} />
      </div>
    );
  const cfg = {
    key: { icon: 'key' as const, title: 'Key unavailable: this memory was forgotten', body: 'Its key was destroyed, so the ciphertext can never be read again. Plica will not supply it to any prompt.' },
    site: { icon: 'globe' as const, title: 'Site not supported', body: `Plica works on ${supportedSite ?? 'one chat site'} in this build. Open it in this tab to use your memories.` },
    error: { icon: 'alert' as const, title: text ?? 'Something went wrong', body: 'Nothing was inserted into your prompt.' },
  }[kind];
  return (
    <div className={`pl-banner pl-banner--${kind}`} role="alert">
      <Icon name={cfg.icon} size={18} />
      <div>
        <b>{cfg.title}</b>
        <p>{cfg.body}</p>
      </div>
      {onDismiss && (
        <button className="pl-banner__x" onClick={onDismiss} aria-label="Dismiss">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}
