/**
 * SessionEncounterView — the real 3D game route's render of a
 * `dnd5e.api.session.v1alpha1` session: the reference tomb, drawn from the
 * atlas, with the local player's character standing where `GetWhere` says
 * they are, able to WALK it (rpg-project#227 W3 slice 2, issue #762's
 * second small victory) — click a floor hex, `useSessionWalk` builds a
 * `MoveRequest` from `atlasPath.ts`'s edge-aware route over the atlas, and
 * the returned steps drive `HexEntity`'s existing move-path animation
 * (`useHexMovePath`, unchanged from the old `HexGrid` route) — and now
 * drawing every OTHER member the local player currently perceives (slice
 * 3, ADR-0041 / rpg-toolkit#1157's `Seen` seam): `useSessionView` polls
 * `GetView`, `sightingEntities.ts` turns its `sightings` into monster
 * `HexEntity`s at their reported cell (or a faded "remembered" one for a
 * held memory, `currentVia` empty), a fight-locked `Move` rejection
 * (`session.ErrInBubble`) surfaces as a friendly status line instead of
 * raw RPC text (`moveErrorMessage.ts`), and now (slice 4) a hover/path
 * indicator on the 3D floor itself: `useSessionWalk`'s `fightLocked` flag
 * and the atlas's own `pathIndex` both flow down into `SessionCanvas` so
 * hovering shows a walk preview, an unreachable-cell refusal, or the same
 * fight lock — computed by the SAME `atlasPath.ts` call `walkTo` itself
 * makes, so the preview can never diverge from what a click actually
 * does (`moveIndicator.ts`'s own doc comment).
 *
 * # The combat panel (rpg-dnd5e-web#762, "grow the HUD into a panel")
 *
 * Slice 5a's `TurnHud` shipped only the three shapes — Kirk walked it and
 * said, verbatim: "well I am 4 spaces away but it stays attack ready and
 * i see nothign happen. what was our plan here? I do not have a panel, I
 * cannot end turn or even see whose turn it is." This is that panel:
 * `useSessionTurn` reads `SessionService.Turn` (whose go is it, what
 * round, the initiative order), `useCombatPanel`/`combatPanel.ts` compose
 * it with Afford into turn order + shapes + Attack/End Turn gates +
 * target selection + a beat line, and `CombatPanel` draws it, replacing
 * `TurnHud` in this view's own render (that component and its tests stay
 * as the focused building block underneath — see its own doc comment).
 * `SessionCanvas` flips into `'target'` mode (slice 4's own seam) exactly
 * when it is this member's turn and Attack is affordable, so hovering a
 * sighted entity highlights it and clicking one selects it as the
 * `Attack` target — `onEntityClick` is new; `onHexClick` is unchanged and
 * does nothing in `'target'` mode (a fight member cannot walk anyway).
 *
 * Still honest about what it doesn't know: a monster's turn has no driver
 * yet (toolkit work item B, in flight) — after this member's own EndTurn,
 * the clock sits on the monster and the panel says so ("Waiting on
 * skeleton-1.") rather than pretending there's more to do.
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
 * (`atlasToScene3D.ts`). It does not enforce Attack's reach/adjacency
 * either — the engine doesn't (toolkit#1010) — see `useAttack.ts`'s own
 * doc comment.
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
import {
  EventKind,
  type Event as SessionEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  GetCharacterRequestSchema,
  type Character,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGetCharacter } from '../../api/characterHooks';
import { useSessionAfford } from '../../api/useSessionAfford';
import { useSessionAtlas } from '../../api/useSessionAtlas';
import { useSessionTurn } from '../../api/useSessionTurn';
import { useSessionView } from '../../api/useSessionView';
import { useSessionWhere } from '../../api/useSessionWhere';
import { layoutFromWire } from '../../concepts/session-tomb/atlas';
import { CLASS_TEXTURE_SUFFIXES } from '../../config/characterTextures';
import { HEX_SIZE } from '../hex-grid/hexMath';
import { Button } from '../ui/Button';
import { ErrorDisplay, LoadingOverlay } from '../ui/Feedback';
import { buildAtlasPathIndex } from './atlasPath';
import { buildScene3D, positionToCube } from './atlasToScene3D';
import { CombatPanel } from './CombatPanel';
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

// The `StreamEvents` kinds that can change what a member can still
// declare this turn (rpg-dnd5e-web#762 slice 5a). Deliberately NOT
// MOVED — a move by itself never changes the economy; a move that forms
// a fight arrives as its own FIGHT_STARTED beat (every member of the
// encounter hears it, per that kind's own doc comment), so listening for
// FIGHT_STARTED already covers the case MOVED alone does not.
const AFFORD_REFRESH_EVENT_KINDS: ReadonlySet<EventKind> = new Set([
  EventKind.FIGHT_STARTED,
  EventKind.FIGHT_ENDED,
  EventKind.TURN_ENDED,
  EventKind.STRUCK,
  EventKind.MISSED,
  EventKind.DOWNED,
  EventKind.ENDED,
]);

// The `StreamEvents` kinds that can change WHOSE turn it is (rpg-dnd5e-
// web#762 combat panel). A narrower set than Afford's above: a strike or
// a downing changes what a member can still PAY for, but never changes
// whose go it is — only a fight starting, ending, or a turn ending does
// that. Also never MOVED, for the same reason as Afford.
const TURN_REFRESH_EVENT_KINDS: ReadonlySet<EventKind> = new Set([
  EventKind.FIGHT_STARTED,
  EventKind.FIGHT_ENDED,
  EventKind.TURN_ENDED,
]);

type LayoutOutcome =
  | { ok: true; layout: 'pointy' }
  | { ok: false; message: string };

/**
 * Reads the wire's own answer for which way the hexes point and gates on
 * it — never guesses (`layoutFromWire`'s own contract: capabilities are
 * supplied, never defaulted). `hexMath.ts`'s 3D placement math is
 * pointy-top only today, so a flat-top or square atlas is reported as a
 * visible, named limitation rather than drawn wrong or silently dropped.
 */
function resolveLayout(
  layout: Parameters<typeof layoutFromWire>[0] | undefined,
  grid: Parameters<typeof layoutFromWire>[1] | undefined
): LayoutOutcome | null {
  if (layout === undefined || grid === undefined) {
    return null;
  }
  try {
    const resolved = layoutFromWire(layout, grid);
    if (resolved === 'pointy') {
      return { ok: true, layout: 'pointy' };
    }
    if (resolved === 'flat') {
      return {
        ok: false,
        message:
          "This session's map is flat-top hex — the 3D route only draws " +
          'pointy-top today (hexMath.ts is pointy-top only; tracked as ' +
          'rpg-dnd5e-web#763), not silently guessed.',
      };
    }
    return {
      ok: false,
      message:
        "This session's map is a square grid — the 3D route only draws " +
        'hex maps today.',
    };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

/** A centered message card, matching the shape (not the fixed positioning)
 * every early-exit state below shares — loading/error/gap all read the
 * same way, just with different content. */
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
    order: turnOrder,
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

  const layoutOutcome = useMemo(
    () => resolveLayout(atlas?.layout, atlas?.grid),
    [atlas]
  );

  const scene = useMemo(() => {
    if (!atlas || !layoutOutcome?.ok) {
      return null;
    }
    return buildScene3D(atlas, HEX_SIZE);
  }, [atlas, layoutOutcome]);

  // The atlas's own movement graph (floor mask + declared boundaries/
  // doorways/props) — layout-agnostic (it works in axial/cube space, not
  // screen space), so unlike `scene` this doesn't gate on `layoutOutcome`;
  // it just has nothing to build from before the atlas itself arrives.
  // Recomputes only when the ATLAS REFERENCE changes (buildAtlasPathIndex
  // is real work — several Sets built from cells/boundaries/doorways/
  // props), same as `scene` above.
  const pathIndex = useMemo(
    () => (atlas ? buildAtlasPathIndex(atlas) : null),
    [atlas]
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
    fightLocked,
  } = useSessionWalk(
    sessionId,
    member,
    lastGoodPathIndexRef.current,
    wherePosition,
    refetchWhere
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
    turnOrder,
    affordClock,
    affordDeclarations,
    refetchAfford,
    refetchTurn,
  });
  // Destructured for handleSessionEvent's dependency array below — a bare
  // identifier keeps eslint's exhaustive-deps rule happy without pulling
  // in the whole (freshly-returned-every-render) combatPanel object.
  const { noteTargetDowned } = combatPanel;

  // MOVED refetches GetWhere for ANY member's move (this is how another
  // member's move will eventually reach this client too — today it's a
  // harmless re-fetch of the same answer the local player's own Move
  // response already reconciled). AFFORD_REFRESH_EVENT_KINDS/
  // TURN_REFRESH_EVENT_KINDS refetch Afford/Turn instead — different
  // questions (turn economy, whose go it is) that a bare MOVED never
  // answers on its own; see those constants' own comments for why
  // FIGHT_STARTED already covers "a move formed a fight" without MOVED
  // needing to. DOWNED also attributes a beat-line entry to the panel's
  // currently selected target — see `useCombatPanel`'s own doc comment
  // for why that's typed-data-only, never a decode of `event.payload`.
  const handleSessionEvent = useCallback(
    (event: SessionEvent) => {
      if (event.kind === EventKind.MOVED) {
        void refetchWhere();
      }
      if (AFFORD_REFRESH_EVENT_KINDS.has(event.kind)) {
        void refetchAfford();
      }
      if (TURN_REFRESH_EVENT_KINDS.has(event.kind)) {
        void refetchTurn();
      }
      if (event.kind === EventKind.DOWNED) {
        noteTargetDowned();
      }
    },
    [refetchWhere, refetchAfford, refetchTurn, noteTargetDowned]
  );
  useSessionEventStream(sessionId, member, handleSessionEvent);

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

  // A fight-lock Move refusal is, today, how a fight FIRST reaches this
  // client (rpg-dnd5e-web#762) — `fightLocked` flips false -> true
  // exactly then (`useSessionWalk`'s own doc comment: "cleared at the
  // start of the next walkTo, same as moveError"), so re-running only on
  // that transition (not on every render) is exactly "refetch when a Move
  // is refused with the fight-lock error." Turn refetches alongside
  // Afford here too: without it, the panel would keep showing the
  // free-roam pill (its MODE is keyed off `turn.clock`) even once the
  // player is demonstrably fight-locked.
  useEffect(() => {
    if (!fightLocked) return;
    void refetchAfford();
    void refetchTurn();
  }, [fightLocked, refetchAfford, refetchTurn]);

  // The local player's own Move round-trip also refetches Afford/Turn —
  // walking can be what forms a fight, and while FIGHT_STARTED (above)
  // should cover that, StreamEvents delivery is best-effort (design rule
  // 6), so this is the same belt-and-suspenders the fight-lock effect
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

  // Every other member the local player currently perceives, ready for
  // SessionCanvas — sightingEntities.ts owns the seen-unset/memory/own-
  // subject rules (see its own doc comment); this route just renders what
  // it returns.
  const otherMembers = useMemo(
    () => sightingsToEntities(sightings, characterId ?? ''),
    [sightings, characterId]
  );

  // 'target' mode exactly when it's this member's turn and Attack is
  // economically affordable (combatPanel.ts's own `targeting` field) —
  // passed straight through to SessionCanvas, which reuses slice 4's
  // `mode: 'target'` seam (hover highlights a sighted entity, click
  // selects it) rather than inventing a second targeting UI.
  const canvasMode =
    combatPanel.selection.mode === 'turn' && combatPanel.selection.targeting
      ? 'target'
      : 'move';

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
          onEntityClick={combatPanel.selectTarget}
          onMovementPresentationComplete={handleWalkAnimationComplete}
          otherMembers={otherMembers}
          pathIndex={lastGoodPathIndexRef.current}
          fightLocked={fightLocked}
          mode={canvasMode}
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
        </div>
        <CombatPanel
          selection={combatPanel.selection}
          onAttackClick={combatPanel.attackSelectedTarget}
          onEndTurnClick={combatPanel.endTurn}
          attacking={combatPanel.attacking}
          endingTurn={combatPanel.endingTurn}
        />
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
