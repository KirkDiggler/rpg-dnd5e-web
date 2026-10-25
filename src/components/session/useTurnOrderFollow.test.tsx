import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  ParticipantSchema,
  Standing,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  ActSchema,
  ClockMark,
  Family,
  PartyKind,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTurnOrderFollow, type TurnSnapshot } from './useTurnOrderFollow';

const VIEWER = 'aldric';
const party = (id: string) => ({ kind: PartyKind.MEMBER, id });
const person = (member: string, active = false): Participant =>
  create(ParticipantSchema, {
    member,
    name: member,
    kind: member === VIEWER ? MemberKind.PLAYER : MemberKind.MONSTER,
    standing: Standing.UP,
    active,
  });

/** Initiative order: the viewer first, then two guards and the captain. */
const ORDER = [VIEWER, 'guard-1', 'guard-2', 'captain'];
function snapshot(
  active: string,
  round: number,
  revision: number,
  order: readonly string[] = ORDER
): TurnSnapshot {
  return {
    active,
    round,
    revision,
    participants: order.map((id) => person(id, id === active)),
  };
}

let seq = 0;
const clock = (value: Record<string, unknown>): Act =>
  create(ActSchema, {
    session: 'castle',
    id: `id-${String(++seq).padStart(4, '0')}`,
    family: Family.CLOCK,
    body: { case: 'clock', value },
  });
const turnEnded = (member: string, next?: string) =>
  clock({
    mark: ClockMark.TURN_ENDED,
    turn: { member: party(member), next: next ? party(next) : undefined },
  });
const live = { source: 'live' } as const;

function setup(initial: TurnSnapshot) {
  const refetch = vi.fn();
  const hook = renderHook(
    ({ snap }: { snap: TurnSnapshot }) =>
      useTurnOrderFollow({
        scope: `castle\u0000${VIEWER}`,
        member: VIEWER,
        snapshot: snap,
        refetch,
      }),
    { initialProps: { snap: initial } }
  );
  const strip = () => {
    const shown = hook.result.current.project(
      hook.result.current.snapshot.participants
    );
    return {
      order: shown.map((p) => p.member),
      marked: shown.filter((p) => p.active).map((p) => p.member),
      active: hook.result.current.active,
      round: hook.result.current.round,
    };
  };
  return { ...hook, refetch, strip };
}

describe('useTurnOrderFollow: the strip follows the fight (rpg-project#685)', () => {
  it('an act sequence moves the marker guard → guard → captain → viewer', () => {
    const { result, rerender, strip } = setup(snapshot(VIEWER, 1, 1));
    const marks: string[] = [];
    const mark = () => marks.push(strip().marked.join());

    // The viewer ends their turn: their own turn end applies on arrival.
    act(() => result.current.acceptActs([turnEnded(VIEWER, 'guard-1')], live));
    mark();
    // The server already drove every guard; pacing starts playing them, and
    // the refetched snapshot lands AHEAD (back on the viewer, round 2).
    act(() => result.current.onTurnBeat({ type: 'playing', actor: 'guard-1' }));
    rerender({ snap: snapshot(VIEWER, 2, 2) });
    expect(strip().marked).toEqual(['guard-1']);
    expect(strip().round).toBe(1);

    act(() =>
      result.current.onTurnBeat({
        type: 'passed',
        act: turnEnded('guard-1', 'guard-2'),
      })
    );
    mark();
    act(() =>
      result.current.onTurnBeat({
        type: 'passed',
        act: turnEnded('guard-2', 'captain'),
      })
    );
    mark();
    act(() =>
      result.current.onTurnBeat({
        type: 'passed',
        act: turnEnded('captain', VIEWER),
      })
    );
    mark();

    expect(marks).toEqual(['guard-1', 'guard-2', 'captain', VIEWER]);
    // Passing back to the head of the order is a new round.
    expect(strip().round).toBe(2);

    // At rest the snapshot is the source again.
    act(() => result.current.onTurnBeat({ type: 'idle' }));
    expect(strip()).toEqual({
      order: ORDER,
      marked: [VIEWER],
      active: VIEWER,
      round: 2,
    });
  });

  it('the replay counts rounds from the viewer’s own turn, not from a snapshot that landed ahead of it', () => {
    const { result, rerender, strip } = setup(snapshot(VIEWER, 1, 1));
    // The end-turn verb's snapshot lands first: the server already looped the
    // fight back to the viewer, a round on.
    rerender({ snap: snapshot(VIEWER, 2, 2) });
    act(() => result.current.acceptActs([turnEnded(VIEWER, 'guard-1')], live));
    expect(strip().marked).toEqual(['guard-1']);
    expect(strip().round).toBe(1);
    act(() => result.current.onTurnBeat({ type: 'playing', actor: 'guard-1' }));
    for (const [from, to] of [
      ['guard-1', 'guard-2'],
      ['guard-2', 'captain'],
      ['captain', VIEWER],
    ]) {
      act(() =>
        result.current.onTurnBeat({ type: 'passed', act: turnEnded(from, to) })
      );
    }
    expect(strip().marked).toEqual([VIEWER]);
    expect(strip().round).toBe(2);
  });

  it('a TURN_ENDED without next refetches the snapshot once instead of guessing', () => {
    const { result, refetch, strip } = setup(snapshot('guard-1', 1, 1));
    act(() => result.current.onTurnBeat({ type: 'playing', actor: 'guard-1' }));
    act(() =>
      result.current.onTurnBeat({ type: 'passed', act: turnEnded('guard-1') })
    );
    expect(refetch).toHaveBeenCalledTimes(1);
    // Nothing named the next member, so the marker did not move on a guess.
    expect(strip().marked).toEqual(['guard-1']);
  });

  it('a world-pace act leaves the strip untouched', () => {
    const initial = snapshot('guard-1', 3, 1);
    const { result, refetch, strip } = setup(initial);
    const before = strip();
    const worldWalk = create(ActSchema, {
      session: 'castle',
      id: 'id-walk',
      family: Family.ACT,
      body: {
        case: 'walk',
        value: { mover: party('commoner'), path: [{ cell: { x: 1, y: 2 } }] },
      },
    });
    act(() =>
      result.current.acceptActs(
        [worldWalk, clock({ mark: ClockMark.TICK, tick: 9n })],
        live
      )
    );
    expect(strip()).toEqual(before);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('JOINED: the joiner appears at its place from the snapshot while the marker keeps playing', () => {
    const { result, rerender, strip } = setup(snapshot(VIEWER, 1, 1));
    act(() => result.current.acceptActs([turnEnded(VIEWER, 'guard-1')], live));
    act(() => result.current.onTurnBeat({ type: 'playing', actor: 'guard-1' }));
    act(() =>
      result.current.acceptActs(
        [clock({ mark: ClockMark.JOINED, member: party('guard-3') })],
        live
      )
    );
    const joined = [VIEWER, 'guard-1', 'guard-3', 'guard-2', 'captain'];
    rerender({ snap: snapshot(VIEWER, 2, 2, joined) });
    expect(strip().order).toEqual(joined);
    expect(strip().marked).toEqual(['guard-1']);
  });

  it('a snapshot after the viewer acts wins over stale act state', () => {
    const { result, rerender, strip } = setup(snapshot(VIEWER, 1, 1));
    act(() => result.current.acceptActs([turnEnded(VIEWER, 'guard-1')], live));
    expect(strip().marked).toEqual(['guard-1']);
    // No driven turn is playing: the next snapshot is the source.
    rerender({ snap: snapshot('captain', 4, 2) });
    expect(strip().marked).toEqual(['captain']);
    expect(strip().round).toBe(4);
  });

  it('EXITED drops the member, FIGHT_FORMED re-orders, FIGHT_DISSOLVED clears', () => {
    const { result, rerender, strip } = setup(snapshot(VIEWER, 1, 1));
    act(() =>
      result.current.acceptActs(
        [
          clock({
            mark: ClockMark.EXITED,
            departure: { member: party('guard-2') },
          }),
        ],
        live
      )
    );
    expect(strip().order).toEqual([VIEWER, 'guard-1', 'captain']);

    rerender({ snap: snapshot(VIEWER, 1, 2) });
    act(() =>
      result.current.acceptActs(
        [
          clock({
            mark: ClockMark.FIGHT_FORMED,
            fight: { order: ['captain', VIEWER, 'guard-1'].map(party) },
          }),
        ],
        live
      )
    );
    expect(strip().order).toEqual(['captain', VIEWER, 'guard-1']);

    act(() =>
      result.current.acceptActs(
        [
          clock({
            mark: ClockMark.FIGHT_DISSOLVED,
            dissolved: { members: [] },
          }),
        ],
        live
      )
    );
    expect(strip().order).toEqual([]);
  });

  it('catch-up history and a reconnect leave the snapshot as the source', () => {
    const { result, strip } = setup(snapshot(VIEWER, 1, 1));
    act(() =>
      result.current.acceptActs([turnEnded(VIEWER, 'guard-1')], {
        source: 'catchup',
      })
    );
    expect(strip().marked).toEqual([VIEWER]);

    act(() => result.current.acceptActs([turnEnded(VIEWER, 'guard-1')], live));
    act(() => result.current.onTurnBeat({ type: 'playing', actor: 'guard-1' }));
    act(() => result.current.reset());
    expect(strip().marked).toEqual([VIEWER]);
  });
});
