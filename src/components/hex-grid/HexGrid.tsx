/**
 * HexGrid - Main component for the hex grid battle map
 *
 * Creates a Three.js scene with:
 * - Orthographic camera looking down at the board
 * - Lighting (ambient + directional)
 * - Invisible ground plane for hit detection
 * - HexTile for each grid cell
 * - HexEntity for each entity
 * - Movement range border visualization
 * - Path preview on hover
 * - Turn order overlay
 */

import type { AuthoredWallRun } from '@/hooks/authoredWallRuns';
// facingToRotationY is the Kirk-approved reference mapping for a wire
// `facing` index (rpg-dnd5e-web unit/game-fidelity Bug B) — the builder's
// 3D preview (author/preview3d/DungeonPreview3D.tsx) already renders
// authored facing through this exact function, verified correct against
// TARGET-YAML.md's E/NE/NW/W/SW/SE convention. The live game route reuses
// it rather than re-deriving an equivalent, per this codebase's own
// "MEASURED, not inferred" facing-offset discipline (facing.ts's own doc
// comment on a prior naive-derivation hazard) — importing the single
// existing measurement is the only way to GUARANTEE agreement with it.
import { facingToRotationY } from '@/components/hex-grid/authorGridHelpers';
import { useCameraDials } from '@/feel/useFeelDials';
import {
  doorHexKinds,
  doorHexPositions,
  frontierGroundHintHexes,
  wallKey,
  type AbsoluteFloorTile,
} from '@/hooks/dungeonMapGeometry';
import type {
  ConnectorRun,
  EnvelopeCorner,
  EnvelopeRun,
  WallRunSegment,
} from '@/hooks/wallRuns';
import { CAMERA_OFFSET } from '@/rendering/calibrationConstants';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  CombatState,
  MonsterCombatState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type { ObstacleType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ErrorBoundary } from '../ui/Feedback/ErrorBoundary';
import { FrontierGroundHint } from './FrontierGroundHint';
import { HexEntity } from './HexEntity';
import {
  cubeToWorld,
  getHexLine,
  HEX_SIZE,
  type CubeCoord,
  type WorldPos,
} from './hexMath';
import { MovementRangeBorder } from './MovementRangeBorder';
import { resolvePropKeyForEntity } from './obstaclePropKeys';
import { PathPreview } from './PathPreview';
import {
  entityClickHandler,
  isRemembered,
  type SceneKnowledgeState,
} from './sceneKnowledge';
import { resolveEntityTint } from './selectionVisuals';
import { SelfIndicatorRing } from './SelfIndicatorRing';
import { ShadedHexFloor } from './ShadedHexFloor';
import { ShadedHexWall } from './ShadedHexWall';
import { SyntyHexFloor } from './SyntyHexFloor';
import { SyntyHexWall } from './SyntyHexWall';
import {
  collectWallHexes,
  computeWallAdjacentRotationY,
} from './syntyHexWallHelpers';
import type { TurnOrderEntry } from './TurnOrderOverlay';
import { TurnOrderOverlay } from './TurnOrderOverlay';
import { useCameraControls } from './useCameraControls';
import { useHexInteraction } from './useHexInteraction';
import { shouldShowMovementBorder, useMovementRange } from './useMovementRange';
import { WallRunMesh } from './WallRunMesh';

export interface HexGridEntity {
  entityId: string;
  name: string;
  position: { x: number; y: number; z: number };
  type: 'player' | 'monster' | 'obstacle';
  isDead?: boolean;
  isGhost?: boolean;
  classRefId?: string;
  monsterRefId?: string;
  isDowned?: boolean;
  obstacleType?: ObstacleType;
  propRefId?: string;
  /** Authored runtime-override facing (rpg-dnd5e-web unit/game-fidelity Bug
   * B) — wire hex-direction index E=0/NE=1/NW=2/W=3/SW=4/SE=5, converted to
   * a rotationY by `resolvePropRotationY` below. Undefined means no
   * authored override. */
  facing?: number;
  movePath?: { x: number; y: number; z: number }[];
  moveSeq?: number;
  knowledgeState?: SceneKnowledgeState;
}

export interface HexGridProps {
  floorTiles: Map<string, AbsoluteFloorTile>;
  rememberedFloorHexKeys?: ReadonlySet<string>;
  entities: HexGridEntity[];
  selectedEntityId?: string;
  onHexClick?: (coord: { x: number; y: number; z: number }) => void;
  onHexHover?: (coord: { x: number; y: number; z: number } | null) => void;
  onEntityClick?: (entityId: string) => void;
  // Combat integration props
  encounterId?: string | null;
  currentEntityId?: string | null;
  movementRemaining?: number;
  isPlayerTurn?: boolean;
  combatState?: CombatState | null;
  characters?: Character[];
  /** Monster combat state for texture selection (includes monsterType) */
  monsters?: MonsterCombatState[];
  onMoveComplete?: (path: CubeCoord[]) => void;
  /** Presentation-only completion of an entity's exact rendered move. */
  onEntityMovementPresentationComplete?: (
    entityId: string,
    moveSeq: number
  ) => void;
  onAttackComplete?: (targetId: string) => void;
  onHoverChange?: (
    entity: { id: string; type: string; name: string } | null
  ) => void;
  // Wall + door props (v1alpha2, rpg-dnd5e-web#526). Doors are DOOR_*-kind
  // walls (design doc §Q2, "DoorData entity is truth, the wall kind is its
  // projected geometry") — there is no separate door list on the wire. The
  // old v1alpha1 `doors: DoorInfo[]`/`onDoorClick(connectionId)`/
  // `isDoorLoading`/`onDoorHoverChange`/HexDoor path was 100% dead code (no
  // real caller ever populated `doors`) and was removed in this wave rather
  // than kept alongside the real mechanism (feedback_prefer_breaking_changes).
  walls?: Wall[];
  rememberedWallHexKeys?: ReadonlySet<string>;
  showFrontierGroundHints?: boolean;
  /**
   * Dungeon-walls redesign (rpg-project#133 design.md/plan.md's W2 slice):
   * the POSITIVE-CATEGORY-FILTERED wall list SyntyHexWall's legacy
   * per-cell renderer should draw (doors + interior pattern walls only —
   * see wallRunAdapters.legacyRenderWalls) now that envelope/connector
   * runs (below) own the room-boundary geometry instead of boundary-edge
   * wall entries. Undefined (every caller not yet updated — the
   * ShadedHexFloor/ShadedHexWall fallback path, and any harness caller
   * that hasn't threaded region data through yet) falls back to the full,
   * unfiltered `walls` list — byte-identical to pre-#133 behavior.
   */
  legacySyntyWalls?: Wall[];
  /** Envelope runs (wallRuns.computeWallRuns) — one straight run per side
   * per room, rendered with real Synty modular pieces by WallRunMesh (W3).
   * Empty/omitted (every caller not yet updated) renders none, same as
   * before this design existed. */
  envelopeRuns?: EnvelopeRun[];
  /** Envelope corners (wallRuns.computeWallRuns, W3) — one
   * `wall-corner-outer` fitting placement per room corner, closing the
   * gap/overlap between adjacent envelope sides' own independent offsets
   * (Kirk's #1 prod-screenshot defect). Empty/omitted renders no corner
   * pieces, unchanged from pre-W3 behavior. */
  envelopeCorners?: EnvelopeCorner[];
  /** Connector runs (wallRuns.computeWallRuns) — one straight run (split
   * around its door gap) per connector column, rendered by WallRunMesh
   * alongside the envelope runs. */
  connectorRuns?: ConnectorRun[];
  /** Connector-flanking fallback segments (wallRunAdapters.
   * connectorFallbackSegments, W3 "fallback restyle" ask) — structural
   * safety-net candidates (frontier doors, far room unexplored) rendered
   * with the SAME tiled-run visual language as a real ConnectorRun,
   * instead of SyntyHexWall's legacy per-cell hex-vertex look. Empty/
   * omitted renders nothing extra, unchanged from pre-W3 behavior. */
  connectorFallbackSegments?: WallRunSegment[];
  /** A canvas (authored) dungeon's own real wall edges, chained into
   * straight runs by authoredWallRuns.computeAuthoredWallRuns and rendered
   * by WallRunMesh with the SAME tiled-Synty-piece language as
   * envelopeRuns — see WallRunMesh's own `authoredRuns` prop doc comment
   * for why this can't reuse envelope/connector geometry (a canvas
   * dungeon's regions are semantic-only zones, not wall truth). Empty/
   * omitted (every caller not yet updated, and any chain-generated
   * dungeon) renders nothing extra, unchanged. */
  authoredRuns?: AuthoredWallRun[];
  /** Per-door exact position + rotationY override, keyed by Wall.id
   * (wallRunAdapters.connectorDoorPlanes) — passed straight through to
   * SyntyHexWall so a door frame/leaf sits exactly on its connector's own
   * straight column plane instead of the wire's arbitrary
   * doorPassageNeighbor-derived edge geometry. */
  doorPlaneOverrides?: ReadonlyMap<
    string,
    { position: WorldPos; rotationY: number }
  >;
  /**
   * Wall height override, world units — defaults to
   * calibrationConstants.WALL_HEIGHT (via SyntyHexWall's/WallRunMesh's own
   * defaults) so every existing caller renders byte-identical to before
   * this prop existed. Kirk's live-walk ask (rpg-project#132, `?wallHeight=`
   * dial): passed straight through to BOTH SyntyHexWall (wall segments,
   * door frame/leaf, corner/end fittings) and WallRunMesh (tiled envelope/
   * connector run pieces) so everything rises together, not just one or
   * the other.
   */
  wallHeight?: number;
  /**
   * Cutaway prototype (rpg-project#132, `?wallCutaway=1`): passed straight
   * through to WallRunMesh. ENVELOPE runs classify camera-facing (stub) or
   * away-facing (tall, `wallHeight`) via their own `facing` vector — see
   * WallRunMesh's own `effectiveWallHeight` doc comment. Connector runs
   * and their fallback stand-ins use a DIFFERENT rule keyed off
   * `playerPosition` below (WallRunMesh's own `connectorPartitionHeight`
   * doc comment). Default false renders every run at the uniform
   * `wallHeight`, unchanged from before this prop existed.
   */
  wallCutaway?: boolean;
  /**
   * The local player's own current world position (rpg-project#132
   * follow-up) — passed straight through to WallRunMesh's interior-
   * partition classification (`connectorPartitionHeight`): a connector
   * run/fallback segment stubs only when it sits between the camera and
   * the player's own current position, otherwise it defaults tall.
   * Undefined (every caller before this prop existed, or a player
   * position not yet resolved) defaults every connector/fallback
   * partition to tall — the same safe fallback as cutaway being off.
   */
  playerPosition?: WorldPos;
  /**
   * Cutaway prototype (rpg-project#132): per-door height override, keyed
   * by Wall.id (wallRunAdapters.connectorDoorHeights) — passed straight
   * through to SyntyHexWall so a door's frame/leaf matches whichever
   * height the connector wall it sits in was classified to, instead of
   * the single global `wallHeight` every door used before this
   * prototype. Undefined/omitted (every caller before this prototype) is
   * byte-identical to pre-cutaway behavior.
   */
  doorHeights?: ReadonlyMap<string, number>;
  /** Fired with the door's Wall.id (rpg-api-protos#186) when a DOOR_* wall
   * is clicked. The web only sends intent — Interact(id) — the server
   * decides what happens; this component computes nothing. */
  onDoorClick?: (doorId: string) => void;
  /**
   * Dev flag (rpg-dnd5e-web#432 harness-parity): render walls/doors/floor
   * with edge-aligned Synty pieces (SyntyHexWall/SyntyHexFloor) instead of
   * the procedural ShadedHexWall/ShadedHexFloor. Default false — behavior
   * is unchanged for every existing caller until they opt in.
   */
  syntyDungeon?: boolean;
  /**
   * Wall-hex keys (hexMath's `coordToKey` format) that should render with
   * SyntyHexWall's `'crypt'` theme instead of `'default'` (rpg-dnd5e-web
   * #558) — passed straight through to SyntyHexWall's own prop of the same
   * name. Undefined (every existing caller) means every wall stays
   * `'default'`, unchanged.
   */
  themeWallHexKeys?: ReadonlySet<string>;
  /**
   * Floor-tile keys (hexMath's `coordToKey` format) that should render with
   * SyntyHexFloor's lit, tinted crypt material instead of the default
   * unlit one (rpg-dnd5e-web#558 PR review — the floor otherwise ignores
   * scene lighting entirely). Undefined (every existing caller) means
   * every tile keeps the exact pre-existing #481/#485 rendering.
   */
  themeFloorHexKeys?: ReadonlySet<string>;
  /**
   * Whole-space theme (rpg-dnd5e-web#558 real-route consumption): when set
   * to `'crypt'`, passed straight through to SyntyHexWall's/SyntyHexFloor's
   * own `spaceTheme` prop, which then treats EVERY wall segment/floor tile
   * as themed regardless of `themeWallHexKeys`/`themeFloorHexKeys` (those
   * stay the `?cryptdemo=1` harness room's own per-hex mechanism —
   * additive, not replaced). Undefined (every caller before this prop
   * existed, and every non-crypt real dungeon) renders byte-identical to
   * pre-#558 behavior.
   */
  spaceTheme?: 'crypt';
  /**
   * Mood-lighting overrides (rpg-dnd5e-web#558 crypt spike, Kirk's POLYGON
   * Dark Fortress reference) — replaces the flat `ambientLight`/
   * `directionalLight` intensities below when set, so an injected room can
   * go near-dark instead of evenly lit. Undefined (every existing caller)
   * keeps the original 0.6/0.8 defaults, unchanged.
   */
  ambientIntensity?: number;
  directionalIntensity?: number;
  /**
   * Point lights placed at prop positions (candles, braziers) for the same
   * mood-lighting pass — simple R3F point lights with distance falloff,
   * not a lighting engine. Empty/undefined (every existing caller) adds
   * nothing.
   */
  moodPointLights?: Array<{
    position: [number, number, number];
    color: string;
    intensity: number;
    distance: number;
  }>;
  /**
   * Look-lab lighting experiment (rpg-dnd5e-web#558 follow-up): the SAME
   * light specs as `moodPointLights` above, passed straight through to
   * SyntyHexFloor so it can blend each nearby tile's tint toward the
   * light's color (deterministic per-tile color math, NOT a lit
   * material — see syntyHexFloorHelpers.ts's doc comment for why this
   * avoids the #481/#587 cross-environment risk the reverted lit-floor
   * experiment hit). Callers typically pass the identical array already
   * built for `moodPointLights` — the two are independent props only so
   * a caller COULD light the scene without pooling the floor, not because
   * they're expected to diverge in practice. Empty/undefined (every
   * caller before this experiment) is a no-op.
   */
  floorPoolLights?: Array<{
    position: [number, number, number];
    color: string;
    intensity?: number;
    distance: number;
  }>;
  /**
   * Dev/Kirk-only A/B, passed straight through to SyntyHexFloor's own
   * `litSurfaces` prop — see that prop's doc comment. Default
   * false/undefined for every caller; local screenshots of this path
   * aren't evidence (see the same doc comment for why).
   */
  litSurfaces?: boolean;
  /** Extra scene content rendered inside the Canvas after the built-in
   * layers (e.g. the playtest harness's Synty model showcase). */
  children?: React.ReactNode;
}

// Ground plane size - large enough to cover the entire grid with plenty of margin
const GROUND_PLANE_SIZE = 200;

/** Prop reference keys that get a computed wall-facing rotationY
 * (rpg-game-assets#36 wave-1, issue #623 increment 5) instead of the
 * default 0 — today just wall-banner. A `Set`, not a single hardcoded
 * key, so a future wall-mounted decor piece (a second banner variant, a
 * wall-mounted trophy, etc.) opts in by adding its key here rather than
 * duplicating the whole rotation-computation wiring. */
const WALL_ADJACENT_PROP_KEYS = new Set<string>(['dnd5e:props:wall-banner']);

/** The rotationY HexEntity's `propRotationY` prop should actually receive
 * for one entity (rpg-dnd5e-web unit/game-fidelity Bug B) — the computed
 * wall-adjacent rotation (wall-banner, geometry-derived from wall
 * neighbors, ignores `facing` entirely) wins when present, since it solves
 * a DIFFERENT problem (flush-against-a-specific-wall-face) that a bare
 * `facingToRotationY` conversion doesn't attempt; otherwise an authored
 * wire `facing` (statues, bookcases, etc.) converts via the same
 * Kirk-approved `facingToRotationY` the builder's 3D preview already uses.
 * `undefined` (no wall-adjacent match AND no authored facing) falls
 * through to PropModel's own rotationY=0 default, unchanged from every
 * entity before this field existed. Pulled out of the render loop as a
 * pure, exported function so the precedence rule is covered by a direct
 * unit test instead of only a live-render assertion — same "pull the
 * composition into arithmetic a test can pin" reasoning as
 * HexEntity.tsx's `shouldTiltDeadOrDowned`. */
// eslint-disable-next-line react-refresh/only-export-components
export function resolvePropRotationY(
  wallAdjacentRotationY: number | undefined,
  facing: number | undefined
): number | undefined {
  if (wallAdjacentRotationY !== undefined) return wallAdjacentRotationY;
  return facing === undefined ? undefined : facingToRotationY(facing);
}

// Scene consumes this exact helper; exporting it permits pathfinding coverage.
// eslint-disable-next-line react-refresh/only-export-components
export function isHexBlocked(
  coord: CubeCoord,
  floorTileKeys: Pick<ReadonlyMap<string, unknown>, 'has'>,
  entities: HexGridProps['entities'],
  currentEntityId: string | null | undefined,
  doorKinds: ReadonlyMap<string, WallKind>
): boolean {
  const key = `${coord.x},${coord.y},${coord.z}`;
  const doorKind = doorKinds.get(key);
  if (doorKind === WallKind.DOOR_CLOSED || doorKind === WallKind.DOOR_LOCKED) {
    return true;
  }
  if (doorKind !== WallKind.DOOR_OPEN && !floorTileKeys.has(key)) return true;
  return entities.some(
    (entity) =>
      !entity.isDead &&
      entity.position.x === coord.x &&
      entity.position.y === coord.y &&
      entity.position.z === coord.z &&
      entity.entityId !== currentEntityId
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function visibleTurnOrder<T extends { entityId: string }>(
  entities: ReadonlyArray<Pick<HexGridEntity, 'entityId' | 'knowledgeState'>>,
  turnOrder: ReadonlyArray<T>
): T[] {
  const rememberedEntityIds = new Set(
    entities
      .filter((entity) => isRemembered(entity.knowledgeState))
      .map((entity) => entity.entityId)
  );
  return turnOrder.filter((entry) => !rememberedEntityIds.has(entry.entityId));
}

// eslint-disable-next-line react-refresh/only-export-components
export function rememberedWallRunIds(
  floorTiles: ReadonlyMap<string, AbsoluteFloorTile>,
  rememberedFloorHexKeys: ReadonlySet<string> | undefined,
  walls: ReadonlyArray<Wall>,
  rememberedWallHexKeys: ReadonlySet<string> | undefined
): { envelopeRegionIds: Set<string>; connectorDoorIds: Set<string> } {
  const regionFloorKeys = new Map<string, string[]>();
  for (const [key, tile] of floorTiles) {
    if (!tile.roomId) continue;
    const keys = regionFloorKeys.get(tile.roomId) ?? [];
    keys.push(key);
    regionFloorKeys.set(tile.roomId, keys);
  }

  const envelopeRegionIds = new Set(
    [...regionFloorKeys].flatMap(([roomId, keys]) =>
      keys.every((key) => rememberedFloorHexKeys?.has(key)) ? [roomId] : []
    )
  );
  const connectorDoorIds = new Set<string>();
  for (const wall of walls) {
    if (!wall.id || !wall.from) continue;
    const key = `${wall.from.x},${wall.from.y},${wall.from.z}`;
    if (rememberedWallHexKeys?.has(key)) connectorDoorIds.add(wall.id);
  }

  return { envelopeRegionIds, connectorDoorIds };
}

/**
 * Scene component - renders inside the Canvas
 * Separated so we can use React Three Fiber hooks
 */
function Scene({
  floorTiles,
  entities,
  selectedEntityId,
  onHexClick,
  onHexHover,
  onEntityClick,
  currentEntityId,
  movementRemaining = 0,
  isPlayerTurn = false,
  combatState = null,
  onMoveComplete,
  onEntityMovementPresentationComplete,
  onAttackComplete,
  onHoverChange,
  onDoorClick,
  characters = [],
  monsters = [],
  walls = [],
  rememberedFloorHexKeys,
  rememberedWallHexKeys,
  showFrontierGroundHints = true,
  legacySyntyWalls,
  envelopeRuns = [],
  envelopeCorners = [],
  connectorRuns = [],
  connectorFallbackSegments = [],
  authoredRuns = [],
  doorPlaneOverrides,
  wallHeight,
  wallCutaway = false,
  playerPosition,
  doorHeights,
  syntyDungeon = false,
  themeWallHexKeys,
  themeFloorHexKeys,
  spaceTheme,
  ambientIntensity = 0.6,
  directionalIntensity = 0.8,
  moodPointLights = [],
  // No `= []` default here (Copilot review, PR #620) — unlike
  // moodPointLights above, a fresh array literal every render would give
  // SyntyHexFloor's `poolLights` prop a new identity each time even when
  // pooling is "off", defeating memoization for no reason. Left
  // `undefined`, SyntyHexFloorTile's own `!poolLights || poolLights.length
  // === 0` check already treats that identically to an empty array.
  floorPoolLights,
  litSurfaces = false,
  children,
}: HexGridProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const visibleEntities = useMemo(
    () => entities.filter((entity) => !isRemembered(entity.knowledgeState)),
    [entities]
  );
  const visibleFloorTiles = useMemo(
    () =>
      new Map(
        [...floorTiles].filter(([key]) => !rememberedFloorHexKeys?.has(key))
      ),
    [floorTiles, rememberedFloorHexKeys]
  );
  const visibleWalls = useMemo(
    () =>
      walls.filter((wall) => {
        if (!wall.from) return true;
        return !rememberedWallHexKeys?.has(
          `${wall.from.x},${wall.from.y},${wall.from.z}`
        );
      }),
    [walls, rememberedWallHexKeys]
  );
  const rememberedRunIds = useMemo(
    () =>
      rememberedWallRunIds(
        floorTiles,
        rememberedFloorHexKeys,
        walls,
        rememberedWallHexKeys
      ),
    [floorTiles, rememberedFloorHexKeys, walls, rememberedWallHexKeys]
  );

  // Wall-mounted decor orientation (rpg-game-assets#36 wave-1, issue #623
  // increment 5) — an entity resolving to one of WALL_ADJACENT_PROP_KEYS
  // gets a computed rotationY facing the wall it sits next to, same
  // "align a piece's local +X with the hex edge" math the wall/door
  // pieces themselves already use (computeWallAdjacentRotationY's own doc
  // comment). Every other entity is untouched — this map only ever holds
  // entries for the specific keys that need it, and PropModel/HexEntity
  // fall back to rotationY=0 (today's default for every non-door prop)
  // when an entityId has no entry here.
  // Precomputed ONCE per (entities, walls) change and reused for every
  // matching entity below (Copilot review, PR #625) — computeWallAdjacentRotationY
  // used to rebuild this same map internally on every call, making this
  // loop O(entities * walls) instead of O(walls + entities).
  const wallKindByHex = useMemo(() => collectWallHexes(walls), [walls]);
  const wallAdjacentRotations = useMemo(() => {
    const map = new Map<string, number>();
    for (const entity of entities) {
      const propKey = resolvePropKeyForEntity({
        obstacleType: entity.obstacleType,
        propRefId: entity.propRefId,
      });
      if (!propKey || !WALL_ADJACENT_PROP_KEYS.has(propKey)) continue;
      const rotationY = computeWallAdjacentRotationY(
        entity.position,
        walls,
        HEX_SIZE,
        wallKindByHex
      );
      if (rotationY !== undefined) map.set(entity.entityId, rotationY);
    }
    return map;
  }, [entities, walls, wallKindByHex]);

  // Final per-entity propRotationY (rpg-dnd5e-web unit/game-fidelity Bug B)
  // — combines the wall-adjacent computation above with an authored wire
  // `facing` via resolvePropRotationY's own precedence rule. Precomputed
  // once per (entities, wallAdjacentRotations) change, same reasoning as
  // wallAdjacentRotations itself: O(entities) here instead of resolving
  // per-entity inline in the render loop below.
  const propRotationYByEntity = useMemo(() => {
    const map = new Map<string, number>();
    for (const entity of entities) {
      const rotationY = resolvePropRotationY(
        wallAdjacentRotations.get(entity.entityId),
        entity.facing
      );
      if (rotationY !== undefined) map.set(entity.entityId, rotationY);
    }
    return map;
  }, [entities, wallAdjacentRotations]);

  // Create character lookup map by ID for efficient entity -> character mapping
  const characterMap = useMemo(() => {
    const map = new Map<string, (typeof characters)[0]>();
    for (const character of characters) {
      map.set(character.id, character);
    }
    return map;
  }, [characters]);

  // Create monster lookup map by ID for efficient entity -> monsterType mapping
  const monsterMap = useMemo(() => {
    const map = new Map<string, (typeof monsters)[0]>();
    for (const monster of monsters) {
      map.set(monster.monsterId, monster);
    }
    return map;
  }, [monsters]);

  // Shaded-wall elements, shared by the non-Synty render path and the Synty
  // path's ErrorBoundary fallback below. Memoized on `walls`/`onDoorClick` —
  // Copilot review on #479: without this, the fallback prop rebuilt
  // walls.map(...) on every Scene render (hover/path-preview churn), even
  // though it's only ever displayed while the boundary is in its (rare,
  // sticky-until-remount) error state.
  const shadedWalls = useMemo(
    () =>
      walls.map((wall) => (
        <ShadedHexWall
          key={wallKey(wall)}
          wall={wall}
          hexSize={HEX_SIZE}
          onDoorClick={onDoorClick}
          rememberedWallHexKeys={rememberedWallHexKeys}
        />
      )),
    [walls, onDoorClick, rememberedWallHexKeys]
  );

  // Revealed-floor bbox: center + extent of all revealed floor tiles.
  // `gridCenter` (below) is the camera's one-time starting position — see
  // stableTarget. The full bounds also feed `Home`'s on-demand fit (#906,
  // cameraFit.ts) via useCameraControls' `revealedBounds` option.
  const revealedBounds = useMemo(() => {
    if (floorTiles.size === 0) return null;
    let minX = Infinity,
      maxX = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;
    for (const [, tile] of floorTiles) {
      const worldPos = cubeToWorld(
        { x: tile.x, y: tile.y, z: tile.z },
        HEX_SIZE
      );
      minX = Math.min(minX, worldPos.x);
      maxX = Math.max(maxX, worldPos.x);
      minZ = Math.min(minZ, worldPos.z);
      maxZ = Math.max(maxZ, worldPos.z);
    }
    // Tile centers alone understate the revealed footprint — each tile's
    // own visual extent reaches roughly HEX_SIZE beyond its center, so pad
    // one hex radius on every side.
    return {
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      width: maxX - minX + HEX_SIZE * 2,
      height: maxZ - minZ + HEX_SIZE * 2,
    };
  }, [floorTiles]);

  const gridCenter = useMemo(
    () =>
      revealedBounds
        ? new THREE.Vector3(revealedBounds.centerX, 0, revealedBounds.centerZ)
        : new THREE.Vector3(0, 0, 0),
    [revealedBounds]
  );

  // Stable base target for useCameraControls' panning, seeded once from
  // the first non-empty gridCenter and frozen after that.
  //
  // Previously `target: gridCenter` was fed to useCameraControls directly:
  // gridCenter is a NEW Vector3 every time floorTiles grows (every
  // GeometryRevealed event), and useCameraControls snaps the camera
  // straight to a changed target reference. Net effect: every reveal
  // recentered the camera on the ever-growing revealed-area bbox, so the
  // player (and any nearby walls) could jump toward the frame's edge
  // mid-exploration — the "camera auto-zoom frames the action out of
  // shot" half of rpg-dnd5e-web#457. The camera's real, continuous framing
  // is now driven by focusTarget below (follows the local player), so this
  // only needs to seed a sane starting point.
  const initialTargetRef = useRef<THREE.Vector3 | null>(null);
  if (initialTargetRef.current === null && floorTiles.size > 0) {
    initialTargetRef.current = gridCenter.clone();
  }
  const stableTarget = initialTargetRef.current ?? gridCenter;

  // Camera focus target: continuously follows the LOCAL PLAYER's own
  // position. currentEntityId is always the local player here — both
  // EncounterMap.tsx and PlaytestMap.tsx pass `currentEntityId={myEntityId}`,
  // never the combat-active-turn entity, despite the name. Depending on the
  // player's live x/y/z (not just currentEntityId's stable identity) is
  // what makes this memo — and the smooth lerp it drives in
  // useCameraControls — re-trigger on every move, biasing framing toward
  // the player instead of the revealed-area bbox (rpg-dnd5e-web#457).
  const myEntity = useMemo(
    () =>
      currentEntityId
        ? visibleEntities.find((e) => e.entityId === currentEntityId)
        : undefined,
    [currentEntityId, visibleEntities]
  );
  const myPosX = myEntity?.position.x;
  const myPosY = myEntity?.position.y;
  const myPosZ = myEntity?.position.z;
  const focusTarget = useMemo(() => {
    if (myPosX === undefined || myPosY === undefined || myPosZ === undefined) {
      return null;
    }
    const worldPos = cubeToWorld({ x: myPosX, y: myPosY, z: myPosZ }, HEX_SIZE);
    return new THREE.Vector3(worldPos.x, 0, worldPos.z);
  }, [myPosX, myPosY, myPosZ]);

  // Camera-feel dials (`?camera=persp`, `?pitchCurve=1`, ...) — all-off by
  // default, so with no query params this is exactly the fixed-angle
  // orthographic rig it has always been. LIVE (#906 batch 2): the drawer's
  // registered dials (rotateSpeed, panSpeed, orbitPivot, the zoom/pitch
  // ladder) apply on the very next render, no remount — useCameraControls
  // reads them as plain props closed over fresh each frame. `perspective`/
  // `fovDeg`/`minDistance`/`maxDistance` stay URL-only (see
  // CAMERA_DIAL_SPECS's own doc comment), so those three cannot change
  // without a page reload regardless. See cameraDials.ts.
  const cameraDials = useCameraDials();

  // Custom camera controls: WASD pan, Q/E rotate, scroll zoom
  useCameraControls({
    target: stableTarget,
    // Kept as this route's own literal override — the pitch curve (default
    // ON) drives polar angle per zoom band and only falls back to this fixed
    // value under `?pitchCurve=0`. Unrelated to the #906 rotate/pan dials
    // below, which both routes now share via cameraDials instead of
    // diverging per-route literals.
    polarAngle: Math.PI / 3.5, // ~51 degrees from vertical - slightly lower tactical angle
    panSpeed: cameraDials.panSpeed,
    rotateSpeed: cameraDials.rotateSpeed,
    orbitPivot: cameraDials.orbitPivot,
    dragRotate: cameraDials.dragRotate,
    minZoom: cameraDials.zoomMin,
    maxZoom: cameraDials.zoomMax,
    focusTarget,
    curve: cameraDials.curve,
    perspective: cameraDials.perspective,
    minDistance: cameraDials.minDistance,
    maxDistance: cameraDials.maxDistance,
    revealedBounds,
  });

  // Build entity map for interaction hook (excludes dead entities so they
  // cannot be hovered, targeted, or path-blocked)
  const entitiesMap = useMemo(() => {
    const map = new Map();
    visibleEntities.forEach((entity) => {
      if (entity.isDead) return; // Dead entities are not interactive
      // Look up monster type if this is a monster entity
      const monster =
        entity.type === 'monster' ? monsterMap.get(entity.entityId) : undefined;
      map.set(entity.entityId, {
        position: {
          x: entity.position.x,
          y: entity.position.y,
          z: entity.position.z,
        },
        type: entity.type,
        name: entity.name,
        monsterType: monster?.monsterType,
      });
    });
    return map;
  }, [visibleEntities, monsterMap]);

  // Get current entity position
  const currentEntityPosition = useMemo(() => {
    if (!currentEntityId) return null;
    const entity = visibleEntities.find((e) => e.entityId === currentEntityId);
    if (!entity) return null;
    return {
      x: entity.position.x,
      y: entity.position.y,
      z: entity.position.z,
    };
  }, [currentEntityId, visibleEntities]);

  // Map of door-hex key -> WallKind (DOOR_CLOSED/DOOR_OPEN), from the v2
  // `walls` list (rpg-dnd5e-web#526). A door's hex sits on the boundary
  // between chambers and is omitted from either chamber's floor-tile bbox,
  // so it needs its own walkability rule, not just floor-tile membership:
  // a CLOSED door blocks movement even if somehow flagged as floor, and an
  // OPEN door is walkable even though it's not a floor tile. Without the
  // OPEN half, A* would see the door as an impassable wall and refuse to
  // path between revealed chambers — the "my pathing on the client never
  // lets me cross" bug. The door-click flow is what flips CLOSED -> OPEN.
  const doorKinds = useMemo(() => doorHexKinds(visibleWalls), [visibleWalls]);

  // Check if a hex is blocked (not a floor tile, or has an entity, or is a
  // closed door). An open door is treated as walkable even when it's not a
  // floor tile.
  // Uses useCallback to ensure stable function reference for downstream memoization
  const isBlocked = useCallback(
    (coord: CubeCoord) =>
      isHexBlocked(
        coord,
        visibleFloorTiles,
        visibleEntities,
        currentEntityId,
        doorKinds
      ),
    [visibleEntities, currentEntityId, visibleFloorTiles, doorKinds]
  );

  // Identifies a hex as occupied by another (non-current, non-dead) entity.
  // Rendering-only: used to suppress the movement-range border's "hole"
  // edge around an ally without changing what's actually reachable —
  // useMovementRange's reachability calc uses the full entity-aware
  // isBlocked below, same as real pathfinding, so the border never
  // promises a hex real movement would refuse (rpg-dnd5e-web#459 Copilot
  // review). See useMovementRange.ts's calculateBoundaryEdges doc comment.
  const isOccupiedByOtherEntity = useCallback(
    (coord: CubeCoord) =>
      visibleEntities.some(
        (entity) =>
          !entity.isDead &&
          entity.position.x === coord.x &&
          entity.position.y === coord.y &&
          entity.position.z === coord.z &&
          entity.entityId !== currentEntityId
      ),
    [visibleEntities, currentEntityId]
  );

  // v1alpha2 TURN_BASED signal: buildTurnOrderCombatState (in
  // playtestMapHelpers.ts) returns null when initiativeOrder is empty, i.e.
  // FREE_ROAM. Computed here (not just below, where a second identical
  // reference used to live) because it also drives effectiveMovementRemaining.
  const inTurnBasedCombat = combatState != null;

  // rpg-dnd5e-web#483: `movementRemaining` (EncounterMap's DEFAULT_MOVEMENT_FEET
  // fallback when the caller doesn't wire real turn economy) is a real per-turn
  // budget in TURN_BASED, but outside combat there IS no client-visible economy
  // to measure against — TurnState.economy only exists mid-turn. Gating
  // free-roam movement on that same number was an invented client-side budget
  // the server doesn't share (Boundary Rule: client references, never
  // calculates/enforces rules). Free-roam gets its own path: any click on a
  // revealed, unblocked hex dispatches — reachability is bounded by
  // `isBlocked` (unrevealed/wall/occupied hexes are excluded regardless of
  // this number), not by a fabricated feet-remaining ceiling. The server is
  // the one that will actually reject an illegal move.
  const effectiveMovementRemaining = inTurnBasedCombat
    ? movementRemaining
    : Number.MAX_SAFE_INTEGER;

  // Use the interaction hook for hover/click detection with path preview
  const {
    hoveredHex,
    selectedHex,
    groundPlaneProps,
    pathPreview,
    canAttack,
    attackPath,
    hoveredEntity,
  } = useHexInteraction({
    hexSize: HEX_SIZE,
    floorTiles: visibleFloorTiles,
    onHexClick: (coord) => {
      // Only allow interactions on player turn and when not processing
      if (!isPlayerTurn || isProcessing) return;

      // If we have a path preview, execute move
      if (pathPreview.length > 0 && onMoveComplete) {
        setIsProcessing(true);
        onMoveComplete(pathPreview);
        // Parent component will reset isProcessing via state update
        setTimeout(() => setIsProcessing(false), 100);
      }

      onHexClick?.(coord);
    },
    onHexHover,
    entityPosition: currentEntityPosition,
    movementRemaining: effectiveMovementRemaining,
    isBlocked,
    entities: entitiesMap,
  });

  // Notify parent when hovered entity changes
  useEffect(() => {
    onHoverChange?.(hoveredEntity);
  }, [hoveredEntity, onHoverChange]);

  // inTurnBasedCombat is computed above (drives effectiveMovementRemaining
  // too). Used here to decide when the movement border is actionable rather
  // than idle-always-on (rpg-dnd5e-web#456). Computed BEFORE useMovementRange
  // below so it can gate the hook's own work, not just its render output.
  const isPlanningMove = hoveredHex !== null || pathPreview.length > 0;
  const showMovementBorder = shouldShowMovementBorder(
    inTurnBasedCombat,
    isPlayerTurn,
    isPlanningMove
  );

  // Use movement range hook for boundary visualization. isBlocked is the
  // same entity-aware predicate real pathfinding uses (reachability must
  // never lie relative to actual pathing); isOccupiedByOtherEntity only
  // suppresses the ally "hole" edge at render time — see
  // useMovementRange.ts's doc comments.
  //
  // entityPosition is gated on showMovementBorder (Copilot review #485):
  // with FREE_ROAM's effectiveMovementRemaining now unbounded, an ungated
  // call ran a full BFS over every revealed tile on every render, including
  // idle exploration where boundaryEdges is never rendered (see the
  // showMovementBorder check below). useMovementRange's reachableHexes/
  // boundaryEdges memos already early-return on a null entityPosition, so
  // withholding it here is a pure no-op when the border wouldn't show —
  // TURN_BASED's showMovementBorder is still exactly `isPlayerTurn`, so
  // combat-mode rendering is unchanged.
  const { boundaryEdges } = useMovementRange({
    entityPosition: showMovementBorder ? currentEntityPosition : null,
    movementRemaining: effectiveMovementRemaining,
    hexSize: HEX_SIZE,
    isBlocked,
    isOccupiedByOtherEntity,
  });

  // Frontier ground hints: dim hex just beyond revealed walls so they read
  // as walls bounding a room rather than blocks floating in the void
  // (rpg-dnd5e-web#457). Kind-agnostic — works off wall geometry, not
  // WallKind, so it extends to DOOR_CLOSED/DOOR_OPEN/WINDOW once wave 2
  // folds doors into this walls array.
  const frontierHints = useMemo(
    () =>
      showFrontierGroundHints
        ? frontierGroundHintHexes(walls, new Set(floorTiles.keys()))
        : [],
    [showFrontierGroundHints, walls, floorTiles]
  );

  // Extract door positions for tile coloring (v2 walls, rpg-dnd5e-web#526).
  const doorPositions = useMemo(
    (): CubeCoord[] => doorHexPositions(visibleWalls),
    [visibleWalls]
  );

  // Extract wall positions for tile coloring (all hexes along each wall)
  const wallPositions = useMemo((): CubeCoord[] => {
    const positions: CubeCoord[] = [];
    for (const wall of visibleWalls) {
      if (!wall.from || !wall.to) continue;
      const start: CubeCoord = {
        x: wall.from.x,
        y: wall.from.y,
        z: wall.from.z,
      };
      const end: CubeCoord = { x: wall.to.x, y: wall.to.y, z: wall.to.z };
      positions.push(...getHexLine(start, end));
    }
    return positions;
  }, [visibleWalls]);

  // Handle entity clicks (for attacking)
  const handleEntityClick = (entityId: string) => {
    if (!isPlayerTurn || isProcessing) {
      onEntityClick?.(entityId);
      return;
    }

    // Check if this is an enemy that can be attacked
    const entity = visibleEntities.find((e) => e.entityId === entityId);
    if (entity?.type === 'monster' && canAttack && attackPath.length > 0) {
      setIsProcessing(true);
      // First move along attack path
      if (onMoveComplete && attackPath.length > 1) {
        onMoveComplete(attackPath);
      }
      // Then attack
      if (onAttackComplete) {
        onAttackComplete(entityId);
      }
      setTimeout(() => setIsProcessing(false), 100);
    }

    onEntityClick?.(entityId);
  };

  return (
    <>
      {/* Lighting — base ambient/directional defaults to the original 0.6/0.8
          for every existing caller; the crypt demo (#558) overrides both
          down to near-dark and adds moodPointLights (candle/brazier glow)
          on top, via PlaytestMap's mood-lighting computation. */}
      <ambientLight intensity={ambientIntensity} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={directionalIntensity}
      />
      {moodPointLights.map((light, i) => (
        <pointLight
          key={i}
          position={light.position}
          color={light.color}
          intensity={light.intensity}
          distance={light.distance}
          decay={2}
        />
      ))}

      {/* Invisible ground plane for hit detection */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]} // Lay flat on XZ plane
        {...groundPlaneProps}
      >
        <planeGeometry args={[GROUND_PLANE_SIZE, GROUND_PLANE_SIZE]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Render all hex tiles — Synty-textured (dev flag) or the default
          auto-shaded instanced mesh. Frontier dimming below is identical
          either way — it's not part of this swap (rpg-dnd5e-web#432).
          ErrorBoundary wraps the Synty path only: a missing/failed GLB or
          texture (e.g. an unsynced clone — public/models/synty/ is
          gitignored, see assets:sync) throws past SyntyHexFloor's own
          Suspense (Suspense only covers the pending-load state, not a
          terminal load failure) and would otherwise unmount this whole
          Canvas tree. Falls back to the always-available shaded renderer
          instead of a blank floor or a crashed scene. */}
      {syntyDungeon ? (
        <ErrorBoundary
          fallback={
            <ShadedHexFloor
              floorTiles={floorTiles}
              hexSize={HEX_SIZE}
              hoveredHex={hoveredHex}
              selectedHex={selectedHex}
              doorPositions={doorPositions}
              wallPositions={wallPositions}
              rememberedFloorHexKeys={rememberedFloorHexKeys}
            />
          }
        >
          <SyntyHexFloor
            floorTiles={floorTiles}
            hexSize={HEX_SIZE}
            themeFloorHexKeys={themeFloorHexKeys}
            spaceTheme={spaceTheme}
            rememberedFloorHexKeys={rememberedFloorHexKeys}
            poolLights={floorPoolLights}
            litSurfaces={litSurfaces}
          />
        </ErrorBoundary>
      ) : (
        <ShadedHexFloor
          floorTiles={floorTiles}
          hexSize={HEX_SIZE}
          hoveredHex={hoveredHex}
          selectedHex={selectedHex}
          doorPositions={doorPositions}
          wallPositions={wallPositions}
          rememberedFloorHexKeys={rememberedFloorHexKeys}
        />
      )}

      {/* Ground the frontier: dim hint hexes just beyond revealed walls,
          so walls read as bounding a room rather than floating in the
          void (rpg-dnd5e-web#457) */}
      <FrontierGroundHint hints={frontierHints} hexSize={HEX_SIZE} />

      {/* Render walls AND doors (after tiles) — already deduplicated by
          wallKey. Doors are DOOR_*-kind walls (design doc §Q2) rendered
          through this same pipeline, not a separate list — see
          SyntyHexWall's/ShadedHexWall's own doc comments for the door
          click surface + open/closed pose. Edge-aligned Synty pieces (dev
          flag) render once for the WHOLE wall list — a wall hex's
          open-facing edges often border a *different* Wall object's hex,
          so segment-building needs every wall at once. The default
          procedural voxel wall stays per-wall, unchanged. Same
          ErrorBoundary-falls-back-to-shaded reasoning as the floor above.
          onDoorClick fires with the door's Wall.id — no client-side
          gating (isPlayerTurn/isProcessing/etc.) on whether the click is
          "allowed": the web sends intent, the server decides. */}
      {syntyDungeon ? (
        <ErrorBoundary fallback={shadedWalls}>
          <SyntyHexWall
            walls={legacySyntyWalls ?? walls}
            hexSize={HEX_SIZE}
            onDoorClick={onDoorClick}
            themeWallHexKeys={themeWallHexKeys}
            spaceTheme={spaceTheme}
            rememberedWallHexKeys={rememberedWallHexKeys}
            doorPlaneOverrides={doorPlaneOverrides}
            wallHeight={wallHeight}
            doorHeights={doorHeights}
          />
          {/* Dungeon-walls redesign (rpg-project#133): straight envelope/
              connector runs, replacing the boundary-edge geometry
              legacySyntyWalls' positive-category filter just excluded
              from SyntyHexWall above. Real Synty modular pieces (W3) —
              tiled wall segments, corner-piece joins, and the
              connector-fallback restyle — replace W2's placeholder boxes.
              Scoped to the Synty path only — the ShadedHexWall fallback
              below is untouched by this design. */}
          <WallRunMesh
            envelopeRuns={envelopeRuns}
            envelopeCorners={envelopeCorners}
            connectorRuns={connectorRuns}
            fallbackSegments={connectorFallbackSegments}
            authoredRuns={authoredRuns}
            spaceTheme={spaceTheme}
            rememberedEnvelopeRegionIds={rememberedRunIds.envelopeRegionIds}
            rememberedConnectorDoorIds={rememberedRunIds.connectorDoorIds}
            wallHeight={wallHeight}
            wallCutaway={wallCutaway}
            playerPosition={playerPosition}
          />
        </ErrorBoundary>
      ) : (
        shadedWalls
      )}

      {/* Movement range border: only when actionable (own TURN_BASED turn,
          or actively planning a move in FREE_ROAM) — not idle-always-on
          (rpg-dnd5e-web#456) */}
      {showMovementBorder && boundaryEdges.length > 0 && (
        <MovementRangeBorder boundaryEdges={boundaryEdges} />
      )}

      {/* Path preview (only on player turn) */}
      {isPlayerTurn && pathPreview.length > 0 && (
        <PathPreview path={pathPreview} hexSize={HEX_SIZE} />
      )}

      {/* Attack path preview (only on player turn, when hovering enemy) */}
      {isPlayerTurn && canAttack && attackPath.length > 0 && (
        <PathPreview
          path={attackPath}
          hexSize={HEX_SIZE}
          color="#ef4444"
          opacity={0.5}
        />
      )}

      {/* "This is me" self-indicator (rpg-dnd5e-web#515): a ring under the
          local player's own model, reusing PathPreview/MovementRangeBorder's
          ground-overlay visual language instead of the selection emissive
          tint (which used to double as this signal — see
          selectionVisuals.ts's doc comment). Always on (not gated on turn
          state, unlike the movement border) and suppressed for dead/ghost
          entities, same as the selection tint's own isDead gate. */}
      {focusTarget && !myEntity?.isDead && !myEntity?.isGhost && (
        <SelfIndicatorRing
          x={focusTarget.x}
          z={focusTarget.z}
          hexSize={HEX_SIZE}
        />
      )}

      {/* Render all entities */}
      {entities.map((entity) => (
        <HexEntity
          key={entity.entityId}
          entityId={entity.entityId}
          name={entity.name}
          position={entity.position}
          type={entity.type}
          hexSize={HEX_SIZE}
          isSelected={resolveEntityTint(
            entity.entityId,
            selectedEntityId,
            currentEntityId
          )}
          onClick={entityClickHandler(entity.knowledgeState, handleEntityClick)}
          character={characterMap.get(entity.entityId)}
          monster={monsterMap.get(entity.entityId)}
          monsterRefId={entity.monsterRefId}
          isDead={entity.isDead}
          isGhost={entity.isGhost}
          classRefId={entity.classRefId}
          isDowned={entity.isDowned}
          obstacleType={entity.obstacleType}
          propRefId={entity.propRefId}
          propRotationY={propRotationYByEntity.get(entity.entityId)}
          movePath={entity.movePath}
          moveSeq={entity.moveSeq}
          onMovementPresentationComplete={onEntityMovementPresentationComplete}
          knowledgeState={entity.knowledgeState}
        />
      ))}

      {/* Caller-supplied extra scene content (see HexGridProps.children) */}
      {children}
    </>
  );
}

/**
 * Main HexGrid component
 * Sets up the Canvas and renders the scene
 */
export function HexGrid(props: HexGridProps) {
  const { combatState, characters = [] } = props;
  const [isContextLost, setIsContextLost] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Camera-feel dials again out here: Scene reads them for the CONTROLS, but
  // the projection itself is a `<Canvas>` prop and Scene lives inside it.
  // Both now read the SAME live store (#906 batch 2), so there is nothing to
  // keep in sync. Default (no query params) is unchanged: orthographic,
  // zoom 80. NOT fully live here, though: `zoomStart`/`fovDeg` only apply as
  // the Canvas's INITIAL camera config, and the `key` below only changes
  // with `perspective` (URL-only, so it never changes live) — a drawer edit
  // to zoomStart updates this value but does not itself force the Canvas to
  // re-mount and pick it up; it takes effect at the next natural remount.
  const canvasDials = useCameraDials();

  // Handle WebGL context loss/restore for GPU protection
  const handleCanvasCreated = useCallback(
    ({ gl }: { gl: THREE.WebGLRenderer }) => {
      canvasRef.current = gl.domElement;
    },
    []
  );

  // Set up context loss event listeners with proper cleanup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('WebGL context lost - GPU may be overloaded');
      setIsContextLost(true);
    };

    const handleContextRestored = () => {
      console.info('WebGL context restored');
      setIsContextLost(false);
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  });

  // Build turn order from combat state
  const turnOrder = useMemo((): TurnOrderEntry[] => {
    if (!combatState?.turnOrder) return [];
    return visibleTurnOrder(props.entities, combatState.turnOrder).map(
      (entry) => ({
        entityId: entry.entityId,
        entityType: entry.entityType,
        initiative: entry.initiative,
      })
    );
  }, [combatState, props.entities]);

  const activeIndex = combatState?.activeIndex ?? -1;
  const round = combatState?.round ?? 1;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {isContextLost ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-secondary, #1a1a2e)',
            color: 'var(--text-primary, #fff)',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ margin: '0 0 0.5rem 0' }}>Graphics Error</h2>
          <p style={{ color: 'var(--text-muted, #888)', margin: '0 0 1rem 0' }}>
            Your GPU couldn&apos;t handle the rendering load.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: 'var(--accent-primary, #5865F2)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Reload Page
          </button>
        </div>
      ) : (
        <Canvas
          // Projection is fixed at mount — R3F does not swap camera type on a
          // prop change — so the dial rides a `key` to force a clean remount.
          // The dials are read once from the URL, so this key is stable and
          // nothing remounts in practice.
          key={canvasDials.perspective ? 'persp' : 'ortho'}
          orthographic={!canvasDials.perspective}
          frameloop="demand"
          onCreated={handleCanvasCreated}
          camera={{
            // Lower isometric angle similar to Stolen Realm. Single-sourced
            // from calibrationConstants.CAMERA_OFFSET so the wall-height
            // cutaway prototype's near/far classification (dots each run's
            // facing against CAMERA_WARD_XZ, derived from this same value)
            // can never drift out of sync with the actual camera.
            position: CAMERA_OFFSET,
            near: 0.1,
            far: 1000,
            // `zoom` drives an orthographic camera, `fov` a perspective one.
            // Both are spelled here because useCameraControls immediately
            // takes over placement either way; only the projection differs.
            ...(canvasDials.perspective
              ? { fov: canvasDials.fovDeg }
              : { zoom: canvasDials.zoomStart }),
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <Scene {...props} />
        </Canvas>
      )}

      {/* Turn order carousel overlay at top */}
      {turnOrder.length > 0 && (
        <TurnOrderOverlay
          turnOrder={turnOrder}
          activeIndex={activeIndex}
          characters={characters}
          round={round}
        />
      )}
    </div>
  );
}
