import { describe, expect, it } from 'vitest';
import {
  addIntel,
  addRegion,
  addWall,
  applyDerivedConcealment,
  deriveConcealment,
  detectConcealmentLeaks,
  doorCrossing,
  emitDungeon,
  emptyDungeon,
  eraseCell,
  floorOwners,
  intelHolders,
  isFloor,
  isScenery,
  isStandable,
  KNOWS_IS_GONE,
  paintCell,
  paintRect,
  paintScenery,
  parseDungeon,
  placeAt,
  placementIds,
  regionWays,
  removeIntel,
  removeWalls,
  resolveErrorPath,
  sceneryBlockedBy,
  setIntelHolders,
  setIntelReveals,
  setScenarioBinding,
  setStart,
  setStartFacing,
  setWallHeights,
  setWallName,
  suggestPlacementId,
  toggleDoorAt,
  toggleExitAt,
  updateDoor,
  updateExit,
  updatePlacement,
  updateRegion,
  wallCrossingKeys,
  wallsThrough,
  type DungeonDoc,
  type PositionRef,
} from './dungeonYaml';
import { referenceTombDoc, seamEdges } from './fixtures/referenceTomb';
import {
  latticeOf,
  latticeWalk,
  positionAt,
  wallDirection,
} from './hexGeometry';
import {
  axialKey,
  edgeKey,
  fromOffset,
  toOffset,
  type Axial,
} from './hexOffset';

const p = (col: number, row: number): Axial => fromOffset('pointy', [col, row]);

/** The lattice point of the side two adjacent cells share. */
function midLattice(c1: Axial, c2: Axial): { u: number; v: number } {
  const a = latticeOf('pointy', { cell: c1, offset: [0, 0] });
  const b = latticeOf('pointy', { cell: c2, offset: [0, 0] });
  const walk = latticeWalk(a, b)!;
  return walk[Math.floor(walk.length / 2)];
}

/** The canonical position on the shared side of two adjacent cells —
 * where a door standing between them belongs. */
function sharedSide(c1: Axial, c2: Axial): PositionRef {
  return positionAt('pointy', midLattice(c1, c2))!;
}

/** A SHORT thin wall that blocks EXACTLY the crossing between two
 * adjacent cells — the line-form way of saying "wall this side" for
 * tests that only care that some wall blocks the crossing, not the exact
 * line drawn.
 *
 * Deliberately NOT centre-to-centre: `wallCrossings`' intersection test
 * counts a touching endpoint, so a wall ending exactly AT a cell's
 * centre registers as blocking every crossing incident to that centre,
 * not only the one along the wall's own line. Both new endpoints here
 * are one diagonal lattice step off the shared side's own midpoint —
 * always a valid side position for a same-row adjacent pair — which
 * keeps the wall thin (touches no centre) and its blocked-crossing set
 * to exactly the one side. */
function wallBetween(
  doc: DungeonDoc,
  c1: Axial,
  c2: Axial,
  height?: number
): DungeonDoc {
  const m = midLattice(c1, c2);
  const start = positionAt('pointy', { u: m.u - 1, v: m.v - 1 })!;
  const end = positionAt('pointy', { u: m.u + 1, v: m.v + 1 })!;
  return addWall(doc, start, end, height);
}

/** Draws the centre-to-centre wall between two adjacent cells AND a door
 * on its shared side — the line-form equivalent of the old pair-form
 * "add a door on this edge", now that a door always stands IN a wall. */
function wallDoorAt(
  doc: DungeonDoc,
  c1: Axial,
  c2: Axial
): { doc: DungeonDoc; at: PositionRef } {
  const at = sharedSide(c1, c2);
  return { doc: toggleDoorAt(wallBetween(doc, c1, c2), at), at };
}

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
    expect(text).toContain('    locked: [{ ability: dex, dc: 12 }]');
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
    const pointy = {
      ...emptyDungeon('pointy'),
      start: { at: { q: -1, r: 3 } },
    };
    const flat: DungeonDoc = {
      ...emptyDungeon('flat'),
      start: { at: { q: -1, r: 3 } },
    };
    expect(emitDungeon(pointy)).toContain('start: [0, 3]'); // odd-r
    expect(emitDungeon(flat)).toContain('start: [-1, 2]'); // odd-q
    expect(parseDungeon(emitDungeon(flat)).start).toEqual({
      at: { q: -1, r: 3 },
    });
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

  it('the reference tomb has no facing/offset anywhere in its placements — the additive fields change nothing absent', () => {
    for (const placement of referenceTombDoc().place) {
      expect(placement.facing).toBeUndefined();
      expect(placement.offset).toBeUndefined();
    }
    const text = emitDungeon(referenceTombDoc());
    // `offset:` legitimately appears in the tomb's walls/doors now (a
    // position IS a cell + offset) — scope the "nothing additive" claim
    // to the `place:` block, which is what it is actually about.
    expect(text).not.toMatch(/facing:/);
    expect(text.slice(text.indexOf('place:'))).not.toMatch(/offset:/);
  });

  // -------------------------------------------------------------------------
  // Walls and doors as LINES (rpg-project#360 slice 2). The pair form — a
  // wall as the crossings it blocks — is deleted, not deprecated: see
  // `dungeonYaml.ts`'s `WallDoc` doc comment for why it could not say what
  // the author drew.
  // -------------------------------------------------------------------------

  describe('walls as lines', () => {
    it('round-trips a wall byte-for-byte, with and without a name and a height', () => {
      let doc = emptyDungeon();
      doc = paintCell(doc, 'region-1', p(0, 0));
      doc = paintCell(doc, 'region-1', p(1, 0));
      doc = addWall(
        doc,
        { cell: p(0, 0), offset: [0, 0] },
        { cell: p(1, 0), offset: [0, 0] }
      );
      const bare = emitDungeon(doc);
      expect(emitDungeon(parseDungeon(bare))).toBe(bare);
      // Scope to the walls: block — a region's own `name:` field is
      // unrelated to whether the WALL carries one.
      const bareWalls = bare.slice(
        bare.indexOf('walls:'),
        bare.indexOf('doors:')
      );
      expect(bareWalls).not.toMatch(/name:|height:/);

      doc = setWallName(doc, 0, 'north wall');
      doc = setWallHeights(doc, [0], 2.5);
      const named = emitDungeon(doc);
      expect(emitDungeon(parseDungeon(named))).toBe(named);
      const namedWalls = named.slice(
        named.indexOf('walls:'),
        named.indexOf('doors:')
      );
      expect(namedWalls).toContain('name: north wall');
      expect(namedWalls).toContain('height: 2.5');
    });

    it('emits the line form as start:/end:, one per line (design §3.2)', () => {
      let doc = emptyDungeon();
      doc = paintCell(doc, 'region-1', p(0, 0));
      doc = paintCell(doc, 'region-1', p(1, 0));
      doc = addWall(
        doc,
        { cell: p(0, 0), offset: [0, 0] },
        { cell: p(1, 0), offset: [0, 0] }
      );
      const text = emitDungeon(doc);
      expect(text).toContain(
        '  - start: { cell: [0,0], offset: [0, 0] }\n    end: { cell: [1,0], offset: [0, 0] }\n'
      );
    });

    it('refuses an offset outside the seven, naming the offset by value', () => {
      const head =
        'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nregions: []\nwalls:\n';
      expect(() =>
        parseDungeon(
          `${head}  - start: { cell: [0,0], offset: [0.1, 0.2] }\n    end: { cell: [1,0], offset: [0,0] }\n`
        )
      ).toThrow(/\[0\.1,0\.2\] is not one of the seven/);
    });

    it('A9: the pair form is refused at the header, naming the form (message text pinned)', () => {
      const head =
        'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nregions: []\n';
      // THE COMPILER'S OWN SENTENCE, pinned word for word. A streamer
      // meets this refusal twice — here on load and again from the
      // server — and two wordings would read as two problems.
      const message =
        'walls[0]: `edges` is the deleted pair form: a wall is now a ' +
        'line, `start` and `end`, each a cell and one of the seven ' +
        'offsets, and a door is `at` one position on it.';
      expect(() => parseDungeon(`${head}walls:\n  - [[0,0],[1,0]]\n`)).toThrow(
        message
      );
      expect(() =>
        parseDungeon(`${head}walls:\n  - { between: [[0,0],[1,0]] }\n`)
      ).toThrow(/deleted pair form/);
      expect(() =>
        parseDungeon(
          `${head}walls: []\ndoors:\n  - { id: d1, edges: [[[0,0],[1,0]]] }\n`
        )
      ).toThrow(/deleted pair form/);
    });

    it('refuses a wall object with an unknown key or a non-number height', () => {
      const head =
        'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nregions: []\nwalls:\n';
      expect(() =>
        parseDungeon(
          `${head}  - start: { cell: [0,0], offset: [0,0] }\n    end: { cell: [1,0], offset: [0,0] }\n    hieght: 2\n`
        )
      ).toThrow(/walls\[0\]: unknown key "hieght"/);
      expect(() =>
        parseDungeon(
          `${head}  - start: { cell: [0,0], offset: [0,0] }\n    end: { cell: [1,0], offset: [0,0] }\n    height: tall\n`
        )
      ).toThrow(/walls\[0\]\.height: expected a number/);
    });

    it('addWall is idempotent and undirected — the same line either way round is not added twice', () => {
      let doc = emptyDungeon();
      doc = paintCell(doc, 'region-1', p(0, 0));
      doc = paintCell(doc, 'region-1', p(1, 0));
      const start: PositionRef = { cell: p(0, 0), offset: [0, 0] };
      const end: PositionRef = { cell: p(1, 0), offset: [0, 0] };
      doc = addWall(doc, start, end);
      expect(doc.walls).toHaveLength(1);
      expect(addWall(doc, start, end)).toBe(doc);
      expect(addWall(doc, end, start)).toBe(doc);
    });

    it('addWall refuses a direction off the twelve, even over solid floor', () => {
      // Floor everywhere, so nothing but the direction can be the
      // reason: an off-twelve pair has no lattice walk, hence no
      // footprint, hence nothing to stand on (F13 and C2 are the same
      // condition here — `addWall`'s own comment).
      let doc = emptyDungeon();
      for (let row = 0; row <= 3; row += 1) {
        for (let col = 0; col <= 3; col += 1) {
          doc = paintCell(doc, 'region-1', p(col, row));
        }
      }
      const start: PositionRef = { cell: p(0, 0), offset: [0, 0] };
      const end: PositionRef = { cell: p(2, 1), offset: [0, 0] };
      expect(
        wallDirection(latticeOf('pointy', start), latticeOf('pointy', end))
      ).toBeNull();
      expect(addWall(doc, start, end)).toBe(doc);
    });

    it('addWall refuses a wall whose footprint holds no floor', () => {
      const doc = emptyDungeon();
      const start: PositionRef = { cell: p(5, 5), offset: [0, 0] };
      const end: PositionRef = { cell: p(6, 5), offset: [0, 0] };
      expect(addWall(doc, start, end)).toBe(doc);
    });

    it('A12: a corner — two walls sharing an end write IDENTICAL PositionRefs, however the shared point was named', () => {
      let doc = emptyDungeon();
      doc = paintCell(doc, 'region-1', p(0, 0));
      doc = paintCell(doc, 'region-1', p(1, 0));

      // The side between (0,0) and (1,0) has two spellings — one from
      // each cell that shares it — and they name the SAME lattice point
      // (hexGeometry.ts's own header comment).
      const fromCell0: PositionRef = { cell: p(0, 0), offset: [0.5, 0] };
      const fromCell1: PositionRef = { cell: p(1, 0), offset: [-0.5, 0] };
      const lattice = latticeOf('pointy', fromCell0);
      expect(latticeOf('pointy', fromCell1)).toEqual(lattice);

      // Whichever cell it is named from, `positionAt` returns ONE
      // canonical spelling — what the picker hands `addWall`, and what
      // keeps a join byte-identical regardless of which side it was
      // drawn from.
      const canonical = positionAt('pointy', lattice)!;
      expect(canonical).toEqual(fromCell0);
      expect(positionAt('pointy', latticeOf('pointy', fromCell1))).toEqual(
        canonical
      );

      doc = addWall(doc, { cell: p(0, 0), offset: [0, 0] }, canonical);
      doc = addWall(doc, canonical, { cell: p(1, 0), offset: [0, 0] });

      expect(doc.walls[0].end).toEqual(doc.walls[1].start);
      expect(doc.walls[0].end).toEqual(canonical);

      const text = emitDungeon(doc);
      const shared = '{ cell: [0,0], offset: [0.5, 0] }';
      expect(text.split(shared).length - 1).toBe(2);
      expect(text).not.toContain('offset: [-0.5, 0]');
    });

    it('addWall refuses in place, setWallHeights stamps by index and clears to undefined, and a redrawn wall starts fresh', () => {
      let doc = emptyDungeon();
      doc = paintCell(doc, 'region-1', p(0, 0));
      doc = paintCell(doc, 'region-1', p(1, 0));
      doc = addWall(
        doc,
        { cell: p(0, 0), offset: [0, 0] },
        { cell: p(1, 0), offset: [0, 0] }
      );
      doc = setWallHeights(doc, [0], 2.5);
      expect(doc.walls[0].height).toBe(2.5);
      doc = setWallHeights(doc, [0], undefined);
      expect(doc.walls[0].height).toBeUndefined();
      expect(setWallHeights(doc, [0], undefined)).toBe(doc);

      doc = removeWalls(doc, [0]);
      expect(doc.walls).toHaveLength(0);
      doc = addWall(
        doc,
        { cell: p(0, 0), offset: [0, 0] },
        { cell: p(1, 0), offset: [0, 0] }
      );
      expect(doc.walls[0].height).toBeUndefined();
    });

    describe('toggleDoorAt', () => {
      it('refuses a position no wall passes through', () => {
        let doc = emptyDungeon();
        doc = paintCell(doc, 'region-1', p(0, 0));
        doc = paintCell(doc, 'region-1', p(1, 0));
        const mid = sharedSide(p(0, 0), p(1, 0));
        expect(wallsThrough(doc, mid)).toHaveLength(0);
        expect(toggleDoorAt(doc, mid)).toBe(doc);
      });

      it('refuses a centre — the midpoint of no side — even where a wall runs through it', () => {
        let doc = emptyDungeon();
        doc = paintCell(doc, 'region-1', p(0, 0));
        doc = paintCell(doc, 'region-1', p(1, 0));
        doc = paintCell(doc, 'region-1', p(2, 0));
        // A thick wall through centre(0,0)-centre(1,0)-centre(2,0).
        doc = wallBetween(doc, p(0, 0), p(2, 0));
        const centre: PositionRef = { cell: p(1, 0), offset: [0, 0] };
        expect(wallsThrough(doc, centre).length).toBeGreaterThan(0);
        expect(toggleDoorAt(doc, centre)).toBe(doc);
      });

      it('toggling an existing door’s position removes it', () => {
        let doc = emptyDungeon();
        doc = paintCell(doc, 'region-1', p(0, 0));
        doc = paintCell(doc, 'region-1', p(1, 0));
        const { doc: withDoor, at } = wallDoorAt(doc, p(0, 0), p(1, 0));
        expect(withDoor.doors).toHaveLength(1);
        expect(toggleDoorAt(withDoor, at).doors).toHaveLength(0);
      });
    });

    it('a door stands IN a wall: its own crossing still shows in wallCrossingKeys (the compiler, not this set, hands it back to the door)', () => {
      let doc = emptyDungeon();
      doc = paintCell(doc, 'region-1', p(0, 0));
      doc = paintCell(doc, 'region-1', p(1, 0));
      const crossingKey = edgeKey([p(0, 0), p(1, 0)]);
      doc = wallBetween(doc, p(0, 0), p(1, 0));
      expect(wallCrossingKeys(doc).has(crossingKey)).toBe(true);

      const { doc: withDoor } = wallDoorAt(doc, p(0, 0), p(1, 0));
      expect(wallCrossingKeys(withDoor).has(crossingKey)).toBe(true);
      expect(doorCrossing(withDoor, withDoor.doors[0]!)).toEqual([
        p(0, 0),
        p(1, 0),
      ]);
    });

    it('REGRESSION NET: wallCrossingKeys on the reference tomb equals seamEdges for both seams — the line blocks exactly what the pair form used to list', () => {
      const doc = referenceTombDoc();
      const [entrance, hall, tomb] = doc.regions;
      const expected = [
        ...seamEdges(entrance, hall),
        ...seamEdges(hall, tomb),
      ].map(edgeKey);
      expect([...wallCrossingKeys(doc)].sort()).toEqual([...expected].sort());
    });
  });

  describe('concealed doors and regions (rpg-project#350/#351)', () => {
    /** Two floor cells, a wall between them, and a door on the shared
     * side — the line-form base every door-state test below builds on
     * now that a door always stands in a wall. */
    function doorDoc(): { doc: DungeonDoc; doorId: string } {
      let doc = emptyDungeon();
      doc = paintCell(doc, 'region-1', p(0, 0));
      doc = paintCell(doc, 'region-1', p(1, 0));
      const { doc: withDoor } = wallDoorAt(doc, p(0, 0), p(1, 0));
      return { doc: withDoor, doorId: withDoor.doors[0]!.id };
    }

    it("a door's concealed find check round-trips byte-for-byte and COMPOSES with an open doorway underneath", () => {
      const { doc: base, doorId } = doorDoc();
      const doc = updateDoor(base, doorId, {
        concealed: [
          { ability: 'perception', dc: 15 },
          {
            ability: 'investigation',
            tool: 'dnd5e:item:magnifying-glass',
            dc: 12,
          },
        ],
      });
      const text = emitDungeon(doc);
      // `scalar()` double-quotes the tool ref: its colon is not in the
      // plain-scalar character set (same rule a `ref:` place field hits).
      expect(text).toContain(
        '    concealed: [{ ability: perception, dc: 15 }, { ability: investigation, tool: "dnd5e:item:magnifying-glass", dc: 12 }]'
      );
      expect(text).not.toContain('closed');
      expect(text).not.toContain('locked');
      const reparsed = parseDungeon(text);
      expect(reparsed.doors[0]!.concealed).toEqual(doc.doors[0]!.concealed);
      expect(reparsed.doors[0]!.closed).toBeUndefined();
      expect(reparsed.doors[0]!.locked).toBeUndefined();
      expect(emitDungeon(reparsed)).toBe(text);
    });

    it('a concealed door composes with locked and with closed underneath — concealment never displaces the state', () => {
      const lockedBase = doorDoc();
      const locked = updateDoor(lockedBase.doc, lockedBase.doorId, {
        locked: [{ ability: 'dex', dc: 12 }],
        concealed: [{ ability: 'perception', dc: 15 }],
      });
      const lockedText = emitDungeon(locked);
      expect(lockedText).toContain('    locked: [{ ability: dex, dc: 12 }]');
      expect(lockedText).toContain(
        '    concealed: [{ ability: perception, dc: 15 }]'
      );
      expect(emitDungeon(parseDungeon(lockedText))).toBe(lockedText);

      const closedBase = doorDoc();
      const closed = updateDoor(closedBase.doc, closedBase.doorId, {
        closed: true,
        concealed: [{ ability: 'perception', dc: 15 }],
      });
      const closedText = emitDungeon(closed);
      expect(closedText).toContain('    closed: true');
      expect(closedText).toContain(
        '    concealed: [{ ability: perception, dc: 15 }]'
      );
      expect(emitDungeon(parseDungeon(closedText))).toBe(closedText);
    });

    it('toggling concealed off removes the key entirely rather than leaving an authored-but-falsy field', () => {
      const { doc: base, doorId } = doorDoc();
      let doc = updateDoor(base, doorId, {
        concealed: [{ ability: 'perception', dc: 15 }],
      });
      expect(doc.doors[0]).toHaveProperty('concealed');
      doc = updateDoor(doc, doorId, { concealed: undefined });
      expect(doc.doors[0]).not.toHaveProperty('concealed');
      expect(emitDungeon(doc)).not.toContain('concealed');
    });

    it('an authored-but-empty check list round-trips unchanged — this loader only refuses what it cannot represent', () => {
      const { doc: base, doorId } = doorDoc();
      const doc = updateDoor(base, doorId, { concealed: [] });
      const text = emitDungeon(doc);
      expect(text).toContain('    concealed: []');
      const reparsed = parseDungeon(text);
      expect(reparsed.doors[0]!.concealed).toEqual([]);
      expect(emitDungeon(reparsed)).toBe(text);
    });

    it("a region's concealed marker round-trips byte-for-byte and is declared, never inferred from a door", () => {
      let doc = emptyDungeon();
      doc = paintCell(doc, 'region-1', p(0, 0));
      doc = updateRegion(doc, 'region-1', { concealed: true });
      const text = emitDungeon(doc);
      expect(text).toContain('    concealed: true');
      const reparsed = parseDungeon(text);
      expect(reparsed.regions[0]!.concealed).toBe(true);
      expect(emitDungeon(reparsed)).toBe(text);

      // Toggling back off drops the key rather than writing `concealed: false`.
      const unconcealed = updateRegion(doc, 'region-1', { concealed: false });
      expect(unconcealed.regions[0]).not.toHaveProperty('concealed');
      expect(emitDungeon(unconcealed)).not.toContain('concealed');
    });

    it('an empty new dungeon writes no concealed key on its one starter region', () => {
      expect(emitDungeon(emptyDungeon())).not.toContain('concealed');
    });

    it('refuses a non-boolean region concealed and a non-list door concealed', () => {
      const head =
        'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\n';
      expect(() =>
        parseDungeon(
          `${head}regions:\n  - id: r1\n    name: R\n    archetype: crypt\n    lighting: { intensity: 1 }\n    cells: []\n    concealed: yes-please\n`
        )
      ).toThrow(/regions\[0\]\.concealed: expected a boolean/);
      expect(() =>
        parseDungeon(
          `${head}regions: []\ndoors:\n  - id: d1\n    at: { cell: [0,0], offset: [0.5,0] }\n    concealed: { ability: perception, dc: 15 }\n`
        )
      ).toThrow(/doors\[0\]\.concealed: expected a list/);
    });

    it('refuses an approach row missing its ability, or with a non-integer dc', () => {
      const head =
        'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nregions: []\ndoors:\n  - id: d1\n    at: { cell: [0,0], offset: [0.5,0] }\n';
      expect(() =>
        parseDungeon(`${head}    concealed: [{ dc: 15 }]\n`)
      ).toThrow(/doors\[0\]\.concealed\[0\]\.ability: required/);
      expect(() =>
        parseDungeon(
          `${head}    concealed: [{ ability: perception, dc: high }]\n`
        )
      ).toThrow(/doors\[0\]\.concealed\[0\]\.dc: expected an integer/);
    });
  });
});

describe('deriveConcealment / detectConcealmentLeaks / applyDerivedConcealment (rpg-dnd5e-web#893)', () => {
  /** region-1: [0,0],[1,0], start [0,0] — region-2: [2,0], reachable only
   * through a (walled) door on the [1,0]-[2,0] side, concealed by the
   * caller. */
  function alcoveDoc(): DungeonDoc {
    let doc = emptyDungeon();
    doc = addRegion(doc);
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    doc = paintCell(doc, 'region-2', p(2, 0));
    const { doc: withDoor } = wallDoorAt(doc, p(1, 0), p(2, 0));
    doc = updateDoor(withDoor, withDoor.doors[0]!.id, {
      concealed: [{ ability: 'perception', dc: 15 }],
    });
    doc = setStart(doc, p(0, 0));
    return doc;
  }

  it('derives the region reachable only through a concealed door', () => {
    const doc = alcoveDoc();
    const { regionIds, doorByRegion } = deriveConcealment(doc);
    expect(regionIds).toEqual(new Set(['region-2']));
    expect(doorByRegion.get('region-2')).toBe(doc.doors[0]!.id);
    // The door's crossing touches region-1 too (its visible side) — but
    // the inspector only ever consults doorByRegion for a CONCEALED
    // region, and region-1 is not one.
    expect(doorByRegion.get('region-1')).toBe(doc.doors[0]!.id);
  });

  it('composes across a chain: a room past the hidden room needs no door of its own', () => {
    let doc = alcoveDoc();
    doc = addRegion(doc); // region-3
    doc = paintCell(doc, 'region-3', p(3, 0));
    // A bare, unwalled edge — no door — between region-2 and region-3.
    const { regionIds, doorByRegion } = deriveConcealment(doc);
    expect(regionIds).toEqual(new Set(['region-2', 'region-3']));
    expect(doorByRegion.has('region-3')).toBe(false);
  });

  it('derives nothing without a start to measure reachability from', () => {
    const doc = alcoveDoc();
    const noStart = { ...doc, start: null };
    expect(deriveConcealment(noStart).regionIds).toBeNull();
    expect(detectConcealmentLeaks(noStart)).toEqual([]);
  });

  it('leaves an orphaned region alone — no concealed door explains it, so this module invents nothing', () => {
    let doc = alcoveDoc();
    doc = addRegion(doc); // region-3, painted but never connected to anything
    doc = paintCell(doc, 'region-3', p(10, 10));
    const { regionIds } = deriveConcealment(doc);
    expect(regionIds).toEqual(new Set(['region-2']));
  });

  it('names the leak once when a concealed door hides nothing — the room is already reachable another way', () => {
    let doc = alcoveDoc();
    // A second, bare edge from region-1 straight into region-2's cell —
    // the room the door "hides" was never exclusive to it.
    doc = paintCell(doc, 'region-1', p(2, 1));
    const { regionIds } = deriveConcealment(doc);
    expect(regionIds).toEqual(new Set()); // no longer exclusive to the door
    const leaks = detectConcealmentLeaks(doc);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]!.doorId).toBe(doc.doors[0]!.id);
    expect(leaks[0]!.message).toContain('Region 2');
    expect(leaks[0]!.message).toContain('Region 1');
  });

  it('applyDerivedConcealment writes concealed: true on the newly-hidden region', () => {
    const doc = alcoveDoc();
    const { doc: next, derivedIds } = applyDerivedConcealment(doc, new Set());
    expect(next.regions.find((r) => r.id === 'region-2')?.concealed).toBe(true);
    expect(
      next.regions.find((r) => r.id === 'region-1')?.concealed
    ).toBeUndefined();
    expect(derivedIds).toEqual(new Set(['region-2']));
    // Idempotent: re-applying with the ratchet it just returned changes nothing.
    expect(applyDerivedConcealment(next, derivedIds).doc).toBe(next);
  });

  it('unmarking the door strips concealment IT derived, going back to the same doc', () => {
    const doc = alcoveDoc();
    const derived = applyDerivedConcealment(doc, new Set());
    const unmarked = updateDoor(derived.doc, derived.doc.doors[0]!.id, {
      concealed: undefined,
    });
    const restored = applyDerivedConcealment(unmarked, derived.derivedIds);
    expect(
      restored.doc.regions.find((r) => r.id === 'region-2')?.concealed
    ).toBeUndefined();
    expect(restored.derivedIds).toEqual(new Set());
  });

  it('never strips concealment a person set by hand — a region with no door behind it at all', () => {
    let doc = alcoveDoc();
    // region-1 itself is hand-marked concealed, with no door gating it —
    // rpg-dnd5e-web#890's surviving case.
    doc = updateRegion(doc, 'region-1', { concealed: true });
    const { doc: next, derivedIds } = applyDerivedConcealment(doc, new Set());
    expect(next.regions.find((r) => r.id === 'region-1')?.concealed).toBe(true);
    expect(derivedIds.has('region-1')).toBe(false);
    // Unmarking the (unrelated) door leaves the hand-set region untouched.
    const unmarked = updateDoor(next, next.doors[0]!.id, {
      concealed: undefined,
    });
    const restored = applyDerivedConcealment(unmarked, derivedIds);
    expect(
      restored.doc.regions.find((r) => r.id === 'region-1')?.concealed
    ).toBe(true);
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

  it('erasing a cell drops a wall whose footprint it empties, and a door whose crossing it touched', () => {
    // A thin spoke wall wholly inside cell (0,0): erasing that cell empties
    // its ENTIRE footprint, so the wall goes with it.
    let spokeDoc = emptyDungeon();
    spokeDoc = paintCell(spokeDoc, 'region-1', p(0, 0));
    spokeDoc = addWall(
      spokeDoc,
      { cell: p(0, 0), offset: [0, 0] },
      { cell: p(0, 0), offset: [0.5, 0] }
    );
    expect(spokeDoc.walls).toHaveLength(1);
    expect(eraseCell(spokeDoc, p(0, 0)).walls).toHaveLength(0);

    // A wall spanning two cells with a door on the shared side: erasing
    // the OTHER cell leaves the wall standing (its footprint still
    // touches floor at (0,0)) but drops the door, whose crossing touches
    // the erased cell.
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    const { doc: withDoor } = wallDoorAt(doc, p(0, 0), p(1, 0));
    doc = withDoor;
    expect(doc.walls).toHaveLength(1);
    expect(doc.doors).toHaveLength(1);

    const erased = eraseCell(doc, p(1, 0));
    expect(erased.walls).toHaveLength(1);
    expect(erased.doors).toHaveLength(0);
  });

  it('erasing a cell also drops the start and a placement standing on it', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    doc = setStart(doc, p(1, 0));
    doc = placeAt(doc, {
      ref: 'dnd5e:props:pillar',
      at: p(1, 0),
      blocksLos: true,
    });
    doc = eraseCell(doc, p(1, 0));
    expect(doc.start).toBeNull();
    expect(doc.place).toHaveLength(0);
    expect(floorOwners(doc).size).toBe(1);
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

describe('the region-rect tool (rpg-dnd5e-web#902)', () => {
  it('paints the offset rectangle two corners span — square by construction', () => {
    let doc = emptyDungeon();
    doc = paintRect(doc, 'region-1', p(2, 1), p(5, 3));

    // 4 columns x 3 rows, whatever order the corners were dragged in.
    expect(doc.regions[0].cells).toHaveLength(12);
    const offsets = doc.regions[0].cells
      .map((c) => toOffset('pointy', c))
      .map(([col, row]) => `${col},${row}`)
      .sort();
    expect(offsets).toEqual(
      [
        [2, 1],
        [3, 1],
        [4, 1],
        [5, 1],
        [2, 2],
        [3, 2],
        [4, 2],
        [5, 2],
        [2, 3],
        [3, 3],
        [4, 3],
        [5, 3],
      ]
        .map(([col, row]) => `${col},${row}`)
        .sort()
    );

    // Dragged from the opposite corner it is the same room — a rectangle has
    // no preferred direction, and neither should the gesture.
    const other = paintRect(emptyDungeon(), 'region-1', p(5, 3), p(2, 1));
    expect(emitDungeon(other)).toBe(emitDungeon(doc));
  });

  it('is a rectangle in OFFSET space, which is the shape the canvas draws', () => {
    // The same corners read as a rhombus in axial. Pinning the offset
    // reading because "square room" is a claim about what the author SEES.
    const doc = paintRect(emptyDungeon(), 'region-1', p(0, 0), p(1, 1));
    const rows = new Map<number, number[]>();
    for (const c of doc.regions[0].cells) {
      const [col, row] = toOffset('pointy', c);
      rows.set(row, [...(rows.get(row) ?? []), col]);
    }
    // Every row spans the same columns — that is what makes it a rectangle.
    expect([...rows.values()].map((cols) => cols.sort())).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it('takes cells from whatever region held them, and is a no-op when it owns them all', () => {
    let doc = emptyDungeon();
    doc = addRegion(doc); // mints region-2
    doc = paintRect(doc, 'region-1', p(0, 0), p(2, 0));
    doc = paintRect(doc, 'region-2', p(1, 0), p(3, 0));

    const owners = floorOwners(doc);
    expect(owners.get(axialKey(p(0, 0)))).toBe('region-1');
    expect(owners.get(axialKey(p(1, 0)))).toBe('region-2');
    expect(owners.get(axialKey(p(3, 0)))).toBe('region-2');

    // Repainting a block the region already owns changes nothing, referen-
    // tially — every other mutator here keeps that promise too.
    expect(paintRect(doc, 'region-2', p(1, 0), p(3, 0))).toBe(doc);
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
    // The boss, wherever the toolkit's own file puts it in `place`.
    const bossIndex = doc.place.findIndex((x) => x.boss);
    expect(bossIndex).toBeGreaterThanOrEqual(0);
    expect(resolveErrorPath(doc, `place[${bossIndex}].boss`)).toEqual({
      kind: 'placement',
      index: bossIndex,
      cell: doc.place[bossIndex].at,
    });
    expect(resolveErrorPath(doc, 'doors[1].locked[0].dc')).toEqual({
      kind: 'door',
      doorId: 'hall-tomb',
    });
    expect(resolveErrorPath(doc, 'regions[2].archetype')).toEqual({
      kind: 'region',
      regionId: 'tomb',
    });
    expect(resolveErrorPath(doc, 'key')).toEqual({ kind: 'document' });
    expect(resolveErrorPath(doc, 'walls[999]')).toEqual({ kind: 'document' });
  });

  it('a wall defect names the WALL whichever of its fields faulted: walls[0].start.offset and walls[0].height both resolve to index 0', () => {
    const doc = referenceTombDoc();
    expect(resolveErrorPath(doc, 'walls[0].start.offset')).toEqual({
      kind: 'wall',
      index: 0,
    });
    expect(resolveErrorPath(doc, 'walls[0].height')).toEqual({
      kind: 'wall',
      index: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Scenery — floor nobody stands on (rpg-project#360 slice 1, design §2.1-2.5,
// §3.1). A cell is in exactly one of: a region, `scenery`, void.
// ---------------------------------------------------------------------------

describe('scenery (rpg-project#360 slice 1)', () => {
  /** A room and a two-cell scenery strip beside it. */
  function stripDoc(): DungeonDoc {
    let doc = emptyDungeon();
    for (const [c, r] of [
      [0, 0],
      [1, 0],
      [2, 0],
    ]) {
      doc = paintCell(doc, 'region-1', p(c, r));
    }
    doc = paintScenery(doc, p(3, 0));
    doc = paintScenery(doc, p(4, 0));
    return doc;
  }

  it('emits `scenery` after regions and before start, one row per line, and round-trips', () => {
    let doc = stripDoc();
    doc = setStart(doc, p(1, 0));
    doc = paintScenery(doc, p(3, 1));
    const text = emitDungeon(doc);

    expect(text).toContain(
      'scenery:\n      - [[3,0],[4,0]]\n      - [[3,1]]\n'
    );
    const lines = text.split('\n');
    const iRegions = lines.findIndex((l) => l === 'regions:');
    const iScenery = lines.findIndex((l) => l === 'scenery:');
    const iStart = lines.findIndex((l) => l.startsWith('start:'));
    expect(iRegions).toBeGreaterThanOrEqual(0);
    expect(iScenery).toBeGreaterThan(iRegions);
    expect(iStart).toBeGreaterThan(iScenery);

    // The parse/emit contract the whole module rests on.
    expect(emitDungeon(parseDungeon(text))).toBe(text);
    expect(parseDungeon(text).scenery.map(axialKey).sort()).toEqual(
      [p(3, 0), p(4, 0), p(3, 1)].map(axialKey).sort()
    );
  });

  it('writes NO `scenery` key when there is none, so a document without it is byte-identical', () => {
    // The server's decoder refuses a key it does not know yet; more to the
    // point, "optional; omitted = none" (design §3.1) is what keeps every
    // existing file re-emitting exactly as it was.
    const text = emitDungeon(referenceTombDoc());
    expect(text).not.toContain('scenery');
    expect(emitDungeon(parseDungeon(text))).toBe(text);
  });

  it('one state per cell: scenery over a room cell moves it out, a room over scenery moves it in (design §2.2)', () => {
    let doc = stripDoc();
    expect(floorOwners(doc).get(axialKey(p(2, 0)))).toBe('region-1');

    doc = paintScenery(doc, p(2, 0));
    expect(floorOwners(doc).has(axialKey(p(2, 0)))).toBe(false);
    expect(isScenery(doc, p(2, 0))).toBe(true);
    // Floor either way — a wall may stand on it, a prop may sit on it.
    expect(isFloor(doc, p(2, 0))).toBe(true);
    expect(isStandable(doc, p(2, 0))).toBe(false);

    doc = paintCell(doc, 'region-1', p(2, 0));
    expect(isScenery(doc, p(2, 0))).toBe(false);
    expect(floorOwners(doc).get(axialKey(p(2, 0)))).toBe('region-1');
    expect(isStandable(doc, p(2, 0))).toBe(true);

    // The rect brush takes cells off the scenery list the same way.
    doc = paintScenery(doc, p(1, 0));
    doc = paintRect(doc, 'region-1', p(0, 0), p(2, 0));
    expect(doc.scenery.map(axialKey)).toEqual([
      axialKey(p(3, 0)),
      axialKey(p(4, 0)),
    ]);
  });

  it('painting scenery twice is a no-op and returns the same doc', () => {
    const doc = stripDoc();
    expect(paintScenery(doc, p(3, 0))).toBe(doc);
  });

  it('refuses to paint scenery under the start or a monster, and never deletes them', () => {
    let doc = stripDoc();
    doc = setStart(doc, p(0, 0));
    doc = placeAt(doc, { ref: 'dnd5e:monsters:skeleton', at: p(1, 0) });

    // The design cascades placements under ERASE and only under erase
    // (§2.2); the monster-meets-scenery collision it rules on is a
    // refusal with a reason (§2.4). Same collision, same answer.
    expect(paintScenery(doc, p(0, 0))).toBe(doc);
    expect(sceneryBlockedBy(doc, p(0, 0))).toBe('start');
    expect(paintScenery(doc, p(1, 0))).toBe(doc);
    expect(sceneryBlockedBy(doc, p(1, 0))).toBe('monster');

    // Both are still standing where the author put them.
    expect(doc.start?.at).toEqual(p(0, 0));
    expect(doc.place).toHaveLength(1);

    // A PROP is never in the way — sitting on scenery is what props do.
    doc = placeAt(doc, {
      ref: 'dnd5e:props:pillar',
      at: p(2, 0),
      blocksMovement: true,
    });
    expect(sceneryBlockedBy(doc, p(2, 0))).toBeNull();
    const painted = paintScenery(doc, p(2, 0));
    expect(isScenery(painted, p(2, 0))).toBe(true);
    expect(
      painted.place.some((pl) => axialKey(pl.at) === axialKey(p(2, 0)))
    ).toBe(true);
  });

  it('erase returns a scenery cell to void and cascades a placement that stood on it (design §2.2)', () => {
    let doc = stripDoc();
    doc = placeAt(doc, {
      ref: 'dnd5e:props:pillar',
      at: p(3, 0),
      blocksMovement: true,
    });
    expect(doc.place).toHaveLength(1);

    doc = eraseCell(doc, p(3, 0));
    expect(isScenery(doc, p(3, 0))).toBe(false);
    expect(isFloor(doc, p(3, 0))).toBe(false);
    expect(doc.place).toHaveLength(0);
  });

  it('a wall or a door may stand on scenery (design §2.3)', () => {
    let doc = stripDoc();
    // room | scenery
    doc = wallBetween(doc, p(2, 0), p(3, 0));
    expect(doc.walls).toHaveLength(1);
    // scenery | scenery
    doc = wallBetween(doc, p(3, 0), p(4, 0));
    expect(doc.walls).toHaveLength(2);
    const { doc: withDoor } = wallDoorAt(doc, p(3, 0), p(4, 0));
    expect(withDoor.doors).toHaveLength(1);
  });

  it('a prop drops on scenery; a monster and the start do not (design §2.4, F2)', () => {
    const doc = stripDoc();

    const prop = placeAt(doc, {
      ref: 'dnd5e:props:pillar',
      at: p(3, 0),
      blocksMovement: true,
    });
    expect(prop.place).toHaveLength(1);

    // Refused IN PLACE: the same doc back, so the caller can say why.
    expect(placeAt(doc, { ref: 'dnd5e:monsters:skeleton', at: p(3, 0) })).toBe(
      doc
    );
    expect(setStart(doc, p(3, 0))).toBe(doc);

    // Both still land on a room cell.
    expect(
      placeAt(doc, { ref: 'dnd5e:monsters:skeleton', at: p(1, 0) }).place
    ).toHaveLength(1);
    expect(setStart(doc, p(1, 0)).start).toEqual({ at: p(1, 0) });
  });

  it('resolveErrorPath names the scenery cell the compiler refused (design §2.5)', () => {
    let doc = stripDoc();
    doc = paintScenery(doc, p(3, 1));
    // Rows are [[3,0],[4,0]] then [[3,1]] — the order the emitter wrote.
    expect(resolveErrorPath(doc, 'scenery[0][1]')).toEqual({
      kind: 'cell',
      cell: p(4, 0),
    });
    expect(resolveErrorPath(doc, 'scenery[1][0]')).toEqual({
      kind: 'cell',
      cell: p(3, 1),
    });
    expect(resolveErrorPath(doc, 'scenery[9][0]')).toEqual({
      kind: 'document',
    });
  });
});

// ---------------------------------------------------------------------------
// The client concealment MIRROR, extended to flood through scenery
// (rpg-project#360 slice 1, design C4). Plan §1.3 was silent on this
// mirror; it is extended so an existing derivation stays true once scenery
// exists. The rule is the server's: two regions are joined iff SOME way
// between them has no concealed door on ANY crossing.
//
// The scenes pair one-for-one with the toolkit's acceptance A3.
// ---------------------------------------------------------------------------

describe('the concealment mirror floods through scenery (design C4)', () => {
  /** A3's shape: a visible room, a scenery strip, a hidden room, in a row.
   * `visible` cols 0-1, strip cols 2-3, `secret` cols 4-5, start in
   * `visible`. Nothing walled and no door, unless a test adds one. */
  function a3Scene(): DungeonDoc {
    let doc = emptyDungeon();
    doc = updateRegion(doc, 'region-1', { id: 'visible', name: 'Visible' });
    doc = addRegion(doc);
    doc = updateRegion(doc, doc.regions[1].id, {
      id: 'secret',
      name: 'Secret',
    });
    for (const c of [0, 1]) doc = paintCell(doc, 'visible', p(c, 0));
    for (const c of [4, 5]) doc = paintCell(doc, 'secret', p(c, 0));
    for (const c of [2, 3]) doc = paintScenery(doc, p(c, 0));
    return setStart(doc, p(0, 0));
  }

  const ways = (doc: DungeonDoc) => regionWays(doc);
  const conceal = (doc: DungeonDoc) => deriveConcealment(doc).regionIds!;

  it('A3: visible room · scenery · hidden room · no wall — the rooms are JOINED', () => {
    const doc = a3Scene();
    // The strip is a way in, so the far room is not a secret and the
    // ratchet must not mark it one. Before this change the mirror saw two
    // rooms with no crossing between them at all.
    expect(ways(doc).openly('visible', 'secret')).toBe(true);
    expect(ways(doc).joined('visible', 'secret')).toBe(true);
    expect(conceal(doc).has('secret')).toBe(false);
  });

  it('A3: add the wall between the visible room and the strip — SEPARATED', () => {
    const doc = wallBetween(a3Scene(), p(1, 0), p(2, 0));
    expect(ways(doc).joined('visible', 'secret')).toBe(false);
    expect(ways(doc).openly('visible', 'secret')).toBe(false);
    // Separated is NOT concealed: the module derives from what is
    // authored and never invents a secret for a room nothing reaches.
    expect(conceal(doc).has('secret')).toBe(false);
  });

  it('a wall standing INSIDE the strip separates them — a wall is not a way', () => {
    const doc = wallBetween(a3Scene(), p(2, 0), p(3, 0));
    expect(ways(doc).joined('visible', 'secret')).toBe(false);
  });

  it('a concealed door on the VISIBLE room’s edge, strip behind it — joined, but not openly', () => {
    const base = a3Scene();
    const { doc: withDoor } = wallDoorAt(base, p(1, 0), p(2, 0));
    const doc = updateDoor(withDoor, withDoor.doors[0]!.id, {
      concealed: [{ ability: 'perception', dc: 15 }],
    });
    expect(ways(doc).joined('visible', 'secret')).toBe(true);
    expect(ways(doc).openly('visible', 'secret')).toBe(false);
    expect(conceal(doc).has('secret')).toBe(true);
  });

  it('a concealed door on the SECRET room’s edge, strip in front of it — the same answer from the far end', () => {
    // This is the scene that killed "classification by the first crossing
    // out of the origin region": from the visible side the first crossing
    // is bare, from the secret side it is the door. The flood gives one
    // answer either way.
    const base = a3Scene();
    const { doc: withDoor } = wallDoorAt(base, p(3, 0), p(4, 0));
    const doc = updateDoor(withDoor, withDoor.doors[0]!.id, {
      concealed: [{ ability: 'perception', dc: 15 }],
    });
    expect(ways(doc).joined('visible', 'secret')).toBe(true);
    expect(ways(doc).openly('visible', 'secret')).toBe(false);
    expect(ways(doc).openly('secret', 'visible')).toBe(false);
    expect(conceal(doc).has('secret')).toBe(true);
  });

  it('an ORDINARY door anywhere on the way leaves them joined openly', () => {
    const onTheWay: [Axial, Axial][] = [
      [p(1, 0), p(2, 0)], // where the strip meets the visible room
      [p(3, 0), p(4, 0)], // where it meets the secret one
    ];
    for (const [c1, c2] of onTheWay) {
      const { doc } = wallDoorAt(a3Scene(), c1, c2);
      expect(doc.doors).toHaveLength(1);
      expect(ways(doc).openly('visible', 'secret')).toBe(true);
      expect(conceal(doc).has('secret')).toBe(false);
    }
  });

  it('a door STANDING IN a wall is a door, not a wall (rpg-project#360 slice 2)', () => {
    // The compiled crossing set subtracts a door's own crossing before
    // classifying it, so the graph has to ask about the door FIRST. A
    // wall physically drawn under a door does not make that crossing a
    // wall to this derivation — a room behind one reads as
    // reachable-through-a-secret, not unreachable.
    let doc = a3Scene();
    doc = { ...doc, scenery: [] };
    doc = paintCell(doc, 'visible', p(2, 0));
    doc = paintCell(doc, 'secret', p(3, 0));
    const { doc: withDoor, at } = wallDoorAt(doc, p(2, 0), p(3, 0));
    doc = withDoor;

    expect(wallsThrough(doc, at).length).toBeGreaterThan(0);
    expect(regionWays(doc).openly('visible', 'secret')).toBe(true);

    doc = updateDoor(doc, doc.doors[0]!.id, {
      concealed: [{ ability: 'perception', dc: 15 }],
    });
    expect(regionWays(doc).joined('visible', 'secret')).toBe(true);
    expect(regionWays(doc).openly('visible', 'secret')).toBe(false);
    expect(deriveConcealment(doc).regionIds!.has('secret')).toBe(true);
  });

  it('never tunnels through a THIRD room: a way ends at the first region cell it meets', () => {
    // visible · scenery · middle · scenery · secret. The flood from
    // `visible` stops on `middle`, so `visible` and `secret` are joined
    // only through what `middle` itself opens onto — not by one long way.
    let doc = emptyDungeon();
    doc = updateRegion(doc, 'region-1', { id: 'visible', name: 'Visible' });
    doc = addRegion(doc);
    doc = updateRegion(doc, doc.regions[1].id, { id: 'middle', name: 'Mid' });
    doc = addRegion(doc);
    doc = updateRegion(doc, doc.regions[2].id, { id: 'far', name: 'Far' });
    doc = paintCell(doc, 'visible', p(0, 0));
    doc = paintCell(doc, 'middle', p(2, 0));
    doc = paintCell(doc, 'far', p(4, 0));
    doc = paintScenery(doc, p(1, 0));
    doc = paintScenery(doc, p(3, 0));
    doc = setStart(doc, p(0, 0));

    const w = ways(doc);
    expect(w.openly('visible', 'middle')).toBe(true);
    expect(w.openly('middle', 'far')).toBe(true);
    // No direct way: `middle` is a destination, never a corridor.
    expect(w.joined('visible', 'far')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ids, knows, holdable, exits and scenario bindings (rpg-project#368 §3.1)
// ---------------------------------------------------------------------------

/** A one-cell dungeon with one prop and one monster on it — the smallest
 * document every new field below can be attached to. */
function twoPlacements(): DungeonDoc {
  let doc = emptyDungeon();
  doc = paintCell(doc, 'region-1', p(0, 0));
  doc = paintCell(doc, 'region-1', p(1, 0));
  doc = placeAt(doc, {
    ref: 'dnd5e:props:reliquary',
    at: p(0, 0),
    blocksMovement: false,
    blocksLos: false,
  });
  doc = placeAt(doc, { ref: 'dnd5e:monsters:skeleton-captain', at: p(1, 0) });
  return doc;
}

/** `emit -> parse -> emit` is byte-identical. The test every new field
 * has to pass BOTH ways: carrying it, and not carrying it — a field
 * written when it is absent changes the bytes of every file that never
 * used it, which is the failure that breaks existing content. */
function roundTrips(doc: DungeonDoc): string {
  const once = emitDungeon(doc);
  expect(emitDungeon(parseDungeon(once))).toBe(once);
  return once;
}

describe('placement id (rpg-project#368 P2)', () => {
  it('is omitted from the bytes when the author named none', () => {
    const bytes = roundTrips(twoPlacements());
    expect(bytes).not.toContain('- { id:');
    expect(parseDungeon(bytes).place.every((x) => x.id === undefined)).toBe(
      true
    );
  });

  it('leads the entry and round-trips', () => {
    const doc = updatePlacement(twoPlacements(), 0, { id: 'heirloom' });
    const bytes = roundTrips(doc);
    expect(bytes).toContain('  - { id: heirloom, ref: "dnd5e:props:reliquary"');
    expect(parseDungeon(bytes).place[0].id).toBe('heirloom');
  });

  it('is cleared by an empty string rather than written as one', () => {
    let doc = updatePlacement(twoPlacements(), 0, { id: 'heirloom' });
    doc = updatePlacement(doc, 0, { id: '' });
    expect(doc.place[0].id).toBeUndefined();
    expect(emitDungeon(doc)).not.toContain('- { id:');
  });

  it('suggests the ref’s last segment, and numbers a name already taken', () => {
    const doc = twoPlacements();
    expect(suggestPlacementId(doc, 'dnd5e:props:reliquary')).toBe('reliquary');
    const named = updatePlacement(doc, 0, { id: 'reliquary' });
    expect(suggestPlacementId(named, 'dnd5e:props:reliquary')).toBe(
      'reliquary-2'
    );
  });

  it('reports each id with the placement that declared it, first wins', () => {
    let doc = updatePlacement(twoPlacements(), 0, { id: 'same' });
    doc = updatePlacement(doc, 1, { id: 'same' });
    // A hand-written file CAN carry a duplicate; the map names the first,
    // which is what lets the panel say "already the name of <that one>".
    expect(placementIds(doc).get('same')).toBe(0);
  });
});

describe('holds — intel record ids, monsters only (rpg-project#372 §2)', () => {
  it('writes the record ids and round-trips', () => {
    const doc = updatePlacement(twoPlacements(), 1, { holds: ['vault-map'] });
    const bytes = roundTrips(doc);
    expect(bytes).toContain('holds: [vault-map]');
    expect(parseDungeon(bytes).place[1].holds).toEqual(['vault-map']);
  });

  it('carries several records on one monster', () => {
    const doc = updatePlacement(twoPlacements(), 1, {
      holds: ['vault-map', 'the-password'],
    });
    const bytes = roundTrips(doc);
    expect(bytes).toContain('holds: [vault-map, the-password]');
  });

  it('is legal on a PROP as well as a monster (R6)', () => {
    // Kirk, walking: intel a party can reach without killing the hardest
    // thing in the dungeon first.
    const doc = updatePlacement(twoPlacements(), 0, { holds: ['vault-map'] });
    expect(doc.place[0].holds).toEqual(['vault-map']);
    expect(roundTrips(doc)).toContain('holds: [vault-map]');
  });

  it('clears the field rather than writing an empty list', () => {
    let doc = updatePlacement(twoPlacements(), 1, { holds: ['vault-map'] });
    doc = updatePlacement(doc, 1, { holds: [] });
    expect(doc.place[1].holds).toBeUndefined();
    expect(emitDungeon(doc)).not.toContain('holds:');
  });

  it('still carries an authored empty list read off a file, unchanged', () => {
    // NIL, NOT LEN 0. A file that says `holds: []` means a monster whose
    // holdings were authored as none — this module represents it rather
    // than silently reading it as absent, so what the author wrote is what
    // the server judges.
    const bytes = emitDungeon(twoPlacements()).replace(
      'ref: "dnd5e:monsters:skeleton-captain", at: [1,0]',
      'ref: "dnd5e:monsters:skeleton-captain", at: [1,0], holds: []'
    );
    expect(parseDungeon(bytes).place[1].holds).toEqual([]);
  });
});

describe('`knows:` is gone, and refused by name (rpg-project#372 R1)', () => {
  const withKnows = () =>
    emitDungeon(twoPlacements()).replace(
      'ref: "dnd5e:monsters:skeleton-captain", at: [1,0]',
      'ref: "dnd5e:monsters:skeleton-captain", at: [1,0], knows: [vault]'
    );

  it('refuses the deleted field in the compiler’s own words', () => {
    // A refusal a streamer meets twice — once on load here, once from the
    // server — must read the same both times, or the two look like two
    // different problems.
    expect(() => parseDungeon(withKnows())).toThrow(KNOWS_IS_GONE);
  });

  it('names the line it is on, and points at the replacement', () => {
    expect(() => parseDungeon(withKnows())).toThrow(/place\[1\]\.knows/);
    expect(() => parseDungeon(withKnows())).toThrow(/intel/);
    expect(() => parseDungeon(withKnows())).toThrow(/holds/);
  });

  it('refuses BEFORE the unknown-key complaint, so the author gets the sentence that explains it', () => {
    // Without the early refusal this file would fail with `unknown key
    // "knows"`, which says the loader failed to learn a field rather than
    // that the field was deleted.
    expect(() => parseDungeon(withKnows())).not.toThrow(/unknown key/);
  });

  it('leaves a file that never mentioned it alone', () => {
    expect(() => parseDungeon(emitDungeon(twoPlacements()))).not.toThrow();
  });
});

describe('intel records (rpg-project#372 §2)', () => {
  it('is absent from the bytes until a record is declared', () => {
    expect(roundTrips(twoPlacements())).not.toContain('intel:');
  });

  it('writes a record and round-trips', () => {
    let doc = addIntel(twoPlacements());
    doc = setIntelReveals(doc, 'intel-1', 'door', 'vault');
    const bytes = roundTrips(doc);
    expect(bytes).toContain(
      'intel:\n  - id: intel-1\n    reveals: { door: vault }\n'
    );
    expect(parseDungeon(bytes).intel).toEqual([
      { id: 'intel-1', reveals: { door: 'vault' } },
    ]);
  });

  it('round-trips a record that reveals nothing yet', () => {
    // The state a brand new record is in before its target is picked. The
    // compiler refuses to compile it; the file can still hold it, so the
    // author is not forced to finish in one go.
    const doc = addIntel(twoPlacements());
    const bytes = roundTrips(doc);
    expect(bytes).toContain('    reveals: {}');
    expect(parseDungeon(bytes).intel).toEqual([{ id: 'intel-1', reveals: {} }]);
  });

  it('carries a reveals key this build has never heard of', () => {
    // `reveals` is opaque on purpose: the set of targets grows one key per
    // use case, and a file written against a newer rulebook survives a
    // round trip here rather than losing what it said.
    const bytes = emitDungeon(twoPlacements()).replace(
      /\n$/,
      '\nintel:\n  - id: treasure\n    reveals: { region: vault, hoard: chest }\n'
    );
    const doc = parseDungeon(bytes);
    expect(doc.intel[0].reveals).toEqual({ region: 'vault', hoard: 'chest' });
    // Keys SORTED on the way out, so the bytes do not record which target
    // the author happened to pick first.
    expect(roundTrips(doc)).toContain(
      'reveals: { hoard: chest, region: vault }'
    );
  });

  it('numbers a suggested id around one already taken', () => {
    let doc = addIntel(twoPlacements());
    doc = addIntel(doc);
    expect(doc.intel.map((r) => r.id)).toEqual(['intel-1', 'intel-2']);
  });

  it('clears a target on an empty value rather than writing an empty string', () => {
    let doc = addIntel(twoPlacements());
    doc = setIntelReveals(doc, 'intel-1', 'door', 'vault');
    doc = setIntelReveals(doc, 'intel-1', 'door', '');
    expect(doc.intel[0].reveals).toEqual({});
  });
});

describe('assigning a record to monsters (rpg-project#372 R2)', () => {
  const named = () => {
    let doc = addIntel(twoPlacements());
    doc = setIntelReveals(doc, 'intel-1', 'door', 'vault');
    return updatePlacement(doc, 1, { id: 'captain' });
  };

  it('writes `holds` on the monster the record was given to', () => {
    const doc = setIntelHolders(named(), 'intel-1', ['captain']);
    expect(doc.place[1].holds).toEqual(['intel-1']);
    expect(intelHolders(doc, 'intel-1')).toEqual(['captain']);
  });

  it('takes it back when the holder is unticked', () => {
    let doc = setIntelHolders(named(), 'intel-1', ['captain']);
    doc = setIntelHolders(doc, 'intel-1', []);
    expect(doc.place[1].holds).toBeUndefined();
    expect(emitDungeon(doc)).not.toContain('holds:');
  });

  it('writes `holds` on a prop as readily as on a monster (R6)', () => {
    let doc = named();
    doc = updatePlacement(doc, 0, { id: 'heirloom' });
    doc = setIntelHolders(doc, 'intel-1', ['heirloom', 'captain']);
    expect(doc.place[0].holds).toEqual(['intel-1']);
    expect(doc.place[1].holds).toEqual(['intel-1']);
    // The same record on two things: intel copies, it does not move.
    expect(intelHolders(doc, 'intel-1')).toEqual(['heirloom', 'captain']);
  });

  it('never assigns to a placement the author never named', () => {
    // `holds` points at a placement by its id, so a thing with no name
    // cannot be given a record — there would be nothing to write.
    const doc = setIntelHolders(named(), 'intel-1', ['']);
    expect(doc.place.every((p) => p.holds === undefined)).toBe(true);
  });

  it('leaves a monster’s OTHER records alone', () => {
    let doc = addIntel(named());
    doc = setIntelHolders(doc, 'intel-1', ['captain']);
    doc = setIntelHolders(doc, 'intel-2', ['captain']);
    expect(doc.place[1].holds).toEqual(['intel-1', 'intel-2']);
    doc = setIntelHolders(doc, 'intel-1', []);
    expect(doc.place[1].holds).toEqual(['intel-2']);
  });

  it('deleting a record takes it out of every monster holding it', () => {
    // A `holds:` naming a record the file does not declare is refused by
    // the compiler, and deleting is not a way to author that.
    let doc = setIntelHolders(named(), 'intel-1', ['captain']);
    doc = removeIntel(doc, 'intel-1');
    expect(doc.intel).toEqual([]);
    expect(doc.place[1].holds).toBeUndefined();
    expect(roundTrips(doc)).not.toContain('holds:');
  });
});
describe('holdable — props only (rpg-project#368 §5)', () => {
  it('is written only when true, and round-trips', () => {
    const doc = updatePlacement(twoPlacements(), 0, { holdable: true });
    const bytes = roundTrips(doc);
    expect(bytes).toContain('holdable: true');
    expect(parseDungeon(bytes).place[0].holdable).toBe(true);
  });

  it('leaves no trace when false — a thing nobody declared stays scenery', () => {
    let doc = updatePlacement(twoPlacements(), 0, { holdable: true });
    doc = updatePlacement(doc, 0, { holdable: false });
    expect(doc.place[0].holdable).toBeUndefined();
    expect(roundTrips(doc)).not.toContain('holdable');
  });

  it('is refused on a monster on the write path', () => {
    const doc = updatePlacement(twoPlacements(), 1, { holdable: true });
    expect(doc.place[1].holdable).toBeUndefined();
  });
});

describe('exits (rpg-project#368 §3.1)', () => {
  it('is absent from the bytes when nothing is authored', () => {
    expect(roundTrips(twoPlacements())).not.toContain('exits:');
  });

  it('writes start’s own shape and round-trips', () => {
    const doc = toggleExitAt(twoPlacements(), p(0, 0));
    const bytes = roundTrips(doc);
    expect(bytes).toContain('exits:\n  - { id: exit-1, at: [0, 0] }');
    expect(parseDungeon(bytes).exits).toEqual([{ id: 'exit-1', at: p(0, 0) }]);
  });

  it('toggles off on the same cell, and numbers around a name in use', () => {
    let doc = toggleExitAt(twoPlacements(), p(0, 0));
    doc = toggleExitAt(doc, p(0, 0));
    expect(doc.exits).toEqual([]);
    doc = toggleExitAt(twoPlacements(), p(0, 0));
    doc = updateExit(doc, 0, { id: 'exit-2' });
    doc = toggleExitAt(doc, p(1, 0));
    expect(doc.exits.map((e) => e.id)).toEqual(['exit-2', 'exit-3']);
  });

  it('refuses a cell nobody can stand on, in place', () => {
    // The compiler refuses an exit on scenery in `start`'s own words; the
    // mutator hands the same document back so the caller can say why.
    let doc = twoPlacements();
    doc = paintScenery(doc, p(2, 0));
    expect(toggleExitAt(doc, p(2, 0))).toBe(doc);
    // And off the floor entirely.
    expect(toggleExitAt(doc, p(9, 9))).toBe(doc);
  });

  it('start is NOT implicitly an exit', () => {
    const doc = setStart(twoPlacements(), p(0, 0));
    expect(doc.exits).toEqual([]);
    expect(emitDungeon(doc)).not.toContain('exits:');
  });
});

describe('scenario bindings (rpg-project#368 §3.2)', () => {
  it('is absent from the bytes until something is bound', () => {
    expect(roundTrips(twoPlacements())).not.toContain('scenarios:');
  });

  it('writes the map and round-trips', () => {
    let doc = setScenarioBinding(
      twoPlacements(),
      'recover-the-artifact',
      'artifact',
      'heirloom'
    );
    doc = setScenarioBinding(doc, 'recover-the-artifact', 'exit', 'entrance');
    const bytes = roundTrips(doc);
    expect(bytes).toContain(
      'scenarios:\n  recover-the-artifact:\n    artifact: heirloom\n    exit: entrance\n'
    );
    expect(parseDungeon(bytes).scenarios).toEqual({
      'recover-the-artifact': { artifact: 'heirloom', exit: 'entrance' },
    });
  });

  it('sorts both levels, so the bytes do not record the filling-in order', () => {
    let a = setScenarioBinding(twoPlacements(), 'zebra', 'b', '2');
    a = setScenarioBinding(a, 'zebra', 'a', '1');
    a = setScenarioBinding(a, 'aardvark', 'x', '9');
    let b = setScenarioBinding(twoPlacements(), 'aardvark', 'x', '9');
    b = setScenarioBinding(b, 'zebra', 'a', '1');
    b = setScenarioBinding(b, 'zebra', 'b', '2');
    expect(emitDungeon(a)).toBe(emitDungeon(b));
  });

  it('unbinds a field on an empty value, and drops the scenario with its last one', () => {
    let doc = setScenarioBinding(
      twoPlacements(),
      'recover-the-artifact',
      'artifact',
      'heirloom'
    );
    doc = setScenarioBinding(doc, 'recover-the-artifact', 'exit', 'entrance');
    doc = setScenarioBinding(doc, 'recover-the-artifact', 'exit', '');
    expect(doc.scenarios).toEqual({
      'recover-the-artifact': { artifact: 'heirloom' },
    });
    doc = setScenarioBinding(doc, 'recover-the-artifact', 'artifact', '');
    expect(doc.scenarios).toEqual({});
    expect(emitDungeon(doc)).not.toContain('scenarios:');
  });

  it('carries a key this build has never heard of, unchanged', () => {
    // The bindings are OPAQUE: the builder learns the keys from
    // ListScenarios and this module interprets none of them. A file
    // written against a newer rulebook survives a round trip here.
    const bytes = emitDungeon(twoPlacements()).replace(
      /\n$/,
      '\nscenarios:\n  something-new:\n    whatever: heirloom\n'
    );
    const doc = parseDungeon(bytes);
    expect(doc.scenarios).toEqual({
      'something-new': { whatever: 'heirloom' },
    });
    expect(emitDungeon(doc)).toContain('    whatever: heirloom');
  });

  it('reads a scenario bound with nothing filled in', () => {
    const bytes = emitDungeon(twoPlacements()).replace(
      /\n$/,
      '\nscenarios:\n  recover-the-artifact: {}\n'
    );
    const doc = parseDungeon(bytes);
    expect(doc.scenarios).toEqual({ 'recover-the-artifact': {} });
    expect(roundTrips(doc)).toContain('  recover-the-artifact: {}');
  });
});

describe('resolveErrorPath — the new fields', () => {
  it('lands an exit refusal on the exit the emitter put there', () => {
    let doc = toggleExitAt(twoPlacements(), p(0, 0));
    doc = toggleExitAt(doc, p(1, 0));
    expect(resolveErrorPath(doc, 'exits[1].id')).toEqual({
      kind: 'exit',
      index: 1,
    });
  });

  it('lands a scenario refusal on the blank the compiler named', () => {
    const doc = setScenarioBinding(
      twoPlacements(),
      'recover-the-artifact',
      'artifact',
      'nope'
    );
    // A scenario id carries hyphens, so the key is what follows the LAST
    // dot — `the-artifact` would be the wrong answer and a silently
    // unrendered refusal.
    expect(
      resolveErrorPath(doc, 'scenarios.recover-the-artifact.artifact')
    ).toEqual({
      kind: 'scenario',
      scenarioId: 'recover-the-artifact',
      key: 'artifact',
    });
  });

  it('falls back to the document for a scenario this file does not bind', () => {
    expect(
      resolveErrorPath(twoPlacements(), 'scenarios.kill-the-captain.boss')
    ).toEqual({ kind: 'document' });
  });

  it('lands a placement id refusal on the placement', () => {
    const doc = updatePlacement(twoPlacements(), 1, { id: 'captain' });
    expect(resolveErrorPath(doc, 'place[1].id')).toEqual({
      kind: 'placement',
      index: 1,
      cell: p(1, 0),
    });
  });
});

describe('the start’s facing (rpg-project#374 design, "The walks")', () => {
  const withStart = () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    return setStart(doc, p(0, 0));
  };

  it('emits the BARE PAIR when the author stated no facing', () => {
    // Every dungeon written before facing existed keeps the bytes it has
    // always had — which is what the toolkit's own fixtures are.
    const bytes = roundTrips(withStart());
    expect(bytes).toContain('start: [0, 0]');
    expect(bytes).not.toContain('facing');
  });

  it('emits the map when the author aimed it, and round-trips', () => {
    const doc = setStartFacing(withStart(), 'e');
    const bytes = roundTrips(doc);
    expect(bytes).toContain('start: { at: [0, 0], facing: e }');
    expect(parseDungeon(bytes).start).toEqual({ at: p(0, 0), facing: 'e' });
  });

  it('parses the bare pair as a start with no facing stated', () => {
    const doc = parseDungeon(emitDungeon(withStart()));
    expect(doc.start).toEqual({ at: p(0, 0) });
    expect(doc.start?.facing).toBeUndefined();
  });

  it('parses the map spelling with no facing, and re-emits it as the bare pair', () => {
    // THE ONE ACCEPTED LOSS, ruled: the same document, different bytes.
    // Carrying the spelling through the model to avoid it would be state
    // that goes stale for no reader's benefit.
    const written = emitDungeon(withStart()).replace(
      'start: [0, 0]',
      'start: { at: [0, 0] }'
    );
    const doc = parseDungeon(written);
    expect(doc.start).toEqual({ at: p(0, 0) });
    expect(emitDungeon(doc)).toContain('start: [0, 0]');
  });

  it('reads an EMPTY facing as no facing at all', () => {
    // Zero values tell the truth: `facing: ""` is the author stating
    // none, which is what the bare pair already says. Carrying it as a
    // third state would let it re-emit as `facing: ""` and make the panel
    // print "the camera looks  on the first frame".
    const written = emitDungeon(withStart()).replace(
      'start: [0, 0]',
      'start: { at: [0, 0], facing: "" }'
    );
    const doc = parseDungeon(written);
    expect(doc.start).toEqual({ at: p(0, 0) });
    expect(roundTrips(doc)).toContain('start: [0, 0]');
  });

  it('clears the facing back to the bare pair', () => {
    let doc = setStartFacing(withStart(), 'e');
    doc = setStartFacing(doc, undefined);
    expect(doc.start).toEqual({ at: p(0, 0) });
    expect(roundTrips(doc)).toContain('start: [0, 0]');
  });

  it('keeps the facing when the start MOVES', () => {
    // The author picked which way the party looks; dragging the entry one
    // cell over is not them changing their mind about that.
    let doc = paintCell(withStart(), 'region-1', p(1, 0));
    doc = setStartFacing(doc, 'ne');
    doc = setStart(doc, p(1, 0));
    expect(doc.start).toEqual({ at: p(1, 0), facing: 'ne' });
  });

  it('aims nothing when there is no start to aim', () => {
    const bare = emptyDungeon();
    expect(setStartFacing(bare, 'e').start).toBeNull();
  });

  it('carries a facing word this build has never heard of', () => {
    // The eight names are the server's call, surfaced as a `start.facing`
    // FieldError like `place[].facing` already is — this module only
    // carries the word.
    const written = emitDungeon(withStart()).replace(
      'start: [0, 0]',
      'start: { at: [0, 0], facing: widdershins }'
    );
    const doc = parseDungeon(written);
    expect(doc.start?.facing).toBe('widdershins');
    expect(roundTrips(doc)).toContain('facing: widdershins');
  });

  it('refuses a start that is neither spelling', () => {
    const written = emitDungeon(withStart()).replace(
      'start: [0, 0]',
      'start: yonder'
    );
    expect(() => parseDungeon(written)).toThrow(/expected \[col,row\]/);
  });
});
