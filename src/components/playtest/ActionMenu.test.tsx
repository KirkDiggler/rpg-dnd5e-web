import type { AvailableAction } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  EconomySlot,
  TargetKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu } from './ActionMenu';

function action(
  partial: Partial<AvailableAction> & { id: string }
): AvailableAction {
  return {
    ref: { module: 'dnd5e', type: 'combat_abilities', id: partial.id },
    displayName: partial.displayName ?? partial.id,
    available: partial.available ?? true,
    unavailableReason: partial.unavailableReason ?? '',
    economySlot: partial.economySlot ?? EconomySlot.ACTION,
    targetKind: partial.targetKind ?? TargetKind.SINGLE_ENTITY,
  } as unknown as AvailableAction;
}

describe('ActionMenu', () => {
  it('renders the empty state when there are no actions', () => {
    render(
      <ActionMenu
        actions={[]}
        enabled
        loading={false}
        onSelectAction={vi.fn()}
      />
    );
    expect(screen.getByTestId('action-menu-empty')).toBeTruthy();
  });

  it('renders actions grouped by economy slot', () => {
    render(
      <ActionMenu
        actions={[
          action({
            id: 'attack',
            displayName: 'Attack',
            economySlot: EconomySlot.ACTION,
          }),
          action({
            id: 'martial-arts',
            displayName: 'Martial Arts',
            economySlot: EconomySlot.BONUS_ACTION,
          }),
        ]}
        enabled
        loading={false}
        onSelectAction={vi.fn()}
      />
    );
    expect(screen.getByText('Action')).toBeTruthy();
    expect(screen.getByText('Bonus Action')).toBeTruthy();
    expect(screen.getByText('Attack')).toBeTruthy();
    expect(screen.getByText('Martial Arts')).toBeTruthy();
  });

  it('disables an unavailable action and shows the server unavailable_reason', () => {
    render(
      <ActionMenu
        actions={[
          action({
            id: 'move',
            displayName: 'Move',
            available: false,
            unavailableReason: 'movement lands in Beat-2',
            economySlot: EconomySlot.MOVEMENT,
            targetKind: TargetKind.POSITION,
          }),
        ]}
        enabled
        loading={false}
        onSelectAction={vi.fn()}
      />
    );
    const btn = screen.getByTestId(
      'action-dnd5e:combat_abilities:move'
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('data-available')).toBe('false');
    expect(
      screen.getByTestId('action-reason-dnd5e:combat_abilities:move')
        .textContent
    ).toContain('movement lands in Beat-2');
  });

  it('fires onSelectAction with the chosen action when available + enabled', () => {
    const onSelectAction = vi.fn();
    const attack = action({ id: 'attack', displayName: 'Attack' });
    render(
      <ActionMenu
        actions={[attack]}
        enabled
        loading={false}
        onSelectAction={onSelectAction}
      />
    );
    fireEvent.click(screen.getByTestId('action-dnd5e:combat_abilities:attack'));
    expect(onSelectAction).toHaveBeenCalledTimes(1);
    expect(onSelectAction.mock.calls[0]?.[0]).toBe(attack);
  });

  it('disables all actions when not enabled (not the local turn)', () => {
    render(
      <ActionMenu
        actions={[action({ id: 'attack', available: true })]}
        enabled={false}
        loading={false}
        onSelectAction={vi.fn()}
      />
    );
    const btn = screen.getByTestId(
      'action-dnd5e:combat_abilities:attack'
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
