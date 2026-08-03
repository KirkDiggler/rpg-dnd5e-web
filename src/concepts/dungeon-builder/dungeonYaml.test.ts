import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addCellToRegion,
  buildWalkItYaml,
  clearPlacementFlag,
  clearRefDefault,
  connectRegions,
  createRegion,
  deletePlacement,
  deleteRegion,
  DungeonParseError,
  movePlacement,
  movePlacementAcrossLists,
  parseDungeon,
  placeItem,
  RegionValidationError,
  removeCellFromRegion,
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
  setStart,
  setWallEdge,
  stripMonsterPlacements,
  stripToV1Subset,
  toDungeonDoc,
  toggleHole,
  toggleWall,
  toggleWallKind,
  validateRegionCells,
  wallKindAtEdge,
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
        'start/end',
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
      expect(
        validateRegionCells(doc2, [
          [2, 1],
          [3, 1],
        ])
      ).toMatch(/already belong to another region/);
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
      // Two candidate edges ([1,1]-[1,2] and [2,1]-[2,2]) sorted by
      // (row, col) of `to` — the midpoint of 2 picks the SECOND
      // (index 1) per pickAttachmentEdge's own floor(n/2) rule.
      expect(result.edge).toEqual({ from: [2, 1], to: [2, 2] });

      const finalDoc = toDungeonDoc(cst);
      expect(finalDoc.walls).toHaveLength(1);
      expect(finalDoc.walls[0]).toEqual({
        from: [2, 1],
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
