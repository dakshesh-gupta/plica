import { useEffect, useState } from 'react';
import type { PlicaApi, Run, VerifyReport } from '../core/types';
import { badgeStatusFromReport } from '../core/verify';
import { Icon } from './icons';

export type BadgeStatus = 'capturing' | 'verifying' | 'anchored' | 'recorded' | 'failed' | 'key-error';

export function BadgeView({ status, onClick, detail }: { status: BadgeStatus; onClick?: () => void; detail?: string }) {
  const map: Record<BadgeStatus, { label: string; icon: 'shield' | 'check' | 'alert' | 'clock' | 'key' }> = {
    capturing: { label: 'Plica · capturing answer…', icon: 'clock' },
    verifying: { label: 'Plica · verifying…', icon: 'clock' },
    anchored: { label: 'Plica · Verified · Anchored', icon: 'check' },
    recorded: { label: 'Plica · Recorded', icon: 'shield' },
    failed: { label: 'Plica · Verification failed', icon: 'alert' },
    'key-error': { label: 'Key unavailable: this memory was forgotten', icon: 'key' },
  };
  const m = map[status];
  return (
    <button className={`pl-vbadge pl-vbadge--${status}`} onClick={onClick} title={detail ?? 'Open receipt'} type="button">
      {status === 'capturing' || status === 'verifying' ? <span className="pl-spin pl-spin--sm" /> : <Icon name={m.icon} size={13} />}
      <span>{m.label}</span>
    </button>
  );
}

export const statusFromReport = (r: VerifyReport): BadgeStatus => badgeStatusFromReport(r);

/** Verification badge shown near an answer. Runs the real browser-side checks. */
export function VerifyBadge({ api, run, capturing, onClick }: { api: PlicaApi; run?: Run; capturing?: boolean; onClick?: () => void }) {
  const [status, setStatus] = useState<BadgeStatus>('verifying');
  useEffect(() => {
    if (!run) return;
    let alive = true;
    setStatus('verifying');
    api.verifyRun(run.id).then((r) => alive && setStatus(statusFromReport(r))).catch(() => alive && setStatus('failed'));
    return () => {
      alive = false;
    };
  }, [api, run?.id]);
  if (capturing || !run) return <BadgeView status="capturing" />;
  return <BadgeView status={status} onClick={onClick} detail={run.receipt.receiptId} />;
}
