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
 * - Reuses `HexGrid` directly rather than a room-accumulating wrapper.
 *   v2 stream events flow per-hex via `revealedHexes` and per-entity via
 *   `entityMeta` — there is no multi-room accumulation to consume yet
 *   (design.md's slice 4, later). This adapter synthesizes floor tiles
 *   directly from those v2-shaped fields instead.
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
import type { Wall } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useMemo } from 'react';
import type { EntityMeta, EntityStatus } from '../../hooks/useEncounterState';
import { HexGrid } from '../hex-grid';
import { cubeToWorld, HEX_SIZE, type CubeCoord } from '../hex-grid/hexMath';
import {
  buildCryptLayout,
  buildRenderableEntities,
  buildThemeMoodLights,
  CRYPT_AMBIENT_INTENSITY,
  CRYPT_DIRECTIONAL_INTENSITY,
  MOOD_LIGHT_BUDGET,
  resolveSpaceTheme,
  synthesizeFloorTiles,
} from './playtestMapHelpers';
import { SyntyRoomDemo } from './SyntyRoomDemo';
import { SyntyShowcase } from './SyntyShowcase';

export interface PlaytestMapProps {
  /**
   * Unified entity store from useEncounterState. Each entry is a v1alpha1
   * `EntityState` stub (entityId + position); v2 metadata lives separately
   * in `entityMeta`. `movePath`/`moveSeq` (rpg-dnd5e-web#542) drive
   * HexEntity's walk-clip interpolation.
   */
  entities: Map<
    string,
    EntityState & {
      ghost?: boolean;
      movePath?: { x: number; y: number; z: number }[];
      moveSeq?: number;
    }
  >;
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
   * Sticky revealed walls, keyed by `wallKey`, from `Space.walls` (snapshot)
   * merged with `GeometryRevealed.walls` (delta). Degrades to an empty map
   * — and no walls render — when the server sends none.
   */
  walls: Map<string, Wall>;
  /**
   * v1alpha2 per-entity HP. Used to mark monsters as dead (HP <= 0) so
   * HexGrid renders their corpse and excludes them from blocking checks.
   */
  entityHP: Map<string, { current: number; max: number }>;
  /**
   * v1alpha2 active conditions per entity — the "unconscious" ref drives
   * the downed class-model swap for CHARACTER entities (rpg-dnd5e-web#501).
   */
  entityStatuses?: Map<string, EntityStatus[]>;
  /**
   * Server-authored dungeon-wide visual family (`state.theme`,
   * rpg-dnd5e-web#558) — the same signal EncounterMap.tsx's real route
   * consumes. Normalized via `resolveSpaceTheme`; only `'crypt'` currently
   * drives a visual treatment. `?spaceTheme=crypt` on the harness URL
   * overrides this (see `showCryptDemo`'s sibling flag below) so the theme
   * can be exercised for evidence-gathering without a live encounter whose
   * server-side dungeon actually carries `Space.theme = "crypt"`.
   */
  theme?: string;
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
  walls,
  entityHP,
  entityStatuses,
  theme,
  myEntityId,
  fallbackPosition,
  isMyTurn,
  movementRemaining = DEFAULT_MOVEMENT_FEET,
  onMove,
  onEntityClick,
}: PlaytestMapProps) {
  // Dev-only crypt-room spike, opted in via `&cryptdemo=1` on the harness
  // URL (rpg-dnd5e-web#558) — read once, same "read the query string once,
  // default off" convention as showSynty/showSyntyRoom below. Flag off
  // (the default) means buildCryptLayout never runs and every downstream
  // merge below is a no-op passthrough — byte-identical to pre-#558
  // behavior.
  const showCryptDemo = useMemo(
    () => new URLSearchParams(window.location.search).get('cryptdemo') === '1',
    []
  );

  // buildCryptLayout is a pure, zero-argument, deterministic builder (no
  // inputs vary its output) — memoized on the flag alone so it runs at most
  // once per mount instead of rebuilding the same Wall/entity objects every
  // render.
  const cryptLayout = useMemo(
    () => (showCryptDemo ? buildCryptLayout() : null),
    [showCryptDemo]
  );

  // Every crypt floor hex renders the lit/tinted crypt floor material
  // (SyntyHexFloor's themeFloorHexKeys prop) — the whole demo room is one
  // theme, so this is just floorKeys as a Set. Undefined when the flag is
  // off, so SyntyHexFloor's real-dungeon tiles keep the exact #481/#485
  // unlit rendering, unchanged.
  const cryptThemeFloorHexKeys = useMemo(
    () => (cryptLayout ? new Set(cryptLayout.floorKeys) : undefined),
    [cryptLayout]
  );

  // Real-route theme override (rpg-dnd5e-web#558): `?spaceTheme=crypt` on
  // the harness URL forces the SAME whole-space theme treatment
  // EncounterMap.tsx's real route drives off `state.theme` — independent
  // of `?cryptdemo=1` above, which injects a fixed synthetic room via
  // per-hex theme keys. This exists so the theme can be exercised (and
  // screenshotted for evidence) against a REAL revealed dungeon/entities
  // without needing a live encounter whose backend already tags
  // `Space.theme = "crypt"`. Read once, same convention as every other
  // dev-only query flag in this file. `theme` (the real `state.theme`
  // prop, when the harness IS connected to a themed encounter) is the
  // fallback so this never masks genuine server data with `undefined`.
  const spaceThemeOverride = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('spaceTheme') ??
      undefined,
    []
  );
  const spaceTheme = resolveSpaceTheme(spaceThemeOverride ?? theme);

  const floorTiles = useMemo(() => {
    const tiles = synthesizeFloorTiles(
      revealedHexes,
      entities.values(),
      fallbackPosition
    );
    if (!cryptLayout) return tiles;
    // Union the crypt's floor keys in — same shape synthesizeFloorTiles
    // already produces (roomId '' — HexGrid only uses roomId for legacy
    // color hinting, not pathing, per synthesizeFloorTiles' own doc
    // comment).
    for (const key of cryptLayout.floorKeys) {
      if (tiles.has(key)) continue;
      const [x, y, z] = key.split(',').map(Number);
      tiles.set(key, { x, y, z, roomId: '' });
    }
    return tiles;
  }, [revealedHexes, entities, fallbackPosition, cryptLayout]);

  const wallList = useMemo(() => {
    const base = Array.from(walls.values());
    return cryptLayout ? [...base, ...cryptLayout.walls] : base;
  }, [walls, cryptLayout]);

  const renderableEntities = useMemo(() => {
    const base = buildRenderableEntities(
      entities,
      entityMeta,
      entityHP,
      entityStatuses
    );
    return cryptLayout ? [...base, ...cryptLayout.props] : base;
  }, [entities, entityMeta, entityHP, entityStatuses, cryptLayout]);

  // Mood lighting (rpg-dnd5e-web#558, Kirk's POLYGON Dark Fortress
  // reference) — near-dark ambient/directional plus sickly-green point
  // lights at candle positions and warm-orange lights at each door (both
  // the "warm torch contrast" half of the palette and practical door
  // visibility — see buildCryptDoorLights' own doc comment). Applies
  // whenever EITHER the `?cryptdemo=1` fixed room is active OR the
  // real-route `spaceTheme` resolves to `'crypt'` (via `?spaceTheme=crypt`
  // or a genuinely themed `state.theme`) — one unified gate instead of two
  // independent light computations, so a themed real dungeon and the demo
  // room read identically. buildThemeMoodLights is sourced from the FULL
  // merged wallList/renderableEntities (not just cryptLayout's own subset)
  // — when only `?cryptdemo=1` is set, those merged lists reduce to
  // exactly the demo's own walls/props (nothing else is revealed in a
  // fresh dev session), so this is behavior-preserving for that case,
  // while also correctly lighting a themed REAL dungeon's own doors/props.
  // Budget-capped (MOOD_LIGHT_BUDGET) nearest the local player, same
  // rationale as EncounterMap.tsx's identical wiring.
  const useCryptMood = Boolean(cryptLayout) || spaceTheme === 'crypt';
  const myWorldXZ = useMemo((): [number, number] | undefined => {
    const mine = renderableEntities.find((e) => e.entityId === myEntityId);
    if (!mine) return undefined;
    const world = cubeToWorld(mine.position, HEX_SIZE);
    return [world.x, world.z];
  }, [renderableEntities, myEntityId]);
  const themeMoodLights = useMemo(
    () =>
      buildThemeMoodLights(
        useCryptMood ? 'crypt' : undefined,
        wallList,
        renderableEntities,
        MOOD_LIGHT_BUDGET,
        myWorldXZ
      ),
    [useCryptMood, wallList, renderableEntities, myWorldXZ]
  );

  // Dev-only Synty asset showcase, opted in via `&synty=1` on the harness
  // URL. Read once — the harness never mutates the query string mid-session.
  const showSynty = useMemo(
    () => new URLSearchParams(window.location.search).get('synty') === '1',
    []
  );

  // Dev-only Synty room-building demo, opted in via `&syntyroom=1` on the
  // harness URL — independent of `&synty=1` above. Read once, same as
  // showSynty.
  const showSyntyRoom = useMemo(
    () => new URLSearchParams(window.location.search).get('syntyroom') === '1',
    []
  );

  // Real-dungeon-rendering flag (rpg-dnd5e-web#432 harness-parity), same
  // flag EncounterMap reads on the game route. Independent of
  // showSynty/showSyntyRoom above: this renders Synty pieces from the REAL
  // wall data flowing through HexGrid's own `walls` prop, not the demo's
  // fixed synthetic room. Default-on now that HexGrid wraps the Synty path
  // in an ErrorBoundary (falls back to the shaded renderer on a missing or
  // failed asset) — opt out per-session with `&syntyDungeon=0`.
  const syntyDungeon = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('syntyDungeon') !== '0',
    []
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
        walls={wallList}
        selectedEntityId={myEntityId}
        currentEntityId={myEntityId}
        movementRemaining={movementRemaining}
        isPlayerTurn={isMyTurn}
        combatState={null}
        syntyDungeon={syntyDungeon}
        spaceTheme={spaceTheme}
        themeWallHexKeys={cryptLayout?.themeWallHexKeys}
        themeFloorHexKeys={cryptThemeFloorHexKeys}
        ambientIntensity={useCryptMood ? CRYPT_AMBIENT_INTENSITY : undefined}
        directionalIntensity={
          useCryptMood ? CRYPT_DIRECTIONAL_INTENSITY : undefined
        }
        moodPointLights={themeMoodLights}
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
      >
        {showSynty && <SyntyShowcase />}
        {showSyntyRoom && <SyntyRoomDemo />}
      </HexGrid>
    </div>
  );
}
