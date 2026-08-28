/**
 * participantNames — name resolution shared by the combat panel and the
 * beat line (rpg-project#249, rpg-dnd5e-web#564: names, not ids).
 * `Participant.name` is the wire's own display name — this module's only
 * job is building a lookup from the roster and special-casing the local
 * player as "You"/"you" for prose; it never invents a name of its own.
 */
import type { Participant } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/** Builds a `member id -> Participant.name` lookup from a `Turn`
 * participants list. */
export function participantNameMap(
  participants: readonly Participant[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of participants) {
    map.set(p.member, p.name);
  }
  return map;
}

/**
 * Resolves a member id to its display name for prose — "You" (sentence-
 * start reading, the design's own "You hit skeleton-1" wording) for the
 * local player, the roster's own name otherwise, and the raw id as a
 * last resort for a member this roster hasn't named (a defect on the
 * server's side per `Participant.name`'s own doc comment: "never empty
 * for a member the server can name" — not expected against a correct
 * server, but never thrown on).
 */
export function resolveName(
  names: Map<string, string>,
  id: string,
  member: string
): string {
  if (id === member) return 'You';
  return names.get(id) ?? id;
}

/** Same as `resolveName` but lowercase "you", for mid-sentence use
 * ("skeleton-1 hits you"). */
export function resolveNameLower(
  names: Map<string, string>,
  id: string,
  member: string
): string {
  if (id === member) return 'you';
  return names.get(id) ?? id;
}
