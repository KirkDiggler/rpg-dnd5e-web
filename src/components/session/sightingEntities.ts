/**
 * sightingEntities — turns `GetViewResponse.sightings` into what
 * `SessionScene` needs to draw one `HexEntity` per other member the local
 * player currently perceives (rpg-dnd5e-web#762 slice 3, grown for the
 * combat turn — rpg-project#249 — to carry the wire's own `name` and
 * `standing` instead of a raw subject id and a client-side downed guess).
 *
 * Rules straight from `Sighting`'s own wire doc comment (types_pb.ts), all
 * enforced here rather than left for the render layer to remember:
 *
 *   - `seen` unset means no position is known for this subject at all —
 *     never guessed, never drawn (`sightingsToEntities` simply omits it).
 *   - `currentVia` empty means the observer holds a MEMORY, not a live
 *     sighting — still drawn, but flagged `remembered` so the caller can
 *     feed `HexEntity.knowledgeState="remembered"`, the same frozen/
 *     crypt-colored treatment `sceneKnowledge.ts` already gives a
 *     out-of-LoS memory elsewhere in this codebase (not a new visual
 *     language).
 *   - `Sighting.name` is the display name (rpg-dnd5e-web#564: names, not
 *     ids) — "anything an observer can sight, they can name" per its own
 *     doc comment, so this is never empty for a drawn entity.
 *   - `Sighting.seen.standing` is sight-channel knowledge (ADR-0041) —
 *     whether this subject is on its feet, from the SAME typed field the
 *     combat panel's participant list reads for the roster (`Participant.
 *     standing`). `STANDING_UNSPECIFIED` (an observer who has never
 *     resolved this) reads as `Standing.UP` for rendering purposes — see
 *     `standing`'s own field comment below.
 *   - `Sighting.kind` (protos#245/toolkit#1231, rpg-dnd5e-web#792) is which
 *     render path the caller routes a sighted member down — PLAYER goes to
 *     `HexEntity`'s player path, everything else (including
 *     `MEMBER_KIND_UNSPECIFIED`) to its monster path. UNSPECIFIED stays on
 *     the monster path rather than flipping to player because that is the
 *     behavior this module already had BEFORE `kind` existed — a producer
 *     bug that leaves `kind` unset degrades to the known, already-shipped
 *     fallback (goblin-if-unmapped) rather than a NEW untested one (a real
 *     monster silently rendering as a neutral human, which would be a
 *     worse and less discoverable lie in a combat context than the
 *     original goblin bug this issue fixes). Once toolkit#1231 lands fully,
 *     UNSPECIFIED should not occur for a live sighting at all — same
 *     "defensive, not primary" status as `standing`'s own UNSPECIFIED case.
 *
 * `payload` is never read here — position/name/standing come only from
 * typed fields, per the review brief's "NEVER decode; render only from
 * typed data" rule.
 */
import type { Sighting } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  MemberKind,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { CubeCoord } from '../hex-grid/hexMath';
import { positionToCube } from './positionBridge';

export interface SightedMember {
  /** The wire subject id, e.g. "skeleton-1" — this entity's React key and
   * `HexEntity.entityId`. */
  subject: string;
  /** Display name (`Sighting.name`) — never empty for a drawn entity. */
  name: string;
  /** `Sighting.kind`, verbatim — which render path the caller routes this
   * member down (rpg-dnd5e-web#792: a sighted PLAYER is a person, not a
   * monster wearing that player's name). `MEMBER_KIND_UNSPECIFIED` reads as
   * MONSTER for rendering purposes — see `monsterRefId`'s own doc comment
   * below, the same "producer bug is the server's, not a reason to invent a
   * new default" reasoning `standing`'s doc comment already gives. */
  kind: MemberKind;
  /** The toolkit monster ref id derived from `subject` (strips the
   * trailing `-<ordinal>`) — feeds `resolveMonsterModelUrl` via
   * `HexEntity.monsterRefId`. Undefined for a PLAYER-kind subject: a
   * character id has no monster ref to strip toward, and deriving one
   * anyway is exactly the bug #792 exists to fix. `MEMBER_KIND_UNSPECIFIED`
   * still gets one derived, same as MONSTER — the least-presumptuous
   * reading is the ALREADY-ESTABLISHED behavior (this field predates
   * `kind` entirely), not a new one; see this module's own top-of-file
   * doc comment for the full reasoning. */
  monsterRefId: string | undefined;
  position: CubeCoord;
  /** True when `currentVia` was empty — a held memory, not a live
   * sighting. Feeds `HexEntity.knowledgeState="remembered"`. */
  remembered: boolean;
  /** `Sighting.seen.standing`, verbatim — drives `HexEntity.isDead`
   * (`Standing.DOWNED`) so a felled monster renders its downed variant
   * from the SAME typed fact the combat panel's roster uses, never a
   * client-side HP-reaches-zero guess. `STANDING_UNSPECIFIED` (never
   * resolved by this observer) is treated as `UP` — the least
   * presumptuous reading; a producer bug here is the server's, not a
   * reason to draw a live monster face-down. */
  standing: Standing;
}

/** Strips a subject id's trailing `-<ordinal>` (e.g. "skeleton-1" ->
 * "skeleton", "skeleton-captain-9" -> "skeleton-captain") to recover the
 * toolkit monster ref id `resolveMonsterModelUrl` keys on. A subject with
 * no trailing ordinal (unexpected, defensive only) is returned unchanged
 * rather than mangled. */
export function monsterRefIdFromSubject(subject: string): string {
  return subject.replace(/-\d+$/, '');
}

/**
 * `sightings` is `GetViewResponse.sightings`, as-is. `ownMember` is the
 * local player's own member/character id — GetView's own doc comment says
 * it already skips the observer's self, so this filter is defensive
 * belt-and-suspenders (a future member shape or a server edge case),
 * never the primary mechanism.
 */
export function sightingsToEntities(
  sightings: Sighting[],
  ownMember: string
): SightedMember[] {
  const entities: SightedMember[] = [];
  for (const sighting of sightings) {
    if (sighting.subject === ownMember) continue;
    if (!sighting.seen?.position) continue;
    const isPlayer = sighting.kind === MemberKind.PLAYER;
    entities.push({
      subject: sighting.subject,
      name: sighting.name || sighting.subject,
      kind: sighting.kind,
      monsterRefId: isPlayer
        ? undefined
        : monsterRefIdFromSubject(sighting.subject),
      position: positionToCube(sighting.seen.position),
      remembered: sighting.currentVia.length === 0,
      standing: sighting.seen.standing,
    });
  }
  return entities;
}

/** `standing === Standing.DOWNED`, verbatim — the one place this reading
 * is asserted (see `SightedMember.standing`'s own doc comment on why
 * `UNSPECIFIED` is not downed). */
export function isSightedDowned(standing: Standing): boolean {
  return standing === Standing.DOWNED;
}
