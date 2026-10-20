import { topicsOf } from './recall';
import type { CoachState, MemoryView, Run, Suggestion } from './types';

const DAY = 86_400_000;
export const FRESH_WINDOW_DAYS = 180;
const GENERIC = /^(likes? (food|music|movies)|good|nice|stuff|things|misc)\b/i;

const CONFLICT_RULES: { name: string; a: RegExp; b: RegExp; label: string }[] = [
  { name: 'city', a: /\b(?:i )?live[s]? in ([A-Za-z]+)/i, b: /\b(?:i )?live[s]? in ([A-Za-z]+)/i, label: 'where you live' },
  { name: 'diet', a: /\bvegetarian|vegan\b/i, b: /\b(eat|likes?) (meat|chicken|non-?veg|fish)\b/i, label: 'your diet' },
  { name: 'length', a: /\b(short|brief|concise)\b/i, b: /\b(detailed|long|thorough|in-depth)\b/i, label: 'answer length' },
];

export function detectConflicts(mems: MemoryView[]): [MemoryView, MemoryView, string][] {
  const live = mems.filter((m) => m.keyAvailable && m.content);
  const out: [MemoryView, MemoryView, string][] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const A = live[i].content!;
      const B = live[j].content!;
      for (const rule of CONFLICT_RULES) {
        if (rule.name === 'city') {
          const ma = rule.a.exec(A);
          const mb = rule.b.exec(B);
          if (ma && mb && ma[1].toLowerCase() !== mb[1].toLowerCase()) out.push([live[i], live[j], rule.label]);
        } else if ((rule.a.test(A) && rule.b.test(B)) || (rule.b.test(A) && rule.a.test(B))) out.push([live[i], live[j], rule.label]);
      }
    }
  }
  return out;
}

export function isVague(content: string): boolean {
  const words = content.trim().split(/\s+/).filter(Boolean);
  return words.length < 2 || GENERIC.test(content.trim());
}

export function computeCoach(mems: MemoryView[], runs: Run[], dismissed: string[], now = Date.now()): CoachState {
  const live = mems.filter((m) => m.status === 'active' && m.keyAvailable && m.content);
  const suggestions: Suggestion[] = [];
  const push = (s: Suggestion) => {
    if (!dismissed.includes(s.id)) suggestions.push(s);
  };

  // --- Score components -----------------------------------------------------
  const personalRuns = runs.filter((r) => r.personalIntent);
  const hits = personalRuns.filter((r) => r.contentHits > 0).length;
  const hitRate = personalRuns.length ? hits / personalRuns.length : 1;
  const specific = live.filter((m) => !isVague(m.content!)).length;
  const specificity = live.length ? specific / live.length : 0;
  const fresh = live.filter((m) => {
    const win = m.expiresAt ? Math.max(1, (m.expiresAt - m.createdAt) / DAY) : FRESH_WINDOW_DAYS;
    return now - (m.confirmedAt ?? m.createdAt) <= win * DAY;
  }).length;
  const freshness = live.length ? fresh / live.length : 0;
  const conflicts = detectConflicts(live);
  const inConflict = new Set(conflicts.flatMap(([a, b]) => [a.id, b.id]));
  const consistency = live.length ? 1 - inConflict.size / live.length : 0;
  const score = live.length ? Math.round(hitRate * 40 + specificity * 25 + freshness * 20 + consistency * 15) : 0;

  // --- Gaps -----------------------------------------------------------------
  const topicMisses: Record<string, number> = {};
  for (const r of personalRuns) {
    if (r.contentHits === 0) for (const t of topicsOf(r.prompt, 'prompt')) topicMisses[t] = (topicMisses[t] ?? 0) + 1;
  }
  for (const [t, n] of Object.entries(topicMisses)) {
    if (t === 'work') continue;
    push({
      id: `gap:${t}`,
      kind: 'gap',
      title: `No memory was used for ${t} questions`,
      body: `You asked about ${t} ${n} time${n > 1 ? 's' : ''} and no memory was used. Add one?`,
      action: { type: 'add', label: 'Add', scope: 'personal', prefill: '' },
    });
  }
  // Food completeness: the demo moment after the dinner question.
  const askedFood = personalRuns.some((r) => topicsOf(r.prompt, 'prompt').includes('food'));
  const hasDislikes = live.some((m) => /\b(allerg\w*|dislike\w*|avoid|hate)\b/i.test(m.content!));
  if (askedFood && !hasDislikes) {
    push({
      id: 'gap:food-detail',
      kind: 'gap',
      title: 'Better meal ideas',
      body: 'Add your allergies or foods you dislike for better meal ideas.',
      note: 'Optional, and short retention is recommended.',
      action: { type: 'add', label: 'Add', scope: 'personal', prefill: 'I dislike mushrooms' },
    });
  }

  // --- Vague ----------------------------------------------------------------
  for (const m of live) {
    if (isVague(m.content!)) {
      push({
        id: `vague:${m.id}`,
        kind: 'vague',
        title: 'Too general to help',
        body: `“${m.content}” → try something concrete, like “Vegetarian, no mushrooms”.`,
        action: { type: 'refine', label: 'Refine', memoryIds: [m.id], prefill: m.content },
      });
    }
  }

  // --- Stale ----------------------------------------------------------------
  for (const m of live) {
    const age = now - (m.confirmedAt ?? m.createdAt);
    if (age > FRESH_WINDOW_DAYS * DAY) {
      const months = Math.round(age / (30 * DAY));
      push({
        id: `stale:${m.id}`,
        kind: 'stale',
        title: 'Still true?',
        body: `“${m.content}” is ${months} months old. Still true?`,
        action: { type: 'confirm', label: 'Confirm still true', memoryIds: [m.id] },
      });
    }
  }

  // --- Conflicts ------------------------------------------------------------
  for (const [a, b, label] of conflicts) {
    push({
      id: `conflict:${a.id}:${b.id}`,
      kind: 'conflict',
      title: `Two memories disagree about ${label}`,
      body: `You have ‘${a.content}’ and ‘${b.content}’. Keep one?`,
      action: { type: 'remove', label: 'Remove older', memoryIds: [a.createdAt <= b.createdAt ? a.id : b.id] },
    });
  }

  // --- Scope mistakes ---------------------------------------------------------
  for (const m of live) {
    if (m.scope === 'work' && /\b(study|exam|homework|syllabus)\b/i.test(m.content!)) {
      push({
        id: `scope:${m.id}`,
        kind: 'scope',
        title: 'Scope looks too narrow',
        body: 'This study preference is only available to the ‘work’ scope.',
        action: { type: 'rescope', label: 'Rescope', memoryIds: [m.id], scope: 'personal' },
      });
    }
  }

  // --- Unused -----------------------------------------------------------------
  const neverUsed = live.filter((m) => (m.uses ?? 0) === 0 && now - m.createdAt > 7 * DAY);
  if (neverUsed.length >= 2) {
    push({
      id: 'unused:' + neverUsed.map((m) => m.id).join(','),
      kind: 'unused',
      title: 'Memories that were never used',
      body: `These ${neverUsed.length} items were never used. Remove or rescope?`,
      action: { type: 'remove', label: 'Remove', memoryIds: neverUsed.map((m) => m.id) },
    });
  }

  // --- Style ------------------------------------------------------------------
  if (live.length && !live.some((m) => m.scope === 'style')) {
    push({
      id: 'style:none',
      kind: 'style',
      title: 'Tell answers how to sound',
      body: 'Add how you like answers: short, step by step, examples?',
      action: { type: 'add', label: 'Add', scope: 'style', prefill: 'Prefers short answers' },
    });
  }

  return { score, components: { hitRate, specificity, freshness, consistency }, suggestions };
}
