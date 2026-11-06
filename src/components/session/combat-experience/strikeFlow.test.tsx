/**
 * CLICK A HOSTILE TO ATTACK (rpg-project#872 D1). Driven end to end on the
 * client: the combat hook and the ordinary walk hook, wired the way
 * `SessionEncounterView` wires them, with the server's Move and Attack
 * stubbed. The Attack row's candidate is the only authority: in reach, the
 * click swings at once; out of reach with an `approach` cell, the click walks
 * there and swings only once the walk arrived AND the refreshed row has him
 * in reach. A walk cut short never swings.
 */
import { create } from '@bufbuild/protobuf';
import {
  ClockKind,
  DeclarationSchema,
  MemberKind,
  ParticipantSchema,
  ShortfallReason,
  ShortfallSchema,
  Slot,
  SpeakOptionSchema,
  Standing,
  TargetCandidateSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, render } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAtlasPathIndex } from '../atlasPath';
import { positionToCube } from '../positionBridge';
import { useSessionCombatExperience } from './useSessionCombatExperience';

const hoisted = vi.hoisted(() => ({
  moveFn: vi.fn(),
  attackFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    move: hoisted.moveFn,
    attack: hoisted.attackFn,
  },
}));

// Import AFTER vi.mock so the mock is applied.
import { useSessionWalk } from '../useSessionWalk';

const pos = (x: number, y: number) => ({ x, y }) as never;
const fighter = create(ParticipantSchema, {
  member: 'fighter-1',
  name: 'Brenna',
  kind: MemberKind.PLAYER,
  standing: Standing.UP,
});
const names = new Map([
  ['fighter-1', 'Brenna'],
  ['orc-2', 'Orc'],
]);

/** A straight run of floor (q, 0), q=0..11: the fighter at q=0, the orc at
 * q=9, and the server's approach cell for him at q=8. */
const where = { x: 0, y: 0 } as never;
const APPROACH = pos(8, 0);
const pathIndex = buildAtlasPathIndex(
  {
    cells: Array.from({ length: 12 }, (_, q) => pos(q, 0)),
    boundaries: [],
    doorways: [],
    props: [],
  },
  undefined
);

/** The world-clock Attack row with the orc as its one candidate. */
function attackRow(
  orc: 'in-reach' | 'approach' | 'out-of-reach',
  id = 'v2.attack.longsword.1'
): Declaration {
  const inReach = orc === 'in-reach';
  return create(DeclarationSchema, {
    id,
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    available: inReach,
    why: inReach
      ? undefined
      : create(ShortfallSchema, {
          reason: ShortfallReason.NO_TARGET_IN_REACH,
          text: 'no target in reach',
        }),
    targetKind: TargetKind.MEMBER,
    attack: { ref: 'dnd5e:weapons:longsword', name: 'Longsword' } as never,
    candidates: [
      create(TargetCandidateSchema, {
        member: 'orc-2',
        available: inReach,
        why: inReach
          ? undefined
          : create(ShortfallSchema, {
              reason: ShortfallReason.TARGET_OUT_OF_REACH,
              text: 'out of reach',
            }),
        approach: orc === 'approach' ? APPROACH : undefined,
      }),
    ],
  });
}

let latest: ReturnType<typeof useSessionCombatExperience>;

function Harness({ declarations }: { declarations: readonly Declaration[] }) {
  // Turn/Afford freshness as the view keeps it: revoked when a Move is
  // accepted, fresh again when the refreshed offer lands.
  const [fresh, setFresh] = useState(true);
  useEffect(() => setFresh(true), [declarations]);
  const walk = useSessionWalk(
    'keep',
    'fighter-1',
    pathIndex,
    where,
    async () => {},
    '',
    undefined,
    () => true,
    () => latest.invalidateAuthority()
  );
  latest = useSessionCombatExperience({
    session: 'keep',
    member: 'fighter-1',
    clock: ClockKind.WORLD,
    active: '',
    authorityFresh: fresh,
    memberNames: names,
    participants: [fighter],
    declarations,
    invalidateAuthoritySnapshots: () => setFresh(false),
    scheduleRefresh: () => {},
    walkToApproach: walk.walkToCell,
  });
  return null;
}

const requestedPath = (): { x: number; y: number }[] =>
  (hoisted.moveFn.mock.calls[0]![0] as { path: { x: number; y: number }[] })
    .path;

beforeEach(() => {
  hoisted.moveFn.mockReset();
  // By default the server walks exactly the path asked for.
  hoisted.moveFn.mockImplementation(
    async (request: { path: { x: number; y: number }[] }) => ({
      steps: request.path.map((position) => ({ position })),
    })
  );
  hoisted.attackFn.mockReset();
  hoisted.attackFn.mockResolvedValue({});
});

describe('a click on a hostile in reach', () => {
  it('swings at once with the offer it was read from, and walks nowhere', async () => {
    render(<Harness declarations={[attackRow('in-reach')]} />);
    await act(async () => latest.onStrike('orc-2'));

    expect(hoisted.moveFn).not.toHaveBeenCalled();
    expect(hoisted.attackFn).toHaveBeenCalledTimes(1);
    expect(hoisted.attackFn.mock.calls[0]![0]).toMatchObject({
      attacker: 'fighter-1',
      target: 'orc-2',
      declarationId: 'v2.attack.longsword.1',
    });
  });
});

describe('a click on a hostile the walk this turn reaches', () => {
  it('walks to the server’s approach cell, then swings once the refreshed row has him in reach', async () => {
    const { rerender } = render(
      <Harness declarations={[attackRow('approach')]} />
    );
    await act(async () => latest.onStrike('orc-2'));

    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);
    const path = requestedPath();
    expect(positionToCube(path[path.length - 1] as never)).toEqual(
      positionToCube(APPROACH)
    );
    // Nothing swings until the offer read at the new cell says so.
    expect(hoisted.attackFn).not.toHaveBeenCalled();

    await act(async () => {
      rerender(
        <Harness declarations={[attackRow('in-reach', 'v2.attack.2')]} />
      );
    });

    expect(hoisted.attackFn).toHaveBeenCalledTimes(1);
    expect(hoisted.attackFn.mock.calls[0]![0]).toMatchObject({
      target: 'orc-2',
      declarationId: 'v2.attack.2',
    });
  });

  it('a walk cut short never swings, even when the refreshed row has him in reach', async () => {
    // The world stops the walk two cells in: an opportunity attack, a body in
    // the way, a fight forming. Short is not an error; it is not arrival.
    hoisted.moveFn.mockImplementation(
      async (request: { path: { x: number; y: number }[] }) => ({
        steps: request.path.slice(0, 2).map((position) => ({ position })),
      })
    );
    const { rerender } = render(
      <Harness declarations={[attackRow('approach')]} />
    );
    await act(async () => latest.onStrike('orc-2'));
    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <Harness declarations={[attackRow('in-reach', 'v2.attack.2')]} />
      );
    });

    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });

  it('an arrival where the row no longer offers him sends nothing', async () => {
    // He stepped away while the walk was under way.
    const { rerender } = render(
      <Harness declarations={[attackRow('approach')]} />
    );
    await act(async () => latest.onStrike('orc-2'));

    await act(async () => {
      rerender(<Harness declarations={[attackRow('out-of-reach')]} />);
    });

    expect(hoisted.attackFn).not.toHaveBeenCalled();
    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);
  });

  it('a refused Move never swings when a later offer has him in reach', async () => {
    hoisted.moveFn.mockRejectedValue(new Error('the door is shut'));
    const { rerender } = render(
      <Harness declarations={[attackRow('approach')]} />
    );
    await act(async () => latest.onStrike('orc-2'));
    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <Harness declarations={[attackRow('in-reach', 'v2.attack.2')]} />
      );
    });

    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });
});

describe('a click on a hostile no walk this turn reaches', () => {
  it('does nothing at all', async () => {
    render(<Harness declarations={[attackRow('out-of-reach')]} />);
    await act(async () => latest.onStrike('orc-2'));

    expect(hoisted.moveFn).not.toHaveBeenCalled();
    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });
});

describe('Speak from the creature’s choices (rpg-project#872 D3)', () => {
  it('opens his lines from the one Speak offer, sending nothing', async () => {
    const speak = create(DeclarationSchema, {
      id: 'v2.speak.keep.1',
      verb: Verb.SPEAK,
      available: true,
      targetKind: TargetKind.MEMBER,
      speakOptions: [
        create(SpeakOptionSchema, {
          target: { case: 'memberId', value: 'orc-2' },
          optionId: 'taunt',
          line: 'Come on, then.',
          available: true,
        }),
      ],
    });
    render(<Harness declarations={[attackRow('in-reach'), speak]} />);
    await act(async () => latest.onSpeakTo('orc-2'));

    expect(latest.presentationState.armedDeclarationId).toBe('v2.speak.keep.1');
    expect(latest.presentationState.speakTarget).toEqual({
      case: 'memberId',
      value: 'orc-2',
    });
    expect(hoisted.attackFn).not.toHaveBeenCalled();
    expect(hoisted.moveFn).not.toHaveBeenCalled();
  });
});
