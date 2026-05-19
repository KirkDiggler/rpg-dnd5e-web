/**
 * Pure helpers backing the PlaytestMap component. Extracted into their own
 * file so the component file exports only the component (satisfies the
 * react-refresh/only-export-components ESLint rule).
 */

import type { EntityState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { EntityType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type { AbsoluteFloorTile } from '../../hooks/useDungeonMap';
import type { EntityMeta } from '../../hooks/useEncounterState';

/**
 * Render shape consumed by HexGrid for each entity on the map.
 * Mirrors the inline shape declared on HexGridProps.entities.
 */
export interface RenderableEntity {
  entityId: string;
  name: string;
  position: { x: number; y: number; z: number };
  type: 'player' | 'monster' | 'obstacle';
  isDead?: boolean;
  isGhost?: boolean;
}

/**
 * Synthesize a `floorTiles` map from the per-hex reveal set plus every
 * entity's current cell. Without the entity-cell fallback the local
 * player can't move from the seed position before GeometryRevealed lands.
 *
 * Cube coordinate constraint: x + y + z = 0. We don't enforce here —
 * positions come from the server which guarantees it.
 */
export function synthesizeFloorTiles(
  revealedHexes: Set<string>,
  entities: Iterable<{ position?: { x: number; y: number; z: number } }>,
  fallbackPosition?: { x: number; y: number; z: number }
): Map<string, AbsoluteFloorTile> {
  const tiles = new Map<string, AbsoluteFloorTile>();
  const add = (x: number, y: number, z: number) => {
    const key = `${x},${y},${z}`;
    if (!tiles.has(key)) {
      // roomId is empty for synthesized tiles — the playtest doesn't track
      // per-room boundaries (no v1alpha1 Room aggregation). HexGrid only
      // uses roomId for legacy color hinting, not pathing.
      tiles.set(key, { x, y, z, roomId: '' });
    }
  };

  for (const key of revealedHexes) {
    const [x, y, z] = key.split(',').map(Number);
    add(x, y, z);
  }

  for (const entity of entities) {
    const pos = entity.position;
    if (pos === undefined) continue;
    add(pos.x, pos.y, pos.z);
  }

  if (fallbackPosition) {
    add(fallbackPosition.x, fallbackPosition.y, fallbackPosition.z);
  }

  return tiles;
}

/**
 * Convert v2 EntityType into the 'player' | 'monster' | 'obstacle'
 * discriminator HexGrid expects. UNSPECIFIED is treated as obstacle so
 * unidentified entities still render as a blocker but never as a target.
 */
export function entityTypeToDisplay(
  type: EntityType | undefined
): 'player' | 'monster' | 'obstacle' {
  if (type === EntityType.CHARACTER) return 'player';
  if (type === EntityType.MONSTER) return 'monster';
  return 'obstacle';
}

/**
 * Build the RenderableEntity[] HexGrid consumes from the playtest's
 * v2-shaped state. Joins entities (position + ghost flag) with entityMeta
 * (type + monsterRefId) and entityHP (death state).
 */
export function buildRenderableEntities(
  entities: Map<string, EntityState & { ghost?: boolean }>,
  entityMeta: Map<string, EntityMeta>,
  entityHP: Map<string, { current: number; max: number }>
): RenderableEntity[] {
  const result: RenderableEntity[] = [];
  for (const [id, entity] of entities.entries()) {
    if (!entity.position) continue;
    const meta = entityMeta.get(id);
    const hp = entityHP.get(id);
    // Monsters die at 0 HP — characters go unconscious instead.
    // Matches isDead semantics from utils/entityHelpers.ts.
    const isDead =
      meta?.type === EntityType.MONSTER && hp ? hp.current <= 0 : false;
    const displayName = meta?.monsterRefId
      ? `${id} (${meta.monsterRefId})`
      : id;
    result.push({
      entityId: id,
      name: displayName,
      position: {
        x: entity.position.x ?? 0,
        y: entity.position.y ?? 0,
        z: entity.position.z ?? 0,
      },
      type: entityTypeToDisplay(meta?.type),
      isDead,
      isGhost: entity.ghost === true,
    });
  }
  return result;
}
