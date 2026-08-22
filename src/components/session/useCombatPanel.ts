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
 * # The monster's turn as a moment (web#561, rpg-project#249 §4)
 *
 * A `turn_ended` event for a MONSTER participant (`Participant.kind ===
 * MONSTER`, read off the SAME roster the panel renders) is a two-stage
 * presentation pace, not an instant refetch: "<name>'s turn." then, after
 * `MONSTER_TURN_PACING_MS`, "<name> does nothing." — and ONLY THEN does
 * this hook refetch Turn/Afford, which is what actually flips the panel
 * back to the player. A `turn_ended` for anyone else (the local player's
 * own turn ending, or another player's) refetches immediately — there is
 * nothing to pace there. A `downed` beat immediately followed by a
 * `fight_ended` beat reads as one combined sentence when they land close
 * together ("skeleton-1 is downed. The fight is over.", the design's own
 * §1 wording) rather than one silently overwriting the other.
 */
import {
  EventKind,
  type Event as SessionEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  ClockKind,
  MemberKind,
  type Declaration,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSessionAttack } from '../../api/useSessionAttack';
import { useSessionEndTurn } from '../../api/useSessionEndTurn';
import { formatBeat } from './combatBeat';
import { selectCombatPanel, type CombatPanelSelection } from './combatPanel';
import { participantNameMap } from './participantNames';
import type { SightedMember } from './sightingEntities';

/** How long the "<name>'s turn." / "<name> does nothing." pacing beats
 * each stay up before the next stage — exported so a test can assert the
 * exact timing rather than a magic number. */
export const MONSTER_TURN_PACING_MS = 1100;

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
   * it after the player's own Attack round-trip (success or refusal) and
   * on a `downed`/`fightEnded` event body, so sightings never lag behind
   * what the beat line has already announced. GetView otherwise only
   * refreshes on `GetWhere` landing (a live-gate-found gap: a just-
   * defeated target kept reporting `Standing.UP` and stayed clickable
   * until the player's NEXT walk happened to refresh it). */
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
   * funnel for beat-line formatting, monster-turn pacing, and Afford/Turn
   * refetch triggers. `SessionEncounterView` still owns the position-only
   * `MOVED -> refetchWhere` trigger separately (a different question this
   * hook has no stake in). */
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
      // Participants first (the authoritative, standing-aware roster);
      // sighted names fill in anyone Turn's own roster fetch hasn't
      // caught up to yet — see this hook's own doc comment on
      // `sightedMembers`.
      const names = participantNameMap(participants);
      for (const m of sightedMembers ?? []) {
        if (!names.has(m.subject)) names.set(m.subject, m.name);
      }

      if (event.body?.case === 'turnEnded') {
        const endedMember = event.body.value.member;
        const endedIsMonster = participants.some(
          (p) => p.member === endedMember && p.kind === MemberKind.MONSTER
        );
        if (endedMember !== member && endedIsMonster) {
          const name = names.get(endedMember) ?? endedMember;
          setLastBeat(`${name}'s turn.`);
          setTimeout(() => {
            setLastBeat(`${name} does nothing.`);
            setTimeout(() => {
              void refetchAfford();
              void refetchTurn();
            }, MONSTER_TURN_PACING_MS);
          }, MONSTER_TURN_PACING_MS);
          return;
        }
        if (endedMember === member) {
          setLastBeat('Turn ended.');
        }
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
        event.body?.case === 'fightEnded'
      ) {
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
      participants,
      member,
      sightedMembers,
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
