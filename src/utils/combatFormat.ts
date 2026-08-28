/**
 * Small pure formatting helpers shared by the v1alpha2 combat surfaces
 * (PlaytestHarness and GameView's EncounterView, #440) so both render
 * server-pushed state through the same lookup — never two copies drifting
 * apart. Display resolution stays web-side (never the wire's possibly-empty
 * display_name), keyed by the condition/ref's `id` through
 * `conditionIcons.ts`'s `getConditionDisplay`.
 */

import type { CubeCoord } from '../components/hex-grid/hexMath';
import { hexDistance } from '../components/hex-grid/hexMath';
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

/**
 * In-fiction verb for one `EntityMoved` event (rpg-dnd5e-web#738). The wire
 * carries positions, not narration — a monster's move is a decisive combat
 * fact (walking five hexes past a healthy target to reach a wounded one)
 * that was previously invisible in the log, so this is a deliberate
 * exception to the "no derived math" rule the rest of the combat log
 * follows: there's no server-authored line to render verbatim, only
 * positions to read a direction out of. `targetEntityId` is the raw wire id
 * (matching every other combat-log line — attack/damage entries show
 * `goblin-1`/`char-alice`, not a resolved display name), never a hex count
 * or coordinate.
 */
export type MovementNarration =
  | { verb: 'closes'; targetEntityId: string }
  | { verb: 'retreats' }
  | { verb: 'moves' };

/**
 * Derive a movement's narration from positions alone. `to` is whichever
 * CHARACTER the mover ends up nearest to — the one the movement effectively
 * targets. Comparing that same character's distance before vs. after the
 * move (rather than "nearest before") is what correctly narrates a monster
 * walking PAST a closer target to reach a farther, more urgent one: the
 * character it ends up next to is what "closes on X" names, not whoever
 * merely started closest.
 *
 * Degrades to a neutral `{ verb: 'moves' }` whenever there isn't enough to
 * go on — no prior position (a just-appeared entity) or no characters to
 * measure against — rather than fabricating a direction.
 */
export function describeEntityMovement(
  from: CubeCoord | undefined,
  to: CubeCoord,
  characterPositions: Array<{ entityId: string; position: CubeCoord }>
): MovementNarration {
  if (!from || characterPositions.length === 0) return { verb: 'moves' };

  let nearestAfter: { entityId: string; position: CubeCoord } | undefined;
  let nearestAfterDistance = Infinity;
  for (const c of characterPositions) {
    const d = hexDistance(to, c.position);
    if (d < nearestAfterDistance) {
      nearestAfterDistance = d;
      nearestAfter = c;
    }
  }
  if (!nearestAfter) return { verb: 'moves' };

  const distanceBeforeToTarget = hexDistance(from, nearestAfter.position);
  if (nearestAfterDistance < distanceBeforeToTarget) {
    return { verb: 'closes', targetEntityId: nearestAfter.entityId };
  }
  if (nearestAfterDistance > distanceBeforeToTarget) {
    return { verb: 'retreats' };
  }
  return { verb: 'moves' };
}
