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
import { EntityType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import type { EntityMeta, EntityStatus } from '../../hooks/useEncounterState';
import {
  buildDevPropDemoEntities,
  buildRenderableEntities,
  buildTurnOrderCombatState,
  entityTypeToDisplay,
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
