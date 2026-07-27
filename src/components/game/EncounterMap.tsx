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
import type {
  Hex,
  Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useMemo } from 'react';
import { DevPerfProbe } from '../../dev/DevPerfProbe';
import type { EntityMeta, EntityStatus } from '../../hooks/useEncounterState';
import {
  connectorDoorHeights,
  connectorDoorInputsFromWalls,
  connectorDoorPlanes,
  connectorFallbackSegments,
  legacyRenderWalls,
  regionInputsFromHexes,
} from '../../hooks/wallRunAdapters';
import { computeWallRuns } from '../../hooks/wallRuns';
import { WALL_HEIGHT } from '../../rendering/calibrationConstants';
import { HexGrid } from '../hex-grid';
import { AuthorGridLegend } from '../hex-grid/AuthorGridLegend';
import { AuthorGridOverlay } from '../hex-grid/AuthorGridOverlay';
import {
  cubeToWorld,
  HEX_SIZE,
  type CubeCoord,
  type WorldPos,
} from '../hex-grid/hexMath';
import {
  buildDevPropDemoEntities,
  buildRenderableEntities,
  buildThemeMoodLights,
  buildTurnOrderCombatState,
  CRYPT_AMBIENT_INTENSITY,
  CRYPT_DIRECTIONAL_INTENSITY,
  MOOD_LIGHT_BUDGET,
  parseCryptLightOverride,
  parseDevPropDemoKeys,
  parsePerfProbeWindowMs,
  parseWallHeightOverride,
  resolveSpaceTheme,
  resolveWallHeightForCutaway,
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
  /**
   * Per-hex reveal map ("x,y,z" cube-coord keys -> the full wire `Hex`,
   * including `zoneId`) from useEncounterState's `state.revealedHexes`.
   * Dungeon-walls redesign (rpg-project#133): `zoneId` is what lets this
   * component reconstruct each room's hex membership
   * (wallRunAdapters.regionInputsFromHexes) for envelope/connector run
   * computation — a plain key `Set` (pre-#133) can't carry that. Floor-tile
   * synthesis below only needs the key set, derived internally.
   */
  revealedHexes: Map<string, Hex>;
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
    () =>
      synthesizeFloorTiles(new Set(revealedHexes.keys()), entities.values()),
    [revealedHexes, entities]
  );

  const wallList = useMemo(() => Array.from(walls.values()), [walls]);

  // The local player's own current world position — needed both for the
  // mood-point-light budget (below) and for the cutaway prototype's
  // interior-partition classification (rpg-project#132 follow-up:
  // connectorPartitionHeight/connectorDoorHeights need to know whether a
  // connector wall or door sits between the camera and the player's own
  // current room). Undefined until the local player's own entity has
  // appeared (matches this component's existing "no player yet" tolerance
  // elsewhere, e.g. EncounterView's "Waiting for your position…" banner).
  //
  // Copilot review (PR #585): reads straight off the `entities` prop (O(1)
  // map lookup, the authoritative store) rather than scanning
  // `renderableEntities` — that array also carries render-only injected
  // entries (e.g. `?devPropDemoKeys` synthetic props) that both cost an
  // avoidable linear scan and, in principle, could shadow the real
  // player's id. `x`/`y`/`z` on the wire Position are individually
  // optional, defaulted to 0 the same way buildRenderableEntities does.
  const playerPosition = useMemo((): WorldPos | undefined => {
    const minePosition = entities.get(myEntityId)?.position;
    if (!minePosition) return undefined;
    return cubeToWorld(
      {
        x: minePosition.x ?? 0,
        y: minePosition.y ?? 0,
        z: minePosition.z ?? 0,
      },
      HEX_SIZE
    );
  }, [entities, myEntityId]);

  // Dungeon-walls redesign (rpg-project#133 design.md/plan.md's W2 slice):
  // reconstruct each room's hex membership from the wire's per-hex zoneId
  // (regions have no width/offset field on the wire at all — see
  // wallRuns.ts's doc comment), derive each door's own cell from the walls
  // list, and compute the straight envelope/connector runs those feed.
  // Also builds the positive-category-filtered legacy wall list
  // (doors + interior pattern walls only) and the per-door rotation
  // overrides HexGrid/SyntyHexWall consume below.
  const regions = useMemo(
    () => regionInputsFromHexes(revealedHexes.values()),
    [revealedHexes]
  );
  const connectorDoors = useMemo(
    () => connectorDoorInputsFromWalls(wallList),
    [wallList]
  );
  const wallRunsResult = useMemo(
    () => computeWallRuns({ regions, doors: connectorDoors }),
    [regions, connectorDoors]
  );
  const legacySyntyWalls = useMemo(
    () =>
      legacyRenderWalls(
        wallList,
        regions,
        wallRunsResult.connectorRuns,
        connectorDoors
      ),
    [wallList, regions, wallRunsResult, connectorDoors]
  );
  // W3 "fallback restyle" (rpg-project#133 design.md/plan.md): the same
  // structural safety-net candidates legacyRenderWalls used to keep for
  // SyntyHexWall's legacy per-cell renderer now render as straight,
  // column-aligned segments via WallRunMesh instead — same invisible-wall
  // coverage, matching visual language as the real connector runs beside
  // them (frontier doors, far-unexplored rooms no longer stand out as the
  // old chunky hex-wall look).
  const fallbackSegments = useMemo(
    () =>
      connectorFallbackSegments(
        wallList,
        regions,
        wallRunsResult.connectorRuns,
        connectorDoors
      ),
    [wallList, regions, wallRunsResult, connectorDoors]
  );
  // Connector-single-wall follow-up (rpg-project#132, Kirk's live-walk
  // regression: "can our door rotate a little to line up with the wall?"):
  // needs only the raw door list + hexSize, not wallRunsResult at all — see
  // connectorDoorPlanes' own doc comment for why that makes this correct
  // in both reveal states rather than only once a real ConnectorRun exists.
  const doorPlaneOverrides = useMemo(
    () => connectorDoorPlanes(connectorDoors, HEX_SIZE),
    [connectorDoors]
  );

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

  // Live brightness dial (rpg-dnd5e-web#558 follow-up): `?cryptAmbient=`/
  // `?cryptDirectional=` (each `0..1`) override CRYPT_AMBIENT_INTENSITY/
  // CRYPT_DIRECTIONAL_INTENSITY when present. Exists because the baked-in
  // default (tuned against local dev captures) reportedly renders the
  // crypt as essentially unlit in Kirk's deployed webview — plausibly the
  // SAME cross-environment tone-mapping variance #481/#485 already fixed
  // the floor for once, resurfacing via this theme's lit floor material
  // and scene-light intensities (this PR's own known-risk callout). A
  // screenshot from this sandbox can't calibrate a screen it can't see;
  // this lets Kirk dial it live on the actual affected environment and
  // hand back the number that belongs in the default. Read once, same
  // "read the query string once, default off" convention as syntyDungeon/
  // perfProbe below. Deliberately NOT gated to development mode (unlike
  // perfProbe) — Kirk needs this on the deployed production build itself.
  const cryptLightOverride = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      ambient: parseCryptLightOverride(params.get('cryptAmbient')),
      directional: parseCryptLightOverride(params.get('cryptDirectional')),
    };
  }, []);

  // Live-tuning wall height dial (rpg-project#132, Kirk's live walk on the
  // connector-single-wall prototype: "the height of the walls might be a
  // little low"). Same "read the query string once" convention as
  // cryptLightOverride above; `undefined` (no param, or an invalid one)
  // means no EXPLICIT override — resolveWallHeightForCutaway below decides
  // what that falls back to.
  const wallHeightExplicitOverride = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return parseWallHeightOverride(params.get('wallHeight'));
  }, []);

  // Cutaway prototype (rpg-project#132, Kirk: "Synty solves see-into-rooms
  // by HIDING the camera-facing walls and keeping far walls FULL height —
  // not by squashing everything"). Same "read the query string once,
  // default off" convention as syntyDungeon/cryptdemo (PlaytestMap.tsx) —
  // a simple opt-in boolean flag needs no dedicated parser/validation the
  // way the numeric wallHeight dial above does.
  const wallCutawayOverride = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('wallCutaway') === '1',
    []
  );

  // Effective wall height passed to HexGrid: an explicit ?wallHeight=
  // always wins, but with NO override, cutaway defaults its TALL value to
  // CUTAWAY_TALL_WALL_HEIGHT rather than silently falling through to the
  // ordinary WALL_HEIGHT (Kirk's live-walk papercut: "?wallCutaway=1 alone
  // gave ankle-high everything" — stub=0.3/tall=0.8, barely
  // distinguishable). `undefined` (cutaway off, no override) is still
  // byte-identical to before this resolution existed — HexGrid's/
  // WallRunMesh's/SyntyHexWall's own WALL_HEIGHT default applies.
  const wallHeightOverride = useMemo(
    () =>
      resolveWallHeightForCutaway(
        wallHeightExplicitOverride,
        wallCutawayOverride
      ),
    [wallHeightExplicitOverride, wallCutawayOverride]
  );

  // Per-door height classification for the cutaway prototype — the
  // interior-partition rule (connectorPartitionHeight, via
  // connectorDoorHeights' own doc comment), keyed by Wall.id so
  // SyntyHexWall's door frame/leaf matches whichever height the
  // connector wall it sits in was classified to. Classified from
  // `connectorDoors` (the RAW wire door list, always fully known
  // regardless of reveal state) + `playerPosition`, NOT from
  // `wallRunsResult.connectorRuns` (which only resolves once a real
  // ConnectorRun exists) — this is what makes the classification stable
  // across the fallback->real-run takeover (Kirk's live-walk finding:
  // "door height pops on open"). Gated on wallCutawayOverride, same as
  // HexGrid's own wallCutaway prop: when cutaway is off, every door must
  // stay at the single uniform wallHeight (undefined here means
  // SyntyHexWall's doorHeights?.get(id) always misses, falling back to
  // `wallHeight` exactly as before this prototype existed). `wallHeightOverride`
  // is already resolved above (explicit override, or
  // CUTAWAY_TALL_WALL_HEIGHT, or WALL_HEIGHT) — reusing it here
  // guarantees the tall value doorHeights classifies against always
  // matches whatever HexGrid actually renders the tall runs at.
  const doorHeights = useMemo(
    () =>
      wallCutawayOverride
        ? connectorDoorHeights(
            connectorDoors,
            playerPosition,
            wallHeightOverride ?? WALL_HEIGHT
          )
        : undefined,
    [wallCutawayOverride, connectorDoors, playerPosition, wallHeightOverride]
  );

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
        playerPosition ? [playerPosition.x, playerPosition.z] : undefined
      ),
    [spaceTheme, wallList, renderableEntities, playerPosition]
  );

  // Look-lab lighting experiment (rpg-dnd5e-web#558 follow-up, deterministic
  // unlit floor pooling — see syntyHexFloorHelpers.ts's doc comment):
  // `?floorPools=1` reuses the SAME `themeMoodLights` array already built
  // above for the real `<pointLight>`s, this time letting SyntyHexFloor
  // blend each nearby floor tile's tint toward the light's color. Read
  // once, same "read the query string once, default off" convention as
  // syntyDungeon/perfProbe below. Default off: this is an experiment
  // gate, not a baked-in default — every existing session (no query
  // param) renders byte-identical to pre-experiment behavior.
  const floorPools = useMemo(
    () => new URLSearchParams(window.location.search).get('floorPools') === '1',
    []
  );

  // Dev/Kirk-only A/B, NOT an experiment result we can judge from this
  // sandbox (see SyntyHexFloor.tsx's `litSurfaces` prop doc comment for
  // the full "why" — this is a precise re-creation of the #566/#585 lit
  // floor PR #587 already reverted, opt-in instead of default, so Kirk
  // can look at it live on his own deployed webview if he wants a
  // refresher). `?litSurfaces=1`, read once, default off.
  const litSurfaces = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('litSurfaces') === '1',
    []
  );

  // Authoring bridge (`?authorGrid=1`): every revealed floor hex's
  // room-local [col,row] label plus a facing legend, so Kirk can walk a
  // room and dictate dungeon-content YAML `place:` coordinates directly
  // instead of hand-deriving them. Same "read the query string once,
  // default off" convention as litSurfaces/floorPools above. `regions`/
  // `connectorDoors` are already computed above for wall-run rendering
  // — this reuses them rather than re-deriving region membership a
  // second time.
  const authorGrid = useMemo(
    () => new URLSearchParams(window.location.search).get('authorGrid') === '1',
    []
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
        legacySyntyWalls={legacySyntyWalls}
        envelopeRuns={wallRunsResult.envelopeRuns}
        envelopeCorners={wallRunsResult.envelopeCorners}
        connectorRuns={wallRunsResult.connectorRuns}
        connectorFallbackSegments={fallbackSegments}
        doorPlaneOverrides={doorPlaneOverrides}
        wallHeight={wallHeightOverride}
        wallCutaway={wallCutawayOverride}
        playerPosition={playerPosition}
        doorHeights={doorHeights}
        selectedEntityId={myEntityId}
        currentEntityId={myEntityId}
        movementRemaining={movementRemaining}
        isPlayerTurn={isMyTurn}
        combatState={combatState}
        syntyDungeon={syntyDungeon}
        spaceTheme={spaceTheme}
        // CRYPT_AMBIENT_INTENSITY/CRYPT_DIRECTIONAL_INTENSITY (#585) are
        // Kirk's readability-vs-mood dial for the REAL route specifically
        // — brighter than the `?cryptdemo=1` demo's original near-dark
        // tuning (Kirk, July 24: the demo values read too dark once seen
        // against real synced assets, "it prob could have more light").
        // The demo path (PlaytestMap.tsx) deliberately keeps its own
        // separate, darker CRYPT_DEMO_* constants unchanged.
        // `cryptLightOverride` (?cryptAmbient=/?cryptDirectional=, #558
        // follow-up) wins over the baked-in constant when present, so
        // Kirk can dial this live on whichever screen is showing it dark.
        ambientIntensity={
          spaceTheme === 'crypt'
            ? (cryptLightOverride.ambient ?? CRYPT_AMBIENT_INTENSITY)
            : undefined
        }
        directionalIntensity={
          spaceTheme === 'crypt'
            ? (cryptLightOverride.directional ?? CRYPT_DIRECTIONAL_INTENSITY)
            : undefined
        }
        moodPointLights={themeMoodLights}
        floorPoolLights={floorPools ? themeMoodLights : undefined}
        litSurfaces={litSurfaces}
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
        {authorGrid && (
          <AuthorGridOverlay
            regions={regions}
            doors={connectorDoors}
            hexSize={HEX_SIZE}
          />
        )}
      </HexGrid>
      {authorGrid && <AuthorGridLegend />}
    </div>
  );
}
