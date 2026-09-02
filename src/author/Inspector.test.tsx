import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConcealmentDerivation } from './dungeonYaml';
import {
  addDoor,
  emptyDungeon,
  paintCell,
  placeAt,
  type DungeonDoc,
} from './dungeonYaml';
import { fromOffset } from './hexOffset';
import { Inspector } from './Inspector';

const p = (c: number, r: number) => fromOffset('pointy', [c, r]);

function propDoc(
  orientation: DungeonDoc['orientation'] = 'pointy'
): DungeonDoc {
  let doc = emptyDungeon(orientation);
  doc = { ...doc, regions: [{ ...doc.regions[0], cells: [p(0, 0)] }] };
  doc = placeAt(doc, { ref: 'dnd5e:props:pillar', at: p(0, 0) });
  return doc;
}

function noop() {}

const EMPTY_CONCEALMENT: ConcealmentDerivation = {
  regionIds: new Set(),
  doorByRegion: new Map(),
};

function mountPlacement(
  doc: DungeonDoc,
  overrides: Partial<{
    onPlacement: (index: number, patch: Record<string, unknown>) => void;
  }> = {}
) {
  return render(
    <Inspector
      doc={doc}
      concealment={EMPTY_CONCEALMENT}
      selection={{ kind: 'placement', index: 0 }}
      onDungeon={noop}
      onRegion={noop}
      onRemoveRegion={noop}
      onDoor={noop}
      onRemoveDoor={noop}
      onPlacement={overrides.onPlacement ?? noop}
      onRemovePlacement={noop}
      onRemoveWall={noop}
      onSetWallHeight={noop}
    />
  );
}

describe('PlacementPanel facing/offset (rpg-project#261)', () => {
  it('draws all eight compass buttons under pointy and none defaults active — the rose does not rotate with orientation (rpg-project#272)', () => {
    mountPlacement(propDoc('pointy'));
    for (const name of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
      expect(screen.getByTestId(`facing-${name}`)).toBeTruthy();
    }
    expect(screen.getByTestId('facing-none').className).toContain(
      'dg-tool--on'
    );
  });

  it('draws the SAME eight compass buttons under a flat dungeon', () => {
    mountPlacement(propDoc('flat'));
    for (const name of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
      expect(screen.getByTestId(`facing-${name}`)).toBeTruthy();
    }
  });

  it('clicking a facing button reports that name; clicking none clears it', () => {
    const onPlacement = vi.fn();
    mountPlacement(propDoc(), { onPlacement });
    fireEvent.click(screen.getByTestId('facing-ne'));
    expect(onPlacement).toHaveBeenLastCalledWith(0, { facing: 'ne' });
    fireEvent.click(screen.getByTestId('facing-none'));
    expect(onPlacement).toHaveBeenLastCalledWith(0, { facing: undefined });
  });

  it('the active facing button is highlighted from the document', () => {
    const doc = propDoc();
    const faced = { ...doc, place: [{ ...doc.place[0], facing: 'sw' }] };
    mountPlacement(faced);
    expect(screen.getByTestId('facing-sw').className).toContain('dg-tool--on');
    expect(screen.getByTestId('facing-none').className).not.toContain(
      'dg-tool--on'
    );
  });

  it('every compass button carries aria-pressed and an accessible name (Copilot review, PR #795)', () => {
    const doc = propDoc();
    const faced = { ...doc, place: [{ ...doc.place[0], facing: 'sw' }] };
    mountPlacement(faced);
    expect(screen.getByTestId('facing-sw').getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByTestId('facing-none').getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(screen.getByTestId('facing-none').getAttribute('aria-label')).toBe(
      'facing: asset default'
    );
    expect(screen.getByTestId('facing-ne').getAttribute('aria-label')).toBe(
      'facing: ne'
    );
  });

  it('offset steppers report a clamped [x, y] tuple; center clears it', () => {
    const onPlacement = vi.fn();
    mountPlacement(propDoc(), { onPlacement });
    fireEvent.change(screen.getByLabelText('x'), { target: { value: '0.3' } });
    expect(onPlacement).toHaveBeenLastCalledWith(0, { offset: [0.3, 0] });
    fireEvent.change(screen.getByLabelText('y'), {
      target: { value: '-0.9' },
    });
    // clamped to the [-0.5, 0.5] bound
    expect(onPlacement).toHaveBeenLastCalledWith(0, { offset: [0, -0.5] });
    fireEvent.click(screen.getByText('center'));
    expect(onPlacement).toHaveBeenLastCalledWith(0, { offset: undefined });
  });

  it('monster placements show neither facing nor offset controls', () => {
    let doc = emptyDungeon();
    doc = { ...doc, regions: [{ ...doc.regions[0], cells: [p(0, 0)] }] };
    doc = placeAt(doc, { ref: 'dnd5e:monsters:zombie', at: p(0, 0) });
    mountPlacement(doc);
    expect(screen.queryByTestId('facing-compass')).toBeNull();
    expect(screen.queryByLabelText('x')).toBeNull();
  });
});

describe('wall selection (#804)', () => {
  it('shows "Wall — N edges" for the selected run and deletes all of them', () => {
    let doc = emptyDungeon('pointy');
    doc = {
      ...doc,
      regions: [{ ...doc.regions[0], cells: [p(0, 0), p(1, 0), p(0, 1)] }],
      walls: [{ edge: [p(0, 0), p(1, 0)] }, { edge: [p(0, 0), p(0, 1)] }],
    };
    const onRemoveWall = vi.fn();
    render(
      <Inspector
        doc={doc}
        concealment={EMPTY_CONCEALMENT}
        selection={{ kind: 'wall', edges: doc.walls.map((w) => w.edge) }}
        onDungeon={noop}
        onRegion={noop}
        onRemoveRegion={noop}
        onDoor={noop}
        onRemoveDoor={noop}
        onPlacement={noop}
        onRemovePlacement={noop}
        onRemoveWall={onRemoveWall}
        onSetWallHeight={noop}
      />
    );
    expect(screen.getByTestId('wall-panel').textContent).toContain(
      'Wall — 2 edges'
    );
    fireEvent.click(screen.getByRole('button', { name: /delete wall/i }));
    expect(onRemoveWall).toHaveBeenCalledWith(doc.walls.map((w) => w.edge));
  });

  it('the wall height stepper reports chain-level stamps: a value for the whole selection, standard clears it (rpg-project#273)', () => {
    let doc = emptyDungeon('pointy');
    doc = {
      ...doc,
      regions: [{ ...doc.regions[0], cells: [p(0, 0), p(1, 0), p(0, 1)] }],
      walls: [
        { edge: [p(0, 0), p(1, 0)], height: 2 },
        { edge: [p(0, 0), p(0, 1)], height: 2 },
      ],
    };
    const onSetWallHeight = vi.fn();
    render(
      <Inspector
        doc={doc}
        concealment={EMPTY_CONCEALMENT}
        selection={{ kind: 'wall', edges: doc.walls.map((w) => w.edge) }}
        onDungeon={noop}
        onRegion={noop}
        onRemoveRegion={noop}
        onDoor={noop}
        onRemoveDoor={noop}
        onPlacement={noop}
        onRemovePlacement={noop}
        onRemoveWall={noop}
        onSetWallHeight={onSetWallHeight}
      />
    );
    const stepper = screen.getByTestId('wall-height') as HTMLInputElement;
    expect(stepper.value).toBe('2');
    fireEvent.change(stepper, { target: { value: '3' } });
    expect(onSetWallHeight).toHaveBeenLastCalledWith(
      doc.walls.map((w) => w.edge),
      3
    );
    // Stepping down to 1 IS "standard": the doc entry clears rather
    // than writing the redundant 1.
    fireEvent.change(stepper, { target: { value: '1' } });
    expect(onSetWallHeight).toHaveBeenLastCalledWith(
      doc.walls.map((w) => w.edge),
      undefined
    );
    fireEvent.click(screen.getByTestId('wall-height-standard'));
    expect(onSetWallHeight).toHaveBeenLastCalledWith(
      doc.walls.map((w) => w.edge),
      undefined
    );
  });

  it('the offset height control has its own [0,3] range and emits a triple — dropping back to the floor emits a pair (rpg-project#272)', () => {
    const onPlacement = vi.fn();
    mountPlacement(propDoc(), { onPlacement });
    const height = screen.getByTestId('offset-height') as HTMLInputElement;
    expect(height.min).toBe('0');
    expect(height.max).toBe('3');
    fireEvent.change(height, { target: { value: '1.6' } });
    expect(onPlacement).toHaveBeenLastCalledWith(0, { offset: [0, 0, 1.6] });
  });

  it('a raised placement dropping back to the floor emits the two-component form — height 0 is not written (rpg-project#272)', () => {
    const onPlacement = vi.fn();
    const doc = propDoc();
    const raised = {
      ...doc,
      place: [{ ...doc.place[0], offset: [0.2, -0.1, 1.6] as const }],
    } as DungeonDoc;
    mountPlacement(raised, { onPlacement });
    const height = screen.getByTestId('offset-height') as HTMLInputElement;
    expect(height.value).toBe('1.6');
    fireEvent.change(height, { target: { value: '0' } });
    expect(onPlacement).toHaveBeenLastCalledWith(0, { offset: [0.2, -0.1] });
  });

  it('a wall selection whose edges are all gone falls back to the dungeon panel', () => {
    const doc = emptyDungeon('pointy');
    render(
      <Inspector
        doc={doc}
        concealment={EMPTY_CONCEALMENT}
        selection={{ kind: 'wall', edges: [[p(0, 0), p(1, 0)]] }}
        onDungeon={noop}
        onRegion={noop}
        onRemoveRegion={noop}
        onDoor={noop}
        onRemoveDoor={noop}
        onPlacement={noop}
        onRemovePlacement={noop}
        onRemoveWall={noop}
        onSetWallHeight={noop}
      />
    );
    expect(screen.getByTestId('dungeon-panel')).toBeTruthy();
  });
});

function doorDoc(): DungeonDoc {
  let doc = emptyDungeon('pointy');
  doc = paintCell(doc, 'region-1', p(0, 0));
  doc = paintCell(doc, 'region-1', p(1, 0));
  doc = addDoor(doc, [[p(0, 0), p(1, 0)]]);
  return doc;
}

function mountDoor(
  doc: DungeonDoc,
  overrides: Partial<{
    onDoor: (id: string, patch: Record<string, unknown>) => void;
  }> = {}
) {
  return render(
    <Inspector
      doc={doc}
      concealment={EMPTY_CONCEALMENT}
      selection={{ kind: 'door', id: doc.doors[0]!.id }}
      onDungeon={noop}
      onRegion={noop}
      onRemoveRegion={noop}
      onDoor={overrides.onDoor ?? noop}
      onRemoveDoor={noop}
      onPlacement={noop}
      onRemovePlacement={noop}
      onRemoveWall={noop}
      onSetWallHeight={noop}
    />
  );
}

describe('DoorPanel concealed + approach rows (rpg-project#350/#886)', () => {
  it('is unchecked and shows no find-check rows for a plain doorway', () => {
    mountDoor(doorDoc());
    expect(
      (screen.getByLabelText('concealed') as HTMLInputElement).checked
    ).toBe(false);
    expect(screen.queryByTestId('find-approach-0')).toBeNull();
  });

  it('checking concealed seeds one perception row and reports it', () => {
    const onDoor = vi.fn();
    const doc = doorDoc();
    mountDoor(doc, { onDoor });
    fireEvent.click(screen.getByLabelText('concealed'));
    expect(onDoor).toHaveBeenCalledWith(doc.doors[0]!.id, {
      concealed: [{ ability: 'perception', dc: 15 }],
    });
  });

  it('unchecking concealed reports undefined, not an empty list', () => {
    const onDoor = vi.fn();
    const doc = {
      ...doorDoc(),
    };
    doc.doors = [
      { ...doc.doors[0]!, concealed: [{ ability: 'perception', dc: 15 }] },
    ];
    mountDoor(doc, { onDoor });
    fireEvent.click(screen.getByLabelText('concealed'));
    expect(onDoor).toHaveBeenCalledWith(doc.doors[0]!.id, {
      concealed: undefined,
    });
  });

  it('"add an approach" grows the find check with a second row', () => {
    const onDoor = vi.fn();
    const doc = doorDoc();
    doc.doors = [
      { ...doc.doors[0]!, concealed: [{ ability: 'perception', dc: 15 }] },
    ];
    mountDoor(doc, { onDoor });
    fireEvent.click(screen.getByTestId('find-add-approach'));
    expect(onDoor).toHaveBeenCalledWith(doc.doors[0]!.id, {
      concealed: [
        { ability: 'perception', dc: 15 },
        { ability: 'perception', dc: 12 },
      ],
    });
  });

  it('the last approach row cannot be removed; a second row can', () => {
    const onDoor = vi.fn();
    const doc = doorDoc();
    doc.doors = [
      {
        ...doc.doors[0]!,
        concealed: [
          { ability: 'perception', dc: 15 },
          { ability: 'investigation', dc: 12 },
        ],
      },
    ];
    mountDoor(doc, { onDoor });
    const removeButtons = screen.getAllByLabelText('remove approach');
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[1]!);
    expect(onDoor).toHaveBeenCalledWith(doc.doors[0]!.id, {
      concealed: [{ ability: 'perception', dc: 15 }],
    });

    onDoor.mockClear();
    const single = {
      ...doc,
      doors: [
        { ...doc.doors[0]!, concealed: [{ ability: 'perception', dc: 15 }] },
      ],
    };
    mountDoor(single, { onDoor });
    const lastRemove = screen.getAllByLabelText('remove approach').at(-1)!;
    expect((lastRemove as HTMLButtonElement).disabled).toBe(true);
  });

  it("editing a find-check row's dc reports the patched list, ability and tool untouched", () => {
    const onDoor = vi.fn();
    const doc = doorDoc();
    doc.doors = [
      { ...doc.doors[0]!, concealed: [{ ability: 'perception', dc: 15 }] },
    ];
    mountDoor(doc, { onDoor });
    fireEvent.change(
      screen
        .getByTestId('find-approach-0')
        .querySelector('input[type="number"]')!,
      {
        target: { value: '18' },
      }
    );
    expect(onDoor).toHaveBeenCalledWith(doc.doors[0]!.id, {
      concealed: [{ ability: 'perception', dc: 18 }],
    });
  });

  it('switching state to locked seeds a dex approach row, editable the same way', () => {
    const onDoor = vi.fn();
    const doc = doorDoc();
    mountDoor(doc, { onDoor });
    fireEvent.change(screen.getByLabelText('state'), {
      target: { value: 'locked' },
    });
    expect(onDoor).toHaveBeenCalledWith(doc.doors[0]!.id, {
      closed: false,
      locked: [{ ability: 'dex', dc: 12 }],
    });
  });

  it('lock and find-check rows compose independently — both render at once', () => {
    const doc = doorDoc();
    doc.doors = [
      {
        ...doc.doors[0]!,
        locked: [{ ability: 'dex', dc: 12 }],
        concealed: [{ ability: 'perception', dc: 15 }],
      },
    ];
    mountDoor(doc);
    expect(screen.getByTestId('lock-approach-0')).toBeTruthy();
    expect(screen.getByTestId('find-approach-0')).toBeTruthy();
  });
});
