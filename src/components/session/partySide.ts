/**
 * partySide — which side of the table a combatant stands on, for THIS viewer
 * (rpg-project#733, Frank's list S9).
 *
 * A companion (a creature whose faction turned `allied` to the party) stays a
 * monster placement driven by its own table: it never joins the party roster
 * or changes the initiative order (rpg-toolkit encounter decisions,
 * 2026-10-29). What the screen owes the player is where it stands, so the
 * strip and the recap can put it beside the party.
 *
 * READ, NEVER DERIVED. The side is the viewer's believed stance that already
 * rides each sighting (`Sighting.stance`, re-derived by the engine on every
 * read through `encounter.BelievedStance`). Players are the party by the
 * rulebook's own reservation. This module only says which word goes on which
 * side: it reads no faction, no hit points and no rule.
 *
 * EMPTY IS NO SIDE. A sighting with no stance, a stance this build does not
 * know, or a creature never sighted answers `undefined`, and the caller draws
 * it exactly as it always did.
 */
import type { Sighting } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  MemberKind,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { STANCE_ALLIED, STANCE_HOSTILE, STANCE_NEUTRAL } from './stanceRing';

export type PartySide = 'party' | 'opposed' | 'neutral';

/** The side one combatant stands on, from its kind and the viewer's stance. */
export function sideOf(
  kind: MemberKind,
  stance: string | undefined
): PartySide | undefined {
  if (kind === MemberKind.PLAYER) return 'party';
  switch (stance) {
    case STANCE_ALLIED:
      return 'party';
    case STANCE_HOSTILE:
      return 'opposed';
    case STANCE_NEUTRAL:
      return 'neutral';
    default:
      return undefined;
  }
}

/** The viewer's believed stance per sighted subject, by member id. */
export function stancesBySubject(
  sightings: readonly Sighting[]
): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const s of sightings) if (s.stance) out.set(s.subject, s.stance);
  return out;
}

/**
 * Who came with the party: every creature this viewer last saw on its feet
 * and believes allied. Players are not listed (they are the party), and a
 * companion last seen down did not come along.
 */
export function companionsStanding(
  sightings: readonly Sighting[]
): readonly string[] {
  return sightings
    .filter(
      (s) =>
        s.kind !== MemberKind.PLAYER &&
        s.stance === STANCE_ALLIED &&
        s.seen?.standing !== Standing.DOWNED
    )
    .map((s) => s.name || s.subject);
}

/** "Aldric came with you.", "Aldric and Bors came with you.", or nothing. */
export function companionsLine(names: readonly string[]): string | undefined {
  if (names.length === 0) return undefined;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} came with you.`;
}
