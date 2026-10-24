import { Slot } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ActionCostMark } from './ActionCostMark';
afterEach(cleanup);
describe('turn-cost shape vocabulary', () => {
  it.each([
    [Slot.ACTION, 'Action', 'action'],
    [Slot.BONUS, 'Bonus action', 'bonus'],
    [Slot.REACTION, 'Reaction', 'reaction'],
    [Slot.NONE, 'No turn slot', 'none'],
    [Slot.UNSPECIFIED, 'Slot cost not supplied', 'unknown'],
  ] as const)(
    'renders supplied slot %s with distinct shape and accessible meaning',
    (slot, label, shape) => {
      render(<ActionCostMark slot={slot} />);
      expect(
        screen
          .getByRole('img', { name: `Cost: ${label}` })
          .getAttribute('data-slot')
      ).toBe(shape);
    }
  );
});
