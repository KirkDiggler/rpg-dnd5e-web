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
