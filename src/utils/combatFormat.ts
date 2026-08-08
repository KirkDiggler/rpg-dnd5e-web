/**
 * Small pure formatting helpers shared by the v1alpha2 combat surfaces
 * (PlaytestHarness and GameView's EncounterView, #440) so both render
 * server-pushed state through the same lookup — never two copies drifting
 * apart. Display resolution stays web-side (never the wire's possibly-empty
 * display_name), keyed by the condition/ref's `id` through
 * `conditionIcons.ts`'s `getConditionDisplay`.
 */

import { getConditionDisplay } from './conditionIcons';

/** Icon + label badge text for one entity's status list, e.g. "🏃 Dodging, 🫥 Hidden". */
export function formatStatusBadges(
  statuses: Array<{ source: { id: string } }>
): string {
  return statuses
    .map((s) => {
      const d = getConditionDisplay(s.source.id);
      return `${d.icon} ${d.label}`;
    })
    .join(', ');
}

/** Comma-joined display labels for a list of condition source refs (e.g. `advantage_sources`). */
export function formatSourceRefs(refs: Array<{ id: string }>): string {
  return refs.map((r) => getConditionDisplay(r.id).label).join(', ');
}

/**
 * Extract a readable message from a caught RPC rejection. ConnectError's
 * `.message` is already prefixed with the status code (e.g.
 * `[invalid_argument] target.entity_id is required`), so this doubles as
 * "code + message" without callers needing to know about ConnectError.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * D&D-voice narration for an ActionResolved `target_rationale` ref (Monster
 * AI slice 1, rpg-dnd5e-web#733, rpg-api-protos#215). Per the Boundary Rule
 * the server sends only a ref — the client owns all prose, mapped here.
 *
 * `dnd5e:targeting:closest` renders nothing: it's the default for any
 * monster without special targeting logic, so voicing it on every routine
 * turn would bury the rarer, more telling lowest-hp/lowest-ac calls in
 * noise. Absent and unknown refs also render nothing, and never throw —
 * an unrecognized ref (a future targeting strategy this map hasn't caught
 * up to yet) degrades to today's line rather than breaking the log.
 */
const TARGET_RATIONALE_VOICE: Record<string, string> = {
  'dnd5e:targeting:lowest-hp': 'turns on the most wounded',
  'dnd5e:targeting:lowest-ac': 'picks out the least armored',
};

/** Trailing clause (" — turns on the most wounded") for a target_rationale ref, or '' when there's nothing to say. */
export function formatTargetRationale(ref?: string): string {
  if (!ref) return '';
  const voice = TARGET_RATIONALE_VOICE[ref];
  return voice ? ` — ${voice}` : '';
}
