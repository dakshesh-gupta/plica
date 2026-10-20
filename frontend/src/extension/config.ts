import cfg from './selectors.config.json';

export interface SiteConfig {
  name: string;
  matches: string[];
  selectors: { composer: string[]; sendButton: string[]; stopButton: string[]; assistantMessage: string[]; modelLabel?: string[] };
  answerSettleMs: number;
  maxAnswerWaitMs: number;
}
export const SITE_ID: string = cfg.activeSite;
export const SITE: SiteConfig = (cfg.sites as Record<string, SiteConfig>)[cfg.activeSite];
export const PLICA_SITE_URL: string = cfg.plicaSiteUrl;
export const APPROVAL_TIMEOUT_MS: number = cfg.approvalTimeoutMs;

export function hostMatches(url?: string): boolean {
  if (!url) return false;
  return SITE.matches.some((m) => {
    const re = new RegExp('^' + m.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return re.test(url);
  });
}
