import { describe, expect, it } from 'vitest';
import {
  emitDungeon,
  emptyDungeon,
  eraseCell,
  floorOwners,
  paintCell,
  parseDungeon,
  placeAt,
  setStart,
  toggleDoorEdge,
  toggleWall,
  type DungeonDoc,
} from './dungeonYaml';
import { referenceTombDoc } from './fixtures/referenceTomb';
import { fromOffset, type Axial } from './hexOffset';

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
    expect(text).toContain('  - id: entrance\n    name: Entrance\n    archetype: crypt\n    lighting: { intensity: 0.6 }\n    cells:\n      - [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]]\n      - [[0,1],[1,1],[2,1],[3,1],[4,1],[5,1]]\n');
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
    const flat: DungeonDoc = { ...emptyDungeon('flat'), start: { q: -1, r: 3 } };
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
    expect(() => parseDungeon('version: 1\nkey: x\n')).toThrow(/version 1 is deleted/);
  });

  it('refuses unknown keys (the server is strict, so is the loader)', () => {
    expect(() =>
      parseDungeon('version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nrooms: []\n')
    ).toThrow(/unknown key "rooms"/);
  });
});

describe('mutators', () => {
  it('the brush never paints a cell into two regions', () => {
    let doc = emptyDungeon();
    doc = { ...doc, regions: [...doc.regions, { ...doc.regions[0], id: 'b', name: 'B' }] };
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

  it('erasing a cell takes its walls, door edges, start and placement with it', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    doc = paintCell(doc, 'region-1', p(2, 0));
    doc = toggleWall(doc, [p(0, 0), p(1, 0)]);
    doc = toggleDoorEdge(doc, [p(1, 0), p(2, 0)]);
    doc = setStart(doc, p(1, 0));
    doc = placeAt(doc, { ref: 'dnd5e:props:pillar', at: p(1, 0), blocksLos: true });
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
    doc = placeAt(doc, { ref: 'dnd5e:props:pillar', at: p(0, 0), blocksLos: true });
    doc = placeAt(doc, { ref: 'dnd5e:monsters:zombie', at: p(1, 0), blocksLos: true });
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

  it('start must be floor', () => {
    const doc = emptyDungeon();
    expect(setStart(doc, p(4, 4))).toBe(doc);
  });
});
