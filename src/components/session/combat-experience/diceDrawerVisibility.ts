/**
 * diceDrawerVisibility — whether the dice tray is showing, and who decided.
 *
 * The tray opens itself when the fight asks for a roll, which is right: a die
 * the player has to throw should not need finding first. But it sits over the
 * map, and once the roll is done — or when the player would rather watch the
 * board than their own d20 — they need a way to put it away (Kirk,
 * 2026-08-28: "we should be able to collapse the dice tray").
 *
 * Three states rather than a boolean, because "closed because nothing is
 * happening" and "closed because the player closed it" are different things:
 * only the second offers a control to reopen, and only the first has nothing
 * to show behind it.
 */
import type { CombatExperiencePhase } from './types';

export type DiceDrawerVisibility = 'idle' | 'collapsed' | 'expanded';

/** The phases where a tray has something worth showing. */
const ROLL_PHASES: readonly CombatExperiencePhase[] = [
  'awaiting-roll',
  'released-waiting-event',
  'settled',
];

export function hasSomethingToShow(phase: CombatExperiencePhase): boolean {
  return ROLL_PHASES.includes(phase);
}

export function diceDrawerVisibility(
  phase: CombatExperiencePhase,
  collapsedByUser: boolean
): DiceDrawerVisibility {
  if (!hasSomethingToShow(phase)) return 'idle';
  return collapsedByUser ? 'collapsed' : 'expanded';
}

/**
 * Whether a phase change should overrule the player's collapse.
 *
 * Only for the roller, and only on the edge INTO `'awaiting-roll'`: that is the
 * one moment the tray is not decoration but the control the turn is waiting
 * on. A player who then collapses it again keeps it collapsed — this reopens
 * on a new demand, it does not fight them.
 *
 * A spectator is never forced open. There is nothing for them to do in there,
 * so their choice stands.
 */
export function shouldReopenForRoll(
  previousPhase: CombatExperiencePhase | undefined,
  phase: CombatExperiencePhase,
  witnessRole: 'roller' | 'spectator'
): boolean {
  return (
    witnessRole === 'roller' &&
    phase === 'awaiting-roll' &&
    previousPhase !== 'awaiting-roll'
  );
}
