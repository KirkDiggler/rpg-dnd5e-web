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
 */

import type { EntityState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type { Wall } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useMemo } from 'react';
import type { EntityMeta } from '../../hooks/useEncounterState';
import { HexGrid } from '../hex-grid';
import type { CubeCoord } from '../hex-grid/hexMath';
import {
  buildRenderableEntities,
  buildTurnOrderCombatState,
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
  initiativeOrder,
  activeEntityId,
  round,
  myEntityId,
  isMyTurn,
  movementRemaining = DEFAULT_MOVEMENT_FEET,
  onMove,
  onEntityClick,
}: EncounterMapProps) {
  const floorTiles = useMemo(
    () => synthesizeFloorTiles(revealedHexes, entities.values()),
    [revealedHexes, entities]
  );

  const wallList = useMemo(() => Array.from(walls.values()), [walls]);

  const renderableEntities = useMemo(
    () => buildRenderableEntities(entities, entityMeta, entityHP),
    [entities, entityMeta, entityHP]
  );

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

  // Dev-only real-dungeon-rendering flag (rpg-dnd5e-web#432 harness-parity),
  // opted in via `?syntyDungeon=1` on the game route — same pattern as
  // PlaytestMap's `&synty=1`/`&syntyroom=1`. Read once; the game route
  // never mutates the query string mid-session. Not a production default
  // yet: piece variety is blocked on the #469 semantic-role manifest, so
  // this stays a manual opt-in until that lands.
  const syntyDungeon = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('syntyDungeon') === '1',
    []
  );

  return (
    <div
      data-testid="encounter-map"
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
