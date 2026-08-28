import { describe, expect, it } from 'vitest';
import {
  addWalls,
  emitDungeon,
  emptyDungeon,
  eraseCell,
  floorOwners,
  paintCell,
  parseDungeon,
  placeAt,
  removeWalls,
  resolveErrorPath,
  setStart,
  setWallHeights,
  toggleDoorEdge,
  toggleWall,
  updatePlacement,
  type DungeonDoc,
} from './dungeonYaml';
import { referenceTombDoc } from './fixtures/referenceTomb';
import {
  edgeKey,
  fromOffset,
  toOffset,
  type Axial,
  type Edge,
} from './hexOffset';

const p = (col: number, row: number): Axial => fromOffset('pointy', [col, row]);

describe('emitDungeon / parseDungeon', () => {
  it('round-trips the reference tomb byte-for-byte', () => {
    const text = emitDungeon(referenceTombDoc());
    expect(emitDungeon(parseDungeon(text))).toBe(text);
  });

  it('round-trips an empty new dungeon byte-for-byte', () => {
    const text = emitDungeon(emptyDungeon());
    expect(emitDungeon(parseDungeon(text))).toBe(text);
    expect(text).toContain('cells: []');
    expect(text).not.toContain('start:');
  });

  it('writes the tomb in the design §2 shape: sorted cells, one row per line', () => {
    const text = emitDungeon(referenceTombDoc());
    const lines = text.split('\n');
    expect(lines.slice(0, 5)).toEqual([
      'version: 2',
      'key: reference-tomb',
      'name: The Reference Tomb',
      'orientation: pointy',
      'void: opaque',
    ]);
    expect(text).toContain(
      '  - id: entrance\n    name: Entrance\n    archetype: crypt\n    lighting: { intensity: 0.6 }\n    cells:\n      - [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]]\n      - [[0,1],[1,1],[2,1],[3,1],[4,1],[5,1]]\n'
    );
    // eight rows per region, every row on its own line
    const entranceRows = lines.filter((l) => /^ {6}- \[\[[0-5],\d\]/.test(l));
    expect(entranceRows).toHaveLength(8);
    expect(text).toContain('start: [1, 3]');
    expect(text).toContain('    locked: { dc: 12, ability: dex }');
    expect(text).toContain(
      '  - { ref: "dnd5e:props:pillar", at: [8,2], blocks_movement: true, blocks_los: true }'
    );
    expect(text).toContain(
      '  - { ref: "dnd5e:monsters:skeleton-captain", at: [23,5], targeting: closest, boss: true }'
    );
  });

  it('emits cells sorted regardless of paint order', () => {
    let doc = emptyDungeon();
    for (const [c, r] of [
      [3, 1],
      [0, 0],
      [2, 1],
      [1, 0],
    ]) {
      doc = paintCell(doc, 'region-1', p(c, r));
    }
    expect(emitDungeon(doc)).toContain(
      '    cells:\n      - [[0,0],[1,0]]\n      - [[2,1],[3,1]]\n'
    );
  });

  it('the file is offset under the declared orientation: the same axial cell writes differently under flat', () => {
    const pointy = { ...emptyDungeon('pointy'), start: { q: -1, r: 3 } };
    const flat: DungeonDoc = {
      ...emptyDungeon('flat'),
      start: { q: -1, r: 3 },
    };
    expect(emitDungeon(pointy)).toContain('start: [0, 3]'); // odd-r
    expect(emitDungeon(flat)).toContain('start: [-1, 2]'); // odd-q
    expect(parseDungeon(emitDungeon(flat)).start).toEqual({ q: -1, r: 3 });
  });

  it('quotes names that YAML would otherwise misread', () => {
    const doc = { ...emptyDungeon(), name: 'Tomb: of #3' };
    const text = emitDungeon(doc);
    expect(text).toContain('name: "Tomb: of #3"');
    expect(parseDungeon(text).name).toBe('Tomb: of #3');
  });

  it('refuses version 1 by name', () => {
    expect(() => parseDungeon('version: 1\nkey: x\n')).toThrow(
      /version 1 is deleted/
    );
  });

  it('refuses unknown keys (the server is strict, so is the loader)', () => {
    expect(() =>
      parseDungeon(
        'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nrooms: []\n'
      )
    ).toThrow(/unknown key "rooms"/);
  });

  it('round-trips facing and offset byte-for-byte', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(1, 1));
    doc = placeAt(doc, {
      ref: 'dnd5e:props:brazier',
      at: p(1, 1),
      blocksMovement: true,
      blocksLos: false,
    });
    doc = {
      ...doc,
      place: [{ ...doc.place[0], facing: 'ne', offset: [0.2, -0.1] }],
    };
    const text = emitDungeon(doc);
    expect(text).toContain(
      '  - { ref: "dnd5e:props:brazier", at: [1,1], blocks_movement: true, blocks_los: false, facing: ne, offset: [0.2, -0.1] }'
    );
    const reparsed = parseDungeon(text);
    expect(reparsed.place[0].facing).toBe('ne');
    expect(reparsed.place[0].offset).toEqual([0.2, -0.1]);
    expect(emitDungeon(reparsed)).toBe(text);
  });

  it('keeps an explicit offset [0, 0] distinct from omitted through a round trip', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(1, 1));
    doc = placeAt(doc, { ref: 'dnd5e:props:brazier', at: p(1, 1) });
    // Omitted: never written.
    expect(emitDungeon(doc)).not.toContain('offset');
    // Explicit zero: written, and survives the round trip as [0, 0] —
    // not silently collapsed to omitted.
    const withZero = {
      ...doc,
      place: [{ ...doc.place[0], offset: [0, 0] as [number, number] }],
    };
    const text = emitDungeon(withZero);
    expect(text).toContain('offset: [0, 0]');
    expect(parseDungeon(text).place[0].offset).toEqual([0, 0]);
  });

  it('refuses a non-string facing', () => {
    expect(() =>
      parseDungeon(
        'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nregions: []\nplace:\n  - { ref: "dnd5e:props:pillar", at: [0,0], facing: 3 }\n'
      )
    ).toThrow(/place\[0\]\.facing: expected a string/);
  });

  it('refuses a malformed offset', () => {
    expect(() =>
      parseDungeon(
        'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nregions: []\nplace:\n  - { ref: "dnd5e:props:pillar", at: [0,0], offset: [0.1] }\n'
      )
    ).toThrow(/place\[0\]\.offset: expected \[x,y\]/);
  });

  it('refuses a non-finite offset component (Copilot review, PR #795: NaN/Infinity are still typeof "number")', () => {
    expect(() =>
      parseDungeon(
        'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nregions: []\nplace:\n  - { ref: "dnd5e:props:pillar", at: [0,0], offset: [.nan, 0.1] }\n'
      )
    ).toThrow(/place\[0\]\.offset: expected \[x,y\]/);
    expect(() =>
      parseDungeon(
        'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nregions: []\nplace:\n  - { ref: "dnd5e:props:pillar", at: [0,0], offset: [.inf, 0.1] }\n'
      )
    ).toThrow(/place\[0\]\.offset: expected \[x,y\]/);
  });

  it('round-trips a three-component offset byte-for-byte — the height escapes the planar clamp (rpg-project#272)', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(1, 1));
    doc = placeAt(doc, {
      ref: 'dnd5e:props:skull',
      at: p(1, 1),
      blocksMovement: false,
      blocksLos: false,
    });
    doc = {
      ...doc,
      place: [{ ...doc.place[0], offset: [0.2, -0.1, 1.6] }],
    };
    const text = emitDungeon(doc);
    expect(text).toContain('offset: [0.2, -0.1, 1.6]');
    const reparsed = parseDungeon(text);
    expect(reparsed.place[0].offset).toEqual([0.2, -0.1, 1.6]);
    expect(emitDungeon(reparsed)).toBe(text);
  });

  it('round-trips both wall forms byte-for-byte: bare pair = standard, object = authored height (rpg-project#273)', () => {
    let doc = emptyDungeon();
    for (const [c, r] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      doc = paintCell(doc, 'region-1', p(c, r));
    }
    doc = toggleWall(doc, [p(0, 0), p(1, 0)]);
    doc = toggleWall(doc, [p(0, 1), p(1, 1)]);
    doc = setWallHeights(doc, [[p(0, 1), p(1, 1)]], 2);
    const text = emitDungeon(doc);
    expect(text).toContain('walls:\n  - [[0,0],[1,0]]\n');
    expect(text).toContain('  - { between: [[0,1],[1,1]], height: 2 }');
    const reparsed = parseDungeon(text);
    expect(reparsed.walls.map((w) => w.height)).toEqual([undefined, 2]);
    expect(emitDungeon(reparsed)).toBe(text);
  });

  it('refuses a wall object with an unknown key, a missing edge, or a non-number height', () => {
    const head =
      'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nregions: []\nwalls:\n';
    expect(() =>
      parseDungeon(head + '  - { between: [[0,0],[1,0]], hieght: 2 }\n')
    ).toThrow(/walls\[0\]: unknown key "hieght"/);
    expect(() => parseDungeon(head + '  - { height: 2 }\n')).toThrow(
      /walls\[0\]\.between/
    );
    expect(() =>
      parseDungeon(head + '  - { between: [[0,0],[1,0]], height: tall }\n')
    ).toThrow(/walls\[0\]\.height: expected a number/);
  });

  it('the reference tomb has no facing/offset anywhere — the additive fields change nothing absent', () => {
    for (const placement of referenceTombDoc().place) {
      expect(placement.facing).toBeUndefined();
      expect(placement.offset).toBeUndefined();
    }
    expect(emitDungeon(referenceTombDoc())).not.toMatch(/facing:|offset:/);
  });
});

describe('mutators', () => {
  it('the brush never paints a cell into two regions', () => {
    let doc = emptyDungeon();
    doc = {
      ...doc,
      regions: [...doc.regions, { ...doc.regions[0], id: 'b', name: 'B' }],
    };
    doc = paintCell(doc, 'region-1', p(2, 2));
    doc = paintCell(doc, 'b', p(2, 2));
    expect(doc.regions[0].cells).toHaveLength(0);
    expect(doc.regions[1].cells).toHaveLength(1);
    expect(floorOwners(doc).get('1,2')).toBe('b');
  });

  it('the wall tool on a non-adjacent pair is a no-op', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(2, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    const before = doc;
    expect(toggleWall(doc, [p(0, 0), p(2, 0)])).toBe(before);
    expect(toggleWall(doc, [p(0, 0), p(1, 0)]).walls).toHaveLength(1);
  });

  it('the wall tool refuses an edge off the floor', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    expect(toggleWall(doc, [p(0, 0), p(1, 0)])).toBe(doc);
  });

  it('an edge is a wall OR a door, never both', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    doc = toggleWall(doc, [p(0, 0), p(1, 0)]);
    doc = toggleDoorEdge(doc, [p(0, 0), p(1, 0)]);
    expect(doc.walls).toHaveLength(0);
    expect(doc.doors).toEqual([{ id: 'door-1', edges: [[p(0, 0), p(1, 0)]] }]);
    // the wall tool leaves a door edge alone
    expect(toggleWall(doc, [p(0, 0), p(1, 0)])).toBe(doc);
    // clicking it again with the door tool removes the door
    expect(toggleDoorEdge(doc, [p(1, 0), p(0, 0)]).doors).toHaveLength(0);
  });

  it('setWallHeights stamps every named edge, clears back to standard with undefined, and dies with an erased wall', () => {
    let doc = emptyDungeon();
    for (const [c, r] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      doc = paintCell(doc, 'region-1', p(c, r));
    }
    const e1: Edge = [p(0, 0), p(1, 0)];
    const e2: Edge = [p(0, 1), p(1, 1)];
    doc = addWalls(doc, [e1, e2]);
    doc = setWallHeights(doc, [e1, e2], 2.5);
    expect(doc.walls.map((w) => w.height)).toEqual([2.5, 2.5]);
    // Clearing is the same chain-level stamp.
    doc = setWallHeights(doc, [e1], undefined);
    expect(doc.walls.map((w) => w.height)).toEqual([undefined, 2.5]);
    // A no-op returns the same doc (referential, like every mutator).
    expect(setWallHeights(doc, [e1], undefined)).toBe(doc);
    // Erasing the raised wall erases its height WITH it: a redraw gets
    // standard, never a resurrected stale height.
    doc = removeWalls(doc, [e2]);
    doc = addWalls(doc, [e2]);
    const redrawn = doc.walls.find((w) => edgeKey(w.edge) === edgeKey(e2));
    expect(redrawn?.height).toBeUndefined();
  });

  it('addWalls with a height writes it on every new edge — the current stroke carries it (rpg-project#273)', () => {
    let doc = emptyDungeon();
    for (const [c, r] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      doc = paintCell(doc, 'region-1', p(c, r));
    }
    doc = addWalls(
      doc,
      [
        [p(0, 0), p(1, 0)],
        [p(0, 1), p(1, 1)],
      ],
      3
    );
    expect(doc.walls.map((w) => w.height)).toEqual([3, 3]);
  });

  it('erasing a cell takes its walls, door edges, start and placement with it', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    doc = paintCell(doc, 'region-1', p(2, 0));
    doc = toggleWall(doc, [p(0, 0), p(1, 0)]);
    doc = toggleDoorEdge(doc, [p(1, 0), p(2, 0)]);
    doc = setStart(doc, p(1, 0));
    doc = placeAt(doc, {
      ref: 'dnd5e:props:pillar',
      at: p(1, 0),
      blocksLos: true,
    });
    doc = eraseCell(doc, p(1, 0));
    expect(doc.walls).toHaveLength(0);
    expect(doc.doors).toHaveLength(0);
    expect(doc.start).toBeNull();
    expect(doc.place).toHaveLength(0);
    expect(floorOwners(doc).size).toBe(2);
  });

  it('placeAt writes blocks_* explicitly for props and never for monsters', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    doc = placeAt(doc, {
      ref: 'dnd5e:props:pillar',
      at: p(0, 0),
      blocksLos: true,
    });
    doc = placeAt(doc, {
      ref: 'dnd5e:monsters:zombie',
      at: p(1, 0),
      blocksLos: true,
    });
    expect(doc.place[0]).toEqual({
      ref: 'dnd5e:props:pillar',
      at: p(0, 0),
      blocksMovement: false,
      blocksLos: true,
    });
    expect(doc.place[1]).toEqual({ ref: 'dnd5e:monsters:zombie', at: p(1, 0) });
    expect(emitDungeon(doc)).toContain(
      '{ ref: "dnd5e:props:pillar", at: [0,0], blocks_movement: false, blocks_los: true }'
    );
  });

  it('placeAt strips facing/offset from monster placements, same as blocks_*', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = placeAt(doc, {
      ref: 'dnd5e:monsters:zombie',
      at: p(0, 0),
      facing: 'ne',
      offset: [0.2, 0.2],
    });
    expect(doc.place[0]).toEqual({ ref: 'dnd5e:monsters:zombie', at: p(0, 0) });
  });

  it('placeAt copies a caller-supplied facing/offset through for props (Copilot review, PR #795)', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = placeAt(doc, {
      ref: 'dnd5e:props:pillar',
      at: p(0, 0),
      facing: 'ne',
      offset: [0.2, 0.2],
    });
    expect(doc.place[0]).toEqual({
      ref: 'dnd5e:props:pillar',
      at: p(0, 0),
      blocksMovement: false,
      blocksLos: false,
      facing: 'ne',
      offset: [0.2, 0.2],
    });
  });

  it('updatePlacement never leaves facing/offset on a monster (Copilot review, PR #795)', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = placeAt(doc, { ref: 'dnd5e:monsters:zombie', at: p(0, 0) });
    doc = updatePlacement(doc, 0, { facing: 'ne', offset: [0.2, 0.2] });
    expect(doc.place[0]).not.toHaveProperty('facing');
    expect(doc.place[0]).not.toHaveProperty('offset');
    expect(emitDungeon(doc)).not.toMatch(/facing:|offset:/);
  });

  it('start must be floor', () => {
    const doc = emptyDungeon();
    expect(setStart(doc, p(4, 4))).toBe(doc);
  });

  it('updatePlacement clears facing/offset back to omitted', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = placeAt(doc, { ref: 'dnd5e:props:pillar', at: p(0, 0) });
    doc = updatePlacement(doc, 0, { facing: 'ne', offset: [0.3, 0.1] });
    expect(doc.place[0].facing).toBe('ne');
    expect(doc.place[0].offset).toEqual([0.3, 0.1]);
    doc = updatePlacement(doc, 0, { facing: undefined, offset: undefined });
    expect(doc.place[0]).not.toHaveProperty('facing');
    expect(doc.place[0]).not.toHaveProperty('offset');
  });
});

describe('resolveErrorPath', () => {
  it('names the thing the emitted order put at that path', () => {
    const doc = referenceTombDoc();
    // regions[1] is the hall; its row 0 is cols 6..15, so [0][3] is [9,0]
    expect(resolveErrorPath(doc, 'regions[1].cells[0][3]')).toEqual({
      kind: 'cell',
      cell: p(9, 0),
    });
    expect(resolveErrorPath(doc, 'start')).toEqual({ kind: 'start' });
    expect(resolveErrorPath(doc, 'place[3].boss')).toEqual({
      kind: 'placement',
      index: 3,
      cell: p(23, 5),
    });
    expect(resolveErrorPath(doc, 'doors[1].edges[0]')).toEqual({
      kind: 'edge',
      edge: [p(15, 3), p(16, 3)],
    });
    expect(resolveErrorPath(doc, 'doors[1].locked.dc')).toEqual({
      kind: 'door',
      doorId: 'hall-tomb',
    });
    expect(resolveErrorPath(doc, 'regions[2].archetype')).toEqual({
      kind: 'region',
      regionId: 'tomb',
    });
    const text = emitDungeon(doc);
    const wallLines = text.split('\n').filter((l) => l.startsWith('  - [['));
    const walls3 = resolveErrorPath(doc, 'walls[3]');
    expect(walls3.kind).toBe('edge');
    if (walls3.kind === 'edge') {
      const [a, b] = walls3.edge;
      const pa = toOffset('pointy', a);
      const pb = toOffset('pointy', b);
      expect(wallLines[3]).toBe(
        `  - [[${pa[0]},${pa[1]}],[${pb[0]},${pb[1]}]]`
      );
    }
    expect(resolveErrorPath(doc, 'key')).toEqual({ kind: 'document' });
    expect(resolveErrorPath(doc, 'walls[999]')).toEqual({ kind: 'document' });
  });
});
