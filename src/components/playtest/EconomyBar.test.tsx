import { create } from '@bufbuild/protobuf';
import { ActionEconomySchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EconomyBar } from './EconomyBar';

describe('EconomyBar', () => {
  it('renders the empty state when economy is null', () => {
    render(<EconomyBar economy={null} />);
    expect(screen.getByTestId('economy-bar-empty')).toBeTruthy();
  });

  it('renders the server-authored economy values verbatim', () => {
    const economy = create(ActionEconomySchema, {
      actionsRemaining: 1,
      bonusActionsRemaining: 0,
      reactionsRemaining: 1,
      movementRemaining: 30,
    });
    render(<EconomyBar economy={economy} />);
    const bar = screen.getByTestId('economy-bar');
    expect(bar.textContent).toContain('Action');
    expect(bar.textContent).toContain('Bonus');
    expect(bar.textContent).toContain('Reaction');
    expect(bar.textContent).toContain('Movement');
    expect(bar.textContent).toContain('30');
  });

  it('renders granted-capacity counts from the two-level economy', () => {
    const economy = create(ActionEconomySchema, {
      actionsRemaining: 1,
      capacities: { attacks: 1, martial_arts_bonus: 1 },
    });
    render(<EconomyBar economy={economy} />);
    const bar = screen.getByTestId('economy-bar');
    expect(bar.textContent).toContain('attacks');
    expect(bar.textContent).toContain('martial_arts_bonus');
  });
});
