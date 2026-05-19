/**
 * PlaytestMap — visual hex-grid layer for PlaytestHarness.
 *
 * Wraps the existing `HexGrid` component (the same Three.js / React Three
 * Fiber map the game routes use) with a thin adapter that translates the
 * playtest's v1alpha2-shaped state (`useEncounterState`) into HexGrid's
 * v1alpha1-flavored prop surface. The map is the interactive layer Kirk
 * uses for backend verification: click a hex to move there, click an entity
 * to attack/select it — no more typing cube coordinates into spinbuttons.
 *
 * Architectural notes
 * -------------------
 * - Reuses `HexGrid` directly rather than the `BattleMapPanel` wrapper.
 *   `BattleMapPanel` consumes `useDungeonMap`'s `DungeonMapState` (built
 *   from v1alpha1 `Room` protos) which the playtest never accumulates —
 *   v2 stream events flow per-hex via `revealedHexes` and per-entity via
 *   `entityMeta`. Synthesizing a fake `DungeonMapState` would be more
 *   surface than the adapter below.
 *
 * - `floorTiles` is synthesized from `revealedHexes` plus every entity's
 *   current cell. Without an entity-cell fallback the local player can't
 *   move from the seeded fallback position before the first
 *   `GeometryRevealed` event lands.
 *
 * - `movementRemaining` defaults to 30 ft. The harness is a verification
 *   tool — the server is the source of truth for movement budget and will
 *   reject over-budget paths. Per `feedback_no_logic_in_web` the web
 *   doesn't compute the budget; we just give the path-preview enough
 *   range to draw and let the RPC sort it out.
 *
 * - `isPlayerTurn` derives from v2 `mode === TURN_BASED && activeEntityId === myEntityId`.
 *   In FREE_ROAM mode clicks still dispatch (matches existing harness button
 *   behavior — FREE_ROAM moves don't require an active turn).
 *
 * Pure helpers live in `./playtestMapHelpers.ts` (synthesizeFloorTiles,
 * entityTypeToDisplay, buildRenderableEntities). Keeps this file
 * component-only per the react-refresh ESLint rule.
 */

import type { EntityState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { useMemo } from 'react';
import type { EntityMeta } from '../../hooks/useEncounterState';
import { HexGrid } from '../hex-grid';
import type { CubeCoord } from '../hex-grid/hexMath';
import {
  buildRenderableEntities,
  synthesizeFloorTiles,
} from './playtestMapHelpers';

export interface PlaytestMapProps {
  /**
   * Unified entity store from useEncounterState. Each entry is a v1alpha1
   * `EntityState` stub (entityId + position); v2 metadata lives separately
   * in `entityMeta`.
   */
  entities: Map<string, EntityState & { ghost?: boolean }>;
  /**
   * v1alpha2 identity metadata (type, monsterRefId) keyed by entityId.
   * Populated by `applyEntityMeta` from EntityAppeared events.
   */
  entityMeta: Map<string, EntityMeta>;
  /**
   * v1alpha2 per-hex reveal set ("x,y,z" cube-coord keys). Each entry
   * becomes a synthesized floor tile so HexGrid can render and pathfind.
   */
  revealedHexes: Set<string>;
  /**
   * v1alpha2 per-entity HP. Used to mark monsters as dead (HP <= 0) so
   * HexGrid renders their corpse and excludes them from blocking checks.
   */
  entityHP: Map<string, { current: number; max: number }>;
  /**
   * Local player's entity id (e.g. `char-alice`). The hovered/selected
   * entity defaults to this so the path preview originates from the
   * player's hex on first render.
   */
  myEntityId: string;
  /**
   * Optional fallback position for the local player before the first
   * EntityAppeared event lands (the dev-seeded encounter). Used only when
   * the local player isn't present in `entities` yet.
   */
  fallbackPosition?: { x: number; y: number; z: number };
  /**
   * True when the local player can act this turn. Gates click-to-move and
   * click-to-attack inside HexGrid (clicks are no-ops otherwise).
   *
   * In FREE_ROAM the harness still wants clicks to dispatch — pass `true`
   * outside TURN_BASED so the server rejection (if any) drives the error
   * surface rather than the client suppressing the request.
   */
  isMyTurn: boolean;
  /**
   * Movement budget for the path-preview overlay. The server is source of
   * truth; this exists only so HexGrid can render the in-range boundary
   * and clip the path-preview at the budget edge. Defaults to 30 ft.
   */
  movementRemaining?: number;
  /**
   * Called with the full computed path (start + intermediates + end) when
   * the user clicks a hex to move. The harness forwards to
   * `moveEntity(encounterId, myEntityId, path)`.
   */
  onMove: (path: Array<{ x: number; y: number; z: number }>) => void;
  /**
   * Called with the clicked entity id. The harness inspects entityMeta
   * and dispatches `takeAction(attack, target)` for monsters or selects
   * for inspection on characters.
   */
  onEntityClick: (entityId: string) => void;
}

const DEFAULT_MOVEMENT_FEET = 30;

export function PlaytestMap({
  entities,
  entityMeta,
  revealedHexes,
  entityHP,
  myEntityId,
  fallbackPosition,
  isMyTurn,
  movementRemaining = DEFAULT_MOVEMENT_FEET,
  onMove,
  onEntityClick,
}: PlaytestMapProps) {
  const floorTiles = useMemo(
    () =>
      synthesizeFloorTiles(revealedHexes, entities.values(), fallbackPosition),
    [revealedHexes, entities, fallbackPosition]
  );

  const renderableEntities = useMemo(
    () => buildRenderableEntities(entities, entityMeta, entityHP),
    [entities, entityMeta, entityHP]
  );

  // HexGrid expects an optional `combatState` to derive the active actor;
  // we don't have a v1alpha1 CombatState in the playtest, so pass null and
  // let `currentEntityId` drive path-preview origin instead.
  return (
    <div
      data-testid="playtest-map"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 360,
        background: '#0a0a0a',
        border: '1px solid #333',
        borderRadius: 4,
      }}
    >
      <HexGrid
        floorTiles={floorTiles}
        entities={renderableEntities}
        selectedEntityId={myEntityId}
        currentEntityId={myEntityId}
        movementRemaining={movementRemaining}
        isPlayerTurn={isMyTurn}
        combatState={null}
        onMoveComplete={(path: CubeCoord[]) => {
          // HexGrid hands back the full cube-coord path it computed via
          // useHexInteraction's findPath. Forward as plain {x,y,z}; the
          // moveEntity hook converts internally. Also fires on the
          // move-into-range phase of a monster attack click — desired
          // (move-then-attack chain matches the game-route UX).
          onMove(path.map((c) => ({ x: c.x, y: c.y, z: c.z })));
        }}
        onEntityClick={(targetId: string) => {
          onEntityClick(targetId);
        }}
        // Deliberately do NOT wire `onAttackComplete`. HexGrid invokes BOTH
        // `onAttackComplete` AND `onEntityClick` when a click lands on an
        // attackable monster (HexGrid.tsx:316-338); wiring both to
        // `onEntityClick` here would double-dispatch the harness's takeAction
        // RPC for every monster click. The harness routes attacks via the
        // `onEntityClick` branch, which always fires.
      />
    </div>
  );
}
