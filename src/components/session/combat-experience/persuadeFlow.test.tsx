/**
 * Arming Persuade, picking a target, and sending the appeal — ON BOTH CLOCKS
 * (rpg-project#458, the front room goblin).
 *
 * WHY IT IS AN INTEGRATION TEST, for `intimidateFlow`'s reason exactly: arming
 * and the coherence check that runs a render later are two halves that only
 * fail together, and a verb missing from one reads as a dead button on the
 * walk — clickable, then "that option changed", and no RPC ever sent.
 *
 * WHAT IS NEW HERE AND NOT IN THE THREAT'S FLOW is the WORLD CLOCK (R3). The
 * front room has no fight, so there is no turn to be out of and no economy to
 * spend, and three separate gates in this hook used to require the turn clock:
 * the arm, the coherence check, and the target click. Every one of them had to
 * learn the difference, and a scene that only exercised the turn clock would
 * pass against a client that offers the goblin and then does nothing.
 */
import { create } from '@bufbuild/protobuf';
import {
  ClockKind,
  DeclarationSchema,
  MemberKind,
  ParticipantSchema,
  Slot,
  Standing,
  TargetCandidateSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionCombatExperience } from './useSessionCombatExperience';

const hoisted = vi.hoisted(() => ({
  persuadeFn: vi.fn(),
  intimidateFn: vi.fn(),
  attackFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    persuade: hoisted.persuadeFn,
    intimidate: hoisted.intimidateFn,
    attack: hoisted.attackFn,
  },
}));

const bard = create(ParticipantSchema, {
  member: 'bard-1',
  name: 'Lyric',
  kind: MemberKind.PLAYER,
  standing: Standing.UP,
  active: true,
});
const goblin = create(ParticipantSchema, {
  member: 'front-goblin',
  name: 'front-goblin',
  kind: MemberKind.MONSTER,
  standing: Standing.UP,
  active: false,
});

const names = new Map([
  ['bard-1', 'Lyric'],
  ['front-goblin', 'front-goblin'],
]);

/**
 * The row Afford sends for an appeal on the WORLD clock: `Slot.NONE`, because
 * the world clock has no economy to charge against, and the witnesses as
 * candidates.
 */
function persuadeDeclaration(slot: Slot = Slot.NONE): Declaration {
  return create(DeclarationSchema, {
    id: 'v2.persuade.sealed.1',
    verb: Verb.PERSUADE,
    slot,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, {
        member: 'front-goblin',
        available: true,
      }),
    ],
  });
}

let latest: ReturnType<typeof useSessionCombatExperience>;

function Harness({
  declarations,
  clock = ClockKind.WORLD,
  active = '',
}: {
  declarations: readonly Declaration[];
  clock?: ClockKind;
  active?: string;
}) {
  latest = useSessionCombatExperience({
    session: 'front-room',
    member: 'bard-1',
    clock,
    active,
    authorityFresh: true,
    memberNames: names,
    participants: [bard, goblin],
    declarations,
    invalidateAuthoritySnapshots: () => {},
    scheduleRefresh: () => {},
  });
  return (
    <>
      <span data-testid="armed">
        {latest.presentationState.armedDeclarationId ?? 'none'}
      </span>
      <span data-testid="notice">
        {latest.presentationState.changedOptionNotice ?? 'none'}
      </span>
    </>
  );
}

beforeEach(() => {
  hoisted.persuadeFn.mockReset();
  hoisted.persuadeFn.mockResolvedValue({});
  hoisted.intimidateFn.mockReset();
  hoisted.intimidateFn.mockResolvedValue({});
  hoisted.attackFn.mockReset();
  hoisted.attackFn.mockResolvedValue({});
});

describe('arming an appeal on the world clock (R3)', () => {
  it('stays armed, and says nothing changed', () => {
    // THE NOTICE WOULD BE THE BUG, and it is the one the old clock gate
    // produced: the row arrived from Afford, armed, and was judged incoherent
    // one render later because the clock was not TURN. Nothing about the offer
    // changed — there is no turn for it to be out of.
    const declaration = persuadeDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));

    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);
    expect(screen.getByTestId('notice').textContent).toBe('none');
  });

  it('arms with nobody holding a turn, which is what a front room is', () => {
    // `active` is empty and the clock is WORLD. Under the old gate this
    // required `active === member`, so a room with no initiative in it refused
    // every social row the server sent.
    const declaration = persuadeDeclaration();
    render(<Harness declarations={[declaration]} active="" />);

    act(() => latest.onSelectDeclaration(declaration));

    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);
  });

  it('still tears down an offer the server really did withdraw', () => {
    const declaration = persuadeDeclaration();
    const { rerender } = render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));
    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);

    rerender(<Harness declarations={[]} />);

    expect(screen.getByTestId('armed').textContent).toBe('none');
    expect(screen.getByTestId('notice').textContent).toContain(
      'That option changed'
    );
  });
});

describe('sending the appeal', () => {
  it('sends session/member/target on the world clock and NO selector', async () => {
    const declaration = persuadeDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('front-goblin');
    });

    expect(hoisted.persuadeFn).toHaveBeenCalledTimes(1);
    expect(hoisted.persuadeFn.mock.calls[0][0]).toEqual({
      session: 'front-room',
      member: 'bard-1',
      target: 'front-goblin',
    });
    expect(hoisted.intimidateFn).not.toHaveBeenCalled();
    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });

  it('sends on the turn clock too, where it costs an action', async () => {
    // The same verb on the other clock. The client sends the same three
    // fields either way — the price is the server's and never appears here.
    const declaration = persuadeDeclaration(Slot.ACTION);
    render(
      <Harness
        declarations={[declaration]}
        clock={ClockKind.TURN}
        active="bard-1"
      />
    );

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('front-goblin');
    });

    expect(hoisted.persuadeFn).toHaveBeenCalledTimes(1);
  });

  it('refuses a member the offer’s own candidate list does not name', async () => {
    const declaration = persuadeDeclaration();
    declaration.candidates = [];
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('front-goblin');
    });

    // NO CANDIDATE LIST, NO CLICK. Whether the goblin can see the bard is the
    // server's answer, and its absence from Afford's list is the only thing
    // this client reads.
    expect(hoisted.persuadeFn).not.toHaveBeenCalled();
    expect(screen.getByTestId('notice').textContent).toContain(
      'That option changed'
    );
  });

  it('an appeal the door refuses is shown as a refusal, not a stale offer', async () => {
    // The panel asks who the ACTOR can see; the verb asks the other direction
    // and can still refuse. There is no selector for the server to reject as
    // stale — the request carries none — so the only honest thing to show is
    // the refusal itself, under this verb's own name.
    hoisted.persuadeFn.mockRejectedValueOnce(
      new Error('target cannot see the actor')
    );
    const declaration = persuadeDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('front-goblin');
    });

    expect(hoisted.persuadeFn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('notice').textContent).toContain(
      'Persuade failed'
    );
    // NAMED FOR THE VERB THE PLAYER CHOSE. The two social verbs share one
    // dispatch body, and a shared notice that said "Intimidate failed" after
    // an appeal would tell the player they did something they did not do.
    expect(screen.getByTestId('notice').textContent).not.toContain(
      'Intimidate'
    );
    expect(screen.getByTestId('armed').textContent).toBe('none');
  });
});

describe('the turn-economy verbs did not come along', () => {
  it('an Attack armed on the world clock is not sendable', async () => {
    // THE GUARD THAT MATTERS MOST. The clock gate became per-verb, and a
    // per-verb gate written carelessly is a blanket one: a swing on the world
    // clock must still be refused, because it spends an action that does not
    // exist there.
    const attack = create(DeclarationSchema, {
      id: 'selector.attack.1',
      verb: Verb.ATTACK,
      slot: Slot.ACTION,
      available: true,
      targetKind: TargetKind.MEMBER,
      candidates: [
        create(TargetCandidateSchema, {
          member: 'front-goblin',
          available: true,
        }),
      ],
    });
    render(<Harness declarations={[attack]} />);

    act(() => latest.onSelectDeclaration(attack));
    await act(async () => {
      latest.onTargetClick('front-goblin');
    });

    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });
});
