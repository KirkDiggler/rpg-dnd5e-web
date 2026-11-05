/**
 * targetClickIntent — what a click on a creature means (SessionCanvas's one
 * target-click seam). Pure, so the move picker's decision is testable
 * without a canvas.
 *
 * THE BUMP (rpg-project#835 R8). On the move picker, a click on a live body
 * whose state blocks, that is neither attackable nor allied, walks up to him
 * and into his cell (`findAtlasBump`); the server stops the walk and he
 * answers. An attackable body is still attacked, a placed world NPC still
 * interacted with, and an armed Speak still approaches. A body that does not
 * block, or is allied, stays as before. Every fact read here is the
 * server's: the passage, the stance, the offers.
 */
import {
  MemberKind,
  Passage,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { SightedMember } from './sightingEntities';
import { STANCE_ALLIED } from './stanceRing';

export type TargetClickIntent =
  | 'select'
  | 'aim'
  | 'interact'
  | 'attack'
  | 'approach'
  | 'bump'
  | 'none';

/** A live body whose state blocks, not allied, and not a world NPC. */
export function blocksTheWay(member: SightedMember | undefined): boolean {
  return (
    !!member &&
    !member.remembered &&
    member.passage === Passage.BLOCKED &&
    member.stance !== STANCE_ALLIED &&
    member.kind !== MemberKind.WORLD
  );
}

export interface TargetClickArgs {
  /** The clicked member's live or remembered sighting; absent for self. */
  observed: SightedMember | undefined;
  /** The click is on the viewer's own entity. */
  isSelf: boolean;
  /** A member-target choice is armed (an attack or a cast picking whom). */
  memberTargeting: boolean;
  /** A cell-aimed offer is armed. */
  cellAim: boolean;
  /** The subject is on the armed or offered attack list. */
  attackable: boolean;
  /** An armed Speak walks toward whom it cannot reach. */
  approachArmed: boolean;
  /** The move picker is live: a floor click would walk. */
  moveArmed: boolean;
}

export function targetClickIntent(args: TargetClickArgs): TargetClickIntent {
  const { observed, isSelf, memberTargeting, cellAim, attackable } = args;
  if (memberTargeting)
    return !observed?.remembered && attackable && (observed || isSelf)
      ? 'select'
      : 'none';
  if (cellAim && observed) return 'aim';
  if (observed?.kind === MemberKind.WORLD) return 'interact';
  if (attackable) return 'attack';
  if (!observed || observed.remembered) return 'none';
  if (args.approachArmed) return 'approach';
  if (args.moveArmed && blocksTheWay(observed)) return 'bump';
  return 'none';
}
