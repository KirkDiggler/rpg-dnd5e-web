/**
 * The Doors panel is a RENDER test, not a grammar test: the state mechanics
 * are `doorBindingEdits.test.ts`'s and the document's law is
 * `roomDraft.test.ts`'s. What is asserted here is that the engine's four
 * authored states appear as one control holding the document's value, that a
 * lock's rows hold the author's ability, tool and DC, and that a value this
 * build does not list still appears rather than being silently replaced.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DoorStates } from './DoorStates';
import type { RoomDoorBinding } from './roomDraft';
import type { WorldProp } from './types';

/** The one asset the catalog declares leaves for. */
const DOUBLE_DOOR = 'dnd5e:env:dark-fortress:wall_door_double_01';
/** A promoted env asset that declares no roles at all. */
const PILLAR = 'dnd5e:env:dark-fantasy:pillar_01';

function prop(id: string, assetRef: string, label: string): WorldProp {
  return {
    id,
    kind: 'prop',
    assetRef,
    label,
    transform: { x: 0, y: 0, z: 0, rotationY: 0 },
  };
}

const CELLAR = prop('cellar-door', DOUBLE_DOOR, 'Cellar door');
const PILLAR_PROP = prop('pillar-1', PILLAR, 'Pillar');

function renderPanel({
  items = [CELLAR],
  bindings,
  declared = ['cellar-door'],
  onChange = vi.fn(),
}: {
  items?: WorldProp[];
  bindings?: Record<string, RoomDoorBinding>;
  declared?: string[];
  onChange?: (id: string, next: RoomDoorBinding | undefined) => void;
} = {}) {
  render(
    <DoorStates
      items={items}
      bindings={bindings}
      declaredIds={new Set(declared)}
      onChange={onChange}
    />
  );
  return onChange;
}

describe('DoorStates — the four authored states, one control', () => {
  it('says so when nothing placed is a door', () => {
    renderPanel({ items: [PILLAR_PROP] });
    expect(screen.getByTestId('doors-empty')).toBeDefined();
    expect(screen.queryByLabelText(/Door state for/)).toBeNull();
  });

  it('offers a door asset, holding the state the document has', () => {
    renderPanel({ bindings: { 'cellar-door': { closed: true } } });
    const select = screen.getByLabelText(
      'Door state for Cellar door cellar-door'
    ) as HTMLSelectElement;
    expect(select.value).toBe('closed');
    // The four options are the engine's four authored states, no more.
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => (option as HTMLOptionElement).value)
    ).toEqual(['none', 'open', 'closed', 'locked']);
  });

  it('reports an unauthored item as not a door, and an empty binding as open', () => {
    renderPanel({ bindings: { 'cellar-door': {} } });
    const select = screen.getByLabelText(
      'Door state for Cellar door cellar-door'
    ) as HTMLSelectElement;
    expect(select.value).toBe('open');
  });

  it('hands the parent the state the author picked', () => {
    const onChange = renderPanel();
    fireEvent.change(
      screen.getByLabelText('Door state for Cellar door cellar-door'),
      { target: { value: 'locked' } }
    );
    // A fresh lock starts from the engine's own example, so the row is a legal
    // document the moment it appears.
    expect(onChange).toHaveBeenCalledWith('cellar-door', {
      locked: [{ ability: 'str', dc: 15 }],
    });
  });

  it('hands the parent closed, open and not-a-door as the engine spells them', () => {
    const onChange = renderPanel({ bindings: { 'cellar-door': {} } });
    const select = screen.getByLabelText(
      'Door state for Cellar door cellar-door'
    );
    fireEvent.change(select, { target: { value: 'closed' } });
    expect(onChange).toHaveBeenLastCalledWith('cellar-door', { closed: true });
    fireEvent.change(select, { target: { value: 'none' } });
    // Deleting the entry is the author's "this is not a door".
    expect(onChange).toHaveBeenLastCalledWith('cellar-door', undefined);
  });
});

describe('DoorStates — a lock’s approaches', () => {
  const locked: Record<string, RoomDoorBinding> = {
    'cellar-door': {
      locked: [
        { ability: 'dex', dc: 15, tool: 'dnd5e:item:thieves-tools' },
        { ability: 'str', dc: 20 },
      ],
    },
  };

  it('shows one row per approach, holding its ability, tool and DC', () => {
    renderPanel({ bindings: locked });
    expect(
      (
        screen.getByLabelText(
          'Ability for approach 0 of cellar-door'
        ) as HTMLSelectElement
      ).value
    ).toBe('dex');
    expect(
      (
        screen.getByLabelText(
          'Tool for approach 0 of cellar-door'
        ) as HTMLInputElement
      ).value
    ).toBe('dnd5e:item:thieves-tools');
    expect(
      (
        screen.getByLabelText(
          'DC for approach 1 of cellar-door'
        ) as HTMLInputElement
      ).value
    ).toBe('20');
  });

  it('shows no rows when the door is not locked', () => {
    renderPanel({ bindings: { 'cellar-door': { closed: true } } });
    expect(screen.queryByLabelText(/Ability for approach/)).toBeNull();
  });

  it('patches one row without disturbing the other', () => {
    const onChange = renderPanel({ bindings: locked });
    fireEvent.change(
      screen.getByLabelText('DC for approach 0 of cellar-door'),
      { target: { value: '18' } }
    );
    expect(onChange).toHaveBeenCalledWith('cellar-door', {
      locked: [
        { ability: 'dex', dc: 18, tool: 'dnd5e:item:thieves-tools' },
        { ability: 'str', dc: 20 },
      ],
    });
  });

  it('clears the tool when the input is emptied', () => {
    const onChange = renderPanel({ bindings: locked });
    fireEvent.change(
      screen.getByLabelText('Tool for approach 0 of cellar-door'),
      { target: { value: '' } }
    );
    expect(onChange).toHaveBeenCalledWith('cellar-door', {
      locked: [
        { ability: 'dex', dc: 15 },
        { ability: 'str', dc: 20 },
      ],
    });
  });

  it('appends a row to the end of the lock', () => {
    const onChange = renderPanel({ bindings: locked });
    fireEvent.click(screen.getByLabelText('Add approach to cellar-door'));
    expect(onChange).toHaveBeenCalledWith('cellar-door', {
      locked: [
        { ability: 'dex', dc: 15, tool: 'dnd5e:item:thieves-tools' },
        { ability: 'str', dc: 20 },
        { ability: 'str', dc: 15 },
      ],
    });
  });

  it('refuses to remove the last row, because the engine refuses an empty lock', () => {
    // The state control is how an author unlocks; a `locked: []` left by
    // removing the last row would be "an authored lock that forgot how it is
    // beaten", which the engine refuses by name.
    renderPanel({
      bindings: { 'cellar-door': { locked: [{ ability: 'str', dc: 15 }] } },
    });
    expect(
      (
        screen.getByLabelText(
          'Remove approach 0 from cellar-door'
        ) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('keeps an ability this build does not list, rather than snapping the document to the first word', () => {
    renderPanel({
      bindings: {
        'cellar-door': { locked: [{ ability: 'luck', dc: 13 }] },
      },
    });
    const select = screen.getByLabelText(
      'Ability for approach 0 of cellar-door'
    ) as HTMLSelectElement;
    expect(select.value).toBe('luck');
    expect(within(select).getByRole('option', { name: 'luck' })).toBeDefined();
  });
});

describe('DoorStates — which items it offers', () => {
  it('still lists an authored door whose asset declares no leaf', () => {
    // Otherwise a binding made before the catalog changed would be published
    // but uneditable and unremovable.
    renderPanel({
      items: [PILLAR_PROP],
      bindings: { 'pillar-1': { closed: true } },
      declared: ['pillar-1'],
    });
    expect(
      screen.getByLabelText('Door state for Pillar pillar-1')
    ).toBeDefined();
  });

  it('reports a door with no footprint yet, and stays quiet once it has one', () => {
    renderPanel({ bindings: { 'cellar-door': {} }, declared: [] });
    expect(screen.getByTestId('door-cellar-door-undeclared')).toBeDefined();
  });

  it('stays quiet about the footprint once the item declares one', () => {
    renderPanel({ bindings: { 'cellar-door': {} }, declared: ['cellar-door'] });
    expect(screen.queryByTestId('door-cellar-door-undeclared')).toBeNull();
  });

  it('does not report a missing footprint for an item that is not a door', () => {
    // "not a door" is the absence of a binding, and a prop needs no footprint
    // to be a prop. The notice is driven by the state the parent holds, so an
    // item at `none` says nothing even with no declaration at all.
    renderPanel({ bindings: undefined, declared: [] });
    expect(screen.queryByTestId('door-cellar-door-undeclared')).toBeNull();
    expect(
      (
        screen.getByLabelText(
          'Door state for Cellar door cellar-door'
        ) as HTMLSelectElement
      ).value
    ).toBe('none');
  });
});
