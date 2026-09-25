/**
 * The Prop orders panel (rpg-project#488 R1, rpg-toolkit#1855) — RENDER tests.
 * The mechanics are covered by `propBindingEdits.test.ts`; what is asserted
 * here is that a placed prop's orders appear as controls holding the document's
 * values, that the panel refuses to offer a door or an undeclared prop, and
 * that it states the engine's compile refusal rather than hiding it.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PropOrders } from './PropOrders';
import type { SiteScope } from './siteScope';
import type { WorldScene } from './types';

const items: WorldScene['items'] = [
  {
    id: 'heirloom',
    kind: 'prop',
    assetRef: 'dnd5e:props:books',
    label: 'heirloom',
    transform: { x: 0, y: 0, z: 0, rotationY: 0 },
    heightScale: 1,
  },
  {
    id: 'vault-door',
    kind: 'prop',
    assetRef: 'dnd5e:props:books',
    label: 'vault door',
    transform: { x: 1, y: 0, z: 0, rotationY: 0 },
    heightScale: 1,
  },
];

const scope: SiteScope = {
  intel: [{ id: 'wisemans-letter', reveals: { fact: 'saved-wiseman' } }],
};

const room = {
  implicitRegionId: 'room-1-region',
  walkableHexes: [{ q: 0, r: 0 }],
  propDeclarations: {},
  arrangementDeclarations: {},
  monsterDeclarations: [],
};

function mount(overrides: Partial<Parameters<typeof PropOrders>[0]> = {}) {
  return render(
    <PropOrders
      items={items}
      bindings={undefined}
      declaredIds={new Set(['heirloom', 'vault-door'])}
      doorIds={new Set(['vault-door'])}
      recordIds={['wisemans-letter']}
      scope={scope}
      room={room}
      onChange={() => {}}
      {...overrides}
    />
  );
}

describe('PropOrders — a placed prop’s orders, editable', () => {
  it('shows a declared, non-door prop and never offers a door', () => {
    mount();
    expect(screen.getByTestId('prop-orders-heirloom')).toBeTruthy();
    // A door may not carry orders — "a door somebody picks up" is refused by
    // name in the engine, so it is not offered here.
    expect(screen.queryByTestId('prop-orders-vault-door')).toBeNull();
  });

  it('says so when nothing placed can carry orders', () => {
    mount({ declaredIds: new Set(), doorIds: new Set() });
    expect(screen.getByTestId('prop-orders-empty')).toBeTruthy();
  });

  it('hands the parent a next binding on holdable, on a record, and on arrival', () => {
    const onChange = vi.fn();
    mount({ onChange });
    fireEvent.click(screen.getByLabelText('Holdable for heirloom'));
    expect(onChange.mock.calls[0]).toEqual(['heirloom', { holdable: true }]);

    onChange.mockClear();
    fireEvent.change(screen.getByLabelText('Give heirloom an intel record'), {
      target: { value: 'wisemans-letter' },
    });
    expect(onChange.mock.calls[0][1]).toEqual({ holds: ['wisemans-letter'] });

    // The arrival uses the SAME editor a creature's `arrives` does.
    onChange.mockClear();
    fireEvent.change(screen.getByLabelText('Arrives form'), {
      target: { value: 'round' },
    });
    expect(onChange.mock.calls[0][1]).toEqual({ arrives: { round: 1 } });
  });

  it('shows what the block already carries, and lets each record go', () => {
    const onChange = vi.fn();
    mount({
      bindings: { heirloom: { holdable: true, holds: ['wisemans-letter'] } },
      onChange,
    });
    expect(
      (screen.getByLabelText('Holdable for heirloom') as HTMLInputElement)
        .checked
    ).toBe(true);
    fireEvent.click(
      screen.getByLabelText('Stop heirloom carrying wisemans-letter')
    );
    // Emptied back to just `holdable`, which is still a real authored answer.
    expect(onChange.mock.calls[0][1]).toEqual({ holdable: true });
  });

  it('states what taking and reserving a prop now do, since the primitive landed', () => {
    mount({ bindings: { heirloom: { holdable: true } } });
    const note = screen.getByTestId('prop-orders-note-heirloom');
    // rpg-toolkit#1854 gave the dialect the primitive, so this is no longer a
    // refusal the author is writing toward — it says what the engine does.
    expect(note.textContent).toMatch(/compile since rpg-toolkit#1854/);
    expect(note.textContent).toMatch(/every cell its footprint covers/);
    expect(note.textContent).not.toMatch(/refuses it at compile/);
  });

  it('keeps an already-bound item listed however the document changed', () => {
    mount({
      declaredIds: new Set(),
      doorIds: new Set(['vault-door']),
      bindings: { 'vault-door': { holdable: true } },
    });
    const panel = screen.getByTestId('prop-orders-vault-door');
    expect(within(panel).getByText(/vault-door/)).toBeTruthy();
  });
});
