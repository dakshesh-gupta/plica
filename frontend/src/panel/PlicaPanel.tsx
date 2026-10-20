import { useEffect, useRef, useState } from 'react';
import type { PlicaApi, PlicaState } from '../core/types';
import { ApiContext, usePlicaState } from './hooks';
import { Icon, Logo, type IconName } from './icons';
import { ApprovalCard } from './ApprovalCard';
import { CoachPanel } from './CoachPanel';
import { MemoryTab } from './MemoryTab';
import { ReceiptDrawer } from './ReceiptDrawer';
import { ReceiptsTab } from './ReceiptsTab';
import { StatusBanner, type BannerKind } from './StatusBanner';
import { TestPanel } from './TestPanel';
import { XRay } from './XRay';
import './panel.css';

export type TabId = 'memory' | 'xray' | 'receipts' | 'tests' | 'coach';
const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'memory', label: 'Memory', icon: 'brain' },
  { id: 'xray', label: 'X-ray', icon: 'scan' },
  { id: 'receipts', label: 'Receipts', icon: 'receipt' },
  { id: 'tests', label: 'Tests', icon: 'flask' },
  { id: 'coach', label: 'Coach', icon: 'spark' },
];

export interface PanelProps {
  api: PlicaApi;
  siteStatus?: 'supported' | 'unsupported' | 'unknown';
  supportedSite?: string;
  capturing?: boolean;
  forcedBanner?: BannerKind | null;
  demoControls?: boolean;
  demoKey?: boolean;
  verifyBase?: string;
  tab?: TabId;
  onTabChange?: (t: TabId) => void;
  onRegenerate?: (prompt: string) => void;
  onApprovalResolved?: (approved: boolean) => void;
  onNeedPanel?: (s: PlicaState) => void;
  className?: string;
  height?: number | string;
  /** Ask the panel to open a receipt drawer (nonce makes repeated requests for the same run work). */
  focusRun?: { id: string; nonce: number } | null;
}

export function PlicaPanel(p: PanelProps) {
  const state = usePlicaState(p.api);
  const [innerTab, setInnerTab] = useState<TabId>('memory');
  const tab = p.tab ?? innerTab;
  const setTab = (t: TabId) => (p.onTabChange ? p.onTabChange(t) : setInnerTab(t));
  const [selected, setSelected] = useState<string | undefined>();
  const [drawer, setDrawer] = useState<string | null>(null);
  const [bannerOff, setBannerOff] = useState(false);
  const lastRun = useRef<string | undefined>();

  // The newest answer becomes the X-ray subject automatically.
  useEffect(() => {
    const id = state?.runs[0]?.id;
    if (id && id !== lastRun.current) {
      lastRun.current = id;
      setSelected(id);
    }
  }, [state?.runs[0]?.id]);
  useEffect(() => setBannerOff(false), [p.forcedBanner, p.siteStatus]);
  useEffect(() => {
    if (p.focusRun) setDrawer(p.focusRun.id);
  }, [p.focusRun?.nonce]);

  const banner: BannerKind | null = p.capturing ? 'loading' : p.forcedBanner ?? (p.siteStatus === 'unsupported' ? 'site' : null);
  const drawerRun = state?.runs.find((r) => r.id === drawer);

  return (
    <ApiContext.Provider value={p.api}>
      <div className={`plica-panel ${p.className ?? ''}`} style={p.height ? { height: p.height } : undefined}>
        <header className="pl-head">
          <Logo size={22} />
          <b className="pl-head__name">Plica</b>
          <span className="pl-spacer" />
          {state && (
            <span className="pl-keychip" title={state.signer.did}>
              <Icon name="key" size={12} /> {p.demoKey ? 'Demo key' : 'Local key'} · {state.signer.short.slice(8, 18)}
            </span>
          )}
          <span className={`pl-site ${p.siteStatus === 'unsupported' ? 'is-off' : 'is-on'}`}>
            <i /> {p.siteStatus === 'unsupported' ? 'Not supported' : 'Active'}
          </span>
        </header>

        {!state ? (
          <div className="pl-body"><div className="pl-skel" style={{ padding: 16 }}><span style={{ width: '80%' }} /><span style={{ width: '60%' }} /><span style={{ width: '70%' }} /></div></div>
        ) : (
          <>
            {state.pending && (
              <ApprovalCard
                proposal={state.pending}
                onResolve={async (ids) => {
                  await p.api.resolve(state.pending!.id, ids);
                  p.onApprovalResolved?.(!!ids);
                }}
              />
            )}
            {banner && !bannerOff && <div className="pl-bannerwrap"><StatusBanner kind={banner} supportedSite={p.supportedSite} onDismiss={banner === 'loading' ? undefined : () => setBannerOff(true)} /></div>}
            <nav className="pl-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
                  <Icon name={t.icon} size={15} />
                  <span>{t.label}</span>
                  {t.id === 'coach' && <em>{state.coach.score}</em>}
                  {t.id === 'receipts' && state.runs.length > 0 && <em>{state.runs.length}</em>}
                </button>
              ))}
            </nav>
            <div className="pl-body" role="tabpanel">
              {tab === 'memory' && <MemoryTab memories={state.memories} api={p.api} />}
              {tab === 'xray' && <XRay runs={state.runs} memories={state.memories} api={p.api} runId={selected} onSelectRun={setSelected} onRegenerate={p.onRegenerate} capturing={p.capturing} onOpenReceipt={setDrawer} />}
              {tab === 'receipts' && <ReceiptsTab state={state} api={p.api} onOpen={setDrawer} />}
              {tab === 'tests' && <TestPanel />}
              {tab === 'coach' && <CoachPanel coach={state.coach} api={p.api} demoControls={p.demoControls} />}
            </div>
            {drawerRun && <ReceiptDrawer run={drawerRun} memories={state.memories} api={p.api} verifyBase={p.verifyBase} onClose={() => setDrawer(null)} />}
          </>
        )}
      </div>
    </ApiContext.Provider>
  );
}
