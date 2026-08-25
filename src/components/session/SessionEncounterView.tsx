/**
 * SessionEncounterView — the real 3D game route's render of a
 * `dnd5e.api.session.v1alpha1` session: the reference tomb, drawn from the
 * atlas, with the local player's character standing where `GetWhere` says
 * they are, able to WALK it — click a floor hex, `useSessionWalk` builds a
 * `MoveRequest` from `atlasPath.ts`'s edge-aware route over the atlas, and
 * the returned steps drive `HexEntity`'s existing move-path animation
 * (`useHexMovePath`, unchanged from the old `HexGrid` route) — and draws
 * every OTHER member the local player currently perceives (ADR-0041 /
 * rpg-toolkit#1157's `Seen` seam): `useSessionView` polls `GetView`,
 * `sightingEntities.ts` turns its `sightings` into monster `HexEntity`s at
 * their reported cell, name, and standing (or a faded "remembered" one for
 * a held memory, `currentVia` empty), a turn-lock `Move` rejection
 * (`session.ErrNotYourTurn`) surfaces as a friendly status line instead of
 * raw RPC text (`moveErrorMessage.ts`), and a hover/path indicator on the
 * 3D floor itself: `turnLocked` (computed fresh from live Turn state) and
 * the atlas's own `pathIndex` both flow down into `SessionCanvas` so
 * hovering shows a walk preview, an unreachable-cell refusal, an Attack
 * affordance, or the turn lock — the walk preview computed by the SAME
 * `atlasPath.ts` call `walkTo` itself makes, so it can never diverge from
 * what a click actually does (`moveIndicator.ts`'s own doc comment).
 *
 * # The combat panel (rpg-project#249 "the combat turn on the session
 * stack"; rpg-dnd5e-web#762/#525/#533)
 *
 * `useSessionTurn` reads `SessionService.Turn` (whose go is it, what
 * round, the roster by name and standing — `Participant`), `useCombat
 * Panel`/`combatPanel.ts` compose it with Afford into the roster + shapes
 * + movement bound + in-reach Attack targets + End Turn gate + a beat
 * line built ONLY from typed stream events, and `CombatPanel` draws it.
 *
 * ATTACK IS A FLOOR GESTURE, NOT A PANEL BUTTON (`combatPanel.ts`'s own
 * doc comment): `SessionCanvas` highlights every subject in
 * `combatPanel.selection.attackTargets` persistently, hovering one shows
 * "Attack <name>" (or its own shortfall text), and clicking one fires
 * `combatPanel.attackTarget` directly — no "arm, then confirm" step.
 * `onHexClick` still walks; a click on any OTHER (non-attackable)
 * entity's cell is a no-op (see `SessionCanvas`'s own doc comment).
 *
 * Still honest about what it doesn't know: a monster's turn is a real
 * driven beat, not a guess. Since rpg-project#254 (design rpg-project#252,
 * journey #253/#91) the server drives an unplayed member's whole turn in
 * one pass — walking it toward whoever it can see, swinging if it gets
 * there — and narrates that as a burst of `moved`/`struck`/`missed`/
 * `turnEnded` events that can land within milliseconds of each other.
 * `useCombatPanel`'s own `handleEvent` queues those four kinds for any
 * OTHER member and replays them at a fixed, human-followable pace
 * (`monsterBeatQueue.ts`), refetching this component's OWN `GetView`
 * (`refetchView` below, its single owner) as each `moved` lands so the
 * entity is standing where the server says by the time its `struck`
 * shows — see that hook's own doc comment for the full sequence.
 *
 * # Move on the turn clock (toolkit#1169)
 *
 * On your own turn, the floor works exactly like free roam (same
 * `findAtlasPath`, same `useSessionWalk`), just bounded to
 * `combatPanel.ts`'s own `moveMaxCells` (the server's `remaining` feet,
 * floor-divided by five — a courtesy preview bound, never a client rule;
 * see `moveIndicator.ts`'s own doc comment). `turnLocked` is computed
 * fresh from live Turn state on every render rather than from
 * `useSessionWalk`'s own attempt-driven `notYourTurn` flag — see that
 * variable's own comment for why a state-derived signal can't go stale
 * the way an error-driven one can when the turn cycles back mid-session.
 *
 * # Why this exists beside `EncounterView`, not inside it
 *
 * `EncounterView` speaks the OLD `EncounterService` (v1alpha2), which
 * `rpg-api` `dev` no longer serves (rpg-api#801 deleted that stack) — the
 * game route does not work against `dev` at all without this. The two
 * services are a reimplementation, not versions of each other (see
 * `client.ts`'s `sessionClient` doc comment and `SessionTombConcept.tsx`'s
 * module doc comment for the asymmetry table), so this is a new component
 * on the new wire rather than a branch inside the old one. `EncounterView`
 * and its whole rendering chain (`EncounterMap`/`HexGrid`) are left
 * untouched — `GameView` simply stops mounting them once a session starts.
 *
 * # What this deliberately does NOT do
 *
 * It does not manufacture the old wire's shapes (`CombatState`,
 * `EncounterState`, v1alpha2 `Wall[]`) from the atlas to feed `HexGrid` —
 * that would be the server-side wrapper `rpg-project#227` refused,
 * relocated into the client. It reuses only the LEAF 3D renderers
 * (`SyntyHexFloor`, `HexEntity`, `useCameraControls`, and — via
 * `AtlasWalls` — `GlbInstance`) with a thin atlas -> leaf-props mapping
 * (`atlasToScene3D.ts`). It computes no reach/adjacency of its own either
 * — every `attackTargets` entry already reflects the server's own reach
 * gate (rpg-toolkit#1010, rpg-project#249 §3).
 *
 * # Full-viewport portal
 *
 * Same reasoning, and the same fix, as `EncounterView`'s own doc comment:
 * App.tsx's shared shell wraps every non-character-sheet view in
 * `max-w-7xl mx-auto p-8`, which caps both width AND height to the
 * padded content box rather than the viewport. A `<Canvas
 * style={{width:'100%',height:'100%'}}>` inside that box inherits a
 * definite WIDTH (max-w-7xl resolves) but no definite HEIGHT (the
 * shell has none), so the percentage height fails to resolve and the
 * canvas falls back to the browser's classic 300x150 default — a
 * hairline strip of the scene, discovered live via a Playwright canvas
 * boundingBox() check, not by inspection. `createPortal` to `document.body`
 * with `position: fixed; inset: 0` escapes that shell entirely, the same
 * way `EncounterView` already does.
 */

import { errorMessage } from '@/utils/combatFormat';
import { create } from '@bufbuild/protobuf';
import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { EventKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  ClockKind,
  DoorState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  GetCharacterRequestSchema,
  type Character,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { CharacterData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGetCharacter } from '../../api/characterHooks';
import { sessionClient } from '../../api/client';
import { useEquipItem } from '../../api/useEquipItem';
import { useGetCharacterData } from '../../api/useGetCharacterData';
import { useSessionAfford } from '../../api/useSessionAfford';
import { useSessionAtlas } from '../../api/useSessionAtlas';
import { useSessionDoors } from '../../api/useSessionDoors';
import { useSessionRoster } from '../../api/useSessionRoster';
import { useSessionTurn } from '../../api/useSessionTurn';
import { useSessionView } from '../../api/useSessionView';
import { useSessionWhere } from '../../api/useSessionWhere';
import { useUnequipItem } from '../../api/useUnequipItem';
import { CLASS_TEXTURE_SUFFIXES } from '../../config/characterTextures';
import { classLabel } from '../game/encounterDockHelpers';
import { EquipmentPopover } from '../game/equipment/EquipmentPopover';
import type { EquipIntent } from '../game/equipment/equipmentTypes';
import { HEX_SIZE } from '../hex-grid/hexMath';
import { Button } from '../ui/Button';
import { ErrorDisplay, LoadingOverlay } from '../ui/Feedback';
import { buildAtlasPathIndex } from './atlasPath';
import {
  buildScene3D,
  positionToCube,
  resolveSceneLayout,
} from './atlasToScene3D';
import { CombatPanel } from './CombatPanel';
import { DebugCombatLog } from './DebugCombatLog';
import { participantNameMap } from './participantNames';
import { SessionCanvas } from './SessionCanvas';
import { sightingsToEntities } from './sightingEntities';
import { useCombatPanel } from './useCombatPanel';
import { useSessionEventStream } from './useSessionEventStream';
import { useSessionWalk } from './useSessionWalk';

export interface SessionEncounterViewProps {
  /** The session/encounter id `StartEncounter` returned. */
  sessionId: string;
  /** The local player's own character id — the session `member` id
   * (matches `EncounterView`'s own doc comment: the bound `characterId`,
   * never `char-<playerId>`). */
  characterId?: string;
  playerId: string;
  onBack: () => void;
}

/** A centered message card, matching the shape (not the fixed positioning)
 * every early-exit state below shares — loading/error/gap all read the
 * same way, just with different content. */
/** The outcome headline by declared ending key — keys are content
 * vocabulary (rpg-project#269 §6.3): the wire carries the author's word and
 * the client owns the sentence. An unknown key still ends the run, with the
 * plain sentence. */
function endingHeadline(ending: string): string {
  switch (ending) {
    case 'boss-down':
      return 'The tomb is cleared.';
    case 'withdrawn':
      return 'The party withdrew.';
    case 'abandoned':
      return 'The run was abandoned.';
    default:
      return 'The run has ended.';
  }
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 32,
      }}
    >
      {children}
    </div>
  );
}

export function SessionEncounterView({
  sessionId,
  characterId,
  onBack,
}: SessionEncounterViewProps) {
  const {
    atlas,
    loading: atlasLoading,
    error: atlasError,
    refetch: refetchAtlas,
  } = useSessionAtlas(sessionId);
  const {
    position: wherePosition,
    loading: whereLoading,
    error: whereError,
    refetch: refetchWhere,
  } = useSessionWhere(sessionId, characterId ?? '');
  // GetView — "what do I hold of everyone else" (rpg-dnd5e-web#762 slice
  // 3). Deliberately NOT folded into loading/blockingError below: an other-
  // member sighting is additive to an already-drawable scene, not a
  // precondition for one, so a slow/failed GetView degrades to "draw the
  // tomb and the local player, nobody else yet" rather than blocking the
  // whole route the way a failed atlas/position/character fetch does.
  const { sightings, refetch: refetchView } = useSessionView(
    sessionId,
    characterId ?? ''
  );

  // The session roster — PUBLIC identity, loaded once and referenced at
  // render (rpg-project#264, ideas/characters/presentation). The only
  // refetch trigger is a `joined` event (pull-on-join, the ruled shape) in
  // `handleSessionEvent` below; nothing perception-driven ever refetches
  // identity.
  const { roster, refetch: refetchRoster } = useSessionRoster(sessionId);

  // The doors' LIVE state (rpg-project#268) — load once, refresh on `door`
  // stream events, the same pull-on-signal shape the roster set. Feeds the
  // leaf each doorway renders, the walk preview's shut-door refusals, and
  // the click affordance below.
  const { doors, refetch: refetchDoors } = useSessionDoors(sessionId);
  // Afford — "what can I still declare this turn" (slice 5a). Same
  // additive-not-blocking treatment as GetView above: a turn-economy
  // readout degrades to "no panel data yet" (free-roam, per
  // `combatPanel.ts`'s own two-mode contract, keyed off Turn's clock —
  // see its doc comment) rather than blocking the scene. See
  // `useSessionAfford`'s own doc comment for the full refetch-ownership
  // policy this component implements below.
  const {
    clock: affordClock,
    declarations: affordDeclarations,
    refetch: refetchAfford,
  } = useSessionAfford(sessionId, characterId ?? '');
  // Turn — "whose go is it" (the combat panel's own reason for being).
  // Same no-mount-fetch/last-good-on-error discipline as Afford (see
  // `useSessionTurn`'s own doc comment) and the SAME refetch-ownership
  // policy below, because the panel's overall MODE (free-roam vs turn) is
  // keyed off `turn.clock`, not `afford.clock` (`combatPanel.ts`'s own
  // doc comment on why) — everywhere Afford gets refetched below, Turn
  // does too, or the panel could show shapes without the order/actions
  // that make them mean anything.
  const {
    clock: turnClock,
    active: turnActive,
    round: turnRound,
    participants: turnParticipants,
    refetch: refetchTurn,
  } = useSessionTurn(sessionId, characterId ?? '');

  const { getCharacter } = useGetCharacter();
  const [character, setCharacter] = useState<Character | null>(null);
  const [characterLoading, setCharacterLoading] = useState(!!characterId);
  const [characterError, setCharacterError] = useState<Error | null>(null);

  // A plain callback (not folded into the mount effect below) so the
  // blocking-error retry button can re-invoke it directly, the same way it
  // already re-invokes refetchAtlas/refetchWhere — before this split, a
  // GetCharacter failure was permanent: Retry only re-ran the other two
  // fetches, and characterError never cleared (Copilot review, PR #764).
  const fetchCharacter = useCallback(async () => {
    if (!characterId) {
      setCharacter(null);
      setCharacterLoading(false);
      setCharacterError(null);
      return;
    }
    setCharacterLoading(true);
    setCharacterError(null);
    try {
      const response = await getCharacter(
        create(GetCharacterRequestSchema, { characterId })
      );
      setCharacter(response.character ?? null);
    } catch (err) {
      setCharacterError(
        err instanceof Error ? err : new Error('GetCharacter RPC failed')
      );
    } finally {
      setCharacterLoading(false);
    }
  }, [characterId, getCharacter]);

  useEffect(() => {
    void fetchCharacter();
  }, [fetchCharacter]);

  // Equipment (rpg-project#249 §4, reusing web#571's popover): the
  // session stack carries no encounter snapshot to seed it from (unlike
  // the old route — see `GetCharacterDataRequest`'s own doc comment), so
  // this is its own read, fetched alongside the v1alpha1 character above.
  // A READ, not an action — fetching it eagerly is not "auto-equip"
  // (Kirk's ruling): nothing about the character changes until the
  // player opens the popover and clicks something themselves.
  const { getCharacterData } = useGetCharacterData();
  const { equipItem, loading: equipping } = useEquipItem();
  const { unequipItem, loading: unequipping } = useUnequipItem();
  const [equipmentData, setEquipmentData] = useState<CharacterData | undefined>(
    undefined
  );
  const [equipmentOpen, setEquipmentOpen] = useState(false);

  const fetchEquipment = useCallback(async () => {
    if (!characterId) {
      setEquipmentData(undefined);
      return;
    }
    try {
      const response = await getCharacterData(characterId);
      setEquipmentData(response.character);
    } catch {
      // Not blocking (same treatment as GetView) — the equipment entry
      // simply stays hidden (CombatPanel only shows it when
      // `equipmentData` is defined) rather than surfacing a second error
      // card on top of the scene.
    }
  }, [characterId, getCharacterData]);

  useEffect(() => {
    void fetchEquipment();
  }, [fetchEquipment]);

  // EquipItem/UnequipItem's own response carries the full recomputed
  // CharacterData (occupancy changes, AC, everything) — mirrored straight
  // into local state, same as EncounterDock's own handleEquipIntent. No
  // stream push for this RPC's effect on OTHER clients (rpg-api#681,
  // out of scope), so only the acting player's own view updates here.
  const handleEquipIntent = useCallback(
    async (intent: EquipIntent) => {
      if (!characterId) return;
      try {
        const response =
          intent.kind === 'EquipItem'
            ? await equipItem({
                characterId,
                item: intent.ref,
                slotKey: intent.slotKey,
              })
            : await unequipItem({ characterId, slotKey: intent.slotKey });
        setEquipmentData(response.character);
      } catch {
        // Surfaced via equipItem/unequipItem's own `error` if a caller
        // needs it; the popover simply keeps showing the last-good state.
      }
    },
    [characterId, equipItem, unequipItem]
  );

  const layoutOutcome = useMemo(
    () => (atlas ? resolveSceneLayout(atlas) : null),
    [atlas]
  );

  const scene = useMemo(() => {
    if (!atlas || !layoutOutcome?.ok) {
      return null;
    }
    return buildScene3D(atlas, HEX_SIZE, layoutOutcome.layout);
  }, [atlas, layoutOutcome]);

  // The atlas's own movement graph (floor mask + declared boundaries/
  // doorways/props) — layout-agnostic (it works in axial/cube space, not
  // screen space), so unlike `scene` this doesn't gate on `layoutOutcome`;
  // it just has nothing to build from before the atlas itself arrives.
  // Recomputes when the ATLAS REFERENCE changes (buildAtlasPathIndex is
  // real work — several Sets built from cells/boundaries/doorways/props)
  // — and when DOOR STATE does (rpg-project#268): a shut or locked door
  // refuses the step server-side, so the preview must refuse it too, and
  // door state is the one live input this otherwise construction-truth
  // index has.
  const pathIndex = useMemo(
    () => (atlas ? buildAtlasPathIndex(atlas, doors) : null),
    [atlas, doors]
  );

  // Whether a FULLY clean paint is possible RIGHT NOW: atlas, position AND
  // character all present, nothing still loading, nothing errored. This is
  // the same bar the original loading/blockingError gate enforced before
  // slice 2 — preserved exactly for the FIRST paint (a character-fetch
  // failure, say, still blocks the very first render with the existing
  // error card, per SessionEncounterView.test.tsx's own "Retry also
  // re-attempts a failed character fetch" case). Computed here, ABOVE
  // `useSessionWalk`, so the last-good refs immediately below are settled
  // before that hook (and the JSX far below) read them — see those refs'
  // own comment for why this ordering is load-bearing, not cosmetic.
  const canDrawSceneNow =
    !!scene &&
    scene.floorTiles.size > 0 &&
    !!wherePosition &&
    !characterLoading &&
    !characterError;

  // Sticky "shown once, stays shown" — set the FIRST time canDrawSceneNow
  // is true and never cleared after (the `initialTargetRef.current ===
  // null` lazy-init idiom SessionCanvas.tsx already uses). Deliberately
  // NOT re-derived from the current loading/error flags on every render:
  // `useSessionAtlas`/`useSessionWhere` don't clear their last-good data
  // just because a REFETCH is in flight (only a FAILED refetch clears
  // it — see each hook's own doc comment), so once the scene has
  // everything it needs, it keeps having everything it needs through a
  // background refresh, and once it has been SHOWN once, a later refetch
  // (even one that clears wherePosition on failure) must not un-show it.
  // Load-bearing as of slice 2: a MOVED stream event refetches GetWhere
  // below, which now fires routinely WHILE a walk is still animating (the
  // event arrives once the server commits the move, well before the
  // client-side walk animation finishes) — gating the canvas on the bare
  // `loading` flag here reproduced a real bug: `SessionCanvas` unmounted
  // on every such refetch, tearing down HexEntity's in-progress walk
  // animation state and the camera's frozen seed mid-walk (the walk would
  // silently restart partway through, and the camera-follow added this
  // slice never got a chance to run — every remount re-seeded it already
  // at the destination).
  // The scene, position AND atlas path index are all captured into refs
  // the moment they're known-good, rather than read live inside the
  // render branch below (or, for `pathIndex`, passed straight through as
  // the live `useMemo` above) — a LATER failed refetch clears
  // `wherePosition` to null (and `atlas`, so `scene`/`pathIndex` too) even
  // after `canDrawSceneNow` has been true before, and reading those live
  // values in that window would pass `null` where `SessionCanvas` expects
  // a real `Scene3D`/position/index. THIS is the fix for rpg-dnd5e-web#768
  // (Copilot review on PR #768, slice 4's own follow-up): before it,
  // `pathIndex` was passed to both `useSessionWalk` and `SessionCanvas`
  // straight from the LIVE memo above, so a background `GetAtlas` refetch
  // failure (which nulls `atlas` — `useSessionAtlas.ts`'s own doc comment)
  // silently went dead — every hover read `'invalid'`, and clicks no-oped
  // — while the canvas kept drawing the OLD encounter via
  // `lastGoodSceneRef`/`lastGoodPositionRef`, contradicting what was drawn.
  // `GetAtlas`'s own doc comment is explicit the atlas is CONSTRUCTION
  // TRUTH, static for the whole encounter, so a refetch failure is never a
  // reason to distrust data already successfully in hand — pinning all
  // three to ONE last-good snapshot makes that guarantee structural rather
  // than three independently-derived values that happen to agree today.
  const lastGoodSceneRef = useRef<typeof scene>(null);
  const lastGoodPositionRef = useRef<ReturnType<typeof positionToCube> | null>(
    null
  );
  const lastGoodPathIndexRef = useRef<typeof pathIndex>(null);
  if (canDrawSceneNow) {
    lastGoodSceneRef.current = scene;
    lastGoodPositionRef.current = positionToCube(wherePosition!);
    lastGoodPathIndexRef.current = pathIndex;
  }
  // Tied to BOTH scene/position refs, not just the scene one (Copilot
  // review, PR #766) — the two are always set together above, but checking
  // only one and relying on that coupling staying true forever is exactly
  // the kind of invariant a later edit silently breaks. Checking both here
  // makes the render branch's own `lastGoodPositionRef.current!` assertion
  // actually safe rather than merely usually-true.
  const canDrawScene =
    lastGoodSceneRef.current !== null && lastGoodPositionRef.current !== null;

  const member = characterId ?? '';
  const {
    displayPosition,
    movePath,
    moveSeq,
    busy: walking,
    walkTo,
    onWalkAnimationComplete,
    moveError,
    notYourTurn,
  } = useSessionWalk(
    sessionId,
    member,
    lastGoodPathIndexRef.current,
    wherePosition,
    refetchWhere
  );

  // The floor's own lock signal — computed FRESH from live Turn state on
  // every render, not from `useSessionWalk`'s `notYourTurn` (an attempt-
  // driven flag that only updates on a NEW walkTo, so it would otherwise
  // keep reading true for a beat after the turn order cycles back to this
  // member — toolkit#1169's own module-doc-comment section explains why).
  // `false` on the world clock: free roam is never locked.
  const turnLocked = turnClock === ClockKind.TURN && turnActive !== member;

  // Every other member the local player currently perceives, ready for
  // SessionCanvas — sightingEntities.ts owns the seen-unset/memory/own-
  // subject rules (see its own doc comment); this route just renders what
  // it returns. Computed BEFORE useCombatPanel below — it doubles as that
  // hook's `sightedMembers` fallback name source (see its own doc
  // comment on why `Turn.participants` alone races a fresh FightStarted).
  const otherMembers = useMemo(
    () => sightingsToEntities(sightings, characterId ?? ''),
    [sightings, characterId]
  );

  // The combat panel (rpg-dnd5e-web#762) — turn order, the three shapes,
  // Attack/End Turn gates, target selection, the beat line. See its own
  // doc comment for why the args are flat primitives rather than a
  // `{turn, afford}` object built fresh here every render.
  const combatPanel = useCombatPanel({
    session: sessionId,
    member,
    turnClock,
    turnActive,
    turnRound,
    participants: turnParticipants,
    sightedMembers: otherMembers,
    affordClock,
    affordDeclarations,
    refetchAfford,
    refetchTurn,
    refetchView,
  });
  // Destructured for handleSessionEvent's dependency array below — a bare
  // identifier keeps eslint's exhaustive-deps rule happy without pulling
  // in the whole (freshly-returned-every-render) combatPanel object.
  const { handleEvent: handleCombatEvent } = combatPanel;

  // MOVED refetches GetWhere for the LOCAL PLAYER's own move only
  // (rpg-project#254 slice 2) — "where am I" is a question only a SELF
  // move answers; another member's position lives in GetView/sightings,
  // not GetWhere. Before this slice, ANY member's MOVED refetched
  // GetWhere unconditionally (the doc comment here used to call that
  // "harmless" — true only while a monster's driven turn could never
  // actually move; now that it can, refetching the LOCAL player's own
  // position on every one of a monster's four-cell approach would be
  // both pointless and, via the wherePosition-changed effect below,
  // an UNPACED GetView refresh racing ahead of `useCombatPanel`'s own
  // paced one). Another member's moved/struck/missed/turnEnded now
  // reaches GetView entirely through that hook's own queue (see its doc
  // comment) — this is the "single owner of the fetch, more trigger
  // sites" shape, not a second fetcher. AFFORD_REFRESH_EVENT_KINDS/
  // TURN_REFRESH_EVENT_KINDS refetch Afford/Turn instead — different
  // questions (turn economy, whose go it is) that a bare MOVED never
  // answers on its own; see those constants' own comments for why
  // FIGHT_STARTED already covers "a move formed a fight" without MOVED
  // needing to. DOWNED also renders an unnamed beat-line entry — see
  // `useCombatPanel`'s own doc comment for why it never names who
  // (toolkit#1137: no typed "who" for DOWNED exists on the wire yet) and
  // never decodes `event.payload` to guess one.
  // The debug combat log's own bounded buffer (rpg-dnd5e-web#740,
  // rescoped 2026-08-23) — every stream event this component ever sees,
  // oldest first, capped at 500 so a long session can't grow this
  // unboundedly. `DebugCombatLog` renders exactly what it's given and
  // never trims its own copy (see that component's own doc comment) —
  // this is the ONE place the bound is enforced.
  const DEBUG_LOG_MAX_EVENTS = 500;
  const [debugEvents, setDebugEvents] = useState<SessionEvent[]>([]);

  // The run's end (rpg-project#268): the declared ending key once the
  // `ended` beat arrives, '' for an ENDED with no typed body, null while
  // the run is live. Drives the outcome overlay below.
  const [runEnded, setRunEnded] = useState<string | null>(null);

  // The last door action's own one-liner — the direct response half of the
  // narration (the table-wide half arrives as a `door` beat). Cleared on
  // the next attempt; shown beside the walk notices in the top bar.
  const [doorNotice, setDoorNotice] = useState<string | null>(null);

  // Click a door (rpg-project#268): shut opens it, locked tries the lock —
  // the check rolls SERVER-SIDE and the answer is narrated with its
  // numbers, both outcomes. Open doors ignore the click (CloseDoor is
  // shelved off the wire). The stream's `door` beat refreshes the map for
  // everyone including us; the refetch here just lands the state a beat
  // earlier for the actor.
  const handleDoorClick = useCallback(
    (door: string) => {
      const state = doors.get(door)?.state;
      if (!member || state === undefined || state === DoorState.OPEN) return;
      setDoorNotice(null);
      void (async () => {
        try {
          if (state === DoorState.LOCKED) {
            const resp = await sessionClient.unlock({
              session: sessionId,
              member,
              door,
            });
            setDoorNotice(
              resp.beaten
                ? `Picked the lock — ${resp.total} vs DC ${resp.dc}. The door swings open.`
                : `The lock holds — ${resp.total} vs DC ${resp.dc}.`
            );
          } else {
            await sessionClient.openDoor({ session: sessionId, member, door });
            setDoorNotice('The door opens.');
          }
          void refetchDoors();
        } catch (err) {
          setDoorNotice(errorMessage(err));
        }
      })();
    },
    [doors, member, sessionId, refetchDoors]
  );

  // Cleared on every session/member change (Copilot review, PR #784) —
  // GameView mounts this component without a `key`, so a future wiring
  // change that reassigns `sessionId`/`characterId` on an already-mounted
  // instance must not carry one session's events into another's log, and
  // a `seq` sequence that restarts at a new session would otherwise
  // collide with `DebugCombatLog`'s own `seq`-keyed React list. Same
  // "reset rather than trust a remount to happen" discipline
  // `useSessionAfford`/`useSessionView` already apply to their own
  // session/member-scoped state.
  useEffect(() => {
    setDebugEvents([]);
  }, [sessionId, member]);

  const handleSessionEvent = useCallback(
    (event: SessionEvent) => {
      if (event.body?.case === 'moved' && event.body.value.member === member) {
        void refetchWhere();
      }
      if (event.body?.case === 'joined') {
        // A new member is new IDENTITY, the roster's one change signal
        // (rpg-project#264's pull-on-join ruling).
        void refetchRoster();
      }
      if (event.body?.case === 'door') {
        // A door changed — opened, closed, or an unlock attempt
        // (rpg-project#268). Re-pull the live door map; the leaf, the walk
        // preview and the click affordance all read from it.
        void refetchDoors();
      }
      if (event.body?.case === 'ended' || event.kind === EventKind.ENDED) {
        // The run is over. The typed body carries the declared key the
        // client maps to a sentence (rpg-project#269 §6.3); an ENDED kind
        // with no body still ends the run, with the default headline. The
        // bubble dissolved BEFORE this arrived (ruling §6.6), so the
        // overlay lands on free roam, never on the combat panel.
        setRunEnded(
          event.body?.case === 'ended' ? event.body.value.ending : ''
        );
      }
      // Beat-line formatting, another member's turn pacing, and every
      // Afford/Turn/View refetch trigger besides the self-MOVED GetWhere
      // refresh above now live in `useCombatPanel`'s own `handleEvent` —
      // see its doc comment for the single-funnel reasoning.
      handleCombatEvent(event);
      setDebugEvents((prev) => {
        const next = prev.length >= DEBUG_LOG_MAX_EVENTS ? prev.slice(1) : prev;
        return [...next, event];
      });
    },
    [member, refetchWhere, refetchRoster, refetchDoors, handleCombatEvent]
  );

  // Names for the debug log — the SAME `participantNameMap` +
  // sighted-member fallback `useCombatPanel`'s own `namesNow` builds
  // internally (see that hook's doc comment on why a beat that arrives
  // before Turn's own roster fetch lands still needs a name), computed
  // here since the debug log is a sibling consumer of the same stream,
  // not a child of `useCombatPanel`.
  const debugLogNames = useMemo(() => {
    const names = participantNameMap(turnParticipants);
    for (const m of otherMembers) {
      if (!names.has(m.subject)) names.set(m.subject, m.name);
    }
    return names;
  }, [turnParticipants, otherMembers]);
  // Aged-out (rule 6, rpg-dnd5e-web#779): the resume point fell out of the
  // retention window, so the stream hook already resynced from zero on its
  // own — this callback is the piece only the caller can own, the same
  // View/Turn/Afford refetch trio SessionEncounterView already owns every
  // other trigger for (see this component's own doc comment).
  const handleStreamAgedOut = useCallback(() => {
    void refetchView();
    void refetchTurn();
    void refetchAfford();
  }, [refetchView, refetchTurn, refetchAfford]);

  const streamState = useSessionEventStream(
    sessionId,
    member,
    handleSessionEvent,
    handleStreamAgedOut
  );

  // GetView's refresh policy piggybacks on GetWhere's: every completed
  // The view FOLLOWS where. This effect is the single owner of every
  // GetView fetch — useSessionView deliberately has no mount fetch (Copilot
  // review, PR #767): a perception snapshot only means something relative
  // to a known position. Every GetWhere answer — initial load, the
  // reconciliation after the local player's own walk (useSessionWalk's
  // onWalkAnimationComplete), and every MOVED-triggered refetch above
  // (which fires for ANY member's move this observer is told about) — sets
  // `wherePosition` to a FRESH object reference (useSessionWhere.ts's
  // fetchWhere always calls `setPosition` with a new response, even when
  // the cell is unchanged), so this runs exactly once per landed position
  // and never while `wherePosition` is still null. This is deliberately the
  // "simplest authoritative loop" over hand-decoding
  // `MoveResponse.discovered` at each call site.
  useEffect(() => {
    if (!wherePosition) return;
    void refetchView();
  }, [wherePosition, refetchView]);

  // Afford/Turn's own bootstrap — the very first read, fired once per
  // bound member (mirrors `fetchCharacter`'s own effect above), NOT tied
  // to `wherePosition` landing the way GetView is above: unlike a
  // perception snapshot, neither answer has anything to do with position,
  // and piggybacking on that effect would also refetch on every OTHER
  // member's MOVED-triggered position refresh, which
  // `AFFORD_REFRESH_EVENT_KINDS`/`TURN_REFRESH_EVENT_KINDS` deliberately
  // exclude. Neither hook has a mount fetch of its own (see their doc
  // comments) — this is the "member is known, ask what they can do and
  // whose turn it is" trigger the free-roam pill needs on first paint.
  useEffect(() => {
    if (!member) return;
    void refetchAfford();
    void refetchTurn();
  }, [member, refetchAfford, refetchTurn]);

  // A turn-lock Move refusal (toolkit#1169's not-your-turn — the old
  // blanket fight lock is gone entirely, rpg-project#249) is, today, how
  // a fight FIRST reaches this client — `notYourTurn` flips false -> true
  // exactly then (`useSessionWalk`'s own doc comment: "cleared at the
  // start of the next walkTo, same as moveError"), so re-running only on
  // that transition (not on every render) is exactly "refetch when a Move
  // is refused." This is `useSessionWalk.notYourTurn`'s OWN remaining job
  // — NOT the same variable as `turnLocked` above, which drives the
  // canvas prop instead. Turn refetches alongside Afford here too:
  // without it, the panel would keep showing the free-roam pill (its
  // MODE is keyed off `turn.clock`) even once the player is demonstrably
  // turn-locked.
  useEffect(() => {
    if (!notYourTurn) return;
    void refetchAfford();
    void refetchTurn();
  }, [notYourTurn, refetchAfford, refetchTurn]);

  // The local player's own Move round-trip also refetches Afford/Turn —
  // walking can be what forms a fight, and while FIGHT_STARTED (above)
  // should cover that, StreamEvents delivery is best-effort (design rule
  // 6), so this is the same belt-and-suspenders the turn-lock effect
  // above already is. Guarded by the SAME completed-seq check
  // `useSessionWalk.onWalkAnimationComplete` uses internally, so a stale
  // animation callback (one that isn't the CURRENT walk) doesn't trigger
  // a spurious refetch.
  const refetchCombatStateAfterOwnMove = useCallback(() => {
    void refetchAfford();
    void refetchTurn();
  }, [refetchAfford, refetchTurn]);

  const handleWalkAnimationComplete = useCallback(
    (completedSeq: number) => {
      onWalkAnimationComplete(completedSeq);
      if (completedSeq === moveSeq) {
        refetchCombatStateAfterOwnMove();
      }
    },
    [onWalkAnimationComplete, moveSeq, refetchCombatStateAfterOwnMove]
  );

  const classRefId = character
    ? CLASS_TEXTURE_SUFFIXES[character.class]
    : undefined;

  // Attack is a floor gesture now, not a separate canvas mode
  // (rpg-project#249, `combatPanel.ts`'s own doc comment) — walking and
  // attacking coexist on the SAME floor at all times. Narrowed to the
  // AFFORDABLE candidates only (Kirk's own live-walk ruling): an
  // in-reach target that's already been spent this turn still gets its
  // own shortfall text on hover (`combatPanel.ts`'s `hoverLabel`, which
  // reads the unfiltered `attackTargets` list), but must NOT keep
  // swallowing floor clicks near it once it can no longer actually be
  // attacked — movement is independent of the action economy in 5e, and
  // the floor has to keep offering it.
  const attackableTargets =
    combatPanel.selection.mode === 'turn'
      ? combatPanel.selection.attackTargets
          .filter((t) => t.affordable)
          .map((t) => t.id)
      : undefined;
  const canvasMaxCells =
    combatPanel.selection.mode === 'turn'
      ? combatPanel.selection.moveMaxCells
      : undefined;

  const loading = atlasLoading || whereLoading || characterLoading;
  const blockingError = atlasError ?? whereError ?? characterError;

  let content: React.ReactNode;
  if (!characterId) {
    content = (
      <CenteredCard>
        <ErrorDisplay
          title="No character selected"
          message="Can't place you in this session without a character."
        />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </CenteredCard>
    );
  } else if (canDrawScene) {
    // Non-null assertions below are exactly what `canDrawScene` (just
    // checked) already established — `lastGoodSceneRef`/
    // `lastGoodPositionRef` are both populated in this branch, per
    // `canDrawScene`'s own definition above.
    content = (
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <SessionCanvas
          scene={lastGoodSceneRef.current!}
          hexSize={HEX_SIZE}
          characterId={characterId}
          characterName={character?.name ?? 'You'}
          character={character ?? undefined}
          classRefId={classRefId}
          roster={roster}
          doors={doors}
          onDoorClick={handleDoorClick}
          // Falls back to the last known-good GetWhere position — see
          // `lastGoodPositionRef`'s own comment above for why this reads
          // from that ref rather than a live `wherePosition`.
          // useSessionWalk's own displayPosition state seeds from
          // wherePosition via an effect, which lags one tick behind the
          // render that first sees wherePosition become non-null, hence
          // still falling back to the ref on that very first render too.
          myPosition={displayPosition ?? lastGoodPositionRef.current!}
          movePath={movePath}
          moveSeq={moveSeq}
          onHexClick={walkTo}
          onEntityClick={combatPanel.attackTarget}
          onHoverEntity={combatPanel.onHoverEntity}
          onMovementPresentationComplete={handleWalkAnimationComplete}
          otherMembers={otherMembers}
          attackableTargets={attackableTargets}
          pathIndex={lastGoodPathIndexRef.current}
          turnLocked={turnLocked}
          maxCells={canvasMaxCells}
        />
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
          {walking && (
            <span style={{ color: 'var(--text-secondary, #aaa)' }}>
              Walking…
            </span>
          )}
          {moveError && !walking && (
            <span style={{ color: 'var(--color-error, #f87171)' }}>
              {moveError}
            </span>
          )}
          {doorNotice && (
            <span style={{ color: 'var(--text-secondary, #aaa)' }}>
              {doorNotice}
            </span>
          )}
        </div>
        {runEnded !== null && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.65)',
              zIndex: 30,
            }}
          >
            <div
              style={{
                textAlign: 'center',
                padding: '32px 48px',
                borderRadius: 12,
                background: 'var(--bg-secondary, #1c1c22)',
                border: '1px solid var(--border-primary, #333)',
              }}
            >
              <h2 style={{ margin: '0 0 8px' }}>{endingHeadline(runEnded)}</h2>
              <p
                style={{
                  color: 'var(--text-secondary, #aaa)',
                  margin: '0 0 20px',
                }}
              >
                The encounter is over — the outcome is recorded.
              </p>
              <Button size="sm" onClick={onBack}>
                Leave
              </Button>
            </div>
          </div>
        )}
        <CombatPanel
          selection={combatPanel.selection}
          turnStartedBanner={combatPanel.turnStartedBanner}
          onEndTurnClick={combatPanel.endTurn}
          endingTurn={combatPanel.endingTurn}
          onOpenEquipment={
            equipmentData ? () => setEquipmentOpen((o) => !o) : undefined
          }
        />
        <DebugCombatLog
          events={debugEvents}
          streamState={streamState}
          names={debugLogNames}
          storyLine={
            combatPanel.selection.mode === 'turn'
              ? combatPanel.selection.lastBeat
              : null
          }
        />
        {equipmentData && (
          // A full-width, ZERO-HEIGHT anchor strip pinned to the bottom
          // of the VIEWPORT (`position: fixed`, not `absolute` — see
          // below) — not a sibling of the full-viewport canvas wrapper.
          // EquipmentPopover's own CSS (`.equip-popover { bottom:
          // calc(100% + 10px); right: 8px; width: min(560px, 60%) }`,
          // base.css) needs BOTH a viewport-scale WIDTH (for the 60% max-
          // width to mean anything) and a SMALL height (so `100%` lands
          // near the bottom, not off the top) from its positioned
          // ancestor — exactly what EncounterDock's own dock bar gives it
          // for free (full width, auto height sized to a single row of
          // controls). `left/right: 0` gives this div the viewport's full
          // width; `height: 0` collapses it to a line sitting at
          // `bottom: 12`, so `calc(100% + 10px)` computes to just above
          // that line, not the top of a tall container. An earlier
          // `position: absolute` wrapper with no explicit size at all
          // collapsed to near-zero in BOTH dimensions instead (its only
          // child is itself `position: absolute`, contributing nothing to
          // its parent's intrinsic size) — the popover rendered as a
          // sliver against the right edge because `60%` had nothing
          // meaningful to be 60% of. `fixed` (rather than `absolute`,
          // which worked in a controlled 1280x900 headless check but is
          // only ever as reliable as every ancestor between here and the
          // viewport staying un-transformed) pins this to the viewport
          // unconditionally — the strictly safer choice given this tree
          // is already portaled to `document.body`.
          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 12,
              height: 0,
            }}
          >
            <EquipmentPopover
              open={equipmentOpen}
              characterName={character?.name ?? 'You'}
              classLabel={classLabel(classRefId) ?? undefined}
              slots={equipmentData.slots}
              equipped={equipmentData.equipped}
              items={equipmentData.inventory.filter(
                (
                  item
                ): item is typeof item & {
                  ref: NonNullable<typeof item.ref>;
                } => item.ref !== undefined
              )}
              armorClass={
                equipmentData.armorClassDetail
                  ? {
                      total: equipmentData.armorClassDetail.total,
                      note: equipmentData.armorClassDetail.note,
                    }
                  : undefined
              }
              mainHandDamage={equipmentData.mainHandDamage}
              onIntent={(intent) => void handleEquipIntent(intent)}
              busy={equipping || unequipping}
            />
          </div>
        )}
      </div>
    );
  } else if (loading) {
    content = <LoadingOverlay visible text="Loading the tomb…" />;
  } else if (blockingError) {
    content = (
      <CenteredCard>
        <ErrorDisplay
          title="Couldn't load the session"
          message={errorMessage(blockingError)}
          onRetry={() => {
            void refetchAtlas();
            void refetchWhere();
            void fetchCharacter();
          }}
        />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </CenteredCard>
    );
  } else if (layoutOutcome && !layoutOutcome.ok) {
    content = (
      <CenteredCard>
        <ErrorDisplay
          title="Can't draw this map yet"
          message={layoutOutcome.message}
        />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </CenteredCard>
    );
  } else {
    content = (
      <CenteredCard>
        <ErrorDisplay
          title="Nothing to draw"
          message="The session has no atlas cells, or no known position for you yet."
        />
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </CenteredCard>
    );
  }

  return createPortal(
    <div
      data-testid="session-encounter-view"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary, #0a0a0a)',
      }}
    >
      {content}
    </div>,
    document.body
  );
}
