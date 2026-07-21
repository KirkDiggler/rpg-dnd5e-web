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
import {
  EntityType,
  PositionSchema,
  WallKind,
  WallSchema,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type { AbsoluteFloorTile } from '../../hooks/dungeonMapGeometry';
import type { EntityMeta, EntityStatus } from '../../hooks/useEncounterState';
import {
  coordToKey,
  HEX_DIRECTIONS,
  type CubeCoord,
} from '../hex-grid/hexMath';

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
  /** The most recent genuine move's real hex-by-hex route
   * (rpg-dnd5e-web#542), passed straight through to HexEntity's movement
   * interpolation. Undefined for an entity that has never moved. */
  movePath?: { x: number; y: number; z: number }[];
  /** Monotonic counter bumped only by a genuine move — see
   * `useEncounterState.ts`'s `mergeEntityPosition` doc comment. */
  moveSeq?: number;
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
  entities: Map<
    string,
    EntityState & {
      ghost?: boolean;
      movePath?: { x: number; y: number; z: number }[];
      moveSeq?: number;
    }
  >,
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
      movePath: entity.movePath,
      moveSeq: entity.moveSeq,
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

/**
 * Parse EncounterMap's `?devPropDemoKeys=` query param value into a
 * deduplicated key list. Deduplication matters because
 * buildDevPropDemoEntities derives each synthetic entity's id from its
 * key (`__dev-prop-demo-${key}__`) — a repeated key (e.g.
 * `?devPropDemoKeys=barrel,barrel`) would otherwise produce two entities
 * sharing one entityId, colliding as HexGrid's render loop keys on
 * entityId (React key warning, unstable rendering). Order-preserving
 * (first occurrence wins), matching the intuitive left-to-right reading
 * of the query param. Returns `[]` for null/empty input.
 */
export function parseDevPropDemoKeys(raw: string | null): string[] {
  if (!raw) return [];
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parsed));
}

/**
 * Parse EncounterMap's `?perfProbeMs=` query param value into a validated
 * DevPerfProbe `windowMs` override, or `undefined` to let DevPerfProbe fall
 * back to its own default (Copilot review, rpg-dnd5e-web#546: an
 * unvalidated `Number(msParam)` turns a malformed value like
 * `?perfProbeMs=abc` into `NaN`; DevPerfProbe's completion check is
 * `elapsed >= windowMs`, and every comparison against `NaN` is `false`, so
 * the probe would never finish — it keeps forcing `invalidate()` every
 * frame forever instead of completing after one sampling window). A
 * non-positive value (`0` or negative) is equally nonsensical as a
 * sampling window, so it's rejected the same way. Returns `undefined`
 * (not a hardcoded fallback number) for null/NaN/non-positive input so
 * DevPerfProbe's own `windowMs = 8000` default prop stays the single
 * source of truth for the default window length.
 */
export function parsePerfProbeWindowMs(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

// ---------------------------------------------------------------------
// buildCryptLayout (rpg-dnd5e-web#558 crypt spike) — a fixed, hand-composed
// 3-room dungeon (entrance chamber -> corridor -> boss/tomb chamber)
// injected wholesale into the playtest map, opt-in via `?cryptdemo=1`
// (PlaytestMap.tsx). Exists to give #560 a concrete visual target and to
// exercise SyntyHexWall's new per-theme wall weighting (syntyHexWallHelpers
// .ts's WALL_VARIANTS_BY_THEME) end-to-end against real room geometry
// instead of a synthetic unit-test edge list. Pure and deterministic (no
// Math.random, no Date.now) — same output every call, same as every other
// helper in this file.
// ---------------------------------------------------------------------

/** HEX_DIRECTIONS is ordered E, NE, NW, W, SW, SE (hexMath.ts's own doc
 * comment) — named locally so the room layout below reads as compass
 * directions instead of numeric indices. */
const DIR_E = HEX_DIRECTIONS[0]!;
const DIR_NE = HEX_DIRECTIONS[1]!;
const DIR_NW = HEX_DIRECTIONS[2]!;
const DIR_W = HEX_DIRECTIONS[3]!;
const DIR_SW = HEX_DIRECTIONS[4]!;
const DIR_SE = HEX_DIRECTIONS[5]!;

function hexAdd(a: CubeCoord, b: CubeCoord): CubeCoord {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function hexScale(dir: CubeCoord, n: number): CubeCoord {
  return { x: dir.x * n, y: dir.y * n, z: dir.z * n };
}

/** Every hex within `radius` cube-distance of `center` — a filled hexagonal
 * blob (radius 0 = just the center, radius 1 = center + 6 neighbors = 7
 * hexes, radius 2 = 19 hexes). Standard cube-coordinate range enumeration:
 * for each x offset in [-radius, radius], y ranges over whatever keeps z
 * (= -x-y) within radius too. */
function hexesWithinRadius(center: CubeCoord, radius: number): CubeCoord[] {
  const hexes: CubeCoord[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    const dyMin = Math.max(-radius, -dx - radius);
    const dyMax = Math.min(radius, -dx + radius);
    for (let dy = dyMin; dy <= dyMax; dy++) {
      const dz = -dx - dy;
      hexes.push(hexAdd(center, { x: dx, y: dy, z: dz }));
    }
  }
  return hexes;
}

/** A single-cell blocked wall (`from === to`, the real-server shape every
 * WALL_VARIANTS-consuming test/renderer assumes — syntyHexWallHelpers.ts's
 * own doc comment). */
function solidWall(hex: CubeCoord): Wall {
  const position = create(PositionSchema, hex);
  return create(WallSchema, {
    from: position,
    to: position,
    kind: WallKind.SOLID,
  });
}

/** A door wall: `from` is the door's own cell, `to` names the single
 * designated passage edge (design doc §Q2) — NOT a second blocked cell.
 * `id` is required (unlike solidWall) because a door needs a click surface
 * (SyntyHexWall's onDoorClick). */
function doorWall(
  from: CubeCoord,
  to: CubeCoord,
  kind: WallKind,
  id: string
): Wall {
  return create(WallSchema, {
    from: create(PositionSchema, from),
    to: create(PositionSchema, to),
    kind,
    id,
  });
}

/** One dressing piece: an OBSTACLE RenderableEntity carrying a propRefId
 * that resolves through obstaclePropKeys.ts's resolvePropKeyForRefId
 * (`dnd5e:props:${refId}`) to an already-synced prop model
 * (propManifest.ts's PROP_KEYS). Entity ids are prefixed/unique per piece —
 * same "__<demo>-<key>__" convention as buildDevPropDemoEntities above, so
 * these can never collide with a real server-assigned entityId. */
function cryptProp(
  idSuffix: string,
  name: string,
  position: CubeCoord,
  propRefId: string
): RenderableEntity {
  return {
    entityId: `__crypt-demo-${idSuffix}__`,
    name,
    position,
    type: 'obstacle',
    propRefId,
  };
}

/** Every hex belonging to any of the crypt's 3 rooms, adjacent to at least
 * one hex OUTSIDE that set, becomes a single-cell solid wall on the OUTSIDE
 * hex (matching buildDungeonWallSegments' "wall hex" model — a wall is a
 * blocked cell bordering the room, not a boundary line ON the room's own
 * floor hex). Neighbors that are themselves floor (the two door junctions
 * below, where the entrance/corridor and corridor/boss floor sets touch
 * directly) are skipped automatically since they're in `floorSet` too. */
function buildPerimeterWalls(floorHexes: CubeCoord[]): Wall[] {
  const floorSet = new Set(floorHexes.map(coordToKey));
  const wallHexes = new Map<string, CubeCoord>();
  for (const hex of floorHexes) {
    for (const dir of HEX_DIRECTIONS) {
      const neighbor = hexAdd(hex, dir);
      const neighborKey = coordToKey(neighbor);
      if (floorSet.has(neighborKey)) continue; // interior/door edge, not a wall
      if (!wallHexes.has(neighborKey)) wallHexes.set(neighborKey, neighbor);
    }
  }
  return Array.from(wallHexes.values()).map(solidWall);
}

export interface CryptLayout {
  /** Cube-coord keys ("x,y,z", coordToKey's format — same shape as
   * `state.revealedHexes`) for every floor hex across all 3 rooms. */
  floorKeys: string[];
  /** Perimeter solid walls plus the 2 inter-room doors. */
  walls: Wall[];
  /** Dressing: sarcophagus, candles, pillars, banner, chest, vase. */
  props: RenderableEntity[];
  /** Wall-hex keys (coordToKey format) for every solid wall this layout
   * injected — the crypt's own opt-in set for SyntyHexWall's
   * `themeWallHexKeys` prop (rpg-dnd5e-web#558), so PlaytestMap can mark
   * exactly these walls `'crypt'`-themed without touching any real dungeon
   * wall sharing the same merged `walls` list. */
  themeWallHexKeys: Set<string>;
}

/**
 * Build a fixed 3-room crypt: a small entrance chamber (radius-1 hexagon, 7
 * hexes), a short 3-hex corridor, and a larger tomb/boss chamber (radius-2
 * hexagon, 19 hexes) — laid out due east along DIR_E so the whole thing
 * reads left-to-right. The two room/corridor junctions are DOOR walls (one
 * DOOR_CLOSED, one DOOR_OPEN, for visual variety per the brief) sitting on
 * the shared edge between two already-adjacent floor hexes — no separate
 * "door cell" outside either room's floor set (doorHexKinds/isBlocked in
 * dungeonMapGeometry.ts/HexGrid.tsx key off `Wall.from`, which is always one
 * of the two rooms' own floor hexes here).
 *
 * All positions below are computed from named direction constants via
 * hexAdd/hexScale — never hand-typed cube coordinates — so the geometry is
 * correct by construction (every result sums to 0) and shifting the layout
 * later (e.g. a different entrance offset) only touches the constants.
 */
export function buildCryptLayout(): CryptLayout {
  const entranceCenter: CubeCoord = { x: 0, y: 0, z: 0 };
  const entranceHexes = hexesWithinRadius(entranceCenter, 1); // 7 hexes

  const corridorStart = hexAdd(entranceCenter, hexScale(DIR_E, 2));
  const corridorHexes = [0, 1, 2].map((i) =>
    hexAdd(corridorStart, hexScale(DIR_E, i))
  ); // 3 hexes, straight east

  const bossCenter = hexAdd(corridorHexes[2]!, hexScale(DIR_E, 3));
  const bossHexes = hexesWithinRadius(bossCenter, 2); // 19 hexes

  // Copilot review (PR #566): un-namespaced door ids risk colliding with a
  // real server-provided Wall.id if this demo wiring is ever reused on a
  // route that calls interact(encounterId, doorId, 'open') — same
  // "__crypt-demo-*__" convention as cryptProp's entityId below guarantees
  // these can never collide with a real id.
  const doorEntranceToCorridor = doorWall(
    hexAdd(entranceCenter, DIR_E), // entrance chamber's E hex (already in entranceHexes)
    corridorHexes[0]!,
    WallKind.DOOR_CLOSED,
    '__crypt-demo-door-entrance__'
  );
  const doorCorridorToBoss = doorWall(
    corridorHexes[2]!,
    hexAdd(bossCenter, hexScale(DIR_W, 2)), // boss chamber's westmost hex (already in bossHexes)
    WallKind.DOOR_OPEN,
    '__crypt-demo-door-boss__'
  );

  const floorHexes = [...entranceHexes, ...corridorHexes, ...bossHexes];
  const perimeterWalls = buildPerimeterWalls(floorHexes);
  const walls = [...perimeterWalls, doorEntranceToCorridor, doorCorridorToBoss];

  // Entrance chamber dressing: a chest at the back, candles flanking the
  // doorway (both are neighbors of the door hex AND of the chamber center,
  // so they sit just inside the entrance on either side of it), a vase for
  // detail on the unused corner.
  const entranceProps: RenderableEntity[] = [
    cryptProp(
      'entrance-chest',
      'Crypt entrance: chest',
      hexAdd(entranceCenter, DIR_W),
      'chest'
    ),
    cryptProp(
      'entrance-candle-a',
      'Crypt entrance: candle (NE)',
      hexAdd(entranceCenter, DIR_NE),
      'candles'
    ),
    cryptProp(
      'entrance-candle-b',
      'Crypt entrance: candle (SE)',
      hexAdd(entranceCenter, DIR_SE),
      'candles'
    ),
    cryptProp(
      'entrance-vase',
      'Crypt entrance: vase',
      hexAdd(entranceCenter, DIR_NW),
      'vase'
    ),
  ];

  // Boss chamber dressing: sarcophagus centerpiece, a symmetric candle pair
  // flanking it (perpendicular to the east-west approach axis), a symmetric
  // pillar pair framing the room further out on the same axis, a rune
  // pillar on the back (east) wall opposite the entrance, and a banner pair
  // flanking that rune pillar.
  const runePillarPos = hexAdd(bossCenter, hexScale(DIR_E, 2));
  const bossProps: RenderableEntity[] = [
    cryptProp(
      'boss-tomb',
      'Crypt boss chamber: sarcophagus',
      bossCenter,
      'tomb'
    ),
    cryptProp(
      'boss-candle-a',
      'Crypt boss chamber: candle (N)',
      hexAdd(bossCenter, DIR_NW),
      'candles'
    ),
    cryptProp(
      'boss-candle-b',
      'Crypt boss chamber: candle (S)',
      hexAdd(bossCenter, DIR_SE),
      'candles'
    ),
    cryptProp(
      'boss-pillar-a',
      'Crypt boss chamber: pillar (N)',
      hexAdd(bossCenter, hexScale(DIR_NW, 2)),
      'pillar'
    ),
    cryptProp(
      'boss-pillar-b',
      'Crypt boss chamber: pillar (S)',
      hexAdd(bossCenter, hexScale(DIR_SE, 2)),
      'pillar'
    ),
    cryptProp(
      'boss-rune-pillar',
      'Crypt boss chamber: rune pillar (back wall)',
      runePillarPos,
      'rune-stone'
    ),
    cryptProp(
      'boss-banner-a',
      'Crypt boss chamber: banner (NE)',
      hexAdd(runePillarPos, DIR_NW),
      'banner'
    ),
    cryptProp(
      'boss-banner-b',
      'Crypt boss chamber: banner (SW)',
      hexAdd(runePillarPos, DIR_SW),
      'banner'
    ),
  ];

  return {
    floorKeys: floorHexes.map(coordToKey),
    walls,
    props: [...entranceProps, ...bossProps],
    themeWallHexKeys: new Set(perimeterWalls.map((w) => coordToKey(w.from!))),
  };
}
