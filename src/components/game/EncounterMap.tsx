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
import { DevPerfProbe } from '../../dev/DevPerfProbe';
import type { EntityMeta, EntityStatus } from '../../hooks/useEncounterState';
import { HexGrid } from '../hex-grid';
import { cubeToWorld, HEX_SIZE, type CubeCoord } from '../hex-grid/hexMath';
import {
  buildDevPropDemoEntities,
  buildRenderableEntities,
  buildThemeMoodLights,
  buildTurnOrderCombatState,
  CRYPT_AMBIENT_INTENSITY,
  CRYPT_DIRECTIONAL_INTENSITY,
  MOOD_LIGHT_BUDGET,
  parseDevPropDemoKeys,
  parsePerfProbeWindowMs,
  resolveSpaceTheme,
  synthesizeFloorTiles,
} from '../playtest/playtestMapHelpers';

export interface EncounterMapProps {
  /** Unified entity store from useEncounterState (v1alpha1 EntityState stubs, entityId + position). `movePath`/`moveSeq` (rpg-dnd5e-web#542) drive HexEntity's walk-clip interpolation. */
  entities: Map<
    string,
    EntityState & {
      ghost?: boolean;
      movePath?: { x: number; y: number; z: number }[];
      moveSeq?: number;
    }
  >;
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
  /**
   * Server-authored dungeon-wide visual family (`state.theme` from
   * useEncounterState, sourced from `Space.theme` via
   * `applySnapshotRegionState` — rpg-dnd5e-web#558). Only `'crypt'`
   * currently drives a real visual treatment (crypt wall-variant pool +
   * tint, lit/tinted floor material, near-dark mood lighting); any other
   * value, `undefined`, or an empty string renders byte-identical to
   * pre-#558 behavior. Normalized via `resolveSpaceTheme`
   * (playtestMapHelpers.ts) — the same rule PlaytestMap.tsx applies, so
   * the harness and the real route can never disagree about what counts
   * as "themed."
   */
  theme?: string;
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
   * applyDoorOpened — rpg-dnd5e-web#432 harness-parity). Exposed on this
   * component's DOM (`data-open-door-ids`) for observability. HexGrid's own
   * door rendering (pose, walkability) is driven directly off `walls`'
   * DOOR_CLOSED/DOOR_OPEN kind (rpg-dnd5e-web#526) — applyDoorOpened flips
   * the matching wall's kind in place, so this prop and `walls` never
   * disagree; this stays a secondary read for debugging/tests.
   */
  openDoorIds?: string[];
  /** Full computed path (start + intermediates + end) when a hex click lands a move. */
  onMove: (path: Array<{ x: number; y: number; z: number }>) => void;
  /** Clicked entity id — caller dispatches attack for monsters or selects for characters. */
  onEntityClick: (entityId: string) => void;
  /** Fired with the door's Wall.id (rpg-api-protos#186) when a DOOR_* wall
   * is clicked — the click->Interact bridge (rpg-dnd5e-web#526). */
  onDoorClick?: (doorId: string) => void;
}

const DEFAULT_MOVEMENT_FEET = 30;

export function EncounterMap({
  entities,
  entityMeta,
  revealedHexes,
  walls,
  entityHP,
  entityStatuses,
  theme,
  initiativeOrder,
  activeEntityId,
  round,
  myEntityId,
  isMyTurn,
  movementRemaining = DEFAULT_MOVEMENT_FEET,
  openDoorIds = [],
  onMove,
  onEntityClick,
  onDoorClick,
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

  // Real-route theme consumption (rpg-dnd5e-web#558): `theme` is the raw
  // server-authored `state.theme` string (Space.theme, applied via
  // applySnapshotRegionState); resolveSpaceTheme normalizes it to the one
  // id this rendering seam understands today. `undefined` (every non-crypt
  // dungeon, and every dungeon before this wave) renders byte-identical to
  // pre-#558 behavior — HexGrid's `spaceTheme` prop, `ambientIntensity`/
  // `directionalIntensity` below, and `moodPointLights` all no-op for it.
  const spaceTheme = resolveSpaceTheme(theme);

  // Mood-point-light budget reference position (rpg-dnd5e-web#558): the
  // local player's own world position, so capMoodLights can keep the
  // lights nearest the camera (which continuously follows the player, see
  // HexGrid's focusTarget) if the themed space's candle/door lights ever
  // exceed MOOD_LIGHT_BUDGET. Undefined until the local player's own
  // entity has appeared (matches this component's existing "no player yet"
  // tolerance elsewhere, e.g. EncounterView's "Waiting for your position…"
  // banner) — capMoodLights degrades to a plain positional slice without
  // it, never throws.
  const myWorldXZ = useMemo((): [number, number] | undefined => {
    const mine = renderableEntities.find((e) => e.entityId === myEntityId);
    if (!mine) return undefined;
    const world = cubeToWorld(mine.position, HEX_SIZE);
    return [world.x, world.z];
  }, [renderableEntities, myEntityId]);

  // Real crypt encounters place obstacle props like obelisk/pillar/coffin/
  // altar/statue (api#702) — none of which are the 'candles' propRefId
  // buildCryptMoodLights (inside buildThemeMoodLights) recognizes as a
  // light source, so this legitimately derives ZERO candle-glow lights for
  // a real crypt today. Door lights (buildCryptDoorLights) still light up
  // real DOOR_CLOSED/DOOR_OPEN walls — the "warm torch contrast" half of
  // the palette works today; the candle-glow half is inert until a real
  // encounter places a 'candles' prop. See this PR's description for the
  // full callout.
  const themeMoodLights = useMemo(
    () =>
      buildThemeMoodLights(
        spaceTheme,
        wallList,
        renderableEntities,
        MOOD_LIGHT_BUDGET,
        myWorldXZ
      ),
    [spaceTheme, wallList, renderableEntities, myWorldXZ]
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

  // Dev-only runtime perf probe (rpg-dnd5e-web#537). Same read-once-via-
  // useMemo / raw-URLSearchParams convention as syntyDungeon above, plus
  // the dev-mode gate App.tsx's showPlaytestHarness/isDevelopment flags
  // already use -- never active in a production build regardless of query
  // string. `?perfProbe` (presence, any value) turns it on; optional
  // `?perfProbeMs=<n>` overrides the sampling window (parsePerfProbeWindowMs
  // validates it -- NaN/non-positive falls back to DevPerfProbe's own
  // default instead of wedging the probe into never completing, Copilot
  // review rpg-dnd5e-web#546); optional `?perfProbeLabel=<slug>` stamps a
  // label onto the emitted result (the sweep driver script uses this to tag
  // which stage a result belongs to).
  const perfProbe = useMemo(() => {
    if (import.meta.env.MODE !== 'development') return null;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('perfProbe')) return null;
    return {
      windowMs: parsePerfProbeWindowMs(params.get('perfProbeMs')),
      label: params.get('perfProbeLabel') ?? undefined,
    };
  }, []);

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
        spaceTheme={spaceTheme}
        ambientIntensity={
          spaceTheme === 'crypt' ? CRYPT_AMBIENT_INTENSITY : undefined
        }
        directionalIntensity={
          spaceTheme === 'crypt' ? CRYPT_DIRECTIONAL_INTENSITY : undefined
        }
        moodPointLights={themeMoodLights}
        onMoveComplete={(path: CubeCoord[]) => {
          onMove(path.map((c) => ({ x: c.x, y: c.y, z: c.z })));
        }}
        onEntityClick={(targetId: string) => {
          onEntityClick(targetId);
        }}
        onDoorClick={onDoorClick}
        // Deliberately not wired — see PlaytestMap's identical note: HexGrid
        // fires both onAttackComplete AND onEntityClick for an attackable
        // monster click, so wiring both here would double-dispatch.
      >
        {perfProbe && (
          <DevPerfProbe windowMs={perfProbe.windowMs} label={perfProbe.label} />
        )}
      </HexGrid>
    </div>
  );
}
