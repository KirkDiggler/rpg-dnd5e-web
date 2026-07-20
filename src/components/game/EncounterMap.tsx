/**
 * EncounterMap — the game route's hex-grid adapter, generalized from
 * PlaytestMap (see rpg-project's design.md: "harness-specific — generalize,
 * don't lift"). Same wrapping pattern as PlaytestMap — thin props-to-HexGrid
 * translation, with all real logic (floor-tile synthesis, renderable-entity
 * construction) staying in the shared `playtestMapHelpers.ts` both
 * components import. HexGrid itself is already shared (design.md: "Already
 * shared or generic").
 *
 * Single room this slice (GameView slice 2, #440) — multi-room accumulation
 * is slice 4, scheduled with The Dungeon leg's multi-room trailblazer.
 *
 * No minHeight on this component's own wrapper (rpg-dnd5e-web#494 gate,
 * "map starvation" finding): a hardcoded 360px floor here used to fight
 * EncounterView's flex:1/minHeight:0 map container on short viewports —
 * this element's own height:100% would compute to less than 360 there
 * (dock stacked + short window), the 360 floor won, and the map overflowed
 * its actual allocated space, pushing EncounterDock off-screen below the
 * fold instead of the intended "map keeps a usable floor" outcome. The
 * real floor now lives one level up: EncounterDock's DOCK_MAX_HEIGHT_VH
 * caps the dock so the map's flex:1 parent always keeps >=58% of the
 * viewport, without a second, conflicting fixed-pixel constraint here.
 */

import type { EntityState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type { Wall } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useMemo } from 'react';
import type { EntityMeta, EntityStatus } from '../../hooks/useEncounterState';
import { HexGrid } from '../hex-grid';
import type { CubeCoord } from '../hex-grid/hexMath';
import {
  buildDevPropDemoEntities,
  buildRenderableEntities,
  buildTurnOrderCombatState,
  parseDevPropDemoKeys,
  synthesizeFloorTiles,
} from '../playtest/playtestMapHelpers';

export interface EncounterMapProps {
  /** Unified entity store from useEncounterState (v1alpha1 EntityState stubs, entityId + position). */
  entities: Map<string, EntityState & { ghost?: boolean }>;
  /** v1alpha2 identity metadata (type, monsterRefId) keyed by entityId. */
  entityMeta: Map<string, EntityMeta>;
  /** Per-hex reveal set ("x,y,z" cube-coord keys) from GeometryRevealed events. */
  revealedHexes: Set<string>;
  /** Sticky revealed walls, keyed by wallKey, from Space.walls/GeometryRevealed.walls. Renders as [] when the server sends none. */
  walls: Map<string, Wall>;
  /** Per-entity HP — marks monsters dead (HP <= 0) so HexGrid renders their corpse. */
  entityHP: Map<string, { current: number; max: number }>;
  /** v1alpha2 active conditions per entity — the "unconscious" ref drives
   * the downed class-model swap for CHARACTER entities (rpg-dnd5e-web#501). */
  entityStatuses?: Map<string, EntityStatus[]>;
  /** v1alpha2 initiative order (entity ids) — drives the TurnOrderOverlay. Empty outside TURN_BASED. */
  initiativeOrder: string[];
  /** v1alpha2 active actor's entity id — highlighted in the TurnOrderOverlay. */
  activeEntityId: string;
  /** v1alpha2 turn-based round number, shown on the TurnOrderOverlay's round badge. */
  round: number;
  /** Local player's entity id — the character bound at lobby create/join, not derived from playerId. */
  myEntityId: string;
  /** True when the local player can act this turn; forced true outside TURN_BASED so clicks still dispatch. */
  isMyTurn: boolean;
  /** Movement budget for the path-preview overlay only — the server enforces the real budget. */
  movementRemaining?: number;
  /**
   * Open door entity ids (state.openDoors from useEncounterState, via
   * applyDoorOpened — rpg-dnd5e-web#432 harness-parity). Accepted and
   * exposed on this component's DOM (`data-open-door-ids`) so the real
   * data flow is observable end-to-end; not yet consumed by HexGrid's
   * rendering — that needs a v2-shaped DoorInfo[] the stream doesn't
   * accumulate today (see EncounterView.tsx's doc comment).
   */
  openDoorIds?: string[];
  /** Full computed path (start + intermediates + end) when a hex click lands a move. */
  onMove: (path: Array<{ x: number; y: number; z: number }>) => void;
  /** Clicked entity id — caller dispatches attack for monsters or selects for characters. */
  onEntityClick: (entityId: string) => void;
}

const DEFAULT_MOVEMENT_FEET = 30;

export function EncounterMap({
  entities,
  entityMeta,
  revealedHexes,
  walls,
  entityHP,
  entityStatuses,
  initiativeOrder,
  activeEntityId,
  round,
  myEntityId,
  isMyTurn,
  movementRemaining = DEFAULT_MOVEMENT_FEET,
  openDoorIds = [],
  onMove,
  onEntityClick,
}: EncounterMapProps) {
  const floorTiles = useMemo(
    () => synthesizeFloorTiles(revealedHexes, entities.values()),
    [revealedHexes, entities]
  );

  const wallList = useMemo(() => Array.from(walls.values()), [walls]);

  // Prop-model resolver demo (rpg-dnd5e-web#528, charter #523):
  // `?devPropDemoKeys=barrel,pillar,rock-pile` injects synthetic OBSTACLE
  // entities carrying those prop reference keys next to the local player,
  // proving PropModel/obstaclePropKeys resolve and render on the REAL
  // EncounterView route ahead of platform sending real obstacle_ref/
  // prop_ref data (see buildDevPropDemoEntities' doc comment). Read once,
  // same convention as `syntyDungeon` below; empty/absent by default, so
  // this is a no-op for every real player and every existing e2e/manual
  // flow. Parsing (including deduplication) lives in
  // parseDevPropDemoKeys/playtestMapHelpers.ts, unit-tested, per this
  // file's own "thin translation, real logic in the shared helpers"
  // convention.
  const devPropDemoKeys = useMemo(
    () =>
      parseDevPropDemoKeys(
        new URLSearchParams(window.location.search).get('devPropDemoKeys')
      ),
    []
  );

  const renderableEntities = useMemo(() => {
    const base = buildRenderableEntities(
      entities,
      entityMeta,
      entityHP,
      entityStatuses
    );
    if (devPropDemoKeys.length === 0) return base;
    const anchor = (base.find((e) => e.entityId === myEntityId) ?? base[0])
      ?.position;
    return [...base, ...buildDevPropDemoEntities(devPropDemoKeys, anchor)];
  }, [
    entities,
    entityMeta,
    entityHP,
    entityStatuses,
    devPropDemoKeys,
    myEntityId,
  ]);

  const combatState = useMemo(
    () =>
      buildTurnOrderCombatState(
        initiativeOrder,
        activeEntityId,
        round,
        entityMeta
      ),
    [initiativeOrder, activeEntityId, round, entityMeta]
  );

  // Real-dungeon-rendering flag (rpg-dnd5e-web#432 harness-parity). Read
  // once; the game route never mutates the query string mid-session.
  // Default-on: deployed builds bake Synty assets into the image (docker
  // workflow's assets:sync step, ASSETS_READ_TOKEN), and HexGrid wraps the
  // Synty path in an ErrorBoundary that falls back to the shaded renderer
  // on a missing or failed asset (an unsynced local clone, or a Vercel
  // preview build — no read token wired there yet) — so this is safe to
  // default on rather than gate behind a manual opt-in. Escape hatch:
  // `?syntyDungeon=0` forces the classic shaded renderer for a session.
  const syntyDungeon = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('syntyDungeon') !== '0',
    []
  );

  return (
    <div
      data-testid="encounter-map"
      data-open-door-ids={openDoorIds.join(',')}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0a0a0a',
        border: '1px solid #333',
        borderRadius: 4,
      }}
    >
      <HexGrid
        floorTiles={floorTiles}
        entities={renderableEntities}
        walls={wallList}
        selectedEntityId={myEntityId}
        currentEntityId={myEntityId}
        movementRemaining={movementRemaining}
        isPlayerTurn={isMyTurn}
        combatState={combatState}
        syntyDungeon={syntyDungeon}
        onMoveComplete={(path: CubeCoord[]) => {
          onMove(path.map((c) => ({ x: c.x, y: c.y, z: c.z })));
        }}
        onEntityClick={(targetId: string) => {
          onEntityClick(targetId);
        }}
        // Deliberately not wired — see PlaytestMap's identical note: HexGrid
        // fires both onAttackComplete AND onEntityClick for an attackable
        // monster click, so wiring both here would double-dispatch.
      />
    </div>
  );
}
