/**
 * useCombatPanel — the React seam between the session route's live RPC
 * state and `combatPanel.ts`'s pure selection, PLUS the panel's own local
 * state (hover, the beat line, the turn-start teaching banner) and its
 * imperative actions (Attack-by-click, End Turn, the stream handler).
 * Same shape as `useMoveIndicator`/`useTurnHud`, grown to own imperative
 * actions the way `useSessionWalk` owns `walkTo` — a panel has actions, a
 * pure selector cannot dispatch RPCs.
 *
 * # Attack fires straight from a floor click (rpg-project#249)
 *
 * `attackTarget` is wired directly to `SessionCanvas.onEntityClick` — no
 * "arm, then confirm" two-step (see `combatPanel.ts`'s own doc comment on
 * why Attack is a floor gesture, not a panel button). It re-checks the
 * CURRENT `selection.attackTargets` before dispatching (never trusts a
 * stale click), and never re-derives reach/affordability of its own.
 *
 * # The beat line renders ONLY from `Event.body` (gate review, PR #769)
 *
 * Every beat — including the local player's OWN swing — comes from the
 * stream's typed events (`combatBeat.ts`'s `formatBeat`), never from
 * `AttackResponse`'s own fields and never from `Event.payload`. One
 * source of truth means "you hit" and "you were told someone else hit"
 * are formatted by the exact same code, and a `Downed` beat finally names
 * who (`Downed.member`, rpg-toolkit#1137) instead of the old anonymous
 * "A member is downed." placeholder this module used to render.
 *
 * # The monster's turn as a moment, replayed at a readable pace
 * (rpg-project#254, design rpg-project#252, journey #253/#91)
 *
 * The server drives an unplayed member's whole turn in one pass and
 * narrates it as a burst on the stream — `moved` (one per cell), then
 * `struck`/`missed`, then `turn_ended` — which can land within
 * milliseconds of each other (`useCombatPanel` used to only ever see a
 * bare `turn_ended`, back when the driver could only Pass). Shown as fast
 * as they arrive, a multi-cell approach and a swing would flash by
 * unreadably, so `handleEvent` diverts those four kinds — whenever their
 * actor isn't the local `member` — into a small queue
 * (`monsterBeatQueue.ts`'s `needsPacing`/`nextBeatStep`) and
 * `drainQueue` below replays them one at a time, `BEAT_PACE_MS` apart:
 * "<name>'s turn." first (an `announce` step, before the actor's first
 * real beat is even consumed), then each `moved` refetches GetView
 * silently (the entity must be standing where the server says by the
 * time its `struck` lands), each `struck`/`missed` sets the beat line
 * (using the SAME `formatBeat` the player's own swings use, so "Skeleton
 * hits Fighter — 23 vs AC 13, 11 slashing." reads no differently than the
 * player's own "You hit Skeleton..."), and `turnEnded` finalizes — "<name>
 * does nothing." only when nothing else played first (a driver that sees
 * nobody), otherwise the last struck/missed line simply stands — then,
 * after one more pace delay, refetches Turn/Afford, which is what
 * actually flips the panel's turn indicator back to the player. Every
 * OTHER kind (`downed`, `fightStarted`, `fightEnded`, `ENDED`, and any
 * beat the local player caused themselves) bypasses the queue and is
 * handled immediately below, exactly as before this slice.
 *
 * `monsterBeatQueue.ts`'s own doc comment covers why the gate is "not the
 * local player," not `MemberKind.MONSTER` specifically.
 */
import {
  EventKind,
  type Event as SessionEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  ClockKind,
  type Declaration,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSessionAttack } from '../../api/useSessionAttack';
import { useSessionEndTurn } from '../../api/useSessionEndTurn';
import { formatBeat } from './combatBeat';
import { selectCombatPanel, type CombatPanelSelection } from './combatPanel';
import { needsPacing, nextBeatStep } from './monsterBeatQueue';
import { participantNameMap } from './participantNames';
import type { SightedMember } from './sightingEntities';

/** How far apart the queue plays consecutive beats of another member's
 * driven turn — the design's own "so a human can follow" bound
 * (rpg-project#252 §4: 250-400ms). Exported so a test can assert the
 * exact timing rather than a magic number. */
export const BEAT_PACE_MS = 300;

/** How long the "Your turn!" teaching banner stays up. */
export const TURN_STARTED_BANNER_MS = 2000;

export interface UseCombatPanelArgs {
  session: string;
  member: string;
  turnClock: ClockKind;
  turnActive: string;
  turnRound: number;
  participants: Participant[];
  /** Every OTHER member currently perceived (`GetView.sightings`, via
   * `sightingsToEntities`) — a FALLBACK name source for a beat that
   * arrives before Turn's own roster fetch has landed. `FightStarted`
   * fires the instant a fight forms, and `Turn.participants` only knows
   * the new fight's roster once its OWN refetch (triggered by that same
   * event) resolves — a real race, not a hypothetical one (caught live:
   * the beat read "A fight begins: skeleton-1, You." — the raw subject
   * id — until this fallback was added). Sighting a subject is exactly
   * what causes a fight to form, so `Sighting.name` is already known at
   * that instant; it is never a guess. */
  sightedMembers?: SightedMember[];
  affordClock: ClockKind;
  affordDeclarations: Declaration[];
  /** Owned by the caller — `SessionEncounterView` is the single owner of
   * every Afford/Turn fetch. */
  refetchAfford: () => Promise<void>;
  refetchTurn: () => Promise<void>;
  /** Owned by the caller (`useSessionView`'s `refetch`) — this hook fires
   * it after the player's own Attack round-trip (success or refusal), on
   * a `downed`/`fightEnded` event body, and — this slice — for every
   * queued `moved`/`struck`/`missed`/`turnEnded` beat belonging to
   * another member, at the SAME paced tempo those beats render at (see
   * this module's own doc comment). GetView otherwise only refreshed on
   * `GetWhere` landing (a live-gate-found gap: a just-defeated target
   * kept reporting `Standing.UP` and stayed clickable until the player's
   * NEXT walk happened to refresh it; the same staleness was true of
   * another member's position before this slice — nothing refreshed
   * `GetView` for a monster's OWN move). */
  refetchView: () => Promise<void>;
}

export interface UseCombatPanelResult {
  selection: CombatPanelSelection;
  /** The turn-start teaching moment (web#533) — "Your turn!" for
   * `TURN_STARTED_BANNER_MS` on the render where `active` first becomes
   * this member, `null` otherwise. */
  turnStartedBanner: string | null;
  /** Wire straight to `SessionCanvas.onHoverEntity`. */
  onHoverEntity: (subject: string | null) => void;
  /** Wire straight to `SessionCanvas.onEntityClick` — see this module's
   * own doc comment on why Attack is a direct floor gesture. */
  attackTarget: (subject: string) => void;
  /** No-ops when `selection.endTurn` isn't enabled. */
  endTurn: () => void;
  /** Wire straight to `useSessionEventStream`'s `onEvent` — the single
   * funnel for beat-line formatting, another member's turn pacing, and
   * every Afford/Turn/View refetch trigger that isn't the position-only
   * `MOVED -> refetchWhere` the caller still owns for the LOCAL player's
   * own move (a different question this hook has no stake in). */
  handleEvent: (event: SessionEvent) => void;
  attacking: boolean;
  endingTurn: boolean;
}

export function useCombatPanel(args: UseCombatPanelArgs): UseCombatPanelResult {
  const {
    session,
    member,
    turnClock,
    turnActive,
    turnRound,
    participants,
    sightedMembers,
    affordClock,
    affordDeclarations,
    refetchAfford,
    refetchTurn,
    refetchView,
  } = args;

  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [lastBeat, setLastBeat] = useState<string | null>(null);
  const [turnStartedBanner, setTurnStartedBanner] = useState<string | null>(
    null
  );

  const { attack: dispatchAttack, loading: attacking } = useSessionAttack();
  const { endTurn: dispatchEndTurn, loading: endingTurn } = useSessionEndTurn();

  const selection = useMemo(
    () =>
      selectCombatPanel({
        turn: {
          clock: turnClock,
          active: turnActive,
          round: turnRound,
          participants,
        },
        afford: { clock: affordClock, declarations: affordDeclarations },
        member,
        hoveredEntityId,
        lastBeat,
        sightedMembers,
      }),
    [
      turnClock,
      turnActive,
      turnRound,
      participants,
      affordClock,
      affordDeclarations,
      member,
      hoveredEntityId,
      lastBeat,
      sightedMembers,
    ]
  );

  // Turn-start teaching moment (web#533): "Your turn!" for a beat on the
  // FIRST render where `active` flips to this member — not on every
  // render where it's already true (a re-render mid-turn, an unrelated
  // Afford refresh, must not re-trigger it).
  const prevActiveRef = useRef<string | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const currentActive = turnClock === ClockKind.TURN ? turnActive : null;
    const isYourTurnNow = currentActive === member && currentActive !== null;
    const wasYourTurn = prevActiveRef.current === member;
    if (isYourTurnNow && !wasYourTurn) {
      setTurnStartedBanner('Your turn!');
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = setTimeout(() => {
        setTurnStartedBanner(null);
      }, TURN_STARTED_BANNER_MS);
    }
    prevActiveRef.current = currentActive;
  }, [turnClock, turnActive, member]);
  useEffect(
    () => () => {
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    },
    []
  );

  // Another member's driven-turn queue (see this module's own doc
  // comment). `participantsRef`/`sightedMembersRef` track the LATEST
  // props across renders so a beat processed several timeouts after it
  // was enqueued still resolves names from current data, not whatever
  // was current the instant it arrived (`useSessionEventStream`'s own
  // `onEventRef` is the same "read through a ref" idiom, for the same
  // reason).
  const queueRef = useRef<SessionEvent[]>([]);
  const drainingRef = useRef(false);
  const announcedActorRef = useRef<string | null>(null);
  const sawActionRef = useRef(false);
  const drainTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const participantsRef = useRef(participants);
  const sightedMembersRef = useRef(sightedMembers);
  useEffect(() => {
    participantsRef.current = participants;
    sightedMembersRef.current = sightedMembers;
  }, [participants, sightedMembers]);

  const namesNow = useCallback((): Map<string, string> => {
    const names = participantNameMap(participantsRef.current);
    for (const m of sightedMembersRef.current ?? []) {
      if (!names.has(m.subject)) names.set(m.subject, m.name);
    }
    return names;
  }, []);

  const drainQueue = useCallback(() => {
    const step = nextBeatStep(queueRef.current, announcedActorRef.current);

    if (step.type === 'idle') {
      drainingRef.current = false;
      return;
    }

    if (step.type === 'announce') {
      announcedActorRef.current = step.actor;
      sawActionRef.current = false;
      const name = namesNow().get(step.actor) ?? step.actor;
      setLastBeat(`${name}'s turn.`);
      drainTimeoutRef.current = setTimeout(drainQueue, BEAT_PACE_MS);
      return;
    }

    // 'process' — consume the head and apply this beat's own side
    // effects. `queueRef` is a plain array the queue owns exclusively;
    // `monsterBeatQueue.ts` only ever reads it.
    queueRef.current.shift();
    const { event, actor } = step;
    const names = namesNow();

    switch (event.body?.case) {
      case 'moved':
        // No beat text (`formatBeat` returns null for `moved` too, same
        // as the local player's own walk) — just move the entity.
        void refetchView();
        break;
      case 'struck':
      case 'missed': {
        sawActionRef.current = true;
        const text = formatBeat(event, member, names);
        if (text !== null) setLastBeat(text);
        void refetchAfford();
        void refetchView();
        break;
      }
      case 'turnEnded': {
        if (!sawActionRef.current) {
          const name = names.get(actor) ?? actor;
          setLastBeat(`${name} does nothing.`);
        }
        // Otherwise the last struck/missed line stands untouched — the
        // design's own walkthrough goes straight from "Skeleton attacks
        // you..." to "Round 2, your turn." with no separate "turn ended"
        // sentence in between (rpg-project#252 §1).
        void refetchView();
        announcedActorRef.current = null;
        sawActionRef.current = false;
        // One more pace delay before Turn/Afford refetch — this is what
        // actually flips the panel's turn indicator/shapes back to the
        // player, so it happens AFTER the closing beat has had a moment
        // on screen, not the instant it's set. If a new actor's beats
        // already queued up during this delay (should never happen today
        // — the wire drives one member at a time — but never assume),
        // resume draining rather than going idle with unplayed work.
        drainTimeoutRef.current = setTimeout(() => {
          void refetchAfford();
          void refetchTurn();
          if (queueRef.current.length > 0) {
            drainQueue();
          } else {
            drainingRef.current = false;
          }
        }, BEAT_PACE_MS);
        return;
      }
      default:
        break;
    }

    if (queueRef.current.length > 0) {
      drainTimeoutRef.current = setTimeout(drainQueue, BEAT_PACE_MS);
    } else {
      drainingRef.current = false;
    }
  }, [member, namesNow, refetchAfford, refetchTurn, refetchView]);

  useEffect(
    () => () => {
      if (drainTimeoutRef.current) clearTimeout(drainTimeoutRef.current);
    },
    []
  );

  const attackTarget = useCallback(
    (subject: string) => {
      if (selection.mode !== 'turn') return;
      const target = selection.attackTargets.find((t) => t.id === subject);
      if (!target || !target.affordable) return;
      void (async () => {
        try {
          await dispatchAttack({ session, attacker: member, target: subject });
          // The beat line comes from the stream's own Struck/Missed event
          // — see this module's own doc comment.
        } catch (err) {
          setLastBeat(
            `Attack failed: ${err instanceof Error ? err.message : 'unknown error'}`
          );
        } finally {
          void refetchAfford();
          void refetchTurn();
          // Own-Attack-round-trip GetView refresh (see this hook's own
          // doc comment on `refetchView`) — success or refusal, either
          // way the swing is over and sightings may now be stale.
          void refetchView();
        }
      })();
    },
    [
      selection,
      dispatchAttack,
      session,
      member,
      refetchAfford,
      refetchTurn,
      refetchView,
    ]
  );

  const endTurn = useCallback(() => {
    if (selection.mode !== 'turn' || !selection.endTurn.enabled) return;
    void (async () => {
      try {
        await dispatchEndTurn({ session, member });
      } catch {
        // Not separately surfaced (rare: only fires if the button was
        // enabled but the server disagreed, e.g. a race) — the refetch
        // below reconciles the panel to the true state either way.
      } finally {
        void refetchAfford();
        void refetchTurn();
      }
    })();
  }, [selection, dispatchEndTurn, session, member, refetchAfford, refetchTurn]);

  const handleEvent = useCallback(
    (event: SessionEvent) => {
      if (needsPacing(event, member)) {
        queueRef.current.push(event);
        if (!drainingRef.current) {
          drainingRef.current = true;
          drainQueue();
        }
        return;
      }

      // Everything below is either the LOCAL player's own beat (moved,
      // turnEnded, struck/missed as attacker or target) or a kind this
      // module never paces (downed, fightStarted, fightEnded, ENDED) —
      // see `monsterBeatQueue.ts`'s own doc comment for the paced/
      // immediate split.
      const names = participantNameMap(participants);
      for (const m of sightedMembers ?? []) {
        if (!names.has(m.subject)) names.set(m.subject, m.name);
      }

      if (event.body?.case === 'turnEnded') {
        // Reached only for the LOCAL player's own turn ending now —
        // every OTHER member's turnEnded is routed into the queue above.
        setLastBeat('Turn ended.');
        void refetchAfford();
        void refetchTurn();
        return;
      }

      const text = formatBeat(event, member, names);
      if (text !== null) {
        setLastBeat((prev) =>
          event.body?.case === 'fightEnded' && prev?.endsWith('is downed.')
            ? `${prev} ${text}`
            : text
        );
      }

      // AFFORD refresh: every beat that can change what this member can
      // still declare this turn, PLUS `EventKind.ENDED` (the whole
      // session/encounter concluding — not a fight ending, and carries no
      // typed body of its own, so this checks the raw kind directly).
      if (
        event.body?.case === 'struck' ||
        event.body?.case === 'missed' ||
        event.body?.case === 'downed' ||
        event.body?.case === 'fightStarted' ||
        event.body?.case === 'fightEnded' ||
        event.kind === EventKind.ENDED
      ) {
        void refetchAfford();
      }
      if (
        event.body?.case === 'fightStarted' ||
        event.body?.case === 'fightEnded' ||
        event.body?.case === 'downed'
      ) {
        // `downed` changes a participant's `Standing` -- Turn.participants
        // is what the roster chip / isDowned display and the beat-name
        // fallback read, and it does NOT refresh on its own until some
        // OTHER kind (fightStarted/fightEnded, or the player's own
        // Move/Attack/EndTurn round-trip) happens to refetch it. Left
        // unrefetched, a just-downed member's Turn.participants entry
        // (and anything a fresh render derives from it) can read stale
        // until one of those other triggers fires -- rpg-project#251
        // web#772.
        void refetchTurn();
      }
      // VIEW refresh: only `downed`/`fightEnded` change a sighted
      // member's `Standing` — see this hook's own doc comment on
      // `refetchView`. `struck`/`missed`/`fightStarted` never do, so
      // they don't need one (the own-Attack-round-trip refresh in
      // `attackTarget` above already covers the attacker's own swing).
      if (event.body?.case === 'downed' || event.body?.case === 'fightEnded') {
        void refetchView();
      }
    },
    [
      member,
      participants,
      sightedMembers,
      drainQueue,
      refetchAfford,
      refetchTurn,
      refetchView,
    ]
  );

  return {
    selection,
    turnStartedBanner,
    onHoverEntity: setHoveredEntityId,
    attackTarget,
    endTurn,
    handleEvent,
    attacking,
    endingTurn,
  };
}
