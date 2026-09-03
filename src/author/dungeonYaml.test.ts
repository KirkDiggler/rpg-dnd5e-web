import { describe, expect, it } from 'vitest';
import {
  addDoor,
  addRegion,
  addWalls,
  applyDerivedConcealment,
  compiledWalls,
  deriveConcealment,
  detectConcealmentLeaks,
  edgeIsOfferable,
  emitDungeon,
  emptyDungeon,
  eraseCell,
  floorOwners,
  isFloor,
  isScenery,
  isStandable,
  paintCell,
  paintRect,
  paintScenery,
  parseDungeon,
  placeAt,
  regionWays,
  removeWalls,
  resolveErrorPath,
  sceneryBlockedBy,
  setStart,
  setWallHeights,
  toggleDoorEdge,
  toggleWall,
  updateDoor,
  updatePlacement,
  updateRegion,
  wallEdges,
  type DungeonDoc,
} from './dungeonYaml';
import { referenceTombDoc } from './fixtures/referenceTomb';
import {
  axialKey,
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

  it('a drawn stroke is ONE entry: the run round-trips byte-for-byte with its height written once (rpg-project#355)', () => {
    let doc = emptyDungeon();
    for (const [c, r] of [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]) {
      doc = paintCell(doc, 'region-1', p(c, r));
    }
    const chain: Edge[] = [
      [p(0, 0), p(0, 1)],
      [p(1, 0), p(1, 1)],
      [p(2, 0), p(2, 1)],
    ];
    doc = addWalls(doc, chain, 2);

    // The stroke the author drew survives as ONE wall, not three edges —
    // this is the whole point: a dungeon reads as the walls somebody drew.
    expect(doc.walls).toHaveLength(1);
    expect(doc.walls[0].edges).toHaveLength(3);

    const text = emitDungeon(doc);
    expect(text).toContain('  - height: 2\n    edges:\n');
    const wallsBlock = text.slice(
      text.indexOf('walls:'),
      text.indexOf('doors:')
    );
    expect(wallsBlock.match(/^ {6}- \[\[/gm)).toHaveLength(3);
    // The height is written ONCE for the run, not repeated per edge.
    expect(wallsBlock.match(/height: 2/g)).toHaveLength(1);

    const reparsed = parseDungeon(text);
    expect(reparsed.walls).toHaveLength(1);
    expect(reparsed.walls[0].edges).toHaveLength(3);
    expect(reparsed.walls[0].height).toBe(2);
    expect(emitDungeon(reparsed)).toBe(text);
  });

  it("a run's name round-trips and is carried unread", () => {
    let doc = emptyDungeon();
    for (const [c, r] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      doc = paintCell(doc, 'region-1', p(c, r));
    }
    doc = addWalls(doc, [
      [p(0, 0), p(0, 1)],
      [p(1, 0), p(1, 1)],
    ]);
    doc = { ...doc, walls: [{ ...doc.walls[0], name: 'north wall' }] };

    const text = emitDungeon(doc);
    expect(text).toContain('  - name: north wall\n    edges:\n');
    const reparsed = parseDungeon(text);
    expect(reparsed.walls[0].name).toBe('north wall');
    expect(emitDungeon(reparsed)).toBe(text);
  });

  it('grouping has NO mechanical consequence: the same edges grouped differently reach the atlas identically (rpg-project#355)', () => {
    let base = emptyDungeon();
    for (const [c, r] of [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]) {
      base = paintCell(base, 'region-1', p(c, r));
    }
    const chain: Edge[] = [
      [p(0, 0), p(0, 1)],
      [p(1, 0), p(1, 1)],
      [p(2, 0), p(2, 1)],
    ];

    // One stroke of three edges...
    const grouped = addWalls(base, chain);
    // ...and the same three edges drawn one at a time.
    let loose = base;
    for (const e of chain) loose = addWalls(loose, [e]);

    expect(grouped.walls).toHaveLength(1);
    expect(loose.walls).toHaveLength(3);

    const keysOf = (d: DungeonDoc) =>
      compiledWalls(d)
        .map((w) => `${edgeKey(w.edge)}@${w.height ?? 'std'}`)
        .sort();
    expect(keysOf(grouped)).toEqual(keysOf(loose));
    // A flat document still emits the bare pairs it always did, so nothing
    // already on disk churns just because runs became expressible.
    expect(emitDungeon(loose)).toContain('walls:\n  - [[');
  });

  it('refuses a wall object with an unknown key, a missing edge, or a non-number height', () => {
    const head =
      'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nregions: []\nwalls:\n';
    expect(() =>
      parseDungeon(head + '  - { between: [[0,0],[1,0]], hieght: 2 }\n')
    ).toThrow(/walls\[0\]: unknown key "hieght"/);
    expect(() => parseDungeon(head + '  - { height: 2 }\n')).toThrow(
      /walls\[0\]: a wall object must name its edge in `between` or its run in `edges`/
    );
    expect(() =>
      parseDungeon(
        head + '  - { between: [[0,0],[1,0]], edges: [[[0,0],[1,0]]] }\n'
      )
    ).toThrow(/never both/);
    expect(() => parseDungeon(head + '  - { edges: [] }\n')).toThrow(
      /walls\[0\]\.edges: a wall run with no edges stands nowhere/
    );
    expect(() =>
      parseDungeon(head + '  - { between: [[0,0],[1,0]], height: tall }\n')
    ).toThrow(/walls\[0\]\.height: expected a number/);
  });

  describe('concealed doors and regions (rpg-project#350/#351)', () => {
    function twoCellDoc(): DungeonDoc {
      let doc = emptyDungeon();
      doc = paintCell(doc, 'region-1', p(0, 0));
      doc = paintCell(doc, 'region-1', p(1, 0));
      return doc;
    }

    it("a door's concealed find check round-trips byte-for-byte and COMPOSES with an open doorway underneath", () => {
      let doc = twoCellDoc();
      doc = addDoor(doc, [[p(0, 0), p(1, 0)]]);
      doc = updateDoor(doc, doc.doors[0]!.id, {
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
      let locked = twoCellDoc();
      locked = addDoor(locked, [[p(0, 0), p(1, 0)]]);
      locked = updateDoor(locked, locked.doors[0]!.id, {
        locked: [{ ability: 'dex', dc: 12 }],
        concealed: [{ ability: 'perception', dc: 15 }],
      });
      const lockedText = emitDungeon(locked);
      expect(lockedText).toContain('    locked: [{ ability: dex, dc: 12 }]');
      expect(lockedText).toContain(
        '    concealed: [{ ability: perception, dc: 15 }]'
      );
      expect(emitDungeon(parseDungeon(lockedText))).toBe(lockedText);

      let closed = twoCellDoc();
      closed = addDoor(closed, [[p(0, 0), p(1, 0)]]);
      closed = updateDoor(closed, closed.doors[0]!.id, {
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
      let doc = twoCellDoc();
      doc = addDoor(doc, [[p(0, 0), p(1, 0)]]);
      doc = updateDoor(doc, doc.doors[0]!.id, {
        concealed: [{ ability: 'perception', dc: 15 }],
      });
      expect(doc.doors[0]).toHaveProperty('concealed');
      doc = updateDoor(doc, doc.doors[0]!.id, { concealed: undefined });
      expect(doc.doors[0]).not.toHaveProperty('concealed');
      expect(emitDungeon(doc)).not.toContain('concealed');
    });

    it('an authored-but-empty check list round-trips unchanged — this loader only refuses what it cannot represent', () => {
      let doc = twoCellDoc();
      doc = addDoor(doc, [[p(0, 0), p(1, 0)]]);
      doc = updateDoor(doc, doc.doors[0]!.id, { concealed: [] });
      const text = emitDungeon(doc);
      expect(text).toContain('    concealed: []');
      const reparsed = parseDungeon(text);
      expect(reparsed.doors[0]!.concealed).toEqual([]);
      expect(emitDungeon(reparsed)).toBe(text);
    });

    it("a region's concealed marker round-trips byte-for-byte and is declared, never inferred from a door", () => {
      let doc = twoCellDoc();
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
          `${head}regions: []\ndoors:\n  - id: d1\n    edges: []\n    concealed: { ability: perception, dc: 15 }\n`
        )
      ).toThrow(/doors\[0\]\.concealed: expected a list/);
    });

    it('refuses an approach row missing its ability, or with a non-integer dc', () => {
      const head =
        'version: 2\nkey: x\nname: x\norientation: pointy\nvoid: opaque\nregions: []\ndoors:\n  - id: d1\n    edges: []\n';
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

  it('the reference tomb has no facing/offset anywhere — the additive fields change nothing absent', () => {
    for (const placement of referenceTombDoc().place) {
      expect(placement.facing).toBeUndefined();
      expect(placement.offset).toBeUndefined();
    }
    expect(emitDungeon(referenceTombDoc())).not.toMatch(/facing:|offset:/);
  });
});

describe('deriveConcealment / detectConcealmentLeaks / applyDerivedConcealment (rpg-dnd5e-web#893)', () => {
  /** region-1: [0,0],[1,0], start [0,0] — region-2: [2,0], reachable only
   * through a door on the [1,0]-[2,0] edge, concealed by the caller. */
  function alcoveDoc(): DungeonDoc {
    let doc = emptyDungeon();
    doc = addRegion(doc);
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    doc = paintCell(doc, 'region-2', p(2, 0));
    doc = addDoor(doc, [[p(1, 0), p(2, 0)]]);
    doc = updateDoor(doc, doc.doors[0]!.id, {
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

  it('a door stands in a wall, and deleting the door gives the wall back', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    doc = paintCell(doc, 'region-1', p(1, 0));
    doc = toggleWall(doc, [p(0, 0), p(1, 0)]);
    doc = toggleDoorEdge(doc, [p(0, 0), p(1, 0)]);

    // rpg-project#355 reverses "an edge is a wall OR a door". The run KEEPS
    // the crossing and the door sits in it — which is what lets one drawn
    // wall stay one entry instead of coming apart at every doorway.
    expect(wallEdges(doc)).toHaveLength(1);
    expect(doc.doors).toEqual([{ id: 'door-1', edges: [[p(0, 0), p(1, 0)]] }]);
    // ...and the wall still does not reach the atlas while the door holds
    // that crossing: the client mirrors the server's own subtraction.
    expect(compiledWalls(doc)).toHaveLength(0);

    // The wall tool may draw on a door's edge, since a wall may run through
    // one. Drawing over the wall already there is idempotent, so this is a
    // removal, and now nothing is left underneath the door.
    expect(wallEdges(toggleWall(doc, [p(0, 0), p(1, 0)]))).toHaveLength(0);

    // Deleting the door gives the wall back rather than leaving a hole
    // nobody authored — the behaviour the old exclusive rule got wrong.
    const reopened = toggleDoorEdge(doc, [p(1, 0), p(0, 0)]);
    expect(reopened.doors).toHaveLength(0);
    expect(compiledWalls(reopened)).toHaveLength(1);
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
    expect(doc.walls.map((w) => w.height)).toEqual([2.5]);
    // Clearing is the same chain-level stamp.
    doc = setWallHeights(doc, [e1], undefined);
    expect(doc.walls.map((w) => w.height)).toEqual([undefined, 2.5]);
    // A no-op returns the same doc (referential, like every mutator).
    expect(setWallHeights(doc, [e1], undefined)).toBe(doc);
    // Erasing the raised wall erases its height WITH it: a redraw gets
    // standard, never a resurrected stale height.
    doc = removeWalls(doc, [e2]);
    doc = addWalls(doc, [e2]);
    const redrawn = doc.walls.find((w) =>
      w.edges.some((x) => edgeKey(x) === edgeKey(e2))
    );
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
    // One stroke is ONE run (rpg-project#355), so the height it carries is
    // written once for the whole wall rather than repeated per edge — the
    // entire point of grouping, seen from the model side.
    expect(doc.walls).toHaveLength(1);
    expect(doc.walls[0].edges).toHaveLength(2);
    expect(doc.walls.map((w) => w.height)).toEqual([3]);
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
    expect(resolveErrorPath(doc, 'place[3].boss')).toEqual({
      kind: 'placement',
      index: 3,
      cell: p(23, 5),
    });
    expect(resolveErrorPath(doc, 'doors[1].edges[0]')).toEqual({
      kind: 'edge',
      edge: [p(15, 3), p(16, 3)],
    });
    expect(resolveErrorPath(doc, 'doors[1].locked[0].dc')).toEqual({
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

  it('a defect inside a run draws on THAT crossing, not on the whole wall (rpg-project#355)', () => {
    let doc = emptyDungeon();
    for (const [c, r] of [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]) {
      doc = paintCell(doc, 'region-1', p(c, r));
    }
    doc = addWalls(doc, [
      [p(0, 0), p(0, 1)],
      [p(1, 0), p(1, 1)],
      [p(2, 0), p(2, 1)],
    ]);

    // The server addresses an edge inside a run as walls[i].edges[j], and
    // the builder has to draw the refusal on that one crossing.
    expect(resolveErrorPath(doc, 'walls[0].edges[2]')).toEqual({
      kind: 'edge',
      edge: [p(2, 0), p(2, 1)],
    });
    // A defect on the RUN itself names no single crossing, so it draws
    // where the wall visibly starts.
    expect(resolveErrorPath(doc, 'walls[0].height')).toEqual({
      kind: 'edge',
      edge: [p(0, 0), p(0, 1)],
    });
    expect(resolveErrorPath(doc, 'walls[0].edges[9]')).toEqual({
      kind: 'document',
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
    expect(doc.start).toEqual(p(0, 0));
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

  it('erase returns a scenery cell to void and cascades what stood on it (design §2.2)', () => {
    let doc = stripDoc();
    doc = toggleWall(doc, [p(2, 0), p(3, 0)]);
    doc = placeAt(doc, {
      ref: 'dnd5e:props:pillar',
      at: p(3, 0),
      blocksMovement: true,
    });
    expect(wallEdges(doc)).toHaveLength(1);
    expect(doc.place).toHaveLength(1);

    doc = eraseCell(doc, p(3, 0));
    expect(isScenery(doc, p(3, 0))).toBe(false);
    expect(isFloor(doc, p(3, 0))).toBe(false);
    expect(wallEdges(doc)).toHaveLength(0);
    expect(doc.place).toHaveLength(0);
  });

  it('a wall or a door may stand on scenery (design §2.3)', () => {
    const doc = stripDoc();
    // room | scenery
    expect(wallEdges(toggleWall(doc, [p(2, 0), p(3, 0)]))).toHaveLength(1);
    // scenery | scenery
    expect(wallEdges(toggleWall(doc, [p(3, 0), p(4, 0)]))).toHaveLength(1);
    expect(edgeIsOfferable(doc, [p(3, 0), p(4, 0)])).toBe(true);
    // ...and still nothing off the floor.
    expect(edgeIsOfferable(doc, [p(4, 0), p(5, 0)])).toBe(false);

    const withDoor = addDoor(doc, [[p(3, 0), p(4, 0)]]);
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
    expect(setStart(doc, p(1, 0)).start).toEqual(p(1, 0));
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
    const doc = toggleWall(a3Scene(), [p(1, 0), p(2, 0)]);
    expect(ways(doc).joined('visible', 'secret')).toBe(false);
    expect(ways(doc).openly('visible', 'secret')).toBe(false);
    // Separated is NOT concealed: the module derives from what is
    // authored and never invents a secret for a room nothing reaches.
    expect(conceal(doc).has('secret')).toBe(false);
  });

  it('a wall standing INSIDE the strip separates them — a wall is not a way', () => {
    const doc = toggleWall(a3Scene(), [p(2, 0), p(3, 0)]);
    expect(ways(doc).joined('visible', 'secret')).toBe(false);
  });

  it('a concealed door on the VISIBLE room’s edge, strip behind it — joined, but not openly', () => {
    let doc = addDoor(a3Scene(), [[p(1, 0), p(2, 0)]]);
    doc = updateDoor(doc, doc.doors[0].id, {
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
    let doc = addDoor(a3Scene(), [[p(3, 0), p(4, 0)]]);
    doc = updateDoor(doc, doc.doors[0].id, {
      concealed: [{ ability: 'perception', dc: 15 }],
    });
    expect(ways(doc).joined('visible', 'secret')).toBe(true);
    expect(ways(doc).openly('visible', 'secret')).toBe(false);
    expect(ways(doc).openly('secret', 'visible')).toBe(false);
    expect(conceal(doc).has('secret')).toBe(true);
  });

  it('an ORDINARY door anywhere on the way leaves them joined openly', () => {
    const onTheWay: Edge[] = [
      [p(1, 0), p(2, 0)], // where the strip meets the visible room
      [p(3, 0), p(4, 0)], // where it meets the secret one
    ];
    for (const edge of onTheWay) {
      const doc = addDoor(a3Scene(), [edge]);
      expect(doc.doors).toHaveLength(1);
      expect(ways(doc).openly('visible', 'secret')).toBe(true);
      expect(conceal(doc).has('secret')).toBe(false);
    }
  });

  it('a door STANDING IN a wall is a door, not a wall (rpg-project#355)', () => {
    // A run keeps the crossing its door sits in and the compiler hands
    // that edge back to the door, so the graph has to ask about the door
    // FIRST. Asking about the wall first made every door drawn inside a
    // run invisible to this derivation — a room behind one read as
    // unreachable rather than as reachable-through-a-secret.
    let doc = a3Scene();
    doc = { ...doc, scenery: [] };
    doc = paintCell(doc, 'visible', p(2, 0));
    doc = paintCell(doc, 'secret', p(3, 0));
    const seam: Edge = [p(2, 0), p(3, 0)];
    doc = addWalls(doc, [seam]);
    doc = addDoor(doc, [seam]);

    // The wall is still authored; the compiler subtracts it at the door.
    expect(wallEdges(doc).map(edgeKey)).toContain(edgeKey(seam));
    expect(compiledWalls(doc)).toHaveLength(0);
    expect(regionWays(doc).openly('visible', 'secret')).toBe(true);

    doc = updateDoor(doc, doc.doors[0].id, {
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
