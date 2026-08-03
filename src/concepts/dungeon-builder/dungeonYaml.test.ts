import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildWalkItYaml,
  deletePlacement,
  DungeonParseError,
  movePlacement,
  parseDungeon,
  placeItem,
  serializeDungeon,
  setBossFacing,
  setBossTargeting,
  setConnectorLocked,
  setEnd,
  setLightingAmbient,
  setPlacementFacing,
  setPlacementMount,
  setPlacementRotationDegrees,
  setPlacementTargeting,
  setStart,
  stripMonsterPlacements,
  stripToV1Subset,
  toDungeonDoc,
  toggleHole,
  toggleWall,
  toggleWallKind,
} from './dungeonYaml';
import { SHOWCASE_YAML } from './fixtures';

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
      '../../../../../dungeon-content/showcase.yaml'
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

  it('setPlacementMount writes mount+height together, clears both together', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setPlacementMount(cst, 'antechamber', 0, 'wall', 2.0);
    const placed = toDungeonDoc(cst).rooms[0].place[0];
    expect(placed.mount).toBe('wall');
    expect(placed.height).toBe(2.0);
    expect(serializeDungeon(cst)).toContain('mount: wall');
    expect(serializeDungeon(cst)).toContain('height: 2');

    setPlacementMount(cst, 'antechamber', 0, 'floor', null);
    const cleared = toDungeonDoc(cst).rooms[0].place[0];
    expect(cleared.mount).toBe('floor');
    expect(cleared.height).toBeNull();
    // `mount:` only ever appears on a wall-mounted placement — a clean
    // string check. `height:` also names the dungeon's own top-level
    // field (room-chain height), so that assertion is covered by
    // `cleared.height` above instead of a substring search here.
    expect(serializeDungeon(cst)).not.toContain('mount:');
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
      setPlacementMount(cst, 'antechamber', 0, 'wall', 2.0);
      setPlacementRotationDegrees(cst, 'antechamber', 0, 15);
      setPlacementTargeting(cst, 'antechamber', 0, 'lowest-health');
      setBossTargeting(cst, doc.rooms[2].id, 'closest');

      const result = stripToV1Subset(serializeDungeon(cst));
      expect(result.dropped).toEqual([
        '2 walls',
        '1 hole',
        'start/end',
        'lighting',
        'facing (1 placement)',
        'wall-mount (1 placement)',
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

    it('setPlacementFacing/setPlacementMount/setPlacementTargeting all work on a top-level entry', () => {
      const { cst } = parseDungeon(SHOWCASE_YAML);
      placeItem(cst, null, 'dnd5e:props:wall-banner', [1, 1]);
      setPlacementFacing(cst, null, 0, 2);
      setPlacementMount(cst, null, 0, 'wall', 2.0);
      setPlacementTargeting(cst, null, 0, 'closest');

      const doc = toDungeonDoc(cst);
      expect(doc.place[0].facing).toBe(2);
      expect(doc.place[0].mount).toBe('wall');
      expect(doc.place[0].height).toBe(2.0);
      expect(doc.place[0].targeting).toBe('closest');
    });
  });
});
