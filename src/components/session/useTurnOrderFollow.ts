/**
 * useTurnOrderFollow — the turn order at the top follows the fight
 * (rpg-project#685).
 *
 * # Why the snapshot alone never moved
 *
 * The server drives every unplayed member's whole turn in one pass. By the
 * time the act stream delivers the guards' turns, the Turn snapshot the funnel
 * refetches is already back on the viewer, so the strip went from "you" to
 * "you" while the story played the guards one by one. The marker has to follow
 * the turns as the story PLAYS them, not as the snapshot reports their sum.
 *
 * # The rule
 *
 * - The snapshot is the source at rest: on (re)connect, after the viewer's own
 *   verbs, and whenever no driven turn is playing. A snapshot landing then
 *   replaces anything the acts said.
 * - Between snapshots, clock acts move it. A turn end names whose turn it is
 *   now (`TurnPassed.next`), so the marker moves there; passing back to the
 *   head of the order is a new round. The viewer's own turn end applies on
 *   arrival; another member's applies when the paced story reaches it
 *   (`onTurnBeat`, from `useCombatStoryPacing`), and the pacing's "playing"
 *   beat marks whose turn the story is showing. While a driven turn plays, a
 *   snapshot that lands ahead of it does not move the marker.
 * - A turn end that names no `next` is not guessed at: it refetches the
 *   snapshot.
 * - EXITED drops the member, FIGHT_FORMED orders the strip by the fight's
 *   order, FIGHT_DISSOLVED clears it, each until the next snapshot (the same
 *   act refetches it). JOINED names no place in the order, so the joiner comes
 *   in at its place with that snapshot.
 * - Everything else, and every catch-up act, leaves the strip alone. A
 *   world-pace walk carries no fight clock and never touches it.
 *
 * Display only: action authority (`turnActive`, `fresh`) stays the snapshot's.
 */
import type { Participant } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  ClockMark,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActDeliveryMetadata } from './actFeed';
import { fightIncludes } from './combat-experience/toastPolicy';

/** What the paced story tells the turn order it is showing. */
export type TurnBeat =
  | { readonly type: 'playing'; readonly actor: string }
  | { readonly type: 'passed'; readonly act: Act }
  | { readonly type: 'idle' };

export interface TurnSnapshot {
  readonly active: string;
  readonly round: number;
  readonly participants: readonly Participant[];
  /** Bumps on every successful Turn read: a new snapshot has landed. */
  readonly revision: number;
}

export interface UseTurnOrderFollowArgs {
  /** Session and member: a new scope starts from its snapshot. */
  scope: string;
  member: string;
  snapshot: TurnSnapshot;
  /** Re-read the Turn snapshot. */
  refetch: () => void;
}

export interface UseTurnOrderFollowResult {
  snapshot: TurnSnapshot;
  active: string;
  round: number;
  /** The strip's members, in order, with the marker where the fight is. */
  project: (participants: readonly Participant[]) => Participant[];
  acceptActs: (run: readonly Act[], metadata: ActDeliveryMetadata) => void;
  onTurnBeat: (beat: TurnBeat) => void;
  /** A reconnect: the snapshot is the source again. */
  reset: () => void;
}

interface Cursor {
  readonly active: string;
  readonly round: number;
}

interface FollowState {
  readonly scope: string;
  /** Where the acts put the marker; null while the snapshot is the source. */
  readonly cursor: Cursor | null;
  /** A driven turn is playing in the story. */
  readonly playing: boolean;
  /** Membership the acts changed since the last snapshot. */
  readonly removed: ReadonlySet<string>;
  readonly order: readonly string[] | null;
  readonly cleared: boolean;
  /** The snapshot revision these act changes sit on top of. */
  readonly revision: number;
}

function restState(scope: string, revision: number): FollowState {
  return {
    scope,
    cursor: null,
    playing: false,
    removed: new Set(),
    order: null,
    cleared: false,
    revision,
  };
}

/** The marker moved to `next`; passing back to the order's head is a round. */
function passTo(
  cursor: Cursor,
  from: string | undefined,
  next: string,
  order: readonly string[]
): Cursor {
  const was = from === undefined ? -1 : order.indexOf(from);
  const now = order.indexOf(next);
  const wrapped = was >= 0 && now >= 0 && now <= was;
  return { active: next, round: wrapped ? cursor.round + 1 : cursor.round };
}

/**
 * The state as of `snapshot`: a new scope starts at rest, and a new snapshot
 * makes membership the snapshot's again, and the marker too unless a driven
 * turn is still playing ahead of it.
 */
function normalize(
  s: FollowState,
  scope: string,
  snapshot: TurnSnapshot
): FollowState {
  if (s.scope !== scope) return restState(scope, snapshot.revision);
  if (s.revision === snapshot.revision) return s;
  return {
    ...s,
    cursor: s.playing ? s.cursor : null,
    removed: new Set(),
    order: null,
    cleared: false,
    revision: snapshot.revision,
  };
}

function cursorOf(s: FollowState, snapshot: TurnSnapshot): Cursor {
  return s.cursor ?? { active: snapshot.active, round: snapshot.round };
}

export function useTurnOrderFollow({
  scope,
  member,
  snapshot,
  refetch,
}: UseTurnOrderFollowArgs): UseTurnOrderFollowResult {
  const [stored, setState] = useState<FollowState>(() =>
    restState(scope, snapshot.revision)
  );
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  // The round the viewer's current or last turn began in: recorded when the
  // strip's marker arrives on the viewer, never when it stays there.
  const viewerTurnRoundRef = useRef<number | null>(null);
  const shownActiveRef = useRef('');
  const shownScopeRef = useRef(scope);

  const update = useCallback((change: (s: FollowState) => FollowState) => {
    setState((previous) =>
      change(normalize(previous, scopeRef.current, snapshotRef.current))
    );
  }, []);

  const applyPassed = useCallback(
    (act: Act) => {
      if (act.body.case !== 'clock') return;
      const turn = act.body.value.turn;
      const next = turn?.next?.id;
      if (!next) {
        // Nothing names whose turn it is now: ask, never guess.
        refetchRef.current();
        return;
      }
      const order = snapshotRef.current.participants.map((p) => p.member);
      const from = turn?.member?.id;
      const ownTurnRound = viewerTurnRoundRef.current;
      update((s) => ({
        ...s,
        cursor: passTo(
          // The viewer's own turn end counts from the round their turn began
          // in: the end-turn verb's snapshot can land first, already a round
          // on, because the server has played the whole loop.
          !s.cursor && from === member && ownTurnRound !== null
            ? { active: member, round: ownTurnRound }
            : cursorOf(s, snapshotRef.current),
          from,
          next,
          order
        ),
      }));
    },
    [member, update]
  );

  const onTurnBeat = useCallback(
    (beat: TurnBeat) => {
      switch (beat.type) {
        case 'playing':
          update((s) => ({
            ...s,
            playing: true,
            cursor: {
              active: beat.actor,
              round: cursorOf(s, snapshotRef.current).round,
            },
          }));
          return;
        case 'passed':
          applyPassed(beat.act);
          return;
        case 'idle':
          update((s) => ({ ...s, playing: false, cursor: null }));
          return;
      }
    },
    [applyPassed, update]
  );

  const acceptActs = useCallback(
    (run: readonly Act[], metadata: ActDeliveryMetadata) => {
      if (metadata.source !== 'live') return;
      for (const act of run) {
        if (act.refused || act.body.case !== 'clock') continue;
        const clock = act.body.value;
        switch (clock.mark) {
          case ClockMark.TURN_ENDED:
            // Another member's turn end arrives through the paced story
            // (`onTurnBeat`); only a turn end with nobody else to play moves
            // the marker on arrival.
            if (!clock.turn?.member?.id || clock.turn.member.id === member) {
              applyPassed(act);
            }
            break;
          case ClockMark.EXITED: {
            const gone = clock.departure?.member?.id;
            if (gone) {
              update((s) => ({ ...s, removed: new Set([...s.removed, gone]) }));
            }
            break;
          }
          case ClockMark.FIGHT_FORMED:
            if (fightIncludes(act, member)) {
              const order = (clock.fight?.order ?? []).map((p) => p.id);
              update((s) => ({
                ...s,
                cursor: null,
                order,
                removed: new Set(),
                cleared: false,
              }));
            }
            break;
          case ClockMark.FIGHT_DISSOLVED:
            if (fightIncludes(act, member)) {
              update((s) => ({ ...s, cursor: null, cleared: true }));
            }
            break;
          default:
            break;
        }
      }
    },
    [applyPassed, member, update]
  );

  const reset = useCallback(() => {
    setState(restState(scopeRef.current, snapshotRef.current.revision));
  }, []);

  const state = normalize(stored, scope, snapshot);
  const active = state.cursor?.active ?? snapshot.active;
  const round = state.cursor?.round ?? snapshot.round;
  const { cleared, order, removed } = state;
  useEffect(() => {
    if (shownScopeRef.current !== scope) {
      shownScopeRef.current = scope;
      shownActiveRef.current = '';
      viewerTurnRoundRef.current = null;
    }
    if (active === member && shownActiveRef.current !== member) {
      viewerTurnRoundRef.current = round;
    }
    shownActiveRef.current = active;
  }, [active, member, round, scope]);
  const project = useCallback(
    (participants: readonly Participant[]): Participant[] => {
      if (cleared) return [];
      let shown: Participant[] = [...participants];
      if (order) {
        shown = order.flatMap((id) => {
          const found = participants.find((p) => p.member === id);
          return found ? [found] : [];
        });
      }
      return shown
        .filter((p) => !removed.has(p.member))
        .map((p) =>
          p.active === (p.member === active)
            ? p
            : { ...p, active: p.member === active }
        );
    },
    [active, cleared, order, removed]
  );

  return useMemo(
    () => ({
      snapshot,
      active,
      round,
      project,
      acceptActs,
      onTurnBeat,
      reset,
    }),
    [acceptActs, active, onTurnBeat, project, reset, round, snapshot]
  );
}
