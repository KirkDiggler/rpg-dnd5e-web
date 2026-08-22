/**
 * No jest-dom matchers — this repo's vitest config has no such setup
 * (`vite.config.ts`'s `test` block, per `YamlPane.test.tsx`'s own note),
 * so assertions use plain DOM properties.
 */
import {
  Slot,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TurnHud } from './TurnHud';
import type { TurnHudSelection } from './turnHud';

describe('TurnHud', () => {
  it('free-roam renders a single quiet pill and no shapes', () => {
    render(<TurnHud selection={{ mode: 'free-roam' }} />);

    expect(screen.getByTestId('turn-hud-free-roam-pill').textContent).toBe(
      'Free roam'
    );
    expect(screen.queryByTestId('turn-hud-shape-action')).toBeNull();
    expect(screen.queryByTestId('turn-hud-declaration-row')).toBeNull();
  });

  it('turn mode renders all three shapes, lit/dim per selection', () => {
    const selection: TurnHudSelection = {
      mode: 'turn',
      shapes: [
        { slot: 'action', lit: true },
        { slot: 'bonus', lit: false },
        { slot: 'reaction', lit: false },
      ],
      declarations: [],
    };
    render(<TurnHud selection={selection} />);

    expect(
      screen.getByTestId('turn-hud-shape-action').getAttribute('data-lit')
    ).toBe('true');
    expect(
      screen.getByTestId('turn-hud-shape-bonus').getAttribute('data-lit')
    ).toBe('false');
    expect(
      screen.getByTestId('turn-hud-shape-reaction').getAttribute('data-lit')
    ).toBe('false');
    expect(screen.queryByTestId('turn-hud-free-roam-pill')).toBeNull();
  });

  it('an affordable declaration renders "Attack — ready"', () => {
    const selection: TurnHudSelection = {
      mode: 'turn',
      shapes: [
        { slot: 'action', lit: true },
        { slot: 'bonus', lit: false },
        { slot: 'reaction', lit: false },
      ],
      declarations: [
        {
          verb: Verb.ATTACK,
          slot: Slot.ACTION,
          affordable: true,
          shortfall: '',
        },
      ],
    };
    render(<TurnHud selection={selection} />);

    expect(screen.getByTestId('turn-hud-declaration-row').textContent).toBe(
      'Attack — ready'
    );
  });

  it('an unaffordable declaration renders the shortfall verbatim, e.g. "Attack — action: 1 needed, 0 left"', () => {
    const selection: TurnHudSelection = {
      mode: 'turn',
      shapes: [
        { slot: 'action', lit: false },
        { slot: 'bonus', lit: false },
        { slot: 'reaction', lit: false },
      ],
      declarations: [
        {
          verb: Verb.ATTACK,
          slot: Slot.ACTION,
          affordable: false,
          shortfall: 'action: 1 needed, 0 left',
        },
      ],
    };
    render(<TurnHud selection={selection} />);

    expect(screen.getByTestId('turn-hud-declaration-row').textContent).toBe(
      'Attack — action: 1 needed, 0 left'
    );
  });

  it('renders one row per declaration, in order', () => {
    const selection: TurnHudSelection = {
      mode: 'turn',
      shapes: [
        { slot: 'action', lit: false },
        { slot: 'bonus', lit: false },
        { slot: 'reaction', lit: false },
      ],
      declarations: [
        {
          verb: Verb.ATTACK,
          slot: Slot.NONE,
          affordable: true,
          shortfall: '',
        },
        {
          verb: Verb.ATTACK,
          slot: Slot.ACTION,
          affordable: false,
          shortfall: 'action: 1 needed, 0 left',
        },
      ],
    };
    render(<TurnHud selection={selection} />);

    const rows = screen.getAllByTestId('turn-hud-declaration-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toBe('Attack — ready');
    expect(rows[1]!.textContent).toBe('Attack — action: 1 needed, 0 left');
  });
});
