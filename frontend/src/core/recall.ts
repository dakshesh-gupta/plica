import type { ExcludedItem, MemoryPayload, RecallCandidate, RecallResult, Scope } from './types';

const WORK_WORDS = /\b(project|work|meeting|deadline|sprint|standup|stand-up|roadmap|client|report|ticket|release|code|team|office|manager|task|focus today|my day)\b/i;
const PERSONAL_INTENT = /\b(i|i'm|im|my|me|mine|for me|dinner|lunch|breakfast|recipe|meal|plan my|recommend|suggest|should i|what should)\b/i;

const TOPICS: Record<string, { prompt: RegExp; memory: RegExp }> = {
  food: {
    prompt: /\b(dinner|lunch|breakfast|meal|recipe|cook|cooking|eat|food|restaurant|snack|menu|groceries|dish)\b/i,
    memory: /\b(vegetarian|vegan|allerg\w*|dislike\w*|diet|eat|food|mushroom\w*|spicy|cuisine|meal|gluten|dairy|nuts?)\b/i,
  },
  work: {
    prompt: /\b(project|work|sprint|deadline|meeting|roadmap|report|release|standup|stand-up|plan|focus|today|status|update|priorit\w*)\b/i,
    memory: /\b(project|working on|work|sprint|deadline|meeting|roadmap|client|release|team)\b/i,
  },
  fitness: {
    prompt: /\b(run|running|workout|exercise|gym|train|training|fitness|10k|marathon|weekend)\b/i,
    memory: /\b(run|running|train|training|10k|marathon|gym|workout|fitness)\b/i,
  },
  travel: {
    prompt: /\b(trip|travel|flight|hotel|visit|vacation|itinerary|commute)\b/i,
    memory: /\b(travel|trip|flight|metro|commute|lives? in|live in|city)\b/i,
  },
  study: {
    prompt: /\b(study|exam|learn|course|homework|revise|syllabus|notes)\b/i,
    memory: /\b(study|exam|learn|course|homework|revising|preparing)\b/i,
  },
};

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'have', 'from', 'about', 'what', 'when', 'where', 'give', 'make', 'some', 'your', 'ideas', 'tonight', 'today', 'please', 'would', 'could']);

export function inferScope(prompt: string): Scope {
  return WORK_WORDS.test(prompt) ? 'work' : 'personal';
}
export function isPersonalIntent(prompt: string): boolean {
  return PERSONAL_INTENT.test(prompt) || Object.values(TOPICS).some((t) => t.prompt.test(prompt) && !WORK_WORDS.test(prompt));
}
export function topicsOf(text: string, side: 'prompt' | 'memory'): string[] {
  return Object.entries(TOPICS)
    .filter(([, t]) => t[side].test(text))
    .map(([k]) => k);
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

export function isRelevant(p: MemoryPayload, prompt: string): boolean {
  if (p.scope === 'style') return true; // style preferences shape every answer
  const pt = topicsOf(prompt, 'prompt');
  const mt = topicsOf(p.content, 'memory');
  if (pt.some((t) => mt.includes(t))) return true;
  const a = new Set(tokens(prompt));
  return tokens(p.content).some((w) => a.has(w));
}

export interface RecallInput {
  id: string;
  commitment: string;
  payload: MemoryPayload | null; // null => key destroyed
}

export function recall(prompt: string, items: RecallInput[], now = Date.now()): RecallResult {
  const promptScope = inferScope(prompt);
  const personalIntent = isPersonalIntent(prompt);
  const used: RecallCandidate[] = [];
  const available: RecallCandidate[] = [];
  const excluded: ExcludedItem[] = [];

  for (const it of items) {
    if (!it.payload) {
      excluded.push({ id: it.id, commitment: it.commitment, reason: 'deleted', detail: 'deleted' });
      continue;
    }
    const p = it.payload;
    const cand: RecallCandidate = { id: it.id, commitment: it.commitment, content: p.content, scope: p.scope, sensitivity: p.sensitivity };
    if (p.expiresAt && p.expiresAt < now) {
      excluded.push({ id: it.id, commitment: it.commitment, reason: 'expired', detail: 'expired' });
      continue;
    }
    if (p.maxUses && p.uses >= p.maxUses) {
      excluded.push({ id: it.id, commitment: it.commitment, reason: 'max uses reached', detail: 'max uses reached' });
      continue;
    }
    if (p.scope !== 'style' && p.scope !== promptScope) {
      excluded.push({ id: it.id, commitment: it.commitment, reason: 'out of scope', detail: `out of scope: ${p.scope}` });
      continue;
    }
    if (isRelevant(p, prompt)) used.push(cand);
    else available.push(cand);
  }
  return { promptScope, personalIntent, used, excluded, available };
}

export function buildContextBlock(items: { content: string }[]): string {
  if (!items.length) return '';
  return ['[Plica memory context — approved by the user]', ...items.map((i) => `- ${i.content}`), '[End Plica memory context]'].join('\n');
}

/** Sensitivity classifier. Runs locally; flags health & finance and defaults them to short retention. */
export function classifySensitivity(text: string): 'none' | 'health' | 'finance' {
  if (/\b(allerg\w*|diabet\w*|asthma|medicat\w*|therapy|anxiety|depress\w*|pregnan\w*|surgery|diagnos\w*|blood pressure|health)\b/i.test(text)) return 'health';
  if (/\b(salary|income|loan|debt|credit|bank|invest\w*|mortgage|tax|savings|portfolio)\b/i.test(text)) return 'finance';
  return 'none';
}

/** Find answer phrases that mention a memory's concrete words, to highlight in the X-ray. */
export function findHighlights(answer: string, used: { commitment: string; content: string }[]) {
  const spans: { start: number; end: number; commitment: string }[] = [];
  for (const u of used) {
    const words = Array.from(new Set(tokens(u.content).concat(u.content.match(/Project [A-Z]\w*/g) ?? [])));
    for (const w of words) {
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(answer))) spans.push({ start: m.index, end: m.index + m[0].length, commitment: u.commitment });
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: typeof spans = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) continue;
    merged.push(s);
  }
  return merged;
}
