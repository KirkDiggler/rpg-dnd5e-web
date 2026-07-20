/**
 * Pure helpers backing the PlaytestMap component. Extracted into their own
 * file so the component file exports only the component (satisfies the
 * react-refresh/only-export-components ESLint rule).
 */

import { create } from '@bufbuild/protobuf';
import {
  CombatStateSchema,
  InitiativeEntrySchema,
  type CombatState,
  type EntityState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { EntityType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type { AbsoluteFloorTile } from '../../hooks/dungeonMapGeometry';
import type { EntityMeta, EntityStatus } from '../../hooks/useEncounterState';

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
  /** v1alpha2 CharacterData.class_ref.id (e.g. "rogue"), from entityMeta —
   * rpg-dnd5e-web#501 class-model hookup. Undefined for monsters/obstacles
   * or when the server hasn't set a class ref. */
  classRefId?: string;
  /** True for CHARACTER entities carrying the "unconscious" condition
   * (rpg-dnd5e-web#501) — the honest downed signal for players, matching
   * entityHelpers.ts's established "only monsters die at 0 HP, characters
   * go unconscious instead" split. Distinct from `isDead` (monster-only,
   * computed from HP<=0 below) — a downed player isn't dead. */
  isDowned?: boolean;
  /** v1alpha2 ObstacleData.obstacle_ref.id / PropData.prop_ref.id, from
   * entityMeta (rpg-dnd5e-web#528, charter #523) — the live-route prop
   * reference-key signal HexEntity's resolver consumes
   * (obstaclePropKeys.ts's resolvePropKeyForEntity). Undefined until
   * platform starts sending a ref (no server code path sets one yet). */
  propRefId?: string;
}

/** Checks for a status whose source ref id is "unconscious" — the only
 * field this needs is `source.id` (see EntityStatus's own doc comment for
 * the full `{module, type: "condition", id}` ref shape). */
function hasUnconsciousStatus(statuses: EntityStatus[] | undefined): boolean {
  return statuses?.some((s) => s.source.id === 'unconscious') ?? false;
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
 * (type + monsterRefId + classRefId) and entityHP (death state).
 *
 * `entityStatuses` defaults to empty (optional, not required) so existing
 * callers/tests that don't track conditions keep compiling — an empty
 * statuses map is a legitimate real state (isDowned simply stays false),
 * not a stand-in for a required argument callers must now all supply.
 */
export function buildRenderableEntities(
  entities: Map<string, EntityState & { ghost?: boolean }>,
  entityMeta: Map<string, EntityMeta>,
  entityHP: Map<string, { current: number; max: number }>,
  entityStatuses: Map<string, EntityStatus[]> | undefined = new Map()
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
    const isDowned =
      meta?.type === EntityType.CHARACTER &&
      hasUnconsciousStatus(entityStatuses.get(id));
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
      classRefId: meta?.classRefId,
      isDowned,
      propRefId: meta?.propRefId,
    });
  }
  return result;
}

/**
 * Shim v2's initiativeOrder/activeEntityId/round into the v1alpha1
 * `CombatState` shape HexGrid's turn-order wiring expects — HexGrid derives
 * its `turnOrder`/`activeIndex`/`round` (and the TurnOrderOverlay it renders)
 * from a `combatState` prop, not from raw v2 primitives (see HexGrid.tsx's
 * `turnOrder` useMemo). This is pure data reshaping for that one consumer;
 * it does not introduce a second combat-state source of truth — every field
 * still traces back to useEncounterState's v2 store.
 *
 * Returns null when there's no active initiative order (FREE_ROAM, or no
 * snapshot yet) so callers can pass it straight through as `combatState` and
 * let HexGrid's existing `turnOrder.length > 0` check hide the overlay.
 */
export function buildTurnOrderCombatState(
  initiativeOrder: string[],
  activeEntityId: string,
  round: number,
  entityMeta: Map<string, EntityMeta>
): CombatState | null {
  if (initiativeOrder.length === 0) return null;
  return create(CombatStateSchema, {
    round,
    turnOrder: initiativeOrder.map((entityId) =>
      create(InitiativeEntrySchema, {
        entityId,
        entityType: entityTypeToInitiativeString(
          entityMeta.get(entityId)?.type
        ),
      })
    ),
    // -1 when activeEntityId isn't in the order (e.g. it died and was
    // removed) — TurnOrderOverlay already treats an out-of-range index as
    // "nobody highlighted" rather than defaulting to entry 0.
    activeIndex: initiativeOrder.indexOf(activeEntityId),
  });
}

/**
 * v1alpha1 InitiativeEntry.entity_type is documented as "character" |
 * "monster" | "npc" (a different vocabulary than entityTypeToDisplay's
 * HexGrid render discriminator above) — TurnOrderOverlay's own check
 * accepts "character" (and "player") case-insensitively for its class-emoji
 * branch.
 */
function entityTypeToInitiativeString(type: EntityType | undefined): string {
  if (type === EntityType.CHARACTER) return 'character';
  if (type === EntityType.MONSTER) return 'monster';
  return 'npc';
}

/** Cube-coord deltas (each summing to 0, so every result is a valid hex)
 * for the six neighbors of a hex, used to spread devPropDemo entities out
 * instead of stacking them on one tile. */
const HEX_NEIGHBOR_DELTAS: ReadonlyArray<{ x: number; y: number; z: number }> =
  [
    { x: 1, y: -1, z: 0 },
    { x: 1, y: 0, z: -1 },
    { x: 0, y: 1, z: -1 },
    { x: -1, y: 1, z: 0 },
    { x: -1, y: 0, z: 1 },
    { x: 0, y: -1, z: 1 },
  ];

/**
 * Dev/demo-only synthetic OBSTACLE entities proving the prop-model
 * resolver (rpg-dnd5e-web#528, charter #523) renders end-to-end on the
 * REAL EncounterView route, ahead of platform sending real
 * obstacle_ref/prop_ref data — verified against rpg-api `main` that no
 * server code path sets either ref yet, so this is the only way to
 * exercise the render path against a live encounter today.
 *
 * Opt-in via EncounterMap's `?devPropDemoKeys=barrel,pillar,rock-pile`
 * query param (comma-separated prop reference-key suffixes) — same
 * "read the query string once, default off" convention as EncounterMap's
 * existing `syntyDungeon` flag. Returns `[]` (a no-op) for an empty key
 * list or an undefined anchor position, so this is inert by default and
 * safe to leave wired in production: it can only ever ADD entities, never
 * read or mutate real encounter state.
 *
 * Placed at successive hex neighbors of `anchor` (EncounterMap passes the
 * local player's position) rather than a fixed absolute coordinate, so
 * the demo pieces always land next to a real, currently-visible entity
 * regardless of which dungeon/room happens to be loaded.
 */
export function buildDevPropDemoEntities(
  keys: string[],
  anchor: { x: number; y: number; z: number } | undefined
): RenderableEntity[] {
  if (keys.length === 0 || !anchor) return [];
  return keys.slice(0, HEX_NEIGHBOR_DELTAS.length).map((key, i) => {
    const delta = HEX_NEIGHBOR_DELTAS[i];
    return {
      entityId: `__dev-prop-demo-${key}__`,
      name: `Dev prop demo: ${key}`,
      position: {
        x: anchor.x + delta.x,
        y: anchor.y + delta.y,
        z: anchor.z + delta.z,
      },
      type: 'obstacle',
      propRefId: key,
    };
  });
}
