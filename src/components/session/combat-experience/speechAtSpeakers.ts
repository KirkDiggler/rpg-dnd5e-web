/**
 * speechAtSpeakers — which creature is saying which line on the map right
 * now (rpg-project#842, R2).
 *
 * A creature's answer that speaks to the viewer — the answer to their own
 * line (`answer-to-your-line`) or the line a barrier says when they bump him
 * (`answer-to-your-bump`), or his hail when they walk up (`line-to-you`) —
 * shows as speech above the speaker, for as long as
 * its notice is on screen. Nothing here decides who heard what: only rows the
 * toast policy already toasts, from acts the server sent, can speak.
 */
import type { ToastCase } from './toastPolicy';
import type { CombatExperienceStoryExchange } from './types';

const SPEECH_CASES: ReadonlySet<ToastCase> = new Set<ToastCase>([
  'answer-to-your-line',
  'answer-to-your-bump',
  'line-to-you',
]);

/** Each speaker's line on screen, by member id; the newest line wins. */
export function speechAtSpeakers(
  notices: readonly CombatExperienceStoryExchange[]
): ReadonlyMap<string, string> {
  const speech = new Map<string, string>();
  for (const entry of notices) {
    const rule = entry.toastRule;
    const act = entry.act;
    if (!rule || !SPEECH_CASES.has(rule.case)) continue;
    if (act?.body.case !== 'tableAnswer') continue;
    const { who, say } = act.body.value;
    if (who?.id && say) speech.set(who.id, say);
  }
  return speech;
}
