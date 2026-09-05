import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConcealmentDerivation, WallDoc } from './dungeonYaml';
import {
  addIntel,
  emptyDungeon,
  paintCell,
  paintScenery,
  placeAt,
  setIntelHolders,
  setIntelReveals,
  setStart,
  setStartFacing,
  toggleExitAt,
  updateExit,
  updatePlacement,
  type DungeonDoc,
} from './dungeonYaml';
import {
  cellPositions,
  latticeOf,
  positionAt,
  positionCrossing,
  type Lattice,
  type PositionRef,
} from './hexGeometry';
import { axialKey, fromOffset, type Axial } from './hexOffset';
import { Inspector } from './Inspector';

const p = (c: number, r: number) => fromOffset('pointy', [c, r]);

/** A position by its lattice address — the fixtures' own way of naming
 * a wall's ends and a door's `at` directly, no picker UI required
 * (rpg-project#360 slice 2). */
const seat = (l: Lattice): PositionRef => {
  const pos = positionAt('pointy', l);
  if (!pos) throw new Error(`seat: ${l.u},${l.v} is not a position`);
  return pos;
};

/** The side midpoint between two adjacent cells — what a door's `at`
 * names now that a wall is a line between positions rather than a list
 * of the crossings it blocked. */
function sideBetween(a: Axial, b: Axial): PositionRef {
  for (const pos of cellPositions('pointy', a)) {
    const crossing = positionCrossing('pointy', latticeOf('pointy', pos));
    if (!crossing) continue;
    const [x, y] = crossing;
    if (
      (axialKey(x) === axialKey(a) && axialKey(y) === axialKey(b)) ||
      (axialKey(x) === axialKey(b) && axialKey(y) === axialKey(a))
    ) {
      return pos;
    }
  }
  throw new Error('sideBetween: cells are not adjacent');
}

function propDoc(
  orientation: DungeonDoc['orientation'] = 'pointy'
): DungeonDoc {
  let doc = emptyDungeon(orientation);
  doc = { ...doc, regions: [{ ...doc.regions[0], cells: [p(0, 0)] }] };
  doc = placeAt(doc, { ref: 'dnd5e:props:pillar', at: p(0, 0) });
  return doc;
}

function noop() {}

const NO_SCENARIOS = { scenarios: [], loading: false, error: null } as const;

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
      onSetWallName={noop}
      onExit={noop}
      onRemoveExit={noop}
      onBindScenario={noop}
      scenarios={NO_SCENARIOS}
      errors={[]}
      onStartFacing={noop}
      onAddIntel={noop}
      onIntel={noop}
      onIntelReveals={noop}
      onIntelHolders={noop}
      onRemoveIntel={noop}
      onAddFaction={noop}
      onFaction={noop}
      onRemoveFaction={noop}
      onAddDisposition={noop}
      onDisposition={noop}
      onRemoveDisposition={noop}
      onSelect={noop}
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
});

/** Mounts the Inspector with a wall selected, a `vi.fn()` for whichever
 * callback the test cares about and `noop` for the rest. */
function mountWall(
  doc: DungeonDoc,
  index: number,
  overrides: Partial<{
    onRemoveWall: (index: number) => void;
    onSetWallHeight: (index: number, height: number | undefined) => void;
    onSetWallName: (index: number, name: string) => void;
  }> = {}
) {
  return render(
    <Inspector
      doc={doc}
      concealment={EMPTY_CONCEALMENT}
      selection={{ kind: 'wall', index }}
      onDungeon={noop}
      onRegion={noop}
      onRemoveRegion={noop}
      onDoor={noop}
      onRemoveDoor={noop}
      onPlacement={noop}
      onRemovePlacement={noop}
      onRemoveWall={overrides.onRemoveWall ?? noop}
      onSetWallHeight={overrides.onSetWallHeight ?? noop}
      onSetWallName={overrides.onSetWallName ?? noop}
      onExit={noop}
      onRemoveExit={noop}
      onBindScenario={noop}
      scenarios={NO_SCENARIOS}
      errors={[]}
      onStartFacing={noop}
      onAddIntel={noop}
      onIntel={noop}
      onIntelReveals={noop}
      onIntelHolders={noop}
      onRemoveIntel={noop}
      onAddFaction={noop}
      onFaction={noop}
      onRemoveFaction={noop}
      onAddDisposition={noop}
      onDisposition={noop}
      onRemoveDisposition={noop}
      onSelect={noop}
    />
  );
}

describe('WallPanel — a wall is one line, selected by index (rpg-project#360 slice 2)', () => {
  it("shows the wall's name and a thin cost line for a wall that seals nothing", () => {
    // v is odd all along this line, so every point on it is a side or no
    // position at all — never a centre (hexGeometry.ts's own table).
    const wall: WallDoc = {
      start: seat({ u: 1, v: 1 }),
      end: seat({ u: 5, v: 1 }),
      name: 'north wall',
    };
    const doc = { ...emptyDungeon('pointy'), walls: [wall] };
    mountWall(doc, 0);
    expect(screen.getByTestId('wall-panel').textContent).toContain(
      'north wall'
    );
    expect(screen.getByTestId('wall-cost').textContent).toBe(
      'Thin — it shaves the cells it passes and seals none of them.'
    );
  });

  it('shows an unnamed wall as "Wall N" and a thick cost line naming the sealed cells', () => {
    let doc = emptyDungeon('pointy');
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    // Centre to centre of two adjacent cells: the line's own endpoints
    // are cell centres, so both are sealed (design §4.3).
    const wall: WallDoc = {
      start: { cell: p(0, 0), offset: [0, 0] },
      end: { cell: p(1, 0), offset: [0, 0] },
    };
    doc = { ...doc, walls: [wall] };
    mountWall(doc, 0);
    expect(screen.getByTestId('wall-panel').textContent).toContain('Wall 1');
    expect(screen.getByTestId('wall-cost').textContent).toBe(
      "Thick — it runs through 2 cells' centres, so those cells are floor nobody stands on."
    );
  });

  it('naming the wall writes through', () => {
    const wall: WallDoc = {
      start: seat({ u: 1, v: 1 }),
      end: seat({ u: 5, v: 1 }),
    };
    const doc = { ...emptyDungeon('pointy'), walls: [wall] };
    const onSetWallName = vi.fn();
    mountWall(doc, 0, { onSetWallName });
    fireEvent.change(screen.getByTestId('wall-name'), {
      target: { value: 'east wall' },
    });
    expect(onSetWallName).toHaveBeenCalledWith(0, 'east wall');
  });

  it('the height stepper writes through: a value, standard-clamps to 1, and the standard button clears it', () => {
    // Starts at 2 (not the standard 1), so each fired change is a real
    // transition — a controlled input snaps back to its unchanged `value`
    // prop between un-rendered events, and React dedupes a change that
    // lands back on that same baseline.
    const wall: WallDoc = {
      start: seat({ u: 1, v: 1 }),
      end: seat({ u: 5, v: 1 }),
      height: 2,
    };
    const doc = { ...emptyDungeon('pointy'), walls: [wall] };
    const onSetWallHeight = vi.fn();
    mountWall(doc, 0, { onSetWallHeight });
    const stepper = screen.getByTestId('wall-height') as HTMLInputElement;
    expect(stepper.value).toBe('2');
    fireEvent.change(stepper, { target: { value: '3' } });
    expect(onSetWallHeight).toHaveBeenLastCalledWith(0, 3);
    // Stepping down to 1 IS "standard": the doc entry clears rather than
    // writing the redundant 1.
    fireEvent.change(stepper, { target: { value: '1' } });
    expect(onSetWallHeight).toHaveBeenLastCalledWith(0, undefined);
    fireEvent.click(screen.getByTestId('wall-height-standard'));
    expect(onSetWallHeight).toHaveBeenLastCalledWith(0, undefined);
  });

  it("delete reports the wall's own index", () => {
    const wallA: WallDoc = {
      start: seat({ u: 1, v: 1 }),
      end: seat({ u: 5, v: 1 }),
    };
    const wallB: WallDoc = {
      start: seat({ u: 1, v: 3 }),
      end: seat({ u: 5, v: 3 }),
    };
    const doc = { ...emptyDungeon('pointy'), walls: [wallA, wallB] };
    const onRemoveWall = vi.fn();
    mountWall(doc, 1, { onRemoveWall });
    fireEvent.click(screen.getByRole('button', { name: /delete wall/i }));
    expect(onRemoveWall).toHaveBeenCalledWith(1);
  });

  it('a selection whose index no longer exists falls back to the dungeon panel', () => {
    const wall: WallDoc = {
      start: seat({ u: 1, v: 1 }),
      end: seat({ u: 5, v: 1 }),
    };
    const doc = { ...emptyDungeon('pointy'), walls: [wall] };
    mountWall(doc, 5);
    expect(screen.getByTestId('dungeon-panel')).toBeTruthy();
  });
});

function doorDoc(): DungeonDoc {
  let doc = emptyDungeon('pointy');
  doc = paintCell(doc, 'region-1', p(0, 0));
  doc = paintCell(doc, 'region-1', p(1, 0));
  // A door stands on a side midpoint (F11) — built directly rather than
  // through the `wall`-gated `toggleDoorAt` mutator, which this panel's
  // own behaviour does not depend on.
  doc = {
    ...doc,
    doors: [{ id: 'door-1', at: sideBetween(p(0, 0), p(1, 0)) }],
  };
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
      onSetWallName={noop}
      onExit={noop}
      onRemoveExit={noop}
      onBindScenario={noop}
      scenarios={NO_SCENARIOS}
      errors={[]}
      onStartFacing={noop}
      onAddIntel={noop}
      onIntel={noop}
      onIntelReveals={noop}
      onIntelHolders={noop}
      onRemoveIntel={noop}
      onAddFaction={noop}
      onFaction={noop}
      onRemoveFaction={noop}
      onAddDisposition={noop}
      onDisposition={noop}
      onRemoveDisposition={noop}
      onSelect={noop}
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

describe('the dungeon panel counts FLOOR, scenery included (rpg-project#360)', () => {
  it('adds the scenery cells to the floor count', () => {
    let doc = emptyDungeon();
    for (const c of [0, 1, 2]) doc = paintCell(doc, 'region-1', p(c, 0));
    const { rerender } = render(
      <Inspector
        doc={doc}
        concealment={EMPTY_CONCEALMENT}
        selection={{ kind: 'dungeon' }}
        onDungeon={noop}
        onRegion={noop}
        onRemoveRegion={noop}
        onDoor={noop}
        onRemoveDoor={noop}
        onPlacement={noop}
        onRemovePlacement={noop}
        onRemoveWall={noop}
        onSetWallHeight={noop}
        onSetWallName={noop}
        onExit={noop}
        onRemoveExit={noop}
        onBindScenario={noop}
        scenarios={NO_SCENARIOS}
        errors={[]}
        onStartFacing={noop}
        onAddIntel={noop}
        onIntel={noop}
        onIntelReveals={noop}
        onIntelHolders={noop}
        onRemoveIntel={noop}
        onAddFaction={noop}
        onFaction={noop}
        onRemoveFaction={noop}
        onAddDisposition={noop}
        onDisposition={noop}
        onRemoveDisposition={noop}
        onSelect={noop}
      />
    );
    expect(screen.getByText(/floor cells/).textContent).toContain(
      '3 floor cells'
    );

    // Scenery is floor (design §1.1), so the line that says "floor cells"
    // has to count it — the strip is not invisible to the summary.
    const withStrip = paintScenery(paintScenery(doc, p(3, 0)), p(4, 0));
    rerender(
      <Inspector
        doc={withStrip}
        concealment={EMPTY_CONCEALMENT}
        selection={{ kind: 'dungeon' }}
        onDungeon={noop}
        onRegion={noop}
        onRemoveRegion={noop}
        onDoor={noop}
        onRemoveDoor={noop}
        onPlacement={noop}
        onRemovePlacement={noop}
        onRemoveWall={noop}
        onSetWallHeight={noop}
        onSetWallName={noop}
        onExit={noop}
        onRemoveExit={noop}
        onBindScenario={noop}
        scenarios={NO_SCENARIOS}
        errors={[]}
        onStartFacing={noop}
        onAddIntel={noop}
        onIntel={noop}
        onIntelReveals={noop}
        onIntelHolders={noop}
        onRemoveIntel={noop}
        onAddFaction={noop}
        onFaction={noop}
        onRemoveFaction={noop}
        onAddDisposition={noop}
        onDisposition={noop}
        onRemoveDisposition={noop}
        onSelect={noop}
      />
    );
    expect(screen.getByText(/floor cells/).textContent).toContain(
      '5 floor cells'
    );
  });
});

// ---------------------------------------------------------------------------
// Ids, knows, holdable and ways out (rpg-project#368 §3.1)
// ---------------------------------------------------------------------------

/** One room with a prop and a monster on it, and a door between two of its
 * cells — everything the three new controls need something to point at. */
function heirloomDoc(): DungeonDoc {
  let doc = emptyDungeon();
  doc = {
    ...doc,
    regions: [{ ...doc.regions[0], cells: [p(0, 0), p(1, 0), p(2, 0)] }],
  };
  doc = placeAt(doc, {
    ref: 'dnd5e:props:reliquary',
    at: p(0, 0),
    blocksMovement: false,
    blocksLos: false,
  });
  doc = placeAt(doc, { ref: 'dnd5e:monsters:skeleton-captain', at: p(1, 0) });
  doc = {
    ...doc,
    doors: [
      { id: 'vault', at: sideBetween(p(0, 0), p(1, 0)), concealed: [] },
      { id: 'front', at: sideBetween(p(1, 0), p(2, 0)) },
    ],
  };
  return doc;
}

function mountAt(
  doc: DungeonDoc,
  selection: Parameters<typeof Inspector>[0]['selection'],
  overrides: Partial<{
    onPlacement: (index: number, patch: Record<string, unknown>) => void;
    onExit: (index: number, patch: Record<string, unknown>) => void;
    onRemoveExit: (index: number) => void;
    onSelect: (selection: unknown) => void;
    onIntel: (id: string, patch: Record<string, unknown>) => void;
    onIntelReveals: (id: string, key: string, value: string) => void;
    onIntelHolders: (id: string, holders: readonly string[]) => void;
    onRemoveIntel: (id: string) => void;
    onStartFacing: (facing: string | undefined) => void;
    onFaction: (id: string, patch: Record<string, unknown>) => void;
    onRemoveFaction: (id: string) => void;
    onAddDisposition: () => void;
    onDisposition: (index: number, patch: Record<string, unknown>) => void;
    onRemoveDisposition: (index: number) => void;
  }> = {}
) {
  return render(
    <Inspector
      doc={doc}
      concealment={EMPTY_CONCEALMENT}
      selection={selection}
      onDungeon={noop}
      onRegion={noop}
      onRemoveRegion={noop}
      onDoor={noop}
      onRemoveDoor={noop}
      onPlacement={overrides.onPlacement ?? noop}
      onRemovePlacement={noop}
      onRemoveWall={noop}
      onSetWallHeight={noop}
      onSetWallName={noop}
      onExit={overrides.onExit ?? noop}
      onRemoveExit={overrides.onRemoveExit ?? noop}
      onBindScenario={noop}
      scenarios={NO_SCENARIOS}
      errors={[]}
      onStartFacing={overrides.onStartFacing ?? noop}
      onAddIntel={noop}
      onIntel={overrides.onIntel ?? noop}
      onIntelReveals={overrides.onIntelReveals ?? noop}
      onIntelHolders={overrides.onIntelHolders ?? noop}
      onRemoveIntel={overrides.onRemoveIntel ?? noop}
      onAddFaction={noop}
      onFaction={overrides.onFaction ?? noop}
      onRemoveFaction={overrides.onRemoveFaction ?? noop}
      onAddDisposition={overrides.onAddDisposition ?? noop}
      onDisposition={overrides.onDisposition ?? noop}
      onRemoveDisposition={overrides.onRemoveDisposition ?? noop}
      onSelect={overrides.onSelect ?? noop}
    />
  );
}

describe('the placement id — offered, renamed, and refused on a collision', () => {
  it('offers a slug from the ref and writes it on one click', () => {
    const onPlacement = vi.fn();
    mountAt(heirloomDoc(), { kind: 'placement', index: 0 }, { onPlacement });
    const suggest = screen.getByTestId('placement-id-suggest');
    expect(suggest.textContent).toBe('call it reliquary');
    fireEvent.click(suggest);
    expect(onPlacement).toHaveBeenCalledWith(0, { id: 'reliquary' });
  });

  it('lets the author rename it to anything not already taken', () => {
    const onPlacement = vi.fn();
    mountAt(heirloomDoc(), { kind: 'placement', index: 0 }, { onPlacement });
    fireEvent.change(screen.getByTestId('placement-id'), {
      target: { value: 'heirloom' },
    });
    expect(onPlacement).toHaveBeenCalledWith(0, { id: 'heirloom' });
  });

  it('refuses a duplicate in place, naming what already has it', () => {
    let doc = heirloomDoc();
    doc = updatePlacement(doc, 1, { id: 'captain' });
    const onPlacement = vi.fn();
    mountAt(doc, { kind: 'placement', index: 0 }, { onPlacement });
    fireEvent.change(screen.getByTestId('placement-id'), {
      target: { value: 'captain' },
    });
    // Not written — the document keeps the name that still works — and the
    // author is told which line already owns it.
    expect(onPlacement).not.toHaveBeenCalled();
    expect(screen.getByTestId('placement-id-refusal').textContent).toContain(
      'dnd5e:monsters:skeleton-captain'
    );
  });

  it('is offered on a monster too, not just a prop', () => {
    mountAt(heirloomDoc(), { kind: 'placement', index: 1 });
    expect(screen.getByTestId('placement-id-suggest').textContent).toBe(
      'call it skeleton-captain'
    );
  });
});

describe('the monster shows what it holds, READ ONLY (rpg-project#372 §5)', () => {
  function withRecord(): DungeonDoc {
    let doc = heirloomDoc();
    doc = { ...doc, intel: [{ id: 'vault-map', reveals: { door: 'vault' } }] };
    return setIntelHolders(doc, 'vault-map', ['captain']);
  }

  it('lists the records this monster carries and links back to each', () => {
    const onSelect = vi.fn();
    let doc = withRecord();
    doc = updatePlacement(doc, 1, { id: 'captain' });
    doc = setIntelHolders(doc, 'vault-map', ['captain']);
    mountAt(doc, { kind: 'placement', index: 1 }, { onSelect });
    fireEvent.click(screen.getByTestId('holds-vault-map'));
    // The monster is not where intel is edited — the link goes to the
    // record's own form, which is where assignment lives (design R2).
    expect(onSelect).toHaveBeenCalledWith({ kind: 'intel', id: 'vault-map' });
  });

  it('offers NO WAY TO EDIT the holding from here', () => {
    let doc = withRecord();
    doc = updatePlacement(doc, 1, { id: 'captain' });
    doc = setIntelHolders(doc, 'vault-map', ['captain']);
    mountAt(doc, { kind: 'placement', index: 1 });
    const readout = screen.getByTestId('holds-readout');
    // No checkbox, no text box: the mirror of a fact, not a second place
    // to write it.
    expect(readout.querySelectorAll('input')).toHaveLength(0);
  });

  it('says so plainly when the monster carries nothing', () => {
    mountAt(heirloomDoc(), { kind: 'placement', index: 1 });
    expect(screen.getByTestId('holds-readout').textContent).toContain(
      'nothing'
    );
  });

  it('names a record the file no longer declares, and does not link to it', () => {
    let doc = heirloomDoc();
    doc = updatePlacement(doc, 1, { holds: ['ghost-record'] });
    mountAt(doc, { kind: 'placement', index: 1 });
    const link = screen.getByTestId('holds-ghost-record') as HTMLButtonElement;
    expect(link.disabled).toBe(true);
    expect(link.textContent).toContain('no such record');
  });

  it('is offered on a PROP too, and reads the same way (R6)', () => {
    // Kirk, walking: "tech could get intel by holding something too … not
    // the hardest monster to kill in the game." A scroll on a table is
    // intel a party can reach without winning a fight first.
    let doc = heirloomDoc();
    doc = updatePlacement(doc, 0, { id: 'hall-scroll' });
    doc = { ...doc, intel: [{ id: 'vault-map', reveals: { door: 'vault' } }] };
    doc = setIntelHolders(doc, 'vault-map', ['hall-scroll']);
    mountAt(doc, { kind: 'placement', index: 0 });
    const readout = screen.getByTestId('holds-readout');
    expect(screen.getByTestId('holds-vault-map')).toBeTruthy();
    // Still read-only on a prop: assignment lives on the record.
    expect(readout.querySelectorAll('input')).toHaveLength(0);
  });

  it('has no `knows` control anywhere — the field is gone (R1)', () => {
    mountAt(heirloomDoc(), { kind: 'placement', index: 1 });
    expect(screen.queryByTestId('knows-control')).toBeNull();
    expect(screen.queryByTestId('knows-vault')).toBeNull();
  });
});

describe('holdable — a prop toggle that requires an id and says so', () => {
  it('is disabled until the prop has an id, and names what is missing', () => {
    mountAt(heirloomDoc(), { kind: 'placement', index: 0 });
    const toggle = screen.getByTestId('placement-holdable') as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(screen.getByTestId('holdable-note').textContent).toContain(
      'has to be nameable'
    );
  });

  it('works once the prop is named, and says what it means', () => {
    const doc = updatePlacement(heirloomDoc(), 0, { id: 'heirloom' });
    const onPlacement = vi.fn();
    mountAt(doc, { kind: 'placement', index: 0 }, { onPlacement });
    const toggle = screen.getByTestId('placement-holdable') as HTMLInputElement;
    expect(toggle.disabled).toBe(false);
    fireEvent.click(toggle);
    expect(onPlacement).toHaveBeenCalledWith(0, { holdable: true });
    expect(screen.getByTestId('holdable-note').textContent).toContain(
      'pick it up'
    );
  });

  it('is NOT offered on a monster', () => {
    mountAt(heirloomDoc(), { kind: 'placement', index: 1 });
    expect(screen.queryByTestId('placement-holdable')).toBeNull();
  });
});

describe('the way-out panel', () => {
  function withExits(): DungeonDoc {
    let doc = toggleExitAt(heirloomDoc(), p(0, 0));
    doc = updateExit(doc, 0, { id: 'entrance' });
    doc = toggleExitAt(doc, p(2, 0));
    return doc;
  }

  it('renames a way out', () => {
    const onExit = vi.fn();
    mountAt(withExits(), { kind: 'exit', index: 0 }, { onExit });
    fireEvent.change(screen.getByTestId('exit-id'), {
      target: { value: 'front-gate' },
    });
    expect(onExit).toHaveBeenCalledWith(0, { id: 'front-gate' });
  });

  it('refuses a name another way out already has', () => {
    const onExit = vi.fn();
    mountAt(withExits(), { kind: 'exit', index: 1 }, { onExit });
    fireEvent.change(screen.getByTestId('exit-id'), {
      target: { value: 'entrance' },
    });
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByTestId('exit-id-refusal').textContent).toContain(
      'entrance'
    );
  });

  it('refuses a blank name in place, and points at the remove button', () => {
    // An exit's id is what a scenario binds to and what `Exited.exit`
    // reports, so an empty one is a way out no form can point at. The
    // document keeps the name that still works while the box is empty.
    const onExit = vi.fn();
    mountAt(withExits(), { kind: 'exit', index: 0 }, { onExit });
    fireEvent.change(screen.getByTestId('exit-id'), { target: { value: '' } });
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByTestId('exit-id-refusal').textContent).toContain(
      'remove way out'
    );
    // And typing a real name from there commits normally.
    fireEvent.change(screen.getByTestId('exit-id'), {
      target: { value: 'side-door' },
    });
    expect(onExit).toHaveBeenCalledWith(0, { id: 'side-door' });
  });

  it('removes one', () => {
    const onRemoveExit = vi.fn();
    mountAt(withExits(), { kind: 'exit', index: 1 }, { onRemoveExit });
    fireEvent.click(screen.getByText('remove way out'));
    expect(onRemoveExit).toHaveBeenCalledWith(1);
  });

  it('falls back to the dungeon panel for an exit that is gone', () => {
    mountAt(heirloomDoc(), { kind: 'exit', index: 3 });
    expect(screen.getByTestId('dungeon-panel')).toBeTruthy();
  });

  it('counts the ways out on the dungeon panel', () => {
    mountAt(withExits(), { kind: 'dungeon' });
    expect(screen.getByText(/ways out/).textContent).toContain('2 ways out');
  });
});

describe('the intel panel — the form that assigns intel (rpg-project#372 §5)', () => {
  /** A dungeon with two named monsters, three doors and one record. */
  function withIntel(): DungeonDoc {
    let doc = heirloomDoc();
    doc = updatePlacement(doc, 1, { id: 'captain' });
    doc = placeAt(doc, { ref: 'dnd5e:monsters:skeleton', at: p(2, 0) });
    doc = updatePlacement(doc, 2, { id: 'guard' });
    doc = addIntel(doc);
    return setIntelReveals(doc, 'intel-1', 'door', 'vault');
  }

  it('renames a record, and refuses a name another one already has', () => {
    const onIntel = vi.fn();
    let doc = withIntel();
    doc = addIntel(doc);
    mountAt(doc, { kind: 'intel', id: 'intel-1' }, { onIntel });
    fireEvent.change(screen.getByTestId('intel-id'), {
      target: { value: 'vault-map' },
    });
    expect(onIntel).toHaveBeenCalledWith('intel-1', { id: 'vault-map' });

    onIntel.mockClear();
    fireEvent.change(screen.getByTestId('intel-id'), {
      target: { value: 'intel-2' },
    });
    expect(onIntel).not.toHaveBeenCalled();
    expect(screen.getByTestId('intel-id-refusal').textContent).toContain(
      'intel-2'
    );
  });

  it('refuses a blank name, and points at the remove button', () => {
    // A record's id is what a monster's `holds` points at, so a nameless
    // one is intel nothing can carry.
    const onIntel = vi.fn();
    mountAt(withIntel(), { kind: 'intel', id: 'intel-1' }, { onIntel });
    fireEvent.change(screen.getByTestId('intel-id'), { target: { value: '' } });
    expect(onIntel).not.toHaveBeenCalled();
    expect(screen.getByTestId('intel-id-refusal').textContent).toContain(
      'remove record'
    );
  });

  it('reveals is the dungeon’s own doors, and marks the concealed one', () => {
    mountAt(withIntel(), { kind: 'intel', id: 'intel-1' });
    const select = screen.getByTestId(
      'intel-reveals-door'
    ) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual([
      '',
      'vault',
      'front',
    ]);
    // The concealed door is the one worth knowing; the panel says which
    // without refusing the others (an ordinary door is legal and inert).
    expect(
      [...select.options].find((o) => o.value === 'vault')?.textContent
    ).toContain('concealed');
    expect(select.value).toBe('vault');
  });

  it('binds and clears the door it reveals', () => {
    const onIntelReveals = vi.fn();
    mountAt(withIntel(), { kind: 'intel', id: 'intel-1' }, { onIntelReveals });
    fireEvent.change(screen.getByTestId('intel-reveals-door'), {
      target: { value: 'front' },
    });
    expect(onIntelReveals).toHaveBeenCalledWith('intel-1', 'door', 'front');
    fireEvent.change(screen.getByTestId('intel-reveals-door'), {
      target: { value: '' },
    });
    expect(onIntelReveals).toHaveBeenLastCalledWith('intel-1', 'door', '');
  });

  it('keeps showing a door the file no longer has', () => {
    // The author deleted the door after binding. The file still says
    // `vault`, so the form still says `vault` — reading "(nothing yet)"
    // would hide what the file contains.
    let doc = withIntel();
    doc = { ...doc, doors: doc.doors.filter((d) => d.id !== 'vault') };
    mountAt(doc, { kind: 'intel', id: 'intel-1' });
    expect(
      (screen.getByTestId('intel-reveals-door') as HTMLSelectElement).value
    ).toBe('vault');
  });

  it('held by lists every NAMED monster, and no props', () => {
    mountAt(withIntel(), { kind: 'intel', id: 'intel-1' });
    expect(screen.getByTestId('intel-holder-captain')).toBeTruthy();
    expect(screen.getByTestId('intel-holder-guard')).toBeTruthy();
    // The reliquary is a prop with an id; a prop holds nothing.
    expect(screen.queryByTestId('intel-holder-heirloom')).toBeNull();
  });

  it('assigns the record to a monster, and takes it back', () => {
    const onIntelHolders = vi.fn();
    const doc = setIntelHolders(withIntel(), 'intel-1', ['captain']);
    mountAt(doc, { kind: 'intel', id: 'intel-1' }, { onIntelHolders });
    // Already held by the captain…
    expect(
      (screen.getByTestId('intel-holder-captain') as HTMLInputElement).checked
    ).toBe(true);
    // …and a second monster may carry the same record: intel copies.
    fireEvent.click(screen.getByTestId('intel-holder-guard'));
    expect(onIntelHolders).toHaveBeenLastCalledWith('intel-1', [
      'captain',
      'guard',
    ]);
    fireEvent.click(screen.getByTestId('intel-holder-captain'));
    expect(onIntelHolders).toHaveBeenLastCalledWith('intel-1', []);
  });

  it('says what to do when nothing in the dungeon has an id yet', () => {
    let doc = heirloomDoc();
    doc = addIntel(doc);
    mountAt(doc, { kind: 'intel', id: 'intel-1' });
    expect(screen.getByTestId('intel-held-by').textContent).toContain(
      'nothing in this dungeon has an id yet'
    );
  });

  it('offers PROPS as holders beside monsters, and says which is which (R6)', () => {
    let doc = withIntel();
    doc = updatePlacement(doc, 0, { id: 'hall-scroll' });
    mountAt(doc, { kind: 'intel', id: 'intel-1' });
    const heldBy = screen.getByTestId('intel-held-by');
    expect(screen.getByTestId('intel-holder-captain')).toBeTruthy();
    expect(screen.getByTestId('intel-holder-hall-scroll')).toBeTruthy();
    // A scroll and a captain are reached in very different ways, and the
    // author is choosing between them here — so each row says its kind.
    expect(heldBy.textContent).toContain('monster');
    expect(heldBy.textContent).toContain('prop');
  });

  it('assigns a record to a prop', () => {
    const onIntelHolders = vi.fn();
    let doc = withIntel();
    doc = updatePlacement(doc, 0, { id: 'hall-scroll' });
    mountAt(doc, { kind: 'intel', id: 'intel-1' }, { onIntelHolders });
    fireEvent.click(screen.getByTestId('intel-holder-hall-scroll'));
    expect(onIntelHolders).toHaveBeenLastCalledWith('intel-1', ['hall-scroll']);
  });

  it('says what to do when the dungeon has no doors', () => {
    let doc = emptyDungeon();
    doc = addIntel(doc);
    mountAt(doc, { kind: 'intel', id: 'intel-1' });
    expect(screen.getByTestId('intel-no-doors')).toBeTruthy();
  });

  it('falls back to the dungeon panel for a record that is gone', () => {
    mountAt(withIntel(), { kind: 'intel', id: 'no-such-record' });
    expect(screen.getByTestId('dungeon-panel')).toBeTruthy();
  });

  it('removes a record', () => {
    const onRemoveIntel = vi.fn();
    mountAt(withIntel(), { kind: 'intel', id: 'intel-1' }, { onRemoveIntel });
    fireEvent.click(screen.getByTestId('intel-remove'));
    expect(onRemoveIntel).toHaveBeenCalledWith('intel-1');
  });
});

describe('intel is a dungeon-level section, not a palette item (R7)', () => {
  it('lists the records on the dungeon panel, beside Scenarios', () => {
    let doc = heirloomDoc();
    doc = { ...doc, intel: [{ id: 'vault-map', reveals: { door: 'vault' } }] };
    mountAt(doc, { kind: 'dungeon' });
    // Kirk, walking: "so little weird the intel is next to the assets."
    // A record is a declaration the dungeon carries, like a scenario
    // binding — not a thing you pick up and place.
    const section = screen.getByTestId('intel-section');
    expect(section).toBeTruthy();
    expect(screen.getByTestId('new-intel')).toBeTruthy();
    expect(screen.getByTestId('intel-vault-map')).toBeTruthy();
    // Its form is NOT open until a record is picked.
    expect(screen.queryByTestId('intel-panel')).toBeNull();
  });

  it('opens the record’s form IN PLACE, with the list still on screen', () => {
    let doc = heirloomDoc();
    doc = { ...doc, intel: [{ id: 'vault-map', reveals: { door: 'vault' } }] };
    mountAt(doc, { kind: 'intel', id: 'vault-map' });
    // Both together: the list the author is choosing from and the form
    // they are filling in.
    expect(screen.getByTestId('intel-vault-map')).toBeTruthy();
    expect(screen.getByTestId('intel-panel')).toBeTruthy();
    // And it is still the dungeon panel underneath, not a replacement.
    expect(screen.getByTestId('dungeon-panel')).toBeTruthy();
  });

  it('says so plainly when the dungeon declares none', () => {
    mountAt(heirloomDoc(), { kind: 'dungeon' });
    expect(screen.getByTestId('intel-section').textContent).toContain(
      'a monster or a prop carries it'
    );
  });
});

describe('the Start panel — aiming the party’s entry (rpg-project#374)', () => {
  const withStart = () => setStart(heirloomDoc(), p(0, 0));

  it('offers the same eight-name compass the props use', () => {
    mountAt(withStart(), { kind: 'start' });
    expect(screen.getByTestId('start-panel')).toBeTruthy();
    // One vocabulary, one control: an author who has aimed a statue has
    // already learned this one.
    expect(screen.getByTestId('facing-compass')).toBeTruthy();
    for (const name of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
      expect(screen.getByTestId(`facing-${name}`)).toBeTruthy();
    }
  });

  it('aims the start, and clears it back to none', () => {
    const onStartFacing = vi.fn();
    mountAt(withStart(), { kind: 'start' }, { onStartFacing });
    fireEvent.click(screen.getByTestId('facing-e'));
    expect(onStartFacing).toHaveBeenCalledWith('e');
    fireEvent.click(screen.getByTestId('facing-none'));
    expect(onStartFacing).toHaveBeenLastCalledWith(undefined);
  });

  it('says what no facing MEANS, rather than leaving the control blank', () => {
    mountAt(withStart(), { kind: 'start' });
    const note = screen.getByTestId('start-facing-note').textContent ?? '';
    expect(note).toContain('the camera starts the way it always has');
    expect(note).toContain('start: [col, row]');
  });

  it('says what a facing does, and what it does NOT', () => {
    // Presentation, not a rule — `AtlasStart.facing` says so on the wire.
    const doc = setStartFacing(withStart(), 'e');
    mountAt(doc, { kind: 'start' });
    const note = screen.getByTestId('start-facing-note').textContent ?? '';
    expect(note).toContain('looks e on the first frame');
    expect(note).toContain('never decides where the party may walk');
  });

  it('offers NO remove — dungeonspec requires a start', () => {
    // An author moves the start with the Start tool; taking it away only
    // produces a file the server refuses, so the verb is not offered.
    mountAt(withStart(), { kind: 'start' });
    expect(screen.queryByTestId('start-remove')).toBeNull();
  });

  it('falls back to the dungeon panel when no start is authored', () => {
    // Nothing to aim, so a form for it would be a form for a thing that
    // does not exist.
    mountAt(heirloomDoc(), { kind: 'start' });
    expect(screen.getByTestId('dungeon-panel')).toBeTruthy();
    expect(screen.queryByTestId('start-panel')).toBeNull();
  });
});
