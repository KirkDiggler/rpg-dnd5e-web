/**
 * Tests for PlaytestMap's pure helper functions.
 *
 * The PlaytestMap component itself wraps HexGrid (Three.js / React Three
 * Fiber), which needs a WebGL canvas — not available in jsdom. Per the
 * pattern in `useHexInteraction.test.ts` we test the pure logic of the
 * helpers and rely on the harness-level integration tests to cover the
 * RPC wiring.
 */

import type { EntityState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  EntityType,
  WallKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import type { EntityMeta, EntityStatus } from '../../hooks/useEncounterState';
import { PROP_KEYS } from '../hex-grid/propManifest';
import {
  buildCryptLayout,
  buildCryptMoodLights,
  buildDevPropDemoEntities,
  buildRenderableEntities,
  buildTurnOrderCombatState,
  entityTypeToDisplay,
  parseDevPropDemoKeys,
  parsePerfProbeWindowMs,
  synthesizeFloorTiles,
} from './playtestMapHelpers';

describe('synthesizeFloorTiles', () => {
  it('returns empty map when no reveals, no entities, no fallback', () => {
    const tiles = synthesizeFloorTiles(new Set(), []);
    expect(tiles.size).toBe(0);
  });

  it('seeds tiles from revealedHexes keys parsed as cube coords', () => {
    const reveals = new Set(['0,0,0', '1,-1,0', '-2,1,1']);
    const tiles = synthesizeFloorTiles(reveals, []);
    expect(tiles.size).toBe(3);
    expect(tiles.get('0,0,0')).toEqual({ x: 0, y: 0, z: 0, roomId: '' });
    expect(tiles.get('1,-1,0')).toEqual({ x: 1, y: -1, z: 0, roomId: '' });
    expect(tiles.get('-2,1,1')).toEqual({ x: -2, y: 1, z: 1, roomId: '' });
  });

  it('adds entity-cell tiles so the player can move before GeometryRevealed lands', () => {
    const entities = [
      { position: { x: 5, y: -5, z: 0 } },
      { position: { x: 5, y: -4, z: -1 } },
    ];
    const tiles = synthesizeFloorTiles(new Set(), entities);
    expect(tiles.size).toBe(2);
    expect(tiles.has('5,-5,0')).toBe(true);
    expect(tiles.has('5,-4,-1')).toBe(true);
  });

  it('skips entities with no position (defensive)', () => {
    const entities = [
      { position: undefined },
      { position: { x: 1, y: -1, z: 0 } },
    ];
    const tiles = synthesizeFloorTiles(new Set(), entities);
    expect(tiles.size).toBe(1);
    expect(tiles.has('1,-1,0')).toBe(true);
  });

  it('adds the fallback position when provided', () => {
    const tiles = synthesizeFloorTiles(new Set(), [], { x: 0, y: 0, z: 0 });
    expect(tiles.size).toBe(1);
    expect(tiles.get('0,0,0')).toEqual({ x: 0, y: 0, z: 0, roomId: '' });
  });

  it('does not duplicate when a reveal, entity, and fallback share a hex', () => {
    const reveals = new Set(['2,-2,0']);
    const entities = [{ position: { x: 2, y: -2, z: 0 } }];
    const tiles = synthesizeFloorTiles(reveals, entities, {
      x: 2,
      y: -2,
      z: 0,
    });
    expect(tiles.size).toBe(1);
    expect(tiles.has('2,-2,0')).toBe(true);
  });
});

describe('entityTypeToDisplay', () => {
  it('maps CHARACTER to player', () => {
    expect(entityTypeToDisplay(EntityType.CHARACTER)).toBe('player');
  });

  it('maps MONSTER to monster', () => {
    expect(entityTypeToDisplay(EntityType.MONSTER)).toBe('monster');
  });

  it('maps OBSTACLE to obstacle', () => {
    expect(entityTypeToDisplay(EntityType.OBSTACLE)).toBe('obstacle');
  });

  it('maps UNSPECIFIED to obstacle (treat as blocker, never as target)', () => {
    expect(entityTypeToDisplay(EntityType.UNSPECIFIED)).toBe('obstacle');
  });

  it('maps undefined to obstacle (entity with no meta yet)', () => {
    expect(entityTypeToDisplay(undefined)).toBe('obstacle');
  });
});

function makeEntityState(
  id: string,
  position: { x: number; y: number; z: number },
  ghost = false
): EntityState & { ghost?: boolean } {
  return {
    entityId: id,
    position,
    ghost,
  } as unknown as EntityState & { ghost?: boolean };
}

describe('buildRenderableEntities', () => {
  it('returns empty list when no entities', () => {
    const list = buildRenderableEntities(new Map(), new Map(), new Map());
    expect(list).toEqual([]);
  });

  it('joins entity + meta + hp into the renderable shape HexGrid expects', () => {
    const entities = new Map([
      ['char-alice', makeEntityState('char-alice', { x: 0, y: 0, z: 0 })],
      ['goblin-1', makeEntityState('goblin-1', { x: 2, y: -2, z: 0 })],
    ]);
    const meta = new Map<string, EntityMeta>([
      ['char-alice', { type: EntityType.CHARACTER, monsterRefId: undefined }],
      ['goblin-1', { type: EntityType.MONSTER, monsterRefId: 'goblin' }],
    ]);
    const hp = new Map([
      ['char-alice', { current: 10, max: 10 }],
      ['goblin-1', { current: 5, max: 7 }],
    ]);

    const list = buildRenderableEntities(entities, meta, hp);
    expect(list).toHaveLength(2);
    const alice = list.find((e) => e.entityId === 'char-alice');
    expect(alice).toMatchObject({
      entityId: 'char-alice',
      type: 'player',
      position: { x: 0, y: 0, z: 0 },
      isDead: false,
    });
    const goblin = list.find((e) => e.entityId === 'goblin-1');
    expect(goblin).toMatchObject({
      entityId: 'goblin-1',
      type: 'monster',
      isDead: false,
    });
    // Display name appends monsterRefId when present so multiple monsters
    // of the same kind remain distinguishable on the map.
    expect(goblin?.name).toBe('goblin-1 (goblin)');
  });

  it('passes movePath/moveSeq through untouched (rpg-dnd5e-web#542)', () => {
    const withMove = {
      ...makeEntityState('char-alice', { x: 1, y: -1, z: 0 }),
      movePath: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: -1, z: 0 },
      ],
      moveSeq: 3,
    };
    const entities = new Map([['char-alice', withMove]]);
    const meta = new Map<string, EntityMeta>([
      ['char-alice', { type: EntityType.CHARACTER, monsterRefId: undefined }],
    ]);

    const list = buildRenderableEntities(entities, meta, new Map());

    expect(list[0]).toMatchObject({
      movePath: withMove.movePath,
      moveSeq: 3,
    });
  });

  it('leaves movePath/moveSeq undefined for an entity that has never moved', () => {
    const entities = new Map([
      ['char-alice', makeEntityState('char-alice', { x: 0, y: 0, z: 0 })],
    ]);
    const meta = new Map<string, EntityMeta>([
      ['char-alice', { type: EntityType.CHARACTER, monsterRefId: undefined }],
    ]);

    const list = buildRenderableEntities(entities, meta, new Map());

    expect(list[0].movePath).toBeUndefined();
    expect(list[0].moveSeq).toBeUndefined();
  });

  it('marks monsters dead at HP=0; characters never marked dead (unconscious only)', () => {
    const entities = new Map([
      ['char-alice', makeEntityState('char-alice', { x: 0, y: 0, z: 0 })],
      ['goblin-1', makeEntityState('goblin-1', { x: 1, y: -1, z: 0 })],
    ]);
    const meta = new Map<string, EntityMeta>([
      ['char-alice', { type: EntityType.CHARACTER, monsterRefId: undefined }],
      ['goblin-1', { type: EntityType.MONSTER, monsterRefId: 'goblin' }],
    ]);
    // Both at 0 HP — only the monster should be marked dead.
    const hp = new Map([
      ['char-alice', { current: 0, max: 10 }],
      ['goblin-1', { current: 0, max: 7 }],
    ]);

    const list = buildRenderableEntities(entities, meta, hp);
    expect(list.find((e) => e.entityId === 'char-alice')?.isDead).toBe(false);
    expect(list.find((e) => e.entityId === 'goblin-1')?.isDead).toBe(true);
  });

  function makeUnconsciousStatus(): EntityStatus {
    return {
      source: { module: 'dnd5e', type: 'condition', id: 'unconscious' },
      displayName: 'Unconscious',
    };
  }

  it('marks a CHARACTER entity downed when it carries the unconscious status (rpg-dnd5e-web#501)', () => {
    const entities = new Map([
      ['char-alice', makeEntityState('char-alice', { x: 0, y: 0, z: 0 })],
    ]);
    const meta = new Map<string, EntityMeta>([
      ['char-alice', { type: EntityType.CHARACTER, monsterRefId: undefined }],
    ]);
    const statuses = new Map<string, EntityStatus[]>([
      ['char-alice', [makeUnconsciousStatus()]],
    ]);

    const list = buildRenderableEntities(entities, meta, new Map(), statuses);
    expect(list[0]?.isDowned).toBe(true);
  });

  it('never marks a MONSTER entity downed, even with the unconscious status (CHARACTER-only guard)', () => {
    const entities = new Map([
      ['goblin-1', makeEntityState('goblin-1', { x: 1, y: -1, z: 0 })],
    ]);
    const meta = new Map<string, EntityMeta>([
      ['goblin-1', { type: EntityType.MONSTER, monsterRefId: 'goblin' }],
    ]);
    const statuses = new Map<string, EntityStatus[]>([
      ['goblin-1', [makeUnconsciousStatus()]],
    ]);

    const list = buildRenderableEntities(entities, meta, new Map(), statuses);
    expect(list[0]?.isDowned).toBe(false);
  });

  it('passes classRefId through from entityMeta to the renderable entity', () => {
    const entities = new Map([
      ['char-bob', makeEntityState('char-bob', { x: 1, y: -1, z: 0 })],
    ]);
    const meta = new Map<string, EntityMeta>([
      [
        'char-bob',
        {
          type: EntityType.CHARACTER,
          monsterRefId: undefined,
          classRefId: 'barbarian',
        },
      ],
    ]);

    const list = buildRenderableEntities(entities, meta, new Map());
    expect(list[0]?.classRefId).toBe('barbarian');
  });

  it('propagates ghost flag from EntityDisappeared (entity outside LoS)', () => {
    const entities = new Map([
      ['goblin-2', makeEntityState('goblin-2', { x: 4, y: -4, z: 0 }, true)],
    ]);
    const meta = new Map<string, EntityMeta>([
      ['goblin-2', { type: EntityType.MONSTER, monsterRefId: 'goblin' }],
    ]);
    const list = buildRenderableEntities(entities, meta, new Map());
    expect(list[0]?.isGhost).toBe(true);
  });

  it('falls back to obstacle type when entityMeta is missing for an entity', () => {
    const entities = new Map([
      ['unknown-1', makeEntityState('unknown-1', { x: 0, y: 0, z: 0 })],
    ]);
    // No meta entry — happens transiently between EntityAppeared and meta apply.
    const list = buildRenderableEntities(entities, new Map(), new Map());
    expect(list[0]?.type).toBe('obstacle');
    // Display name falls back to entityId when no monsterRefId is known.
    expect(list[0]?.name).toBe('unknown-1');
  });

  it('skips entities with no position (defensive)', () => {
    const entities = new Map([
      [
        'limbo-1',
        {
          entityId: 'limbo-1',
          position: undefined,
        } as unknown as EntityState & {
          ghost?: boolean;
        },
      ],
    ]);
    const list = buildRenderableEntities(entities, new Map(), new Map());
    expect(list).toHaveLength(0);
  });
});

describe('buildTurnOrderCombatState', () => {
  it('returns null when initiativeOrder is empty (FREE_ROAM or no snapshot yet)', () => {
    expect(buildTurnOrderCombatState([], '', 0, new Map())).toBeNull();
  });

  it('shims v2 initiative state into the v1alpha1 CombatState shape HexGrid expects', () => {
    const meta = new Map<string, EntityMeta>([
      ['char-alice', { type: EntityType.CHARACTER, monsterRefId: undefined }],
      ['goblin-1', { type: EntityType.MONSTER, monsterRefId: 'goblin' }],
    ]);
    const combatState = buildTurnOrderCombatState(
      ['char-alice', 'goblin-1'],
      'goblin-1',
      3,
      meta
    );
    expect(combatState?.round).toBe(3);
    expect(combatState?.activeIndex).toBe(1);
    expect(combatState?.turnOrder).toHaveLength(2);
    expect(combatState?.turnOrder[0]).toMatchObject({
      entityId: 'char-alice',
      entityType: 'character',
    });
    expect(combatState?.turnOrder[1]).toMatchObject({
      entityId: 'goblin-1',
      entityType: 'monster',
    });
  });

  it('falls back entityType to "npc" when entityMeta has no entry (transient gap)', () => {
    const combatState = buildTurnOrderCombatState(
      ['unknown-1'],
      'unknown-1',
      1,
      new Map()
    );
    expect(combatState?.turnOrder[0]).toMatchObject({
      entityId: 'unknown-1',
      entityType: 'npc',
    });
  });

  it('activeIndex is -1 when activeEntityId is not in the order (e.g. it died and was removed)', () => {
    const combatState = buildTurnOrderCombatState(
      ['char-alice'],
      'goblin-1',
      1,
      new Map()
    );
    expect(combatState?.activeIndex).toBe(-1);
  });
});

describe('buildDevPropDemoEntities (rpg-dnd5e-web#528 devPropDemoKeys)', () => {
  it('returns [] for an empty key list', () => {
    expect(buildDevPropDemoEntities([], { x: 0, y: 0, z: 0 })).toEqual([]);
  });

  it('returns [] for an undefined anchor (no-op when nothing to anchor to)', () => {
    expect(buildDevPropDemoEntities(['barrel'], undefined)).toEqual([]);
  });

  it('places one obstacle entity per key, each a valid hex neighbor of the anchor', () => {
    const anchor = { x: 2, y: -1, z: -1 };
    const entities = buildDevPropDemoEntities(['barrel', 'pillar'], anchor);
    expect(entities).toHaveLength(2);
    for (const e of entities) {
      expect(e.type).toBe('obstacle');
      // Cube coordinate invariant: x + y + z === 0 for every valid hex.
      expect(e.position.x + e.position.y + e.position.z).toBe(0);
      // Genuinely adjacent to the anchor, not stacked on it.
      const dist =
        Math.abs(e.position.x - anchor.x) +
        Math.abs(e.position.y - anchor.y) +
        Math.abs(e.position.z - anchor.z);
      expect(dist).toBe(2); // hex distance 1 == cube L1 distance 2
    }
  });

  it('carries the key as propRefId, and distinct entities don’t collide', () => {
    const entities = buildDevPropDemoEntities(['barrel', 'pillar', 'crate'], {
      x: 0,
      y: 0,
      z: 0,
    });
    expect(entities.map((e) => e.propRefId)).toEqual([
      'barrel',
      'pillar',
      'crate',
    ]);
    const ids = new Set(entities.map((e) => e.entityId));
    expect(ids.size).toBe(3);
    const positions = new Set(
      entities.map((e) => `${e.position.x},${e.position.y},${e.position.z}`)
    );
    expect(positions.size).toBe(3);
  });

  it('caps at the 6 available hex neighbors, silently dropping extras', () => {
    const keys = [
      'barrel',
      'crate',
      'pillar',
      'rock-pile',
      'stalagmite',
      'rune-stone',
      'barricade',
    ];
    const entities = buildDevPropDemoEntities(keys, { x: 0, y: 0, z: 0 });
    expect(entities).toHaveLength(6);
  });
});

describe('parseDevPropDemoKeys (Copilot review, rpg-dnd5e-web#530)', () => {
  it('returns [] for null input', () => {
    expect(parseDevPropDemoKeys(null)).toEqual([]);
  });

  it('returns [] for an empty string', () => {
    expect(parseDevPropDemoKeys('')).toEqual([]);
  });

  it('splits and trims a comma-separated list', () => {
    expect(parseDevPropDemoKeys('barrel, pillar ,crate')).toEqual([
      'barrel',
      'pillar',
      'crate',
    ]);
  });

  it('drops empty segments (trailing/double commas)', () => {
    expect(parseDevPropDemoKeys('barrel,,pillar,')).toEqual([
      'barrel',
      'pillar',
    ]);
  });

  it('deduplicates repeated keys, keeping first-occurrence order — the exact bug Copilot flagged: a repeated key would otherwise collide as a duplicate entityId in buildDevPropDemoEntities', () => {
    expect(parseDevPropDemoKeys('barrel,pillar,barrel,crate,pillar')).toEqual([
      'barrel',
      'pillar',
      'crate',
    ]);
  });

  it('composes with buildDevPropDemoEntities to guarantee unique entityIds even with duplicate query-param keys', () => {
    const keys = parseDevPropDemoKeys('barrel,barrel,barrel');
    const entities = buildDevPropDemoEntities(keys, { x: 0, y: 0, z: 0 });
    expect(entities).toHaveLength(1);
    const ids = new Set(entities.map((e) => e.entityId));
    expect(ids.size).toBe(entities.length);
  });
});

describe('parsePerfProbeWindowMs (Copilot review, rpg-dnd5e-web#546)', () => {
  it('returns undefined for null input (param absent)', () => {
    expect(parsePerfProbeWindowMs(null)).toBeUndefined();
  });

  it("returns undefined for a non-numeric value instead of NaN — the exact bug Copilot flagged: an unvalidated NaN windowMs makes DevPerfProbe's `elapsed >= windowMs` check never true, so the probe never completes", () => {
    expect(parsePerfProbeWindowMs('abc')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(parsePerfProbeWindowMs('')).toBeUndefined();
  });

  it('returns undefined for zero', () => {
    expect(parsePerfProbeWindowMs('0')).toBeUndefined();
  });

  it('returns undefined for a negative value', () => {
    expect(parsePerfProbeWindowMs('-500')).toBeUndefined();
  });

  it('returns undefined for Infinity', () => {
    expect(parsePerfProbeWindowMs('Infinity')).toBeUndefined();
  });

  it('parses a valid positive integer string', () => {
    expect(parsePerfProbeWindowMs('5000')).toBe(5000);
  });

  it('parses a valid positive decimal string', () => {
    expect(parsePerfProbeWindowMs('1500.5')).toBe(1500.5);
  });
});

describe('buildCryptLayout (rpg-dnd5e-web#558 crypt spike)', () => {
  it('is deterministic — two calls produce identical floor keys, wall list, and props', () => {
    const a = buildCryptLayout();
    const b = buildCryptLayout();
    expect(a.floorKeys).toEqual(b.floorKeys);
    expect(a.walls).toEqual(b.walls);
    expect(a.props).toEqual(b.props);
    expect(Array.from(a.themeWallHexKeys)).toEqual(
      Array.from(b.themeWallHexKeys)
    );
  });

  it('every floor key is a valid cube coordinate (x + y + z === 0)', () => {
    const { floorKeys } = buildCryptLayout();
    expect(floorKeys.length).toBeGreaterThan(0);
    for (const key of floorKeys) {
      const [x, y, z] = key.split(',').map(Number);
      expect(x + y + z).toBe(0);
    }
  });

  it('floor keys are unique — entrance chamber, corridor, and boss chamber never overlap', () => {
    const { floorKeys } = buildCryptLayout();
    expect(new Set(floorKeys).size).toBe(floorKeys.length);
  });

  it('produces exactly 29 floor hexes — entrance (7, radius-1 hexagon) + corridor (3) + boss chamber (19, radius-2 hexagon)', () => {
    // Discriminates against a broken room-shape/radius regression: any
    // change to hexesWithinRadius or the corridor length changes this
    // count.
    expect(buildCryptLayout().floorKeys).toHaveLength(29);
  });

  it('every non-door wall is a single-cell block — from and to are the exact same position (the real-server shape every renderer assumes)', () => {
    const { walls } = buildCryptLayout();
    const solidWalls = walls.filter(
      (w) => w.kind !== WallKind.DOOR_CLOSED && w.kind !== WallKind.DOOR_OPEN
    );
    expect(solidWalls.length).toBeGreaterThan(0);
    for (const wall of solidWalls) {
      expect(wall.from).toBeDefined();
      expect(wall.to).toBeDefined();
      expect(wall.from).toEqual(wall.to);
    }
  });

  it('has exactly 2 door walls, one DOOR_CLOSED and one DOOR_OPEN (variety per the brief), each carrying a real passage edge and an id', () => {
    const { walls } = buildCryptLayout();
    const doors = walls.filter(
      (w) => w.kind === WallKind.DOOR_CLOSED || w.kind === WallKind.DOOR_OPEN
    );
    expect(doors).toHaveLength(2);
    expect(doors.filter((d) => d.kind === WallKind.DOOR_CLOSED)).toHaveLength(
      1
    );
    expect(doors.filter((d) => d.kind === WallKind.DOOR_OPEN)).toHaveLength(1);
    for (const door of doors) {
      // A real passage edge (design doc §Q2): from !== to, unlike a solid
      // block. Discriminates against accidentally building doors the same
      // way as solid walls (from === to), which would silently fall
      // through buildDungeonWallSegments's degenerate-door branch instead
      // of rendering a frame on the intended edge.
      expect(door.from).toBeDefined();
      expect(door.to).toBeDefined();
      expect(door.from).not.toEqual(door.to);
      expect(door.id).toBeTruthy();
    }
  });

  it('door ids follow the __crypt-demo-*__ convention — Copilot review (PR #566): an un-namespaced door id risks colliding with a real server-provided Wall.id if this demo wiring is ever reused on a route that calls interact(encounterId, doorId, "open")', () => {
    const { walls } = buildCryptLayout();
    const doors = walls.filter(
      (w) => w.kind === WallKind.DOOR_CLOSED || w.kind === WallKind.DOOR_OPEN
    );
    expect(doors).toHaveLength(2);
    for (const door of doors) {
      expect(door.id).toMatch(/^__crypt-demo-.+__$/);
    }
  });

  it('both door edges connect two hexes that are BOTH real floor hexes — the door sits on the shared boundary between rooms, not floating outside either room', () => {
    const { walls, floorKeys } = buildCryptLayout();
    const floorSet = new Set(floorKeys);
    const doors = walls.filter(
      (w) => w.kind === WallKind.DOOR_CLOSED || w.kind === WallKind.DOOR_OPEN
    );
    for (const door of doors) {
      const fromKey = `${door.from!.x},${door.from!.y},${door.from!.z}`;
      const toKey = `${door.to!.x},${door.to!.y},${door.to!.z}`;
      expect(floorSet.has(fromKey)).toBe(true);
      expect(floorSet.has(toKey)).toBe(true);
    }
  });

  it('no solid wall hex is also a floor hex — walls and floor never collide', () => {
    const { walls, floorKeys } = buildCryptLayout();
    const floorSet = new Set(floorKeys);
    const solidWalls = walls.filter(
      (w) => w.kind !== WallKind.DOOR_CLOSED && w.kind !== WallKind.DOOR_OPEN
    );
    for (const wall of solidWalls) {
      const key = `${wall.from!.x},${wall.from!.y},${wall.from!.z}`;
      expect(floorSet.has(key)).toBe(false);
    }
  });

  it("themeWallHexKeys contains exactly the solid perimeter walls' own hex keys (not the doors', which bypass theme selection entirely)", () => {
    const { walls, themeWallHexKeys } = buildCryptLayout();
    const solidWalls = walls.filter(
      (w) => w.kind !== WallKind.DOOR_CLOSED && w.kind !== WallKind.DOOR_OPEN
    );
    const expectedKeys = new Set(
      solidWalls.map((w) => `${w.from!.x},${w.from!.y},${w.from!.z}`)
    );
    expect(themeWallHexKeys).toEqual(expectedKeys);
  });

  it('every prop has a valid cube-coord position and a propRefId that resolves to an already-synced model key in PROP_KEYS', () => {
    const { props } = buildCryptLayout();
    expect(props.length).toBeGreaterThan(0);
    for (const prop of props) {
      expect(prop.type).toBe('obstacle');
      expect(prop.position.x + prop.position.y + prop.position.z).toBe(0);
      expect(prop.propRefId).toBeTruthy();
      expect(PROP_KEYS[`dnd5e:props:${prop.propRefId}`]).toBeDefined();
    }
  });

  it('every prop has a unique entityId, distinct from real server-assigned ids (the __crypt-demo-*__ convention)', () => {
    const { props } = buildCryptLayout();
    const ids = props.map((p) => p.entityId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^__crypt-demo-.+__$/);
    }
  });

  it('every prop sits on an actual floor hex — nothing floats outside the rooms', () => {
    const { props, floorKeys } = buildCryptLayout();
    const floorSet = new Set(floorKeys);
    for (const prop of props) {
      const key = `${prop.position.x},${prop.position.y},${prop.position.z}`;
      expect(floorSet.has(key)).toBe(true);
    }
  });

  it('the boss chamber has exactly one sarcophagus (tomb) centerpiece', () => {
    const { props } = buildCryptLayout();
    expect(props.filter((p) => p.propRefId === 'tomb')).toHaveLength(1);
  });
});

describe('buildCryptMoodLights (rpg-dnd5e-web#558 crypt spike, mood-lighting pass)', () => {
  it('returns [] for an empty prop list', () => {
    expect(buildCryptMoodLights([])).toEqual([]);
  });

  it('produces a light for a light-source prop (candles) and skips non-light dressing (pillars, banners, chest, vase, tomb)', () => {
    const props = [
      {
        entityId: 'a',
        name: 'candle',
        position: { x: 0, y: 0, z: 0 },
        type: 'obstacle' as const,
        propRefId: 'candles',
      },
      {
        entityId: 'b',
        name: 'pillar',
        position: { x: 1, y: -1, z: 0 },
        type: 'obstacle' as const,
        propRefId: 'pillar',
      },
      {
        entityId: 'c',
        name: 'tomb',
        position: { x: 2, y: -2, z: 0 },
        type: 'obstacle' as const,
        propRefId: 'tomb',
      },
      {
        entityId: 'd',
        name: 'no ref',
        position: { x: 3, y: -3, z: 0 },
        type: 'obstacle' as const,
      },
    ];
    const lights = buildCryptMoodLights(props);
    expect(lights).toHaveLength(1);
  });

  it('candle lights use the sickly-green glow color, not a neutral/white default', () => {
    const props = [
      {
        entityId: 'a',
        name: 'candle',
        position: { x: 0, y: 0, z: 0 },
        type: 'obstacle' as const,
        propRefId: 'candles',
      },
    ];
    const [light] = buildCryptMoodLights(props);
    expect(light!.color).toBe('#3ddc84');
  });

  it('every light has a finite world-space position and positive intensity/distance falloff', () => {
    const props = [
      {
        entityId: 'a',
        name: 'candle',
        position: { x: 2, y: -1, z: -1 },
        type: 'obstacle' as const,
        propRefId: 'candles',
      },
    ];
    const [light] = buildCryptMoodLights(props);
    expect(light!.position).toHaveLength(3);
    for (const coord of light!.position) {
      expect(Number.isFinite(coord)).toBe(true);
    }
    expect(light!.intensity).toBeGreaterThan(0);
    expect(light!.distance).toBeGreaterThan(0);
  });

  it('the real crypt layout produces exactly one light per candle prop (2 entrance + 2 boss = 4), discriminating against a layout change silently adding/removing candles without updating lighting', () => {
    const { props } = buildCryptLayout();
    const candleCount = props.filter((p) => p.propRefId === 'candles').length;
    expect(candleCount).toBe(4);
    const lights = buildCryptMoodLights(props);
    expect(lights).toHaveLength(candleCount);
  });
});
