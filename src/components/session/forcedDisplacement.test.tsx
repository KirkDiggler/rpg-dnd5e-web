import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  MoveKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { arrivingWalk } from './arrivingWalk';
import { useCombatStoryPacing } from './combat-experience/useCombatStoryPacing';
import { useMoveController } from './useMoveController';
import { useWalkPresentation } from './useWalkPresentation';

// A walk as the server sends it: the kind, and `forced` as its mirror.
const move = (actor: string, displaced = false, id = 'push') =>
  create(ActSchema, {
    id,
    session: 's',
    body: {
      case: 'walk',
      value: {
        mover: { id: actor },
        kind: displaced ? MoveKind.DISPLACED : MoveKind.OWN,
        forced: displaced,
        cause: 'same-cause',
        path: [{ cell: { x: 1, y: 0 } }, { cell: { x: 2, y: 0 } }],
      },
    },
  });
function harness(sighted = new Set(['npc', 'viewer'])) {
  return renderHook(() => {
    const moves = useMoveController('s', 'viewer');
    const bridge = useWalkPresentation({
      session: 's',
      member: 'viewer',
      liveSighted: sighted,
      canPresent: true,
      beginRoute: moves.beginRoute,
      forgetRoute: moves.forgetRoute,
    });
    const pacing = useCombatStoryPacing({
      session: 's',
      member: 'viewer',
      participants: [],
      story: [],
      onPresentWalk: bridge.presentWalk,
      presentableMembers: sighted,
    });
    return { moves, bridge, pacing };
  });
}
describe('authoritative displacement through the presentation owners', () => {
  it.each(['npc', 'viewer'])(
    'carries displaced to the real movement owner for %s',
    (actor) => {
      const { result, unmount } = harness();
      act(() =>
        result.current.pacing.acceptActs([move(actor, true)], {
          source: 'live',
        })
      );
      expect(result.current.moves.movements.get(actor)).toMatchObject({
        kind: 'displaced',
        seq: 1,
        reached: 0,
      });
      expect(result.current.pacing.heldMovementMembers.has(actor)).toBe(true);
      act(() => result.current.bridge.movementPainted(actor, 1, 2));
      expect(result.current.pacing.heldMovementMembers.has(actor)).toBe(false);
      unmount();
    }
  );
  it("feeds the viewer's own compelled walk, which no Move answer carries", () => {
    const { result, unmount } = harness();
    const compelled = create(ActSchema, {
      id: 'flee',
      session: 's',
      body: {
        case: 'walk',
        value: {
          mover: { id: 'viewer' },
          kind: MoveKind.COMPELLED,
          cause: 'dnd5e:spells:dissonant-whispers',
          path: [{ cell: { x: 1, y: 0 } }, { cell: { x: 2, y: 0 } }],
        },
      },
    });
    act(() =>
      result.current.pacing.acceptActs([compelled], { source: 'live' })
    );
    expect(result.current.moves.movements.get('viewer')).toMatchObject({
      kind: 'compelled',
      seq: 1,
    });
    unmount();
  });
  it('never infers displacement from a cause and still suppresses the own voluntary RPC duplicate', () => {
    expect(arrivingWalk(move('viewer'), 'viewer')).toBeUndefined();
    expect(arrivingWalk(move('npc'), 'viewer')?.kind).toBe('own');
  });
  it.each(['catch-up', 'hidden'] as const)(
    'does not replay %s displacement',
    (kind) => {
      const { result, unmount } = harness(
        kind === 'hidden' ? new Set() : undefined
      );
      act(() =>
        result.current.pacing.acceptActs([move('npc', true)], {
          source: kind === 'catch-up' ? 'catchup' : 'live',
        })
      );
      expect(result.current.moves.movements.size).toBe(0);
      unmount();
    }
  );
  it('does not let a superseded completion settle the newer displaced route', () => {
    const { result, unmount } = harness();
    const old = vi.fn();
    const fresh = vi.fn();
    act(() => {
      result.current.bridge.presentWalk({
        act: move('npc', true),
        complete: old,
      });
    });
    act(() => {
      result.current.bridge.presentWalk({
        act: move('npc', true, 'new'),
        complete: fresh,
      });
    });
    expect(old).toHaveBeenCalledWith('cancelled');
    act(() => result.current.bridge.movementPainted('npc', 1, 2));
    expect(fresh).not.toHaveBeenCalled();
    expect(result.current.moves.movements.get('npc')).toMatchObject({
      kind: 'displaced',
      seq: 2,
    });
    act(() => result.current.bridge.movementPainted('npc', 2, 2));
    expect(fresh).toHaveBeenCalledExactlyOnceWith('painted');
    unmount();
  });
});
