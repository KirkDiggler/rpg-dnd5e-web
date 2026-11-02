import { resetDial, setDial } from '@/feel/dialStore';
import {
  MemberKind,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { SightedMember } from './sightingEntities';
import { useMonsterTurnFocus } from './useMonsterTurnFocus';

const monster: SightedMember = {
  subject: 'guard',
  name: 'Guard',
  kind: MemberKind.MONSTER,
  monsterRefId: 'skeleton',
  position: { x: 3, y: -3, z: 0 },
  remembered: false,
  standing: Standing.UP,
  stance: '',
  equipment: undefined,
};
const props = {
  scope: 'session:me',
  sightings: [monster] as readonly SightedMember[],
};
afterEach(() => {
  cleanup();
  resetDial('followMonsterTurns');
});
it('defaults off, and follows the current visible monster when enabled', () => {
  const view = renderHook(useMonsterTurnFocus, { initialProps: props });
  act(() =>
    view.result.current.onTurnBeat({ type: 'playing', actor: 'guard' })
  );
  expect(view.result.current.focus).toBeNull();
  act(() => setDial('followMonsterTurns', 'on'));
  expect(view.result.current.focus?.position).toEqual(monster.position);
  const first = view.result.current.focus?.key;
  act(() => view.result.current.onTurnBeat({ type: 'idle' }));
  expect(view.result.current.focus).toBeNull();
  act(() =>
    view.result.current.onTurnBeat({ type: 'playing', actor: 'guard' })
  );
  expect(view.result.current.focus?.key).not.toBe(first);
  view.rerender({ ...props, scope: 'other:me' });
  expect(view.result.current.focus).toBeNull();
});
it.each(['missing', 'remembered', 'player'])(
  'refuses %s as a camera target',
  (kind) => {
    setDial('followMonsterTurns', 'on');
    const view = renderHook(useMonsterTurnFocus, {
      initialProps: {
        ...props,
        sightings:
          kind === 'missing'
            ? []
            : [
                {
                  ...monster,
                  remembered: kind === 'remembered',
                  kind:
                    kind === 'player' ? MemberKind.PLAYER : MemberKind.MONSTER,
                },
              ],
      },
    });
    act(() =>
      view.result.current.onTurnBeat({ type: 'playing', actor: 'guard' })
    );
    expect(view.result.current.focus).toBeNull();
  }
);
it('stops automatic focus immediately when disabled or sight is lost', () => {
  setDial('followMonsterTurns', 'on');
  const view = renderHook(useMonsterTurnFocus, { initialProps: props });
  act(() =>
    view.result.current.onTurnBeat({ type: 'playing', actor: 'guard' })
  );
  expect(view.result.current.focus).not.toBeNull();
  view.rerender({ ...props, sightings: [] });
  expect(view.result.current.focus).toBeNull();
  view.rerender(props);
  act(() => setDial('followMonsterTurns', 'off'));
  expect(view.result.current.focus).toBeNull();
});
