import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  RoomMonsterPlacement,
  RoomPropDeclaration,
} from '../world-building/roomDraft';
import type { WorldProp } from '../world-building/types';
import { createLayoutTransform, layoutCellCenter } from './layoutGeometry';
import {
  LayoutPlacedOverlay,
  type LayoutPlacedEditing,
} from './LayoutPlacedOverlay';
import { castColour } from './overviewColours';
import type { StudioSelection } from './studioSession';

const monsters: RoomMonsterPlacement[] = [
  {
    id: 'gate-1',
    ref: 'dnd5e:monsters:guard',
    startingCell: { location: { q: 2, r: -1 } },
  },
  {
    id: 'cook',
    ref: 'dnd5e:monsters:commoner',
    startingCell: { location: { q: -1, r: 1 } },
  },
];
const items: WorldProp[] = [
  {
    id: 'altar',
    kind: 'prop',
    assetRef: 'dnd5e:props:dark-fortress:altar_01',
    label: 'Altar',
    transform: { x: 1, y: 0, z: 2, rotationY: 0 },
  },
  {
    id: 'ledger',
    kind: 'prop',
    assetRef: 'dnd5e:props:dark-fortress:book_03',
    label: 'Ledger',
    transform: { x: -2, y: 0, z: 0, rotationY: 0 },
  },
];
const declarations: Record<string, RoomPropDeclaration> = {
  altar: {
    blocksMovement: true,
    blocksLineOfSight: false,
    footprint: { width: 2, depth: 1, offsetX: 0, offsetZ: 0 },
  },
};

function setup(
  options: {
    selected?: StudioSelection;
    interactive?: boolean;
    exits?: { id: string; cell: { q: number; r: number } }[];
  } = {}
) {
  const editing: LayoutPlacedEditing = {
    selected: options.selected ?? { kind: 'nothing' },
    names: new Map([
      ['gate-1', 'Guard'],
      ['cook', 'Commoner'],
    ]),
    selectCreature: vi.fn(() => true),
    selectProp: vi.fn(),
    selectPartyStart: vi.fn(() => true),
  };
  const transform = createLayoutTransform(
    { left: 0, top: 0, width: 800, height: 800 },
    { center: { x: 0, z: 0 }, zoom: 1 },
    10
  )!;
  const view = render(
    <svg>
      <LayoutPlacedOverlay
        monsters={monsters}
        items={items}
        declarations={declarations}
        partyStart={{ q: 0, r: 0 }}
        exits={options.exits}
        editing={editing}
        interactive={options.interactive ?? true}
        transform={transform}
      />
    </svg>
  );
  const q = (selector: string): Element =>
    view.container.querySelector(selector)!;
  return { ...view, editing, q };
}

describe('LayoutPlacedOverlay', () => {
  it('the exit marker draws at its cell', () => {
    const { q } = setup({
      exits: [{ id: 'postern', cell: { q: 3, r: -2 } }],
    });
    const centre = layoutCellCenter({ q: 3, r: -2 });
    const marker = q('[data-exit="postern"] rect');
    expect(
      Number(marker.getAttribute('x')) +
        Number(marker.getAttribute('width')) / 2
    ).toBeCloseTo(centre.x);
    expect(
      Number(marker.getAttribute('y')) +
        Number(marker.getAttribute('height')) / 2
    ).toBeCloseTo(centre.z);
    expect(q('[data-placed-name="exit:postern"]').textContent).toBe(
      'Exit postern'
    );
    expect(q('[data-exit="postern"]').getAttribute('pointer-events')).toBe(
      'none'
    );
  });

  it('a creature ring sits at its cell in its cast colour', () => {
    const { q } = setup();
    const centre = layoutCellCenter({ q: 2, r: -1 });
    const ring = q('[data-placed-creature="gate-1"] circle');
    expect(Number(ring.getAttribute('cx'))).toBeCloseTo(centre.x);
    expect(Number(ring.getAttribute('cy'))).toBeCloseTo(centre.z);
    expect(ring.getAttribute('stroke')).toBe(
      castColour('dnd5e:monsters:guard')
    );
    expect(q('[data-placed-name="creature:gate-1"]').textContent).toBe('Guard');
  });

  it('a ring is highlighted when its cast member is selected', () => {
    const { q } = setup({
      selected: { kind: 'castMember', ref: 'dnd5e:monsters:guard' },
    });
    expect(
      q('[data-placed-creature="gate-1"]').getAttribute('data-selected')
    ).toBe('true');
    expect(
      q('[data-placed-creature="cook"]').getAttribute('data-selected')
    ).toBeNull();
  });

  it('clicking a ring selects that creature', () => {
    const { q, editing } = setup();
    fireEvent.pointerDown(q('[data-placed-creature="cook"] circle'), {
      button: 0,
    });
    expect(editing.selectCreature).toHaveBeenCalledExactlyOnceWith('cook');
  });

  it('clicking a prop footprint selects the prop and shift extends the pick', () => {
    const { q, editing } = setup();
    const altar = q('[data-placed-prop="altar"]');
    expect(altar.getAttribute('data-footprint')).toBe('declared');
    // A 2 × 1 footprint around (1, 2): its corners are the declared extent.
    expect(altar.getAttribute('points')).toBe('0,1.5 2,1.5 2,2.5 0,2.5');
    expect(
      q('[data-placed-prop="ledger"]').getAttribute('data-footprint')
    ).toBe('marker');
    fireEvent.pointerDown(altar, { button: 0 });
    fireEvent.pointerDown(q('[data-placed-prop="ledger"]'), {
      button: 0,
      shiftKey: true,
    });
    expect(editing.selectProp).toHaveBeenNthCalledWith(1, 'altar', false);
    expect(editing.selectProp).toHaveBeenNthCalledWith(2, 'ledger', true);
  });

  it('the party start marker selects the party start', () => {
    const { q, editing } = setup();
    fireEvent.pointerDown(q('[data-placed-start] polygon'), { button: 0 });
    expect(editing.selectPartyStart).toHaveBeenCalledOnce();
    expect(q('[data-placed-name="start"]').textContent).toBe('Party start');
  });

  it('the paint tool ignores glyph clicks', () => {
    const { q, editing } = setup({ interactive: false });
    for (const selector of [
      '[data-placed-creature="cook"] circle',
      '[data-placed-prop="altar"]',
      '[data-placed-start] polygon',
    ]) {
      fireEvent.pointerDown(q(selector), { button: 0 });
    }
    expect(editing.selectCreature).not.toHaveBeenCalled();
    expect(editing.selectProp).not.toHaveBeenCalled();
    expect(editing.selectPartyStart).not.toHaveBeenCalled();
    expect(
      q('[data-placed-creature="cook"]').getAttribute('pointer-events')
    ).toBe('none');
  });
});
