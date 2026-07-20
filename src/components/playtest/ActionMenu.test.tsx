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

  describe('action icons (rpg-dnd5e-web#497, Copilot review)', () => {
    it('renders a decorative icon for a mapped action ref id', () => {
      render(
        <ActionMenu
          actions={[action({ id: 'attack', displayName: 'Attack' })]}
          enabled
          loading={false}
          onSelectAction={vi.fn()}
        />
      );
      const btn = screen.getByTestId('action-dnd5e:combat_abilities:attack');
      const icon = btn.querySelector('img');
      expect(icon).not.toBeNull();
      expect(icon?.getAttribute('src')).toBe(
        '/models/synty/ui/actions/attack.png'
      );
      expect(icon?.getAttribute('alt')).toBe('');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
    });

    it('renders no icon for an unmapped action ref id — text-only fallback', () => {
      render(
        <ActionMenu
          actions={[
            action({ id: 'martial-arts', displayName: 'Martial Arts' }),
          ]}
          enabled
          loading={false}
          onSelectAction={vi.fn()}
        />
      );
      const btn = screen.getByTestId(
        'action-dnd5e:combat_abilities:martial-arts'
      );
      expect(btn.querySelector('img')).toBeNull();
      expect(btn.textContent).toContain('Martial Arts');
    });
  });

  describe('compact mode (rpg-dnd5e-web#519)', () => {
    it('renders one flat row with no per-slot grouping headers', () => {
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
          compact
        />
      );
      expect(
        screen.getByTestId('action-menu').getAttribute('data-compact')
      ).toBe('true');
      // No slot-grouping headers in compact mode — both buttons still render.
      expect(screen.queryByText('Action')).toBeNull();
      expect(screen.queryByText('Bonus Action')).toBeNull();
      expect(screen.getByText('Attack')).toBeTruthy();
      expect(screen.getByText('Martial Arts')).toBeTruthy();
    });

    it('keeps the unavailable_reason in the title tooltip but not as visible text', () => {
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
          compact
        />
      );
      const btn = screen.getByTestId('action-dnd5e:combat_abilities:move');
      expect(btn.getAttribute('title')).toBe('movement lands in Beat-2');
      expect(
        screen.queryByTestId('action-reason-dnd5e:combat_abilities:move')
      ).toBeNull();
    });
  });
});
