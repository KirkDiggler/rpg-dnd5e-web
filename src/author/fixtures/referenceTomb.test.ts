import { describe, expect, it } from 'vitest';
import {
  emitDungeon,
  nameFromFloor,
  parseDungeon,
  wallCrossingKeys,
  type PositionRef,
} from '../dungeonYaml';
import { latticeOf, positionSpellings } from '../hexGeometry';
import { axialKey, edgeKey, fromOffset } from '../hexOffset';
import {
  REFERENCE_TOMB_YAML,
  referenceTombDoc,
  seamEdges,
} from './referenceTomb';

describe('the reference tomb is the toolkit’s own file', () => {
  it('parses the file the compiler compiles, not a conversion of it', () => {
    // `reference-tomb.yaml` beside this test is a verbatim copy of the
    // toolkit's dungeonspec testdata. If the two ever diverge, the
    // builder and the server stop agreeing about what the tomb IS, and
    // no test either side would notice.
    //
    // THE ROW BELOW IS THE ONE THAT CATCHES IT. Every assertion here used
    // to name a substring prettier leaves alone, so when the pre-commit
    // hook's `*.yaml` formatter respaced this file's flow sequences —
    // `[[0,0],[1,0]]` to `[[0, 0], [1, 0]]` — the copy stopped being
    // verbatim and nothing failed (found while adding the heirloom copy,
    // rpg-project#368). The file is in `.prettierignore` now, and this
    // asserts a byte prettier would have changed.
    expect(REFERENCE_TOMB_YAML).toContain(
      '      - [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]]\n'
    );
    expect(REFERENCE_TOMB_YAML).toContain('key: reference-tomb');
    const doc = referenceTombDoc();
    expect(doc.regions.map((r) => r.id)).toEqual(['entrance', 'hall', 'tomb']);
    expect(doc.regions.flatMap((r) => r.cells)).toHaveLength(224);
  });

  it('carries each seam as ONE wall, named from a floor cell at both ends', () => {
    const doc = referenceTombDoc();
    expect(doc.walls).toHaveLength(2);
    const floor = new Set(doc.regions.flatMap((r) => r.cells).map(axialKey));
    for (const wall of doc.walls) {
      for (const end of [wall.start, wall.end]) {
        expect(floor.has(axialKey(end.cell))).toBe(true);
      }
    }
    // The toolkit's own spellings, exactly.
    expect(doc.walls[0].start).toEqual({
      cell: fromOffset('pointy', [5, 7]),
      offset: [0.25, 0.375],
    });
    expect(doc.walls[0].end).toEqual({
      cell: fromOffset('pointy', [6, 0]),
      offset: [-0.25, -0.375],
    });
  });

  it('stands each door on the line, one row from where the pair form had it', () => {
    const doc = referenceTombDoc();
    expect(doc.doors.map((d) => d.id)).toEqual(['entrance-hall', 'hall-tomb']);
    expect(doc.doors[0].at).toEqual({
      cell: fromOffset('pointy', [6, 4]),
      offset: [-0.25, -0.375],
    });
    expect(doc.doors[1].at).toEqual({
      cell: fromOffset('pointy', [16, 4]),
      offset: [-0.25, 0.375],
    });
    // Still one crossing between the same two rooms.
    const owners = new Map(
      doc.regions.flatMap((r) => r.cells.map((c) => [axialKey(c), r.id]))
    );
    for (const door of doc.doors) {
      const crossing = positionSpellings(
        'pointy',
        latticeOf('pointy', door.at)
      );
      expect(crossing).toHaveLength(2);
      const rooms = crossing.map((p) => owners.get(axialKey(p.cell)));
      expect(new Set(rooms).size).toBe(2);
      expect(rooms.every((r) => r !== undefined)).toBe(true);
    }
  });

  it('re-emits and re-parses byte-for-byte', () => {
    const doc = referenceTombDoc();
    const once = emitDungeon(doc);
    expect(emitDungeon(parseDungeon(once))).toBe(once);
  });

  it('blocks exactly the crossings the pair form used to list by hand', () => {
    const doc = referenceTombDoc();
    const [entrance, hall, tomb] = doc.regions;
    const seam = new Set(
      [...seamEdges(entrance, hall), ...seamEdges(hall, tomb)].map(edgeKey)
    );
    const blocked = wallCrossingKeys(doc);
    for (const key of seam) expect(blocked.has(key)).toBe(true);
    expect(seam.size).toBe(30);
  });
});

describe('a position is named from a floor cell when the point has one', () => {
  it('prefers the floor cell over the one off the map', () => {
    const doc = referenceTombDoc();
    // The wall's own end: half a hex above row 0. One of its two
    // spellings names row -1, a cell nobody painted; the other names
    // [6,0], which is hall floor.
    const l = latticeOf('pointy', doc.walls[0].end);
    const both = positionSpellings('pointy', l);
    const floor = new Set(doc.regions.flatMap((r) => r.cells).map(axialKey));
    expect(both.some((p) => !floor.has(axialKey(p.cell)))).toBe(true);
    const named = nameFromFloor(doc, l) as PositionRef;
    expect(floor.has(axialKey(named.cell))).toBe(true);
  });

  it('leaves the canonical spelling alone when both cells are floor', () => {
    const doc = referenceTombDoc();
    const l = latticeOf('pointy', doc.doors[0].at);
    const both = positionSpellings('pointy', l);
    const floor = new Set(doc.regions.flatMap((r) => r.cells).map(axialKey));
    expect(both.every((p) => floor.has(axialKey(p.cell)))).toBe(true);
    expect(nameFromFloor(doc, l)).toEqual(both[0]);
  });
});
