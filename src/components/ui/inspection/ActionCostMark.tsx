import { Slot } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import './actionCostMark.css';

/** Presentation of the supplied turn-slot cost; never an availability decision. */
export function ActionCostMark({ slot }: { slot: Slot }) {
  const state =
    slot === Slot.ACTION
      ? 'action'
      : slot === Slot.BONUS
        ? 'bonus'
        : slot === Slot.REACTION
          ? 'reaction'
          : slot === Slot.NONE
            ? 'none'
            : 'unknown';
  const label =
    slot === Slot.ACTION
      ? 'Action'
      : slot === Slot.BONUS
        ? 'Bonus action'
        : slot === Slot.REACTION
          ? 'Reaction'
          : slot === Slot.NONE
            ? 'No turn slot'
            : 'Slot cost not supplied';
  return (
    <span
      className="action-cost-mark"
      data-slot={state}
      role="img"
      aria-label={`Cost: ${label}`}
      title={label}
    >
      <span aria-hidden="true">
        {state === 'none' ? '—' : state === 'unknown' ? '?' : ''}
      </span>
    </span>
  );
}
