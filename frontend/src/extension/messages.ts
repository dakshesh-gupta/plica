import type { PlicaState } from '../core/types';

export type ToBackground =
  | { t: 'rpc'; method: string; args: unknown[] }
  | { t: 'intercept'; prompt: string }
  | { t: 'answer'; proposalId: string; answer: string; model: string }
  | { t: 'open-panel'; runId?: string }
  | { t: 'site-status' };

export type Decision = 'none' | 'approved' | 'skipped' | 'timeout' | 'error';
export interface InterceptReply {
  proposalId?: string;
  decision: Decision;
  contextBlock?: string;
  keyUnavailable?: boolean;
  error?: string;
}
export interface AnswerReply {
  ok: boolean;
  runId?: string;
  receiptId?: string;
  status?: 'anchored' | 'recorded' | 'failed';
  error?: string;
}
export type ToPanel = { t: 'state'; state: PlicaState };
