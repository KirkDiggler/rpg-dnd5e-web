import { hexDistance } from '@/components/hex-grid/hexMath';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DIALECT_FIELDS,
  type DialectField,
  type ServerCapabilities,
} from './capabilityProbe';
import { emptyCanvasYaml } from './creation/emptyCanvasDoc';
import { canonicalCorner } from './creation/hexCorner';
import {
  addCellToRegion,
  addWallLine,
  buildWalkItYaml,
  clearPlacementFlag,
  clearRefDefault,
  connectRegions,
  createRegion,
  deletePlacement,
  deleteRegion,
  DungeonParseError,
  findRegionCellOverlap,
  movePlacement,
  movePlacementAcrossLists,
  parseDungeon,
  placeItem,
  RegionValidationError,
  removeCellFromRegion,
  removeWallLineAt,
  renameRegion,
  resolvePlacement,
  serializeDungeon,
  setBossFacing,
  setBossTargeting,
  setConnectorLocked,
  setEnd,
  setLightingAmbient,
  setPlacementFacing,
  setPlacementHeight,
  setPlacementMount,
  setPlacementRotationDegrees,
  setPlacementTargeting,
  setRefDefault,
  setRegionArchetype,
  setSpecVersion,
  setStart,
  setWallEdge,
  setWallLineEndpoint,
  stripMonsterPlacements,
  stripToV1Subset,
  toDungeonDoc,
  toggleHole,
  toggleWall,
  toggleWallKind,
  toggleWallLineDoorAt,
  validateRegionCells,
  WallEdgeValidationError,
  wallKindAtEdge,
} from './dungeonYaml';
import { SHOWCASE_YAML } from './fixtures';
import { cubeAtColRow } from './hexLayout';
import { OVERLAP_SAMPLE_CELLS } from './regionTree';

describe('parseDungeon', () => {
  it('parses showcase.yaml into the expected room chain', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    expect(doc.key).toBe('showcase');
    expect(doc.height).toBe(8);
    expect(doc.rooms.map((r) => r.id)).toEqual([
      'antechamber',
      'shrine',
      'vault',
    ]);
    expect(doc.rooms[2].boss).toEqual({
      ref: 'dnd5e:monsters:skeleton-captain',
      at: [5, 5],
      facing: null,
      targeting: null,
    });
    // 3 in antechamber's place: list, matching the source file exactly.
    expect(doc.rooms[0].place).toHaveLength(3);
    // showcase.yaml's own 2 connectors, neither locked.
    expect(doc.connectors).toEqual([
      { from: 'antechamber', to: 'shrine', locked: null },
      { from: 'shrine', to: 'vault', locked: null },
    ]);
  });

  it('flags monster refs and never reads flags off them', () => {
    // showcase.yaml's own place: lists are all props; confirm the flag via
    // a synthetic monster placement instead.
    const withMonster = SHOWCASE_YAML.replace(
      '- { ref: "dnd5e:props:brazier", at: [1, 1], blocks_movement: true, blocks_los: false }',
      '- { ref: "dnd5e:props:brazier", at: [1, 1], blocks_movement: true, blocks_los: false }\n      - { ref: "dnd5e:monsters:skeleton", at: [1, 2] }'
    );
    const { doc: doc2 } = parseDungeon(withMonster);
    const monster = doc2.rooms[0].place.find((p) => p.ref.includes('monsters'));
    expect(monster?.isMonster).toBe(true);
  });

  it('parses room-level obstacles: into the shape RolledContentPanel consumes', () => {
    // showcase.yaml has zero obstacles: entries (CONTRACT.md's "add real
    // rolled-content fixture coverage" note) — same synthetic-injection
    // approach as the monster-flag test just above, since the field is
    // real (dungeonYaml.ts's own RoomDoc.obstacles) but nothing recorded
    // happens to use it yet.
    const withObstacles = SHOWCASE_YAML.replace(
      '  - id: vault\n    archetype: boss',
      '  - id: vault\n    archetype: boss\n    obstacles:\n      - { ref: "dnd5e:hazards:rubble", count: 3 }\n      - { ref: "dnd5e:hazards:web", count: 1 }'
    );
    const { doc } = parseDungeon(withObstacles);
    const vault = doc.rooms.find((r) => r.id === 'vault');
    expect(vault?.obstacles).toEqual([
      { ref: 'dnd5e:hazards:rubble', count: 3 },
      { ref: 'dnd5e:hazards:web', count: 1 },
    ]);
    // and the two untouched rooms still parse to an empty list, not undefined
    expect(doc.rooms[0].obstacles).toEqual([]);
    expect(doc.rooms[1].obstacles).toEqual([]);
  });

  it('throws DungeonParseError on structurally invalid YAML', () => {
    expect(() => parseDungeon('key: only-a-key\n')).toThrow(DungeonParseError);
  });

  it('throws on genuinely malformed YAML syntax', () => {
    expect(() => parseDungeon('rooms: [this is not: valid')).toThrow(
      DungeonParseError
    );
  });
});

describe('emptyCanvasYaml seed — theme: crypt (rpg-project#194 authoring-robustness unit)', () => {
  it('stamps theme: crypt so a fresh "New Dungeon" canvas is never full-bright', () => {
    const { doc } = parseDungeon(emptyCanvasYaml(20, 30));
    expect(doc.theme).toBe('crypt');
  });
});

describe('shape validation at parse (rpg-project#194 authoring-robustness unit — "the YAML is always fixable")', () => {
  const base = () => emptyCanvasYaml(10, 10);

  describe('walls: — the incident repro (pasted wallLines-shaped objects, missing from/to)', () => {
    it('rejects an entry with no from/to at all, naming the entry and field', () => {
      const yaml = base().replace('walls: []', 'walls:\n  - { kind: solid }');
      expect(() => parseDungeon(yaml)).toThrow(DungeonParseError);
      expect(() => parseDungeon(yaml)).toThrow(/walls\[0\]\.from/);
    });

    it("rejects a wallLines-shaped from (Kirk's exact paste: {cell, corner} instead of [col, row])", () => {
      const yaml = base().replace(
        'walls: []',
        'walls:\n  - { from: { cell: [1, 1], corner: 0 }, to: [2, 2], kind: solid }'
      );
      expect(() => parseDungeon(yaml)).toThrow(/walls\[0\]\.from/);
    });

    it('rejects a from/to with non-numeric elements', () => {
      const yaml = base().replace(
        'walls: []',
        'walls:\n  - { from: ["a", 1], to: [2, 2] }'
      );
      expect(() => parseDungeon(yaml)).toThrow(/walls\[0\]\.from/);
    });

    it('rejects an invalid kind', () => {
      const yaml = base().replace(
        'walls: []',
        'walls:\n  - { from: [0, 0], to: [1, 0], kind: portcullis }'
      );
      expect(() => parseDungeon(yaml)).toThrow(/walls\[0\]\.kind/);
    });

    it('accepts a well-formed entry (positive control)', () => {
      const yaml = base().replace(
        'walls: []',
        'walls:\n  - { from: [0, 0], to: [1, 0], kind: door }'
      );
      const { doc } = parseDungeon(yaml);
      expect(doc.walls).toEqual([{ from: [0, 0], to: [1, 0], kind: 'door' }]);
    });
  });

  describe('wallLines:', () => {
    it('rejects a from with neither [col,row] nor {cell,corner} shape', () => {
      const yaml = base().replace(
        'wallLines: []',
        'wallLines:\n  - { from: "nope", to: [2, 2] }'
      );
      expect(() => parseDungeon(yaml)).toThrow(/wallLines\[0\]\.from/);
    });

    it('rejects a {cell, corner} endpoint whose cell is missing', () => {
      const yaml = base().replace(
        'wallLines: []',
        'wallLines:\n  - { from: { corner: 0 }, to: [2, 2] }'
      );
      expect(() => parseDungeon(yaml)).toThrow(/wallLines\[0\]\.from\.cell/);
    });

    it('rejects a malformed doors[].cell', () => {
      const yaml = base().replace(
        'wallLines: []',
        'wallLines:\n  - { from: [0, 0], to: [2, 0], doors: [{ cell: [1] }] }'
      );
      expect(() => parseDungeon(yaml)).toThrow(
        /wallLines\[0\]\.doors\[0\]\.cell/
      );
    });
  });

  describe('holes: / start: / end:', () => {
    it('rejects a malformed holes entry', () => {
      const yaml = base().replace('holes: []', 'holes:\n  - [1]');
      expect(() => parseDungeon(yaml)).toThrow(/holes\[0\]/);
    });

    it('rejects a present-but-malformed start', () => {
      const yaml = base().replace('start: null', 'start: "middle"');
      expect(() => parseDungeon(yaml)).toThrow(/^start:/);
    });

    it('rejects a present-but-malformed end', () => {
      const yaml = base().replace('end: null', 'end: [1]');
      expect(() => parseDungeon(yaml)).toThrow(/^end:/);
    });

    it('leaves start/end unset (not an error) when genuinely absent', () => {
      const { doc } = parseDungeon(base());
      expect(doc.start).toBeNull();
      expect(doc.end).toBeNull();
    });
  });

  describe('canvas: / lighting:', () => {
    it('rejects a non-numeric canvas width/height', () => {
      const yaml = base().replace(
        'canvas:\n  width: 10\n  height: 10',
        'canvas:\n  width: "10"\n  height: 10'
      );
      expect(() => parseDungeon(yaml)).toThrow(/^canvas:/);
    });

    it('rejects a non-numeric lighting.ambient', () => {
      const yaml = base().replace(
        'place: []',
        'place: []\nlighting:\n  ambient: "bright"'
      );
      expect(() => parseDungeon(yaml)).toThrow(/lighting\.ambient/);
    });
  });

  describe('connectors:', () => {
    it('rejects a connector missing from/to', () => {
      const yaml = SHOWCASE_YAML.replace(
        '- { from: antechamber, to: shrine }',
        '- { to: shrine }'
      );
      expect(() => parseDungeon(yaml)).toThrow(/connectors\[0\]/);
    });

    it('rejects a malformed locked: block', () => {
      const withBadLock = SHOWCASE_YAML.replace(
        '- { from: shrine, to: vault }',
        '- { from: shrine, to: vault, locked: { dc: "twelve", ability: dex } }'
      );
      expect(() => parseDungeon(withBadLock)).toThrow(
        /connectors\[\d+\]\.locked/
      );
    });
  });

  describe('place: (top-level and room-scoped)', () => {
    it('rejects a top-level place entry with a non-numeric at', () => {
      const yaml = base().replace(
        'place: []',
        'place:\n  - { ref: "dnd5e:props:crate", at: ["a", 1] }'
      );
      expect(() => parseDungeon(yaml)).toThrow(/place\[0\]\.at/);
    });

    it('rejects a room-scoped place entry missing ref', () => {
      const yaml = SHOWCASE_YAML.replace(
        '- { ref: "dnd5e:props:brazier", at: [1, 1], blocks_movement: true, blocks_los: false }',
        '- { at: [1, 1] }'
      );
      expect(() => parseDungeon(yaml)).toThrow(/place\[0\]/);
    });
  });

  describe('regions: cells', () => {
    it('rejects a malformed cell', () => {
      const yaml = base().replace(
        'place: []',
        'place: []\nregions:\n  - { id: r1, archetype: chamber, cells: [[1, 1], [2]] }'
      );
      expect(() => parseDungeon(yaml)).toThrow(/regions\[0\]\.cells\[1\]/);
    });
  });

  describe('boss: at', () => {
    it('rejects a malformed boss.at', () => {
      const yaml = SHOWCASE_YAML.replace(
        'boss: { ref: "dnd5e:monsters:skeleton-captain", at: [5, 5] }',
        'boss: { ref: "dnd5e:monsters:skeleton-captain", at: [5] }'
      );
      expect(() => parseDungeon(yaml)).toThrow(/boss\.at/);
    });
  });
});

describe('setConnectorLocked (door editing, rpg-dnd5e-web#667)', () => {
  it('adds a flow-style locked: block matching the real dungeonspec shape', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setConnectorLocked(cst, 0, { dc: 12, ability: 'dex' });
    const out = serializeDungeon(cst);
    expect(out).toContain(
      '- { from: antechamber, to: shrine, locked: { dc: 12, ability: dex } }'
    );
    const { doc } = parseDungeon(out);
    expect(doc.connectors[0]).toEqual({
      from: 'antechamber',
      to: 'shrine',
      locked: { dc: 12, ability: 'dex' },
    });
    // The untouched connector stays untouched.
    expect(doc.connectors[1].locked).toBeNull();
  });

  it('removes locked: entirely when set to null', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setConnectorLocked(cst, 0, { dc: 15, ability: 'str' });
    setConnectorLocked(cst, 0, null);
    const { doc } = parseDungeon(serializeDungeon(cst));
    expect(doc.connectors[0].locked).toBeNull();
  });
});

describe('stripMonsterPlacements / buildWalkItYaml (Walk it, rpg-dnd5e-web#667)', () => {
  // showcase.yaml itself has zero monster place: entries (only its vault
  // room's boss:) — inject a synthetic one, same technique the "flags
  // monster refs" test above uses, so there's something real to strip.
  const withMonster = SHOWCASE_YAML.replace(
    '- { ref: "dnd5e:props:brazier", at: [1, 1], blocks_movement: true, blocks_los: false }',
    '- { ref: "dnd5e:props:brazier", at: [1, 1], blocks_movement: true, blocks_los: false }\n      - { ref: "dnd5e:monsters:skeleton", at: [1, 2] }'
  );

  it('removes only monster place: entries — props and boss: survive', () => {
    const { cst, doc: before } = parseDungeon(withMonster);
    expect(before.rooms[0].place.some((p) => p.isMonster)).toBe(true);

    stripMonsterPlacements(cst);
    const after = toDungeonDoc(cst);

    expect(after.rooms[0].place.some((p) => p.isMonster)).toBe(false);
    expect(
      after.rooms[0].place.some((p) => p.ref === 'dnd5e:props:brazier')
    ).toBe(true);
    // The boss-archetype room's boss: is untouched — dungeonspec requires
    // exactly one boss per boss-archetype room (validateBossCardinality);
    // stripMonsterPlacements only ever touches place: lists.
    expect(after.rooms[2].boss).toEqual({
      ref: 'dnd5e:monsters:skeleton-captain',
      at: [5, 5],
      facing: null,
      targeting: null,
    });
  });

  it('buildWalkItYaml renames the key and strips monsters from a FRESH parse', () => {
    const walkYaml = buildWalkItYaml(withMonster, 'showcase-walk');
    const { doc } = parseDungeon(walkYaml);

    expect(doc.key).toBe('showcase-walk');
    expect(doc.rooms.every((r) => r.place.every((p) => !p.isMonster))).toBe(
      true
    );
    expect(doc.rooms[2].boss).toEqual({
      ref: 'dnd5e:monsters:skeleton-captain',
      at: [5, 5],
      facing: null,
      targeting: null,
    });

    // The input text itself is untouched — buildWalkItYaml parses its own
    // CST rather than mutating a CST the caller might still be using for
    // the live board.
    const { doc: reparsedOriginal } = parseDungeon(withMonster);
    expect(reparsedOriginal.key).toBe('showcase');
    expect(reparsedOriginal.rooms[0].place.some((p) => p.isMonster)).toBe(true);
  });
});

describe('serializeDungeon round-trip', () => {
  it('is byte-stable on a no-op round trip against the real fixture on disk', () => {
    // Read the actual file, not the embedded copy, so this test catches
    // fixtures.ts drifting from the source of truth too.
    const realPath = join(
      __dirname,
      '../../../../dungeon-content/showcase.yaml'
    );
    let real: string;
    try {
      real = readFileSync(realPath, 'utf8');
    } catch {
      // Not every checkout has the sibling game-dev workspace present
      // (e.g. CI) — fall back to the embedded copy, which is the same
      // content pinned at build time.
      real = SHOWCASE_YAML;
    }
    const { cst } = parseDungeon(real);
    const out = serializeDungeon(cst);
    // Documented residual gap (dungeonYaml.ts's own doc comment): flow
    // sequences round-trip with internal padding ("[ 1, 1 ]") the source
    // file doesn't have ("[1, 1]"). Normalize only that one, single-space
    // difference before asserting byte-stability, so this test still
    // catches any OTHER drift (reflowed blocks, dropped comments, field
    // reordering) as a real failure.
    const normalize = (s: string) =>
      s.replace(/\[ (-?\d+), (-?\d+) \]/g, '[$1, $2]');
    expect(normalize(out)).toBe(normalize(real));
  });

  it('preserves a comment through a no-op parse/serialize cycle', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    const out = serializeDungeon(cst);
    expect(out).toContain(
      '# colonnade: 8 pillars framing the center lane (rows 3-5 clear)'
    );
  });
});

describe('board-driven edits', () => {
  it('placeItem adds a flow-style entry matching the source style', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    placeItem(cst, 'antechamber', 'dnd5e:props:brazier', [3, 2]);
    const out = serializeDungeon(cst);
    expect(out).toContain(
      '{ ref: "dnd5e:props:brazier", at: [ 3, 2 ], blocks_movement: false, blocks_los: false }'
    );
  });

  it('placeItem never writes blocks_movement/blocks_los for a monster ref', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    placeItem(cst, 'antechamber', 'dnd5e:monsters:skeleton', [3, 3]);
    const out = serializeDungeon(cst);
    expect(out).toContain('{ ref: "dnd5e:monsters:skeleton", at: [ 3, 3 ] }');
    expect(out).not.toMatch(/monsters:skeleton.*blocks_movement/);
  });

  it('movePlacement mutates in place and keeps an attached comment', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    // shrine's pillar[0] (index 2 in the room's place list) carries the
    // "colonnade" comment (see fixtures.ts / CONTRACT.md).
    const pillarIndex = doc.rooms[1].place.findIndex(
      (p) => p.ref === 'dnd5e:props:pillar' && p.at[0] === 2 && p.at[1] === 2
    );
    movePlacement(cst, 'shrine', pillarIndex, [3, 2]);
    const out = serializeDungeon(cst);
    expect(out).toContain(
      '# colonnade: 8 pillars framing the center lane (rows 3-5 clear)'
    );
    expect(out).toContain('at: [ 3, 2 ]');
  });

  it('deletePlacement on a comment-carrying item silently drops the comment too — CONTRACT.md finding, confirmed here', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    const pillarIndex = doc.rooms[1].place.findIndex(
      (p) => p.ref === 'dnd5e:props:pillar' && p.at[0] === 2 && p.at[1] === 2
    );
    deletePlacement(cst, 'shrine', pillarIndex);
    const out = serializeDungeon(cst);
    // The other 7 pillars remain, but the heading that described all 8 is gone.
    expect(out).not.toContain('# colonnade: 8 pillars');
    expect(out).toContain('dnd5e:props:pillar", at: [ 4, 2 ]');
  });

  it('movePlacementAcrossLists preserves every field, not just ref/at — 2026-08-02 graduation-audit fix', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    // Build a fully-loaded placement first, via the real mutators, so
    // this test proves preservation of every field a placement can
    // carry — the old delete+placeItem shape only ever kept ref+at,
    // silently dropping the rest.
    placeItem(cst, 'shrine', 'dnd5e:props:wall-banner', [1, 2]);
    const afterPlace = toDungeonDoc(cst);
    const shrineIndex =
      afterPlace.rooms.find((r) => r.id === 'shrine')!.place.length - 1;
    setPlacementFacing(cst, 'shrine', shrineIndex, 1); // NE
    setPlacementMount(cst, 'shrine', shrineIndex, 'wall');
    setPlacementHeight(cst, 'shrine', shrineIndex, 2.5);
    setPlacementRotationDegrees(cst, 'shrine', shrineIndex, 15);
    setPlacementTargeting(
      cst,
      'shrine',
      shrineIndex,
      'dnd5e:targeting:nearest'
    );

    const docBefore = toDungeonDoc(cst);
    const item = docBefore.rooms.find((r) => r.id === 'shrine')!.place[
      shrineIndex
    ];
    expect(item).toMatchObject({
      facing: 1,
      mount: 'wall',
      height: 2.5,
      rotationDegrees: 15,
      targeting: 'dnd5e:targeting:nearest',
    });

    // Cross-list move: room-scoped (shrine) -> top-level (roomId: null).
    const newIndex = movePlacementAcrossLists(
      cst,
      'shrine',
      shrineIndex,
      null,
      [20, 3],
      item
    );

    const docAfter = toDungeonDoc(cst);
    const moved = docAfter.place[newIndex];
    expect(moved).toMatchObject({
      ref: 'dnd5e:props:wall-banner',
      at: [20, 3],
      facing: 1,
      mount: 'wall',
      height: 2.5,
      rotationDegrees: 15,
      targeting: 'dnd5e:targeting:nearest',
      blocksMovement: false,
      blocksLos: false,
    });
  });

  it('movePlacementAcrossLists returns the correct new index for a roomId: null destination — the exact case the old `.find(...)!.place.length` crashed on (no room has id null)', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    const pillarIndex = doc.rooms[1].place.findIndex(
      (p) => p.ref === 'dnd5e:props:pillar' && p.at[0] === 2 && p.at[1] === 2
    );
    const item = doc.rooms[1].place[pillarIndex];
    const newIndex = movePlacementAcrossLists(
      cst,
      'shrine',
      pillarIndex,
      null,
      [25, 1],
      item
    );
    const after = toDungeonDoc(cst);
    expect(after.place[newIndex]).toMatchObject({
      ref: 'dnd5e:props:pillar',
      at: [25, 1],
    });
  });
});

describe('target-dialect fields (TARGET-YAML.md, rpg-dnd5e-web#667)', () => {
  it('parses a pure v1 document with every target-dialect field absent/null/empty', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    expect(doc.canvas).toBeNull();
    expect(doc.walls).toEqual([]);
    expect(doc.holes).toEqual([]);
    expect(doc.start).toBeNull();
    expect(doc.end).toBeNull();
    expect(doc.lighting).toBeNull();
    expect(doc.rooms[0].place[0].facing).toBeNull();
    expect(doc.rooms[0].place[0].mount).toBe('floor');
    expect(doc.rooms[0].place[0].height).toBeNull();
    expect(doc.rooms[0].place[0].rotationDegrees).toBeNull();
    expect(doc.rooms[0].place[0].targeting).toBeNull();
    expect(doc.rooms[2].boss?.targeting).toBeNull();
  });

  describe('edge-native wall adjacency', () => {
    const hexDistanceBetween = (
      from: [number, number],
      to: [number, number]
    ): number =>
      hexDistance(cubeAtColRow(from[0], from[1]), cubeAtColRow(to[0], to[1]));

    const originalInvalidKitchenSinkEdges: ReadonlyArray<{
      label: string;
      from: [number, number];
      to: [number, number];
    }> = [
      {
        label: 'odd-column solid edge',
        from: [7, 1],
        to: [8, 0],
      },
      {
        label: 'odd-column door edge',
        from: [7, 3],
        to: [8, 2],
      },
    ];

    it.each(originalInvalidKitchenSinkEdges)(
      'rejects the original non-adjacent Kitchen Sink $label',
      ({ from, to }) => {
        // Use the real odd-q conversion rather than inferring adjacency
        // from row/column deltas: both historical pairs are distance 2.
        expect(hexDistanceBetween(from, to)).toBe(2);
        const { cst } = parseDungeon(SHOWCASE_YAML);

        expect(() => setWallEdge(cst, from, to, 'solid', true)).toThrow(
          WallEdgeValidationError
        );
        expect(toDungeonDoc(cst).walls).toEqual([]);
      }
    );

    const validEdges: ReadonlyArray<{
      label: string;
      from: [number, number];
      to: [number, number];
      kind: 'solid' | 'door';
    }> = [
      // Kitchen Sink: odd-column origin to its real even-column neighbor.
      {
        label: 'corrected odd-column Kitchen Sink solid edge',
        from: [7, 1],
        to: [8, 1],
        kind: 'solid',
      },
      {
        label: 'corrected odd-column Kitchen Sink door edge',
        from: [7, 3],
        to: [8, 3],
        kind: 'door',
      },
      // Blank-canvas specimen: exercise the even-column parity and the
      // other valid real-hex edge directions its real mutator emits.
      {
        label: 'canvas diagonal edge from an even column',
        from: [4, 4],
        to: [5, 3],
        kind: 'solid',
      },
      {
        label: 'canvas same-column edge',
        from: [4, 4],
        to: [4, 5],
        kind: 'solid',
      },
      {
        label: 'canvas diagonal door edge from an odd column',
        from: [5, 3],
        to: [6, 4],
        kind: 'door',
      },
    ];

    it.each(validEdges)(
      'accepts each real hex $label',
      ({ from, to, kind }) => {
        expect(hexDistanceBetween(from, to)).toBe(1);
        const { cst } = parseDungeon(SHOWCASE_YAML);

        setWallEdge(cst, from, to, kind, true);
        expect(toDungeonDoc(cst).walls).toEqual([{ from, to, kind }]);
      }
    );

    it('keeps the generated Kitchen Sink YAML on real shared edges', () => {
      const { doc } = parseDungeon(
        readFileSync(join(__dirname, 'specimens', 'kitchen-sink.yaml'), 'utf8')
      );
      expect(doc.walls.slice(0, 2)).toEqual([
        { from: [7, 1], to: [8, 1], kind: 'solid' },
        { from: [7, 3], to: [8, 3], kind: 'door' },
      ]);
      for (const wall of doc.walls) {
        expect(hexDistanceBetween(wall.from, wall.to)).toBe(1);
      }
    });

    it('keeps valid setWallEdge add, kind-update, and removal semantics', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      const from: [number, number] = [7, 1];
      const to: [number, number] = [8, 1];

      setWallEdge(cst, from, to, 'solid', true);
      setWallEdge(cst, from, to, 'door', true);
      expect(toDungeonDoc(cst).walls).toEqual([{ from, to, kind: 'door' }]);

      setWallEdge(cst, from, to, 'solid', false);
      expect(toDungeonDoc(cst).walls).toEqual([]);
    });

    it('parses legacy hand-authored non-adjacent walls losslessly and still lets the model remove them', () => {
      const { cst } = parseDungeon(
        `${SHOWCASE_YAML}\nwalls:\n  - { from: [7, 1], to: [8, 0], kind: solid }\n`
      );
      expect(hexDistanceBetween([7, 1], [8, 0])).toBe(2);
      // Parsing does not reject or repair a malformed edge — it round-trips
      // exactly as authored. Nothing downstream currently re-checks it
      // either: `walls:` is target-dialect-only, so `stripToV1Subset`
      // drops this entry before any real preview/Save & Play call, and the
      // released PutDungeon API neither accepts nor validates it today.
      // Direct, strict server-side validation of authored edges becomes
      // authoritative only once rpg-toolkit#881 and rpg-api#768 land.
      expect(toDungeonDoc(cst).walls).toEqual([
        { from: [7, 1], to: [8, 0], kind: 'solid' },
      ]);

      // A caller can still clear a legacy malformed entry without being
      // trapped by the model-side add/update guard (which only applies to
      // `on: true`).
      expect(() =>
        setWallEdge(cst, [7, 1], [8, 0], 'solid', false)
      ).not.toThrow();
      expect(toDungeonDoc(cst).walls).toEqual([]);
    });
  });

  it('toggleWall adds a solid wall, then removes it on a second toggle', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    toggleWall(cst, 7, 0);
    let doc = toDungeonDoc(cst);
    expect(doc.walls).toEqual([{ from: [7, 0], to: [7, 1], kind: 'solid' }]);
    // The `yaml` library pads flow sequences (`[ 7, 0 ]`, not `[7, 0]`) —
    // this file's own known residual round-trip gap, see its top-of-file
    // doc comment.
    expect(serializeDungeon(cst)).toContain(
      'walls:\n  - { from: [ 7, 0 ], to: [ 7, 1 ], kind: solid }'
    );

    toggleWall(cst, 7, 0);
    doc = toDungeonDoc(cst);
    expect(doc.walls).toEqual([]);
  });

  it('toggleWallKind flips solid<->door on an existing wall, no-ops with none there', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    expect(toggleWallKind(cst, 3, 3)).toBe(false); // nothing there yet
    expect(toDungeonDoc(cst).walls).toEqual([]);

    toggleWall(cst, 3, 3);
    expect(toggleWallKind(cst, 3, 3)).toBe(true);
    expect(toDungeonDoc(cst).walls[0].kind).toBe('door');
    toggleWallKind(cst, 3, 3);
    expect(toDungeonDoc(cst).walls[0].kind).toBe('solid');
  });

  it('toggleWall/toggleWallKind never touch a wall on a DIFFERENT edge that merely shares the same `from` cell (wallIndexAt/wallIndexAtEdge reconciliation)', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    // A creation-mode-style wall on cell (7,0)'s OTHER edge — same `from`
    // cell edit mode's Wall tool would use at (7,0), but a different `to`
    // ([8,0] instead of [7,1]). Before the reconciliation this was
    // reachable and deletable by clicking cell (7,0) with edit mode's
    // Wall tool, since the old from-cell-only lookup didn't check `to`.
    setWallEdge(cst, [7, 0], [8, 0], 'solid', true);
    expect(wallKindAtEdge(cst, [7, 0], [8, 0])).toBe('solid');

    // toggleWall on the SAME (7,0) cell must ADD a new wall on edit
    // mode's own (7,0)->(7,1) edge, not touch the [7,0]->[8,0] one.
    toggleWall(cst, 7, 0);
    expect(toDungeonDoc(cst).walls).toEqual([
      { from: [7, 0], to: [8, 0], kind: 'solid' },
      { from: [7, 0], to: [7, 1], kind: 'solid' },
    ]);

    // toggleWallKind on (7,0) must flip ONLY the (7,0)->(7,1) wall.
    expect(toggleWallKind(cst, 7, 0)).toBe(true);
    expect(wallKindAtEdge(cst, [7, 0], [7, 1])).toBe('door');
    expect(wallKindAtEdge(cst, [7, 0], [8, 0])).toBe('solid'); // untouched

    // A second toggleWall on (7,0) must remove ONLY the (7,0)->(7,1)
    // wall, leaving the [7,0]->[8,0] wall standing.
    toggleWall(cst, 7, 0);
    expect(toDungeonDoc(cst).walls).toEqual([
      { from: [7, 0], to: [8, 0], kind: 'solid' },
    ]);
  });

  describe('wallLines: corner-anchored straight walls (rpg-project#169, follow-up "corner-anchored straight walls + line doors" unit)', () => {
    // Canonicalized up front: addWallLine/setWallLineEndpoint both
    // canonicalize on write (see their own doc comments), so a fixture
    // built from a NON-canonical corner ref would round-trip to a
    // different (but physically identical) representation than it was
    // authored with — see this describe block's own dedicated
    // "canonicalizing a non-canonical input" tests for that behavior
    // demonstrated directly.
    const A = canonicalCorner({ cell: [4, 4], corner: 0 });
    const B = canonicalCorner({ cell: [6, 1], corner: 3 });

    it('addWallLine appends a corner-anchored, door-free entry; removeWallLineAt removes it by index', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      addWallLine(cst, A, B);
      let doc = toDungeonDoc(cst);
      expect(doc.wallLines).toEqual([{ from: A, to: B, doors: [] }]);
      // Padded flow sequences again — this file's own known residual
      // round-trip gap (see its top-of-file doc comment), same as the
      // `walls:` toggleWall test above. `B` canonicalizes to a DIFFERENT
      // owner cell than the [6,1] it was defined from (see this describe
      // block's own note on `A`/`B` above) — the serialized text reflects
      // that canonical form, not the literal cell the test constant was
      // written against.
      expect(serializeDungeon(cst)).toContain(
        `wallLines:\n  - { from: { cell: [ ${A.cell[0]}, ${A.cell[1]} ], corner: ${A.corner} }, to: { cell: [ ${B.cell[0]}, ${B.cell[1]} ], corner: ${B.corner} } }`
      );

      removeWallLineAt(cst, 0);
      doc = toDungeonDoc(cst);
      expect(doc.wallLines).toEqual([]);
    });

    it('removeWallLineAt is a no-op on an out-of-range index', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      addWallLine(cst, A, B);
      expect(() => removeWallLineAt(cst, 5)).not.toThrow();
      expect(() => removeWallLineAt(cst, -1)).not.toThrow();
      expect(toDungeonDoc(cst).wallLines).toHaveLength(1);
    });

    it('removeWallLineAt removes exactly the targeted line — its own doors go with it, a second line is untouched (rpg-project#169, delete-affordance follow-up)', () => {
      // Kirk's own ask this test exists for: "gonna need a way to delete
      // a wall... had a small section with no way to remove it" — the
      // UI-reachability gap was in CreationBoard.tsx (a delete button was
      // missing); this mutator itself already removed doors correctly by
      // construction (`doors:` lives NESTED inside the wallLine's own CST
      // node, so splicing the whole entry out can't leave one stranded) —
      // asserted directly here rather than just trusted.
      const C = canonicalCorner({ cell: [0, 3], corner: 0 });
      const D = canonicalCorner({ cell: [10, 8], corner: 3 });
      const { cst } = parseDungeon(SHOWCASE_YAML);
      addWallLine(cst, A, B);
      addWallLine(cst, C, D);
      toggleWallLineDoorAt(cst, 0, [5, 2]);
      expect(toDungeonDoc(cst).wallLines[0].doors).toEqual([{ cell: [5, 2] }]);

      removeWallLineAt(cst, 0);
      const doc = toDungeonDoc(cst);
      // The SECOND line (C, D) survives untouched, now at index 0 — a
      // real "exactly the targeted line" check, not just "count went
      // down by one."
      expect(doc.wallLines).toEqual([{ from: C, to: D, doors: [] }]);
      // Round-trips through the serialized YAML text too, not just the
      // in-memory doc — no stranded `doors:` fragment left behind.
      expect(serializeDungeon(cst)).not.toContain('doors:');
    });

    it('setWallLineEndpoint overwrites one end in place, canonicalizing the new corner', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      addWallLine(cst, A, B);
      // (5,5)#1 is NOT its own canonical form (canonicalizes to (5,4)#5 —
      // see hexCorner.test.ts) — setWallLineEndpoint must store the
      // canonical form regardless of what the caller passed in.
      setWallLineEndpoint(cst, 0, 'to', { cell: [5, 5], corner: 1 });
      expect(toDungeonDoc(cst).wallLines[0]).toEqual({
        from: A,
        to: { cell: [5, 4], corner: 5 },
        doors: [],
      });
      // The other end is untouched by an endpoint-drag commit.
      expect(toDungeonDoc(cst).wallLines[0].from).toEqual(A);
    });

    it('setWallLineEndpoint is a no-op on an out-of-range index', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      addWallLine(cst, A, B);
      expect(() =>
        setWallLineEndpoint(cst, 5, 'to', { cell: [0, 0], corner: 0 })
      ).not.toThrow();
      expect(toDungeonDoc(cst).wallLines[0]).toEqual({
        from: A,
        to: B,
        doors: [],
      });
    });

    it('toggleWallLineDoorAt adds a door at a cell, then removes it on a second call', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      addWallLine(cst, A, B);
      toggleWallLineDoorAt(cst, 0, [5, 2]);
      expect(toDungeonDoc(cst).wallLines[0].doors).toEqual([{ cell: [5, 2] }]);

      toggleWallLineDoorAt(cst, 0, [5, 2]);
      expect(toDungeonDoc(cst).wallLines[0].doors).toEqual([]);
      // An emptied doors: list is deleted, not left as doors: [] — see
      // the function's own doc comment.
      expect(serializeDungeon(cst)).not.toContain('doors:');
    });

    it('toggleWallLineDoorAt supports more than one door on the same line', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      addWallLine(cst, A, B);
      toggleWallLineDoorAt(cst, 0, [5, 2]);
      toggleWallLineDoorAt(cst, 0, [4, 4]);
      expect(toDungeonDoc(cst).wallLines[0].doors).toEqual(
        expect.arrayContaining([{ cell: [5, 2] }, { cell: [4, 4] }])
      );
      expect(toDungeonDoc(cst).wallLines[0].doors).toHaveLength(2);
    });

    it('toggleWallLineDoorAt is a no-op on an out-of-range line index', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      addWallLine(cst, A, B);
      expect(() => toggleWallLineDoorAt(cst, 5, [5, 2])).not.toThrow();
      expect(toDungeonDoc(cst).wallLines[0].doors).toEqual([]);
    });

    it('multiple straight walls keep independent from/to/doors, round-tripped through YAML text', () => {
      // Canonicalized up front — see this describe block's own note on
      // the `A`/`B` constants above for why a non-canonical literal
      // wouldn't round-trip to itself.
      const C = canonicalCorner({ cell: [0, 3], corner: 0 });
      const D = canonicalCorner({ cell: [10, 8], corner: 3 });
      const { cst } = parseDungeon(SHOWCASE_YAML);
      addWallLine(cst, A, B);
      addWallLine(cst, C, D);
      toggleWallLineDoorAt(cst, 1, [5, 5]);
      const reparsed = parseDungeon(serializeDungeon(cst));
      expect(reparsed.doc.wallLines).toEqual([
        { from: A, to: B, doors: [] },
        { from: C, to: D, doors: [{ cell: [5, 5] }] },
      ]);
    });

    describe('migrating a PRE-corner-anchoring document (legacy [col,row] endpoints)', () => {
      it('self-heals a bare-cell wallLines entry into a corner-anchored one on parse', () => {
        const { doc } = parseDungeon(
          `${SHOWCASE_YAML}\nwallLines:\n  - { from: [4, 4], to: [6, 1], kind: solid }\n`
        );
        expect(doc.wallLines).toHaveLength(1);
        const line = doc.wallLines[0];
        // Migrated endpoints resolve to one of (4,4)'s / (6,1)'s own real
        // corners — not the cell centers the legacy shape used.
        expect(line.from.cell).toEqual(
          expect.arrayContaining([expect.any(Number), expect.any(Number)])
        );
        expect(typeof line.from.corner).toBe('number');
        expect(typeof line.to.corner).toBe('number');
        expect(line.doors).toEqual([]);
      });

      it('a legacy whole-line kind: door materializes into a single midpoint door', () => {
        const { doc } = parseDungeon(
          `${SHOWCASE_YAML}\nwallLines:\n  - { from: [2, 5], to: [10, 5], kind: door }\n`
        );
        expect(doc.wallLines).toHaveLength(1);
        expect(doc.wallLines[0].doors).toHaveLength(1);
      });

      it('a bare re-serialize (no edits) keeps the migrated line’s ORIGINAL legacy text untouched', () => {
        // Migration heals the in-memory `doc`, not the CST by itself —
        // per this file's own CST-preservation discipline, content
        // nothing has explicitly mutated is never silently rewritten.
        // See parseWallLineEndpoint's own doc comment.
        const { cst } = parseDungeon(
          `${SHOWCASE_YAML}\nwallLines:\n  - { from: [4, 4], to: [6, 1], kind: solid }\n`
        );
        const text = serializeDungeon(cst);
        expect(text).toContain(
          'wallLines:\n  - { from: [ 4, 4 ], to: [ 6, 1 ], kind: solid }'
        );
      });

      it('a mutator touching just ONE endpoint of a migrated line converges BOTH endpoints and drops kind:', () => {
        // The interesting case: setWallLineEndpoint only asks to change
        // 'from', but normalizeWallLineItem (called first, inside every
        // mutator that touches an existing entry) migrates the WHOLE
        // entry — 'to' converges too, and the now-meaningless legacy
        // `kind:` key is dropped — rather than leaving a half-migrated
        // entry (one corner-anchored endpoint, one still bare-[c,r], a
        // dangling kind: key nothing reads anymore).
        const { cst, doc } = parseDungeon(
          `${SHOWCASE_YAML}\nwallLines:\n  - { from: [4, 4], to: [6, 1], kind: solid }\n`
        );
        // Commits the SAME endpoint an endpoint-drag would (using the
        // already-migrated doc's own corner as the "new" value), to
        // isolate this test to the shape-rewrite behavior rather than an
        // actual position change.
        setWallLineEndpoint(cst, 0, 'from', doc.wallLines[0].from);
        const text = serializeDungeon(cst);
        expect(text).toContain('cell: [');
        expect(text).not.toContain('kind: solid');
        expect(text).not.toMatch(/to: \[ 6, 1 \]/);
        // The re-parsed doc's 'to' end still addresses the identical
        // real-world corner it did before — only its representation
        // shape changed (bare `[6,1]` -> `{cell,corner}`), not the
        // geometry itself.
        expect(toDungeonDoc(cst).wallLines[0].to).toEqual(doc.wallLines[0].to);
      });
    });

    it('stripToV1Subset drops wallLines: entirely, reported separately from walls:', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      toggleWall(cst, 7, 0); // one edge wall
      addWallLine(cst, A, B); // one straight wall
      addWallLine(
        cst,
        { cell: [0, 3], corner: 0 },
        { cell: [10, 8], corner: 3 }
      ); // a second straight wall

      const result = stripToV1Subset(serializeDungeon(cst));
      expect(result.dropped).toEqual(
        expect.arrayContaining(['1 wall', '2 straight walls'])
      );
      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.wallLines).toEqual([]);
      // The real edge wall's own drop is untouched by this addition.
      expect(stripped.walls).toEqual([]);
    });

    it('a document with only wallLines: (no edge walls) reports just the straight-wall count', () => {
      // SHOWCASE_YAML is already confirmed pure-v1 (this describe block's
      // sibling test above), so adding exactly one straight wall and
      // nothing else should produce exactly this one dropped entry — no
      // separate "N walls" (edge-wall) entry alongside it.
      const { cst } = parseDungeon(SHOWCASE_YAML);
      addWallLine(cst, A, B);
      const result = stripToV1Subset(serializeDungeon(cst));
      expect(result.dropped).toEqual(['1 straight wall']);
    });
  });

  it('toggleHole adds then removes a hole', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    toggleHole(cst, 3, 6);
    toggleHole(cst, 3, 7);
    expect(toDungeonDoc(cst).holes).toEqual([
      [3, 6],
      [3, 7],
    ]);
    toggleHole(cst, 3, 6);
    expect(toDungeonDoc(cst).holes).toEqual([[3, 7]]);
  });

  it('setStart/setEnd write and clear flow-style [c,r] pairs', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setStart(cst, [0, 4]);
    setEnd(cst, [19, 25]);
    let doc = toDungeonDoc(cst);
    expect(doc.start).toEqual([0, 4]);
    expect(doc.end).toEqual([19, 25]);
    // Padded flow sequences again — see the toggleWall test's own note.
    expect(serializeDungeon(cst)).toContain('start: [ 0, 4 ]');
    expect(serializeDungeon(cst)).toContain('end: [ 19, 25 ]');

    setStart(cst, null);
    doc = toDungeonDoc(cst);
    expect(doc.start).toBeNull();
    expect(doc.end).toEqual([19, 25]); // untouched
  });

  it('setLightingAmbient writes and clears the lighting: block', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setLightingAmbient(cst, 0.8);
    expect(toDungeonDoc(cst).lighting).toEqual({ ambient: 0.8 });
    setLightingAmbient(cst, 0.5);
    expect(toDungeonDoc(cst).lighting).toEqual({ ambient: 0.5 }); // update in place
    setLightingAmbient(cst, null);
    expect(toDungeonDoc(cst).lighting).toBeNull();
  });

  it('setPlacementFacing / setBossFacing write real HEX_FACING_LABELS strings', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    setPlacementFacing(cst, 'antechamber', 0, 5); // index 5 = 'SE'
    expect(toDungeonDoc(cst).rooms[0].place[0].facing).toBe(5);
    expect(serializeDungeon(cst)).toContain('facing: SE');

    const bossRoomId = doc.rooms[2].id;
    setBossFacing(cst, bossRoomId, 3); // index 3 = 'W'
    expect(toDungeonDoc(cst).rooms[2].boss?.facing).toBe(3);

    setPlacementFacing(cst, 'antechamber', 0, null);
    expect(toDungeonDoc(cst).rooms[0].place[0].facing).toBeNull();
  });

  it('setPlacementMount sets/clears mount: alone, independent of height', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setPlacementMount(cst, 'antechamber', 0, 'wall');
    const placed = toDungeonDoc(cst).rooms[0].place[0];
    expect(placed.mount).toBe('wall');
    expect(placed.height).toBeNull(); // mount alone never sets height
    expect(serializeDungeon(cst)).toContain('mount: wall');

    setPlacementMount(cst, 'antechamber', 0, 'floor');
    const cleared = toDungeonDoc(cst).rooms[0].place[0];
    expect(cleared.mount).toBe('floor');
    // `mount:` only ever appears on a wall-mounted placement — a clean
    // string check.
    expect(serializeDungeon(cst)).not.toContain('mount:');
  });

  it('setPlacementHeight is DECOUPLED from mount (Kirk-batch, 2026-08-02) — sets/clears height: independently, on a floor-standing placement too', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    // Floor-standing (mount stays 'floor') but floating -- the exact
    // "floating candle" shape the decoupling exists for.
    setPlacementHeight(cst, 'antechamber', 0, 0.5);
    const floating = toDungeonDoc(cst).rooms[0].place[0];
    expect(floating.mount).toBe('floor');
    expect(floating.height).toBe(0.5);
    expect(serializeDungeon(cst)).toContain('height: 0.5');
    expect(serializeDungeon(cst)).not.toContain('mount:');

    // Setting mount afterward does not disturb the independently-set
    // height, and clearing mount does not clear height either --
    // genuine independence, not just independent setters that still
    // secretly interact.
    setPlacementMount(cst, 'antechamber', 0, 'wall');
    expect(toDungeonDoc(cst).rooms[0].place[0].height).toBe(0.5);
    setPlacementMount(cst, 'antechamber', 0, 'floor');
    expect(toDungeonDoc(cst).rooms[0].place[0].height).toBe(0.5);

    setPlacementHeight(cst, 'antechamber', 0, null);
    expect(toDungeonDoc(cst).rooms[0].place[0].height).toBeNull();
  });

  it('setPlacementRotationDegrees writes a rotate_degrees: key, clears on null AND on 0 (a 0° nudge and no nudge render identically)', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setPlacementRotationDegrees(cst, 'antechamber', 0, 12);
    expect(toDungeonDoc(cst).rooms[0].place[0].rotationDegrees).toBe(12);
    expect(serializeDungeon(cst)).toContain('rotate_degrees: 12');

    setPlacementRotationDegrees(cst, 'antechamber', 0, 0);
    expect(toDungeonDoc(cst).rooms[0].place[0].rotationDegrees).toBeNull();
    expect(serializeDungeon(cst)).not.toContain('rotate_degrees');

    setPlacementRotationDegrees(cst, 'antechamber', 0, -8);
    expect(toDungeonDoc(cst).rooms[0].place[0].rotationDegrees).toBe(-8);
    setPlacementRotationDegrees(cst, 'antechamber', 0, null);
    expect(toDungeonDoc(cst).rooms[0].place[0].rotationDegrees).toBeNull();
    expect(serializeDungeon(cst)).not.toContain('rotate_degrees');
  });

  it('setPlacementTargeting / setBossTargeting write/clear a targeting: key', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    setPlacementTargeting(cst, 'antechamber', 0, 'lowest-health');
    expect(toDungeonDoc(cst).rooms[0].place[0].targeting).toBe('lowest-health');

    const bossRoomId = doc.rooms[2].id;
    setBossTargeting(cst, bossRoomId, 'closest');
    expect(toDungeonDoc(cst).rooms[2].boss?.targeting).toBe('closest');

    setPlacementTargeting(cst, 'antechamber', 0, null);
    expect(toDungeonDoc(cst).rooms[0].place[0].targeting).toBeNull();
  });

  describe('spec: version marker (local-drafts unit)', () => {
    it('parses a declared spec: value', () => {
      const yaml = `version: 1
spec: "0.3"
key: foo
name: "Foo"
height: 8
rooms: []
connectors: []
`;
      expect(parseDungeon(yaml).doc.spec).toBe('0.3');
    });

    it('is null when undeclared — not an error', () => {
      const { doc } = parseDungeon(SHOWCASE_YAML);
      expect(doc.spec).toBeNull();
    });

    it('setSpecVersion writes the key, round-tripping through serialize/parse', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      setSpecVersion(cst, '0.3');
      const { doc } = parseDungeon(serializeDungeon(cst));
      expect(doc.spec).toBe('0.3');
    });

    it('setSpecVersion(cst, null) removes a previously-set key', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      setSpecVersion(cst, '0.3');
      setSpecVersion(cst, null);
      const { doc } = parseDungeon(serializeDungeon(cst));
      expect(doc.spec).toBeNull();
    });

    it("New Dungeon's seed template declares spec: 0.3 — honest by construction (only canvas:/top-level place: populated)", () => {
      const { doc } = parseDungeon(emptyCanvasYaml(20, 30));
      expect(doc.spec).toBe('0.3');
    });

    it('stripToV1Subset deletes spec: unconditionally — pure client metadata, never sent to the real server', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      setSpecVersion(cst, '0.3');
      const result = stripToV1Subset(serializeDungeon(cst));
      expect(result.yaml).not.toMatch(/^spec:/m);
      // Never counted in dropped/compiling — same treatment as version:
      // itself (see stripToV1Subset's own comment on this field).
      expect(result.dropped).toEqual([]);
      expect(result.compiling).toEqual([]);
    });

    it('stripToV1Subset deletes an undeclared spec: the same way — nothing to delete is a no-op, not an error', () => {
      const result = stripToV1Subset(SHOWCASE_YAML);
      expect(result.yaml).not.toMatch(/^spec:/m);
    });
  });

  describe('stripToV1Subset', () => {
    it('is a no-op (besides key/dropped) on an already-pure-v1 document', () => {
      const result = stripToV1Subset(SHOWCASE_YAML);
      expect(result.dropped).toEqual([]);
      expect(result.compilable).toBe(true);
      const { doc } = parseDungeon(result.yaml);
      expect(doc.key).toBe('showcase');
      expect(doc.rooms).toHaveLength(3);
    });

    it('drops every target-dialect construct and reports what it dropped', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      toggleWall(cst, 7, 0);
      toggleWall(cst, 7, 4);
      toggleHole(cst, 3, 6);
      setStart(cst, [0, 4]);
      setEnd(cst, [19, 25]);
      setLightingAmbient(cst, 0.8);
      setPlacementFacing(cst, 'antechamber', 0, 2);
      setPlacementMount(cst, 'antechamber', 0, 'wall');
      setPlacementHeight(cst, 'antechamber', 0, 2.0);
      setPlacementRotationDegrees(cst, 'antechamber', 0, 15);
      setPlacementTargeting(cst, 'antechamber', 0, 'lowest-health');
      setBossTargeting(cst, doc.rooms[2].id, 'closest');

      const result = stripToV1Subset(serializeDungeon(cst));
      expect(result.dropped).toEqual([
        '2 walls',
        '1 hole',
        'start',
        'end',
        'lighting',
        'facing (1 placement)',
        'wall-mount (1 placement)',
        'height (1 placement)',
        'targeting (2 placements)',
        'fine-rotation experiment (1 placement)',
      ]);
      expect(result.compilable).toBe(true);

      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.version).toBe(1);
      expect(stripped.walls).toEqual([]);
      expect(stripped.holes).toEqual([]);
      expect(stripped.start).toBeNull();
      expect(stripped.end).toBeNull();
      expect(stripped.lighting).toBeNull();
      expect(stripped.rooms[0].place[0].facing).toBeNull();
      expect(stripped.rooms[0].place[0].mount).toBe('floor');
      expect(stripped.rooms[0].place[0].height).toBeNull();
      expect(stripped.rooms[0].place[0].rotationDegrees).toBeNull();
      expect(stripped.rooms[0].place[0].targeting).toBeNull();
      expect(stripped.rooms[2].boss?.targeting).toBeNull();
      // Real v1 content untouched.
      expect(stripped.rooms.map((r) => r.id)).toEqual([
        'antechamber',
        'shrine',
        'vault',
      ]);
    });

    it('reports not-compilable when fewer than 2 rooms remain', () => {
      const oneRoom = `
version: 1
key: bare
name: "Bare"
height: 8
rooms:
  - id: only
    archetype: entrance
    width: 6
connectors: []
`;
      const result = stripToV1Subset(oneRoom);
      expect(result.compilable).toBe(false);
    });

    it('maps a top-level placement inside a room into that room, converting absolute -> room-local at', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      // showcase.yaml's real chain: antechamber [0,6), shrine [7,21),
      // vault [22,30) — verified against SHOWCASE_FLOORPLAN in
      // fixtures.ts and floorPlanCompile.test.ts. Column 10 falls inside
      // shrine's range; local col is 10 - 7 = 3.
      placeItem(cst, null, 'dnd5e:props:pillar', [10, 3]);

      const result = stripToV1Subset(serializeDungeon(cst));
      expect(result.dropped).toEqual([
        '1 top-level placement (mapped into rooms)',
      ]);
      expect(result.compilable).toBe(true);

      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.place).toEqual([]); // top-level place: is gone in v1
      const shrine = stripped.rooms.find((r) => r.id === 'shrine')!;
      const mapped = shrine.place.find(
        (p) => p.ref === 'dnd5e:props:pillar' && p.at[0] === 3 && p.at[1] === 3
      );
      expect(mapped).toBeDefined();
    });

    it('drops a top-level placement outside every room, with an honest count', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      // vault ends at column 30 (22 + 8) — column 50 is outside every
      // room's range. A distinctive ref (not one showcase.yaml already
      // places elsewhere) so the "did it end up in some room" check
      // below can't false-positive against pre-existing content.
      placeItem(cst, null, 'dnd5e:props:__test_marker__', [50, 3]);

      const result = stripToV1Subset(serializeDungeon(cst));
      expect(result.dropped).toEqual([
        '1 top-level placement outside any room',
      ]);
      expect(result.compilable).toBe(true);

      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.place).toEqual([]);
      for (const room of stripped.rooms) {
        expect(
          room.place.some((p) => p.ref === 'dnd5e:props:__test_marker__')
        ).toBe(false);
      }
    });

    it('reports both mapped and out-of-room placements together, in order', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      placeItem(cst, null, 'dnd5e:props:pillar', [10, 3]); // maps into shrine
      placeItem(cst, null, 'dnd5e:props:altar', [50, 3]); // outside every room

      const result = stripToV1Subset(serializeDungeon(cst));
      expect(result.dropped).toEqual([
        '1 top-level placement (mapped into rooms)',
        '1 top-level placement outside any room',
      ]);
    });
  });

  describe('stripToV1Subset: capability-aware (capability-probed graduation unit)', () => {
    // Minimal helper: every DialectField the test doesn't explicitly list
    // is left unaccepted, matching how a real `ServerCapabilities` reads
    // for a server that hasn't graduated a field yet — never a silent
    // "everything accepted" default.
    function caps(accepted: DialectField[]): ServerCapabilities {
      const all = Object.fromEntries(
        DIALECT_FIELDS.map((f) => [f, { accepted: false }])
      ) as ServerCapabilities;
      for (const field of accepted) all[field] = { accepted: true };
      return all;
    }

    it('keeps an accepted walls: verbatim instead of stripping it, and counts it as compiling', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      toggleWall(cst, 7, 0);
      toggleWall(cst, 7, 4);

      const result = stripToV1Subset(serializeDungeon(cst), caps(['walls']));

      expect(result.dropped).toEqual([]);
      expect(result.compiling).toEqual(['2 walls']);
      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.walls).toHaveLength(2);
    });

    it('with no capabilities at all, falls back to the prior conservative-static strip (walls always dropped)', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      toggleWall(cst, 7, 0);

      const result = stripToV1Subset(serializeDungeon(cst)); // no second arg

      expect(result.dropped).toEqual(['1 wall']);
      expect(result.compiling).toEqual([]);
      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.walls).toEqual([]);
    });

    it('start and end are independent capabilities — one can compile while the other still drops', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      setStart(cst, [0, 4]);
      setEnd(cst, [19, 25]);

      const result = stripToV1Subset(
        serializeDungeon(cst),
        caps(['start']) // end NOT accepted
      );

      expect(result.dropped).toEqual(['end']);
      expect(result.compiling).toEqual(['start']);
      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.start).toEqual([0, 4]);
      expect(stripped.end).toBeNull();
    });

    it('facing is gated PER ENTRY TYPE — a floor prop keeps facing while a monster/boss/wall-mount in the same doc still loses it', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      // antechamber's own place[0] (brazier) is a plain floor prop —
      // real fixture data, not hand-crafted.
      setPlacementFacing(cst, 'antechamber', 0, 2);
      placeItem(cst, 'shrine', 'dnd5e:monsters:skeleton-captain', [3, 3]);
      setPlacementFacing(cst, 'shrine', doc.rooms[1].place.length, 4);
      setBossFacing(cst, doc.rooms[2].id, 1);

      const result = stripToV1Subset(
        serializeDungeon(cst),
        caps(['facingFloorProp']) // monster/boss facing NOT accepted
      );

      expect(result.dropped).toContain('facing (2 placements)');
      expect(result.compiling).toContain('facing (1 placement)');
      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.rooms[0].place[0].facing).toBe(2);
      const monster = stripped.rooms[1].place.find((p) => p.isMonster)!;
      expect(monster.facing).toBeNull();
      expect(stripped.rooms[2].boss?.facing).toBeNull();
    });

    it('wall-mount facing is its own DialectField, independent of a plain floor prop facing capability', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      setPlacementFacing(cst, 'antechamber', 0, 2);
      setPlacementMount(cst, 'antechamber', 0, 'wall');

      const acceptedFloorOnly = stripToV1Subset(
        serializeDungeon(cst),
        caps(['facingFloorProp'])
      );
      expect(acceptedFloorOnly.dropped).toContain('facing (1 placement)');

      const acceptedWallMountToo = stripToV1Subset(
        serializeDungeon(cst),
        caps(['facingFloorProp', 'facingWallMount'])
      );
      expect(acceptedWallMountToo.compiling).toContain('facing (1 placement)');
    });

    it('an accepted defaults: block is kept verbatim — no materialize-on-strip when the server understands it directly', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      setRefDefault(cst, 'dnd5e:props:statue-reaper', 'blocksMovement', true);

      const result = stripToV1Subset(serializeDungeon(cst), caps(['defaults']));

      expect(result.dropped).toEqual([]);
      expect(result.compiling).toEqual(['1 default ref']);
      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.defaults).toEqual({
        'dnd5e:props:statue-reaper': { blocksMovement: true },
      });
      // NOT materialized onto the instance — the server resolves
      // inheritance itself now, so baking it in here would be redundant.
      const statue = stripped.rooms
        .find((r) => r.id === 'shrine')!
        .place.find((p) => p.ref === 'dnd5e:props:statue-reaper')!;
      expect(statue.explicit.blocksMovement).toBe(false);
    });

    it('an accepted topLevelPlace keeps the top-level place: list verbatim instead of mapping it into rooms', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      placeItem(cst, null, 'dnd5e:props:pillar', [10, 3]); // would map into shrine if NOT accepted

      const result = stripToV1Subset(
        serializeDungeon(cst),
        caps(['topLevelPlace'])
      );

      expect(result.dropped).toEqual([]);
      expect(result.compiling).toEqual(['1 top-level placement']);
      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.place).toHaveLength(1);
      expect(stripped.place[0]).toMatchObject({
        ref: 'dnd5e:props:pillar',
        at: [10, 3],
      });
      // shrine already legitimately has 8 pillar props of its own
      // (showcase.yaml's real "colonnade" content) — check the SPECIFIC
      // room-local coordinate the mapped-down conversion would have used
      // (10 - shrine's startColumn 7 = 3), not just ref presence.
      const shrine = stripped.rooms.find((r) => r.id === 'shrine')!;
      expect(
        shrine.place.some(
          (p) =>
            p.ref === 'dnd5e:props:pillar' && p.at[0] === 3 && p.at[1] === 3
        )
      ).toBe(false);
    });

    it('a kept top-level placement still gets its OWN facing/mount/height/targeting stripped per-field', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      placeItem(cst, null, 'dnd5e:props:pillar', [10, 3]);
      setPlacementFacing(cst, null, 0, 3);
      setPlacementHeight(cst, null, 0, 2.0);

      const result = stripToV1Subset(
        serializeDungeon(cst),
        caps(['topLevelPlace']) // facing/height NOT accepted
      );

      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.place[0].facing).toBeNull();
      expect(stripped.place[0].height).toBeNull();
      expect(result.dropped).toEqual(
        expect.arrayContaining(['facing (1 placement)', 'height (1 placement)'])
      );
    });

    it('canvas/holes/regions/lighting each compile independently when their own capability is accepted', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      toggleHole(cst, 3, 6);
      setLightingAmbient(cst, 0.8);
      createRegion(cst, doc, 'r1', 'chamber', [[1, 1]]);

      const result = stripToV1Subset(
        serializeDungeon(cst),
        caps(['holes', 'lighting', 'regions'])
      );

      expect(result.dropped).toEqual([]);
      expect(result.compiling).toEqual(
        expect.arrayContaining(['1 hole', 'lighting', '1 region'])
      );
    });

    it('present-but-EMPTY holes:/end: are still stripped when not accepted — a decode-unknown field is rejected on mere presence, not on content (regression: emptyCanvasDoc.ts ships holes: [] / end: null, which survived stripping untouched before this fix and broke every real from-scratch canvas save)', () => {
      const canvasDocWithEmptyPlaceholders = `
version: 1
key: untitled-creation
name: "Untitled Dungeon"
canvas:
  width: 20
  height: 30
rooms: []
connectors: []
walls: []
holes: []
start: null
end: null
place: []
`;
      const result = stripToV1Subset(
        canvasDocWithEmptyPlaceholders,
        caps(['canvas']) // holes/end NOT accepted — real server state today
      );

      // Neither key survives to the wire — a strict decode-unknown check
      // rejects the KEY'S presence regardless of its (empty) value.
      expect(result.yaml).not.toMatch(/^holes:/m);
      expect(result.yaml).not.toMatch(/^end:/m);
      // Empty content never gets reported — nothing meaningful to name.
      expect(result.dropped).toEqual([]);
      expect(result.compiling).toEqual(['canvas']);
    });

    it('compilableBlockers names the real, unconditional server minimums — independent of any dialect capability', () => {
      const oneRoom = `
version: 1
key: bare
name: "Bare"
height: 8
rooms:
  - id: only
    archetype: entrance
    width: 6
connectors: []
`;
      const result = stripToV1Subset(oneRoom, caps(['walls', 'start']));
      expect(result.compilable).toBe(false);
      expect(result.compilableBlockers).toEqual(
        expect.arrayContaining(['needs at least 2 rooms (has 1)'])
      );
    });

    it('a real, load-bearing finding this unit uncovered: 2+ rooms alone is not enough — the chain needs exactly one boss-archetype room with a declared boss', () => {
      const twoNonBossRooms = `
version: 1
key: no-boss
name: "No Boss"
height: 8
rooms:
  - id: a
    archetype: entrance
    width: 6
  - id: b
    archetype: chamber
    width: 6
connectors:
  - { from: a, to: b }
`;
      const result = stripToV1Subset(twoNonBossRooms);
      expect(result.compilable).toBe(false);
      expect(result.compilableBlockers).toEqual(
        expect.arrayContaining([
          'needs exactly one boss-archetype room with a declared boss (has none)',
        ])
      );
    });

    it('a real showcase-shaped document (2 rooms + 1 boss room, boss declared) is compilable with no blockers', () => {
      const result = stripToV1Subset(SHOWCASE_YAML);
      expect(result.compilable).toBe(true);
      expect(result.compilableBlockers).toEqual([]);
    });

    describe('canvas-mode compilableBlockers (region-brush honesty round, 2026-08-06)', () => {
      // Kirk, live authoring: added a boss region trying to satisfy "needs
      // exactly one boss-archetype room" on a from-scratch canvas doc —
      // which can never unblock it, since the server rejects `canvas:`
      // itself before validation ever reaches boss cardinality. These
      // prove the blocker names THAT fact instead of the chain-mode
      // room/boss rules once a document is canvas-mode.
      it('a canvas doc with canvas NOT accepted reports the real Wave 0/#192 blocker, not the room/boss chain rules', () => {
        const result = stripToV1Subset(
          emptyCanvasYaml(20, 20),
          caps([]) // canvas not accepted — every server today
        );
        expect(result.compilable).toBe(false);
        expect(result.compilableBlockers).toEqual([
          "from-scratch canvas documents aren't accepted by this server yet (platform Wave 0 — rpg-project#192)",
        ]);
      });

      it('the same canvas doc reports NO blockers once canvas IS accepted — no invented chain-rule guess takes its place', () => {
        const result = stripToV1Subset(
          emptyCanvasYaml(20, 20),
          caps(['canvas'])
        );
        expect(result.compilableBlockers).toEqual([]);
        expect(result.compilable).toBe(true);
      });

      it('with no capabilities at all (fixtures mode / probe not yet complete), a canvas doc still reports the Wave 0 blocker, not room/boss', () => {
        const result = stripToV1Subset(emptyCanvasYaml(20, 20));
        expect(result.compilableBlockers).toEqual([
          "from-scratch canvas documents aren't accepted by this server yet (platform Wave 0 — rpg-project#192)",
        ]);
      });

      it('a real ROOM-chain document is unaffected — still reports the chain-mode blockers, canvas or not', () => {
        const oneRoom = `
version: 1
key: bare
name: "Bare"
height: 8
rooms:
  - id: only
    archetype: entrance
    width: 6
connectors: []
`;
        const result = stripToV1Subset(oneRoom, caps(['canvas']));
        expect(result.compilableBlockers).toEqual(
          expect.arrayContaining(['needs at least 2 rooms (has 1)'])
        );
      });
    });

    // wallLines->edges projection (rpg-project#169's "drawn walls become
    // real" unit) — a genuinely VERTICAL corner-anchored line clips a
    // CONTIGUOUS column run (this fixture verified directly against
    // `straightWallGeometry.ts`'s own test suite: footprint
    // [[6,4],[6,5],[6,6],[6,7],[6,8],[6,9]], every consecutive pair real
    // hex neighbors of each other), so `[6,4]`<->`[6,5]` is a KNOWN real
    // projected edge to assert against directly, not guessed at.
    describe('wallLines -> walls: projection', () => {
      const VLINE_FROM = canonicalCorner({ cell: [5, 3], corner: 0 });
      const VLINE_TO = canonicalCorner({ cell: [5, 9], corner: 0 });

      it('projects into walls: when this server accepts walls, counted in compiling — never dropped', () => {
        const { cst } = parseDungeon(SHOWCASE_YAML);
        addWallLine(cst, VLINE_FROM, VLINE_TO);

        const result = stripToV1Subset(serializeDungeon(cst), caps(['walls']));

        expect(result.dropped).toEqual([]);
        expect(result.compiling).toEqual([
          expect.stringMatching(
            /^1 straight wall \(projects to \d+ wall edges?\)$/
          ),
        ]);
        const { doc: stripped } = parseDungeon(result.yaml);
        expect(stripped.wallLines).toEqual([]); // the key itself never survives
        const edge = stripped.walls.find(
          (w) =>
            (w.from[0] === 6 &&
              w.from[1] === 4 &&
              w.to[0] === 6 &&
              w.to[1] === 5) ||
            (w.from[0] === 6 &&
              w.from[1] === 5 &&
              w.to[0] === 6 &&
              w.to[1] === 4)
        );
        expect(edge).toBeDefined();
        expect(edge?.kind).toBe('solid');
      });

      it('the ORIGINAL live doc is untouched — a projection, not a conversion; wallLines: still round-trips from the caller’s own cst', () => {
        const { cst } = parseDungeon(SHOWCASE_YAML);
        addWallLine(cst, VLINE_FROM, VLINE_TO);
        const yamlText = serializeDungeon(cst);

        stripToV1Subset(yamlText, caps(['walls']));

        // stripToV1Subset parsed a FRESH cst from yamlText — the caller's
        // own cst (and re-parsing yamlText itself) still shows the
        // straight wall, untouched.
        expect(toDungeonDoc(cst).wallLines).toHaveLength(1);
        expect(parseDungeon(yamlText).doc.wallLines).toHaveLength(1);
      });

      it('merges with explicit walls: — EXPLICIT wins on a kind conflict, no duplicate edge', () => {
        const { cst } = parseDungeon(SHOWCASE_YAML);
        addWallLine(cst, VLINE_FROM, VLINE_TO);
        // The projection would derive [6,4]<->[6,5] as `solid` (previous
        // test) — author it explicitly as a DOOR instead.
        setWallEdge(cst, [6, 4], [6, 5], 'door', true);

        const result = stripToV1Subset(serializeDungeon(cst), caps(['walls']));
        const { doc: stripped } = parseDungeon(result.yaml);
        const matches = stripped.walls.filter(
          (w) =>
            (w.from[0] === 6 &&
              w.from[1] === 4 &&
              w.to[0] === 6 &&
              w.to[1] === 5) ||
            (w.from[0] === 6 &&
              w.from[1] === 5 &&
              w.to[0] === 6 &&
              w.to[1] === 4)
        );
        expect(matches).toHaveLength(1); // never duplicated
        expect(matches[0].kind).toBe('door'); // explicit wins, not overwritten to solid
      });

      it('a doors: cell projects as kind: door, reading as a doorway rather than a bare gap or a block', () => {
        const { cst } = parseDungeon(SHOWCASE_YAML);
        addWallLine(cst, VLINE_FROM, VLINE_TO);
        toggleWallLineDoorAt(cst, 0, [6, 6]); // middle of the [6,4]..[6,9] run

        const result = stripToV1Subset(serializeDungeon(cst), caps(['walls']));
        const { doc: stripped } = parseDungeon(result.yaml);
        const doorEdge = stripped.walls.find(
          (w) =>
            (w.from[0] === 6 &&
              w.from[1] === 6 &&
              w.to[0] === 6 &&
              w.to[1] === 5) ||
            (w.from[0] === 6 &&
              w.from[1] === 5 &&
              w.to[0] === 6 &&
              w.to[1] === 6)
        );
        expect(doorEdge?.kind).toBe('door');
        // The door cell itself never appears in doc.holes/blocked in any
        // v1 sense — it's real floor with a door edge beside it, nothing
        // marks the CELL itself as special on the wire (matching real
        // walls: semantics: kind lives on the edge, not the cell).
      });

      it('rim edges (the wall reaches the canvas boundary) are counted honestly, never silently dropped', () => {
        const { cst } = parseDungeon(SHOWCASE_YAML);
        // Same "diameter of one cell" fixture straightWallGeometry.test.ts
        // uses, anchored at column 0 — some of its 6 neighbor directions
        // fall off the canvas grid entirely.
        addWallLine(
          cst,
          canonicalCorner({ cell: [0, 4], corner: 2 }),
          canonicalCorner({ cell: [0, 4], corner: 5 })
        );

        const result = stripToV1Subset(serializeDungeon(cst), caps(['walls']));
        expect(result.compiling).toEqual([
          expect.stringMatching(
            /rim edges? at the canvas boundary could not be expressed/
          ),
        ]);
      });

      it('not accepted (walls: itself rejected): still drops both, never touches walls: — unchanged prior behavior', () => {
        const { cst } = parseDungeon(SHOWCASE_YAML);
        addWallLine(cst, VLINE_FROM, VLINE_TO);

        const result = stripToV1Subset(serializeDungeon(cst), caps([])); // nothing accepted

        expect(result.dropped).toEqual(['1 straight wall']);
        expect(result.compiling).toEqual([]);
        const { doc: stripped } = parseDungeon(result.yaml);
        expect(stripped.walls).toEqual([]);
        expect(stripped.wallLines).toEqual([]);
      });
    });
  });

  describe('generalized placement mutators (roomId: null = top-level)', () => {
    it('placeItem/movePlacement/deletePlacement round-trip a top-level entry', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      placeItem(cst, null, 'dnd5e:props:pillar', [1, 1]);
      let doc = toDungeonDoc(cst);
      expect(doc.place).toHaveLength(1);
      expect(doc.place[0]).toMatchObject({
        ref: 'dnd5e:props:pillar',
        at: [1, 1],
      });

      movePlacement(cst, null, 0, [2, 2]);
      doc = toDungeonDoc(cst);
      expect(doc.place[0].at).toEqual([2, 2]);

      deletePlacement(cst, null, 0);
      doc = toDungeonDoc(cst);
      expect(doc.place).toEqual([]);
    });

    it('setPlacementFacing/setPlacementMount/setPlacementHeight/setPlacementTargeting all work on a top-level entry', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      placeItem(cst, null, 'dnd5e:props:wall-banner', [1, 1]);
      setPlacementFacing(cst, null, 0, 2);
      setPlacementMount(cst, null, 0, 'wall');
      setPlacementHeight(cst, null, 0, 2.0);
      setPlacementTargeting(cst, null, 0, 'closest');

      const doc = toDungeonDoc(cst);
      expect(doc.place[0].facing).toBe(2);
      expect(doc.place[0].mount).toBe('wall');
      expect(doc.place[0].height).toBe(2.0);
      expect(doc.place[0].targeting).toBe('closest');
    });
  });
});

describe('defaults: ref-keyed inherited fields (rpg-project#175, Kirk\'s ask verbatim: "maybe we can set a default for all skeletons")', () => {
  it('parses a defaults: map, snake_case wire keys converted to the same camelCase shape a placement itself uses', () => {
    const withDefaults = SHOWCASE_YAML.replace(
      'rooms:',
      'defaults:\n  "dnd5e:monsters:skeleton-captain": { targeting: lowest-health }\n  "dnd5e:props:candles": { blocks_movement: false, height: 1.2, facing: SE }\nrooms:'
    );
    const { doc } = parseDungeon(withDefaults);
    expect(doc.defaults['dnd5e:monsters:skeleton-captain']).toEqual({
      targeting: 'lowest-health',
    });
    expect(doc.defaults['dnd5e:props:candles']).toEqual({
      blocksMovement: false,
      height: 1.2,
      facing: 5, // SE — HEX_FACING_LABELS index, same convention as every other facing field
    });
  });

  it('resolvePlacement falls back to the plain false/null default when the ref has no defaults: entry at all — the overwhelmingly common case today', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    const room = doc.rooms.find((r) => r.id === 'shrine')!;
    // showcase.yaml's own statue-reaper carries no blocks_movement/
    // blocks_los/height/facing/targeting at all (fixtures.ts) — a real,
    // pre-existing "nothing explicit" instance, not one hand-crafted for
    // this test.
    const statue = room.place.find(
      (p) => p.ref === 'dnd5e:props:statue-reaper'
    )!;
    expect(resolvePlacement(doc, statue)).toEqual({
      blocksMovement: false,
      blocksLos: false,
      height: null,
      facing: null,
      targeting: null,
      inheritedFrom: {
        blocksMovement: false,
        blocksLos: false,
        height: false,
        facing: false,
        targeting: false,
      },
    });
  });

  it('resolvePlacement inherits a ref default for every field the placement itself leaves unset', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setRefDefault(cst, 'dnd5e:props:statue-reaper', 'blocksMovement', true);
    setRefDefault(cst, 'dnd5e:props:statue-reaper', 'height', 1.5);
    const doc = toDungeonDoc(cst);
    const room = doc.rooms.find((r) => r.id === 'shrine')!;
    const statue = room.place.find(
      (p) => p.ref === 'dnd5e:props:statue-reaper'
    )!;
    const resolved = resolvePlacement(doc, statue);
    expect(resolved.blocksMovement).toBe(true);
    expect(resolved.height).toBe(1.5);
    expect(resolved.inheritedFrom.blocksMovement).toBe(true);
    expect(resolved.inheritedFrom.height).toBe(true);
    // A field with no matching default key stays at its plain fallback.
    expect(resolved.blocksLos).toBe(false);
    expect(resolved.inheritedFrom.blocksLos).toBe(false);
  });

  it("a placement's own EXPLICIT field always overrides its ref's default, never the other way around", () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    // showcase.yaml's own braziers are already explicit blocks_movement: true.
    setRefDefault(cst, 'dnd5e:props:brazier', 'blocksMovement', false);
    const doc = toDungeonDoc(cst);
    const room = doc.rooms.find((r) => r.id === 'antechamber')!;
    const brazier = room.place.find((p) => p.ref === 'dnd5e:props:brazier')!;
    const resolved = resolvePlacement(doc, brazier);
    expect(resolved.blocksMovement).toBe(true);
    expect(resolved.inheritedFrom.blocksMovement).toBe(false);
  });

  it('setRefDefault creates defaults: and a flow-style ref entry, accumulating multiple fields on the same ref', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setRefDefault(
      cst,
      'dnd5e:monsters:skeleton-captain',
      'targeting',
      'lowest-health'
    );
    setRefDefault(cst, 'dnd5e:monsters:skeleton-captain', 'facing', 5); // SE
    const yaml = serializeDungeon(cst);
    expect(yaml).toContain('defaults:');
    expect(yaml).toMatch(
      /"dnd5e:monsters:skeleton-captain":\s*\{\s*targeting:\s*lowest-health,\s*facing:\s*SE\s*\}/
    );
  });

  it('clearRefDefault removes one field, then the ref entry once empty, then defaults: itself once the last ref is cleared', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setRefDefault(cst, 'dnd5e:props:candles', 'blocksMovement', false);
    setRefDefault(cst, 'dnd5e:props:candles', 'height', 0.5);

    clearRefDefault(cst, 'dnd5e:props:candles', 'blocksMovement');
    expect(toDungeonDoc(cst).defaults['dnd5e:props:candles']).toEqual({
      height: 0.5,
    });

    clearRefDefault(cst, 'dnd5e:props:candles', 'height');
    expect(toDungeonDoc(cst).defaults['dnd5e:props:candles']).toBeUndefined();
    expect(serializeDungeon(cst)).not.toContain('defaults:');
  });

  it('clearRefDefault on a field/ref/defaults: that was never set is a no-op, not an error', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    expect(() =>
      clearRefDefault(cst, 'dnd5e:props:candles', 'height')
    ).not.toThrow();
    expect(toDungeonDoc(cst).defaults).toEqual({});
  });

  it("clearPlacementFlag reverts an explicit blocks_movement back to inheriting the ref's default — the Inspector's revert-to-default affordance", () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setRefDefault(cst, 'dnd5e:props:brazier', 'blocksMovement', false);

    let doc = toDungeonDoc(cst);
    let brazier = doc.rooms.find((r) => r.id === 'antechamber')!.place[0];
    expect(brazier.explicit.blocksMovement).toBe(true); // showcase's own explicit true
    expect(resolvePlacement(doc, brazier).blocksMovement).toBe(true);

    clearPlacementFlag(cst, 'antechamber', 0, 'blocksMovement');

    doc = toDungeonDoc(cst);
    brazier = doc.rooms.find((r) => r.id === 'antechamber')!.place[0];
    expect(brazier.explicit.blocksMovement).toBe(false);
    const resolved = resolvePlacement(doc, brazier);
    expect(resolved.blocksMovement).toBe(false); // now following the ref default
    expect(resolved.inheritedFrom.blocksMovement).toBe(true);
  });

  it('boss inheritance is an open question this prototype records, not decides — a defaults: entry never applies to a BossDoc', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setRefDefault(
      cst,
      'dnd5e:monsters:skeleton-captain',
      'targeting',
      'lowest-health'
    );
    const doc = toDungeonDoc(cst);
    const vault = doc.rooms.find((r) => r.id === 'vault')!;
    expect(vault.boss?.ref).toBe('dnd5e:monsters:skeleton-captain');
    // A matching defaults: entry exists for this exact ref, and yet the
    // boss's own targeting stays null — resolvePlacement only ever takes
    // a PlacementDoc, never a BossDoc (see its own doc comment).
    expect(vault.boss?.targeting).toBeNull();
  });

  it('"snap flush to nearest wall" (useBoardEditing.ts\'s handleSnapFlush, fine-rotation generalization round) writes an EXPLICIT facing that overrides a ref-level defaulted one, and an explicit rotate_degrees alongside it', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    // Give this ref an inherited facing default — same shape this whole
    // describe block is about, just on the prop the fine-rotation round
    // uses for its own floor-standing test case.
    setRefDefault(cst, 'dnd5e:props:statue-reaper', 'facing', 2); // NE
    let doc = toDungeonDoc(cst);
    let room = doc.rooms.find((r) => r.id === 'shrine')!;
    const statueIndex = room.place.findIndex(
      (p) => p.ref === 'dnd5e:props:statue-reaper'
    );
    let resolved = resolvePlacement(doc, room.place[statueIndex]!);
    expect(resolved.facing).toBe(2);
    expect(resolved.inheritedFrom.facing).toBe(true);

    // handleSnapFlush itself: two independent mutator calls against the
    // SAME (roomId, index), the pre-validated (facing, rotationDegrees)
    // pair `computeFlushRotation` would have produced — the "flush"
    // answer here (SW) is deliberately different from the ref default
    // (NE) so an accidental no-op wouldn't pass this assertion.
    setPlacementFacing(cst, 'shrine', statueIndex, 4); // SW
    setPlacementRotationDegrees(cst, 'shrine', statueIndex, 15);

    doc = toDungeonDoc(cst);
    room = doc.rooms.find((r) => r.id === 'shrine')!;
    const statue = room.place[statueIndex]!;
    resolved = resolvePlacement(doc, statue);
    // The snap-flush facing is now EXPLICIT on this instance and wins
    // over the ref default, exactly like every other explicit-vs-default
    // case above — a default facing never blocks overriding it.
    expect(statue.explicit.facing).toBe(true);
    expect(resolved.facing).toBe(4);
    expect(resolved.inheritedFrom.facing).toBe(false);
    expect(statue.rotationDegrees).toBe(15);
  });

  describe('stripToV1Subset: materialize-on-strip', () => {
    it('bakes an inherited blocks_movement: true onto EVERY placement of that ref that never set it explicitly', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      // showcase.yaml's own statue-reaper appears twice, in two different
      // rooms (shrine [13,3] and vault [1,1]), neither with an explicit
      // blocks_movement — a real fixture case, not one hand-crafted for
      // this test, that happens to exercise "materializes across more
      // than one instance of the same ref" for free.
      setRefDefault(cst, 'dnd5e:props:statue-reaper', 'blocksMovement', true);
      const stripped = stripToV1Subset(serializeDungeon(cst));

      expect(stripped.compilable).toBe(true);
      const entry = stripped.dropped.find((d) => d.startsWith('defaults ('));
      expect(entry).toContain('materialized onto 2 placements');

      const { doc: strippedDoc } = parseDungeon(stripped.yaml);
      expect(strippedDoc.defaults).toEqual({}); // defaults: itself is gone
      for (const roomId of ['shrine', 'vault']) {
        const statue = strippedDoc.rooms
          .find((r) => r.id === roomId)!
          .place.find((p) => p.ref === 'dnd5e:props:statue-reaper')!;
        expect(statue.blocksMovement).toBe(true);
        expect(statue.explicit.blocksMovement).toBe(true); // now a real, literal key
      }
    });

    it('bakes an inherited blocks_los: false too — materializing does not gate on the value being true', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      setRefDefault(
        cst,
        'dnd5e:props:statue-knight-hooded',
        'blocksLos',
        false
      );
      const stripped = stripToV1Subset(serializeDungeon(cst));
      const { doc: strippedDoc } = parseDungeon(stripped.yaml);
      const statue = strippedDoc.rooms
        .find((r) => r.id === 'shrine')!
        .place.find((p) => p.ref === 'dnd5e:props:statue-knight-hooded')!;
      expect(statue.explicit.blocksLos).toBe(true);
      expect(statue.blocksLos).toBe(false);
    });

    it('does NOT touch an already-EXPLICIT placement — its own value wins and stays exactly as authored', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      // showcase's own braziers are already explicit blocks_movement: true.
      setRefDefault(cst, 'dnd5e:props:brazier', 'blocksMovement', false);
      const stripped = stripToV1Subset(serializeDungeon(cst));
      const { doc: strippedDoc } = parseDungeon(stripped.yaml);
      const brazier = strippedDoc.rooms
        .find((r) => r.id === 'antechamber')!
        .place.find((p) => p.ref === 'dnd5e:props:brazier')!;
      expect(brazier.blocksMovement).toBe(true);
    });

    it('never materializes blocks_movement/blocks_los onto a MONSTER placement, even with a matching default — dungeonspec rejects both on monster refs', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      placeItem(cst, 'shrine', 'dnd5e:monsters:skeleton-captain', [3, 3]);
      setRefDefault(
        cst,
        'dnd5e:monsters:skeleton-captain',
        'targeting',
        'lowest-health'
      );
      const stripped = stripToV1Subset(serializeDungeon(cst));
      const { doc: strippedDoc } = parseDungeon(stripped.yaml);
      const monster = strippedDoc.rooms
        .find((r) => r.id === 'shrine')!
        .place.find((p) => p.ref === 'dnd5e:monsters:skeleton-captain')!;
      expect(monster.explicit.blocksMovement).toBe(false);
      expect(monster.explicit.blocksLos).toBe(false);
      // targeting has no v1 representation regardless of inheritance —
      // dropped like every other target-dialect-only field, never baked in.
      expect(monster.targeting).toBeNull();
    });

    it('materializes a top-level placement BEFORE it is mapped down into its containing room', () => {
      // NOT via `placeItem` — it always stamps a fresh prop placement
      // with EXPLICIT blocks_movement/blocks_los: false (see `placeItem`'s
      // own doc comment), so a board-placed instance can never actually
      // be inheriting either field; only a hand-authored YAML entry
      // (typed directly into the pane, CONTRACT.md's own framing for
      // what a hand-editor can produce that the board itself wouldn't)
      // omits them. Column 2 falls inside antechamber's range
      // (startColumn 0, width 6).
      const withTopPlace = `${SHOWCASE_YAML}\nplace:\n  - { ref: "dnd5e:props:statue-reaper", at: [2, 2] }\n`;
      const { cst } = parseDungeon(withTopPlace);
      setRefDefault(cst, 'dnd5e:props:statue-reaper', 'blocksMovement', true);
      const stripped = stripToV1Subset(serializeDungeon(cst));
      const { doc: strippedDoc } = parseDungeon(stripped.yaml);
      const mapped = strippedDoc.rooms
        .find((r) => r.id === 'antechamber')!
        .place.find(
          (p) =>
            p.ref === 'dnd5e:props:statue-reaper' &&
            p.at[0] === 2 &&
            p.at[1] === 2
        );
      expect(mapped).toBeDefined();
      expect(mapped!.blocksMovement).toBe(true);
      expect(mapped!.explicit.blocksMovement).toBe(true);
    });

    it('reports a plain "defaults (N refs)" — no materialize wording — when nothing actually inherits from the ref', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      setRefDefault(cst, 'dnd5e:props:not-placed-anywhere', 'height', 1.0);
      const stripped = stripToV1Subset(serializeDungeon(cst));
      expect(stripped.dropped.find((d) => d.startsWith('defaults ('))).toBe(
        'defaults (1 ref)'
      );
    });
  });
});

describe('regions: cell-authored semantic room regions (rpg-project#180)', () => {
  it('parses a regions: list into RegionDoc[], id/name/archetype/cells', () => {
    const yaml = `${SHOWCASE_YAML}
regions:
  - id: shrine-inner
    name: "Shrine — Inner Sanctum"
    archetype: chamber
    cells: [[9, 2], [9, 3], [10, 2], [10, 3]]
`;
    const { doc } = parseDungeon(yaml);
    expect(doc.regions).toHaveLength(1);
    expect(doc.regions[0]).toEqual({
      id: 'shrine-inner',
      name: 'Shrine — Inner Sanctum',
      archetype: 'chamber',
      cells: [
        [9, 2],
        [9, 3],
        [10, 2],
        [10, 3],
      ],
    });
  });

  it('defaults to an empty regions: list when absent — every pure v1 document', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    expect(doc.regions).toEqual([]);
  });

  it('a region with no name parses name: undefined, not a fabricated string', () => {
    const yaml = `${SHOWCASE_YAML}
regions:
  - id: vault-annex
    archetype: chamber
    cells: [[1, 1]]
`;
    const { doc } = parseDungeon(yaml);
    expect(doc.regions[0].name).toBeUndefined();
  });

  describe('validateRegionCells', () => {
    it('rejects an empty cell set', () => {
      const { doc } = parseDungeon(SHOWCASE_YAML);
      expect(validateRegionCells(doc, [])).toMatch(/at least one cell/);
    });

    it('rejects a duplicate cell within the same set', () => {
      const { doc } = parseDungeon(SHOWCASE_YAML);
      expect(
        validateRegionCells(doc, [
          [1, 1],
          [1, 1],
        ])
      ).toMatch(/selected twice/);
    });

    it('rejects a disconnected (non-contiguous) cell set', () => {
      const { doc } = parseDungeon(SHOWCASE_YAML);
      expect(
        validateRegionCells(doc, [
          [1, 1],
          [9, 9],
        ])
      ).toMatch(/contiguous/);
    });

    it('accepts a single cell and a contiguous run', () => {
      const { doc } = parseDungeon(SHOWCASE_YAML);
      expect(validateRegionCells(doc, [[1, 1]])).toBeNull();
      expect(
        validateRegionCells(doc, [
          [1, 1],
          [2, 1],
          [2, 2],
        ])
      ).toBeNull();
    });

    it('rejects a cell set overlapping an existing region, but allows it when self-excluded', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [
        [1, 1],
        [2, 1],
      ]);
      const doc2 = toDungeonDoc(cst);
      // Region-brush honesty round: the message now names the exact
      // collision (count + owning region), not a generic "another
      // region" — Kirk's own ask, "with NO indication which cells or
      // whose."
      expect(
        validateRegionCells(doc2, [
          [2, 1],
          [3, 1],
        ])
      ).toBe("1 cell already belongs to 'r1'");
      // Excluding r1's own id lets r1's proposed new cell set (which still
      // legitimately reuses its own current cells) validate cleanly.
      expect(
        validateRegionCells(
          doc2,
          [
            [1, 1],
            [2, 1],
            [3, 1],
          ],
          'r1'
        )
      ).toBeNull();
    });
  });

  describe('findRegionCellOverlap (region-brush honesty round, 2026-08-06)', () => {
    it('returns null when the candidate cells collide with nothing', () => {
      const { doc } = parseDungeon(SHOWCASE_YAML);
      expect(findRegionCellOverlap(doc, [[5, 5]])).toBeNull();
    });

    it('names the owning region and the exact colliding cells for a single-cell check — the brush per-cell shape', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'entrance', 'entrance', [
        [0, 0],
        [1, 0],
      ]);
      const doc2 = toDungeonDoc(cst);
      const overlap = findRegionCellOverlap(doc2, [[1, 0]]);
      expect(overlap).toEqual({
        ownerId: 'entrance',
        ownerName: undefined,
        cells: [[1, 0]],
        cellCount: 1,
      });
    });

    it('reports the region NAME when one is set, not just the id', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [[3, 3]], 'The Vault');
      const doc2 = toDungeonDoc(cst);
      const overlap = findRegionCellOverlap(doc2, [[3, 3]]);
      expect(overlap?.ownerName).toBe('The Vault');
    });

    it('excludeRegionId lets a region check its own proposed cell set without self-colliding', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [
        [1, 1],
        [2, 1],
      ]);
      const doc2 = toDungeonDoc(cst);
      expect(
        findRegionCellOverlap(
          doc2,
          [
            [1, 1],
            [2, 1],
          ],
          'r1'
        )
      ).toBeNull();
    });

    it('caps the reported cell sample at OVERLAP_SAMPLE_CELLS but keeps the TRUE count uncapped', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      const owned: [number, number][] = Array.from({ length: 9 }, (_, i) => [
        i,
        0,
      ]);
      createRegion(cst, doc, 'wide', 'chamber', owned);
      const doc2 = toDungeonDoc(cst);
      const overlap = findRegionCellOverlap(doc2, owned);
      expect(overlap?.cellCount).toBe(9);
      expect(overlap?.cells).toHaveLength(OVERLAP_SAMPLE_CELLS);
    });

    it('only reports the FIRST region a candidate set collides with, when it touches more than one', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'first', 'chamber', [[0, 0]]);
      const afterFirst = toDungeonDoc(cst);
      createRegion(cst, afterFirst, 'second', 'chamber', [[5, 5]]);
      const doc2 = toDungeonDoc(cst);
      const overlap = findRegionCellOverlap(doc2, [
        [0, 0],
        [5, 5],
      ]);
      expect(overlap?.ownerId).toBe('first');
    });
  });

  describe('createRegion', () => {
    it("adds a region with a block-style entry and flow-style cells, matching this file's cell-native convention", () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'shrine-inner', 'chamber', [
        [9, 2],
        [9, 3],
      ]);
      const yaml = serializeDungeon(cst);
      expect(yaml).toContain('regions:');
      expect(yaml).toContain('id: shrine-inner');
      // `yaml`'s own flow-sequence padding (this file's header doc
      // comment names the same residual diff for `at: [1, 1]` etc.) —
      // exact byte content isn't the point here, round-trip fidelity is
      // (asserted via the reparse below).
      expect(yaml).toMatch(
        /cells: \[\s*\[\s*9,\s*2\s*\],\s*\[\s*9,\s*3\s*\]\s*\]/
      );

      const { doc: reparsed } = parseDungeon(yaml);
      expect(reparsed.regions).toHaveLength(1);
      expect(reparsed.regions[0].cells).toEqual([
        [9, 2],
        [9, 3],
      ]);
    });

    it('writes an optional name: only when provided', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [[1, 1]], 'The Annex');
      const { doc: reparsed } = parseDungeon(serializeDungeon(cst));
      expect(reparsed.regions[0].name).toBe('The Annex');

      const { cst: cst2, doc: doc2 } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst2, doc2, 'r2', 'chamber', [[1, 1]]);
      const { doc: reparsed2 } = parseDungeon(serializeDungeon(cst2));
      expect(reparsed2.regions[0].name).toBeUndefined();
    });

    it('throws RegionValidationError on a duplicate id', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [[1, 1]]);
      const doc2 = toDungeonDoc(cst);
      expect(() => createRegion(cst, doc2, 'r1', 'chamber', [[2, 1]])).toThrow(
        RegionValidationError
      );
    });

    it('throws RegionValidationError on an invalid cell set instead of writing anything', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      expect(() => createRegion(cst, doc, 'bad', 'chamber', [])).toThrow(
        RegionValidationError
      );
      expect(toDungeonDoc(cst).regions).toEqual([]);
    });
  });

  describe('addCellToRegion / removeCellFromRegion', () => {
    it('adds an adjacent cell to an existing region', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [[1, 1]]);
      const doc2 = toDungeonDoc(cst);
      addCellToRegion(cst, doc2, 'r1', [2, 1]);
      const doc3 = toDungeonDoc(cst);
      expect(doc3.regions[0].cells).toEqual([
        [1, 1],
        [2, 1],
      ]);
    });

    it('is a no-op when the cell is already a member', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [[1, 1]]);
      const doc2 = toDungeonDoc(cst);
      addCellToRegion(cst, doc2, 'r1', [1, 1]);
      expect(toDungeonDoc(cst).regions[0].cells).toEqual([[1, 1]]);
    });

    it('refuses a cell that would make the region non-contiguous', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [[1, 1]]);
      const doc2 = toDungeonDoc(cst);
      expect(() => addCellToRegion(cst, doc2, 'r1', [9, 9])).toThrow(
        RegionValidationError
      );
      expect(toDungeonDoc(cst).regions[0].cells).toEqual([[1, 1]]);
    });

    it('refuses a cell already claimed by another region', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [[1, 1]]);
      const doc2 = toDungeonDoc(cst);
      createRegion(cst, doc2, 'r2', 'chamber', [[5, 1]]);
      const doc3 = toDungeonDoc(cst);
      expect(() => addCellToRegion(cst, doc3, 'r2', [1, 1])).toThrow(
        RegionValidationError
      );
    });

    it('removes a member cell, leaving the rest intact', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [
        [1, 1],
        [2, 1],
      ]);
      const doc2 = toDungeonDoc(cst);
      removeCellFromRegion(cst, doc2, 'r1', [2, 1]);
      expect(toDungeonDoc(cst).regions[0].cells).toEqual([[1, 1]]);
    });

    it('refuses to remove the last cell — delete the region instead', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [[1, 1]]);
      const doc2 = toDungeonDoc(cst);
      expect(() => removeCellFromRegion(cst, doc2, 'r1', [1, 1])).toThrow(
        RegionValidationError
      );
      expect(toDungeonDoc(cst).regions[0].cells).toEqual([[1, 1]]);
    });

    it('refuses a removal that would split the region into two pieces', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      // A 1x3 strip — removing the middle cell splits it into two islands.
      createRegion(cst, doc, 'r1', 'chamber', [
        [1, 1],
        [2, 1],
        [3, 1],
      ]);
      const doc2 = toDungeonDoc(cst);
      expect(() => removeCellFromRegion(cst, doc2, 'r1', [2, 1])).toThrow(
        RegionValidationError
      );
      expect(toDungeonDoc(cst).regions[0].cells).toHaveLength(3);
    });
  });

  it('renameRegion sets/clears name:, setRegionArchetype updates archetype:', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    createRegion(cst, doc, 'r1', 'chamber', [[1, 1]]);
    renameRegion(cst, 'r1', 'The Annex');
    setRegionArchetype(cst, 'r1', 'boss');
    let reparsed = toDungeonDoc(cst);
    expect(reparsed.regions[0].name).toBe('The Annex');
    expect(reparsed.regions[0].archetype).toBe('boss');

    renameRegion(cst, 'r1', null);
    reparsed = toDungeonDoc(cst);
    expect(reparsed.regions[0].name).toBeUndefined();
  });

  it('deleteRegion removes the region entirely; a no-op for an unknown id', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    createRegion(cst, doc, 'r1', 'chamber', [[1, 1]]);
    deleteRegion(cst, 'r1');
    expect(toDungeonDoc(cst).regions).toEqual([]);
    // No throw:
    deleteRegion(cst, 'does-not-exist');
  });

  describe('connectRegions — attach via a door edge, distinct from chain connectors:', () => {
    it('places a door edge on the shared boundary and returns it', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'north', 'chamber', [
        [1, 1],
        [2, 1],
      ]);
      const doc2 = toDungeonDoc(cst);
      createRegion(cst, doc2, 'south', 'chamber', [
        [1, 2],
        [2, 2],
      ]);
      const doc3 = toDungeonDoc(cst);

      const result = connectRegions(cst, doc3, 'north', 'south');
      expect(result.edge).not.toBeNull();
      // HEX-TRUE (2026-08-03): real hex adjacency finds THREE candidate
      // edges here, not the two a square-grid 4-adjacency check would —
      // [1,1]-[1,2] and [2,1]-[2,2] (same-column, row+1, real under
      // either rule) PLUS [1,1]-[2,2], a genuine hex neighbor
      // (regionGeometry.ts's own `cellsAdjacent` — verified numerically
      // while building this unit) that a square grid has no way to
      // represent at all. Sorted by (row, col) of `to`, the middle of 3
      // (pickAttachmentEdge's own floor(n/2) rule) is now the new edge.
      expect(result.edge).toEqual({ from: [1, 1], to: [2, 2] });
      // The connector's odd-column -> even-column diagonal is a real
      // shared hex edge under the same cube conversion setWallEdge uses.
      expect(hexDistance(cubeAtColRow(1, 1), cubeAtColRow(2, 2))).toBe(1);

      const finalDoc = toDungeonDoc(cst);
      expect(finalDoc.walls).toHaveLength(1);
      expect(finalDoc.walls[0]).toEqual({
        from: [1, 1],
        to: [2, 2],
        kind: 'door',
      });
      // The connectors: chain is completely untouched — a region-
      // attachment door is not a chain connector (rpg-project#175 spot-
      // check finding).
      expect(finalDoc.connectors).toEqual(doc.connectors);
    });

    it('returns { edge: null } and writes nothing when the two regions share no boundary', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'north', 'chamber', [[1, 1]]);
      const doc2 = toDungeonDoc(cst);
      createRegion(cst, doc2, 'far', 'chamber', [[9, 9]]);
      const doc3 = toDungeonDoc(cst);

      const result = connectRegions(cst, doc3, 'north', 'far');
      expect(result.edge).toBeNull();
      expect(toDungeonDoc(cst).walls).toEqual([]);
    });

    it('throws DungeonParseError for an unknown region id', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'north', 'chamber', [[1, 1]]);
      const doc2 = toDungeonDoc(cst);
      expect(() => connectRegions(cst, doc2, 'north', 'nope')).toThrow(
        DungeonParseError
      );
    });
  });

  it('comment-safety: a comment elsewhere in the document survives creating/editing a region', () => {
    const yaml = `${SHOWCASE_YAML.trimEnd()}
# a durable comment, unrelated to regions
`;
    const { cst, doc } = parseDungeon(yaml);
    createRegion(cst, doc, 'r1', 'chamber', [[1, 1]]);
    const doc2 = toDungeonDoc(cst);
    addCellToRegion(cst, doc2, 'r1', [2, 1]);
    expect(serializeDungeon(cst)).toContain(
      '# a durable comment, unrelated to regions'
    );
  });

  describe('stripToV1Subset', () => {
    it('drops regions: entirely, with an honest count, and reports "1 region" (singular)', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [[1, 1]]);
      const result = stripToV1Subset(serializeDungeon(cst));
      expect(result.dropped).toContain('1 region');
      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.regions).toEqual([]);
    });

    it('reports "N regions" (plural) and leaves the real room chain untouched', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'r1', 'chamber', [[1, 1]]);
      const doc2 = toDungeonDoc(cst);
      createRegion(cst, doc2, 'r2', 'chamber', [[5, 1]]);
      const result = stripToV1Subset(serializeDungeon(cst));
      expect(result.dropped).toContain('2 regions');
      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.rooms.map((r) => r.id)).toEqual(
        doc.rooms.map((r) => r.id)
      );
    });

    it('a connectRegions door edge is dropped independently, via the existing walls: count, not the regions: count', () => {
      const { cst, doc } = parseDungeon(SHOWCASE_YAML);
      createRegion(cst, doc, 'north', 'chamber', [[1, 1]]);
      const doc2 = toDungeonDoc(cst);
      createRegion(cst, doc2, 'south', 'chamber', [[1, 2]]);
      const doc3 = toDungeonDoc(cst);
      connectRegions(cst, doc3, 'north', 'south');

      const result = stripToV1Subset(serializeDungeon(cst));
      expect(result.dropped).toEqual(
        expect.arrayContaining(['1 wall', '2 regions'])
      );
      const { doc: stripped } = parseDungeon(result.yaml);
      expect(stripped.walls).toEqual([]);
      expect(stripped.regions).toEqual([]);
    });
  });
});
