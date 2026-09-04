/**
 * standingActions — the seam's standing verbs as dock offers, and the one
 * question about them the client may answer itself.
 *
 * Search, Loot, Hold and Leave are NOT declarations and never pretend to
 * be. `Afford` does not compile them: each is its own RPC at the seam,
 * offered whenever the client can name a target, and the server is the
 * only thing that decides whether one is allowed. Design §4.4 says they
 * join the Afford enum the day one costs a slot mid-fight; this module is
 * what becomes that mapping when it does.
 *
 * Pure, and in its own file rather than beside the dock, for the reason
 * every other selector on this route is (`selection.ts`,
 * `actionTooltip.ts`): a component file that also exports functions
 * breaks fast refresh, and a rule that can be tested without a DOM should
 * be.
 */
import {
  ClockKind,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/** One standing verb, ready to draw. */
export interface StandingAction {
  /** Stable across renders — the button's key and its test id. */
  key: string;
  label: string;
  icon: string;
  /** What the button says it does, when it is offered. */
  title: string;
  /** An RPC of this kind is in flight. */
  pending?: boolean;
  onSelect: () => void;
}

/** The one reason that belongs to these verbs alone. Every other reason
 * the dock gives — stale authority, no clock yet — is already announced
 * once by the row above them, and repeating it per button would say the
 * same sentence five times to a screen reader. */
export const NOT_YOUR_TURN = 'Not your turn';

/**
 * Why the standing verbs are not clickable right now, or null when they
 * are.
 *
 * FREE ON YOUR TURN, REFUSED OFF IT (design §4.4). Out of combat there is
 * no turn economy and they are simply free. In a fight the engine refuses
 * them off-turn, and the button says so rather than sending a call that
 * comes back refused — whose turn it is is public (`Turn.active`, the same
 * fact the dock already reads to decide whose commands to draw), so this
 * is presentation of a known fact and not a rule invented here. The server
 * stays the authority either way: on-turn the button is enabled and the
 * seam still refuses out of range, already held, or closed.
 */
export function standingActionsBlocked(
  clock: ClockKind,
  viewerMember: string,
  participants: readonly Participant[],
  authorityFresh: boolean
): string | null {
  if (clock === ClockKind.WORLD) {
    return authorityFresh ? null : 'Actions may be out of date';
  }
  if (clock !== ClockKind.TURN) return 'Waiting for authority';
  if (!authorityFresh) return 'Actions may be out of date';
  const active = participants.find((participant) => participant.active);
  if (!active || active.member !== viewerMember) return NOT_YOUR_TURN;
  return null;
}
