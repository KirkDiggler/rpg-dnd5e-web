/**
 * Targeting on the world clock (rpg-project#785 S1, rpg-project#811).
 *
 * THE FINDING: on free roam the longsword was drawn and clicking it armed
 * nothing. Afford sends Attack, Cast and Activate rows on the world clock with
 * their candidates; this client gated every verb but Speak on the turn clock
 * and refused the rows the server had sent. The world clock has no active
 * member, so every row Afford returns there is the viewer's to take.
 *
 * The hook and the surface are driven together, as in `speakFlow.test.tsx`,
 * so arming, the coherence check one render later, the highlight and the
 * dispatch are judged as one flow.
 */
import { create } from '@bufbuild/protobuf';
import {
  AbilityRefSchema,
  CastOptionSchema,
  ClockKind,
  DeclarationSchema,
  MemberKind,
  ParticipantSchema,
  Slot,
  SpellRefSchema,
  Standing,
  TargetCandidateSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TargetSurface } from './TargetSurface';
import { selectCombatExperience } from './selection';
import { useSessionCombatExperience } from './useSessionCombatExperience';

const hoisted = vi.hoisted(() => ({
  attackFn: vi.fn(),
  castFn: vi.fn(),
  activateFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    attack: hoisted.attackFn,
    cast: hoisted.castFn,
    activate: hoisted.activateFn,
  },
}));

const fighter = create(ParticipantSchema, {
  member: 'fighter-1',
  name: 'Brannoc',
  kind: MemberKind.PLAYER,
  standing: Standing.UP,
  active: false,
});
const captain = create(ParticipantSchema, {
  member: 'captain',
  name: 'Captain',
  kind: MemberKind.MONSTER,
  standing: Standing.UP,
  active: false,
});

const names = new Map([
  ['fighter-1', 'Brannoc'],
  ['captain', 'Captain'],
  ['gate-1', 'Gate guard'],
  ['gate-2', 'Gate guard'],
]);

/** The longsword row as the staged api returned it in free roam. */
function longsword(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.attack.longsword',
    verb: Verb.ATTACK,
    slot: Slot.NONE,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, { member: 'captain', available: true }),
      create(TargetCandidateSchema, { member: 'gate-1', available: true }),
      create(TargetCandidateSchema, {
        member: 'gate-2',
        available: false,
        why: { text: 'target out of reach' },
      }),
    ],
  });
}

function mockery(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.cast.mockery',
    verb: Verb.CAST,
    slot: Slot.NONE,
    available: true,
    targetKind: TargetKind.MEMBER,
    minTargets: 1,
    maxTargets: 1,
    candidates: [
      create(TargetCandidateSchema, { member: 'captain', available: true }),
    ],
    spell: create(SpellRefSchema, {
      ref: 'dnd5e:spells:vicious-mockery',
      name: 'Vicious Mockery',
    }),
  });
}

function shove(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.activate.shove',
    verb: Verb.ACTIVATE,
    slot: Slot.NONE,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, { member: 'gate-1', available: true }),
    ],
    ability: create(AbilityRefSchema, {
      ref: 'dnd5e:actions:shove',
      name: 'Shove',
    }),
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
    session: 'castle',
    member: 'fighter-1',
    clock,
    active,
    authorityFresh: true,
    memberNames: names,
    participants: [fighter, captain],
    declarations,
    invalidateAuthoritySnapshots: () => {},
    scheduleRefresh: () => {},
  });
  const state = latest.presentationState;
  return (
    <>
      <span data-testid="armed">{state.armedDeclarationId ?? 'none'}</span>
      <span data-testid="notice">{state.changedOptionNotice ?? 'none'}</span>
      <TargetSurface
        phase={latest.phase}
        selection={selectCombatExperience(declarations, state)}
        isViewerTurn={false}
        showTurnNotice={false}
        memberNames={names}
        location={{ name: 'The Castle', area: 'Gate' }}
        renderMap={({ attackableTargets }) => (
          <span data-testid="highlighted">
            {attackableTargets.length ? attackableTargets.join(',') : 'none'}
          </span>
        )}
        onTargetClick={latest.onTargetClick}
        onCancelSelection={latest.onCancelSelection}
      />
    </>
  );
}

beforeEach(() => {
  for (const fn of [hoisted.attackFn, hoisted.castFn, hoisted.activateFn]) {
    fn.mockReset();
    fn.mockResolvedValue({});
  }
});

describe('an Attack on the world clock arms like one on the turn clock', () => {
  it('arms with nobody holding a turn and highlights the row’s candidates', () => {
    const attack = longsword();
    render(<Harness declarations={[attack]} />);

    act(() => latest.onSelectDeclaration(attack));

    expect(screen.getByTestId('armed').textContent).toBe(attack.id);
    expect(screen.getByTestId('notice').textContent).toBe('none');
    expect(latest.phase).toBe('targeting');
    // The available candidates, as Afford ruled them; gate-2 is out of reach.
    expect(screen.getByTestId('highlighted').textContent).toBe(
      'captain,gate-1'
    );
  });

  it('declares against the armed selector when a candidate is clicked', async () => {
    const attack = longsword();
    render(<Harness declarations={[attack]} />);

    act(() => latest.onSelectDeclaration(attack));
    await act(async () => {
      latest.onTargetClick('captain');
    });

    expect(hoisted.attackFn).toHaveBeenCalledTimes(1);
    expect(hoisted.attackFn.mock.calls[0][0]).toEqual({
      session: 'castle',
      attacker: 'fighter-1',
      target: 'captain',
      declarationId: 'selector.attack.longsword',
    });
  });

  it('sends nothing for a candidate Afford ruled out of reach', async () => {
    const attack = longsword();
    render(<Harness declarations={[attack]} />);

    act(() => latest.onSelectDeclaration(attack));
    await act(async () => {
      latest.onTargetClick('gate-2');
    });

    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });

  it('cancel disarms and clears the highlight', async () => {
    const attack = longsword();
    render(<Harness declarations={[attack]} />);

    act(() => latest.onSelectDeclaration(attack));
    act(() => latest.onCancelSelection());

    expect(screen.getByTestId('armed').textContent).toBe('none');
    expect(screen.getByTestId('highlighted').textContent).toBe('none');
    await act(async () => {
      latest.onTargetClick('captain');
    });
    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });
});

describe('the other targeted verbs Afford offers on the world clock', () => {
  it('a Cast at a creature arms and sends against its selector', async () => {
    const cast = mockery();
    render(<Harness declarations={[cast]} />);

    act(() => latest.onSelectDeclaration(cast));
    expect(screen.getByTestId('armed').textContent).toBe(cast.id);
    await act(async () => {
      latest.onTargetClick('captain');
    });

    expect(hoisted.castFn).toHaveBeenCalledTimes(1);
    expect(hoisted.castFn.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        session: 'castle',
        member: 'fighter-1',
        declarationId: 'selector.cast.mockery',
        targets: ['captain'],
      })
    );
  });

  it('an Activate with a member target (Help, a heal) arms and sends against its selector', async () => {
    const activation = shove();
    render(<Harness declarations={[activation]} />);

    act(() => latest.onSelectDeclaration(activation));
    expect(screen.getByTestId('armed').textContent).toBe(activation.id);
    await act(async () => {
      latest.onTargetClick('gate-1');
    });

    expect(hoisted.activateFn).toHaveBeenCalledTimes(1);
    expect(hoisted.activateFn.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        session: 'castle',
        member: 'fighter-1',
        declarationId: 'selector.activate.shove',
        target: 'gate-1',
      })
    );
  });
});

/** Thunderwave: aimed at a cell, sent from the cell click. */
function thunderwave(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.cast.thunderwave',
    verb: Verb.CAST,
    slot: Slot.NONE,
    available: true,
    targetKind: TargetKind.CELL,
    spell: create(SpellRefSchema, {
      ref: 'dnd5e:spells:thunderwave',
      name: 'Thunderwave',
    }),
  });
}

/** An area cast: the server works out who is in it; fires on the row click. */
function thunderclap(options: readonly string[] = []): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.cast.thunderclap',
    verb: Verb.CAST,
    slot: Slot.NONE,
    available: true,
    targetKind: TargetKind.AREA,
    options: options.map((id) => create(CastOptionSchema, { id, label: id })),
    spell: create(SpellRefSchema, {
      ref: 'dnd5e:spells:thunderclap',
      name: 'Thunderclap',
    }),
  });
}

describe('every cast path opens on the world clock', () => {
  it('a cell cast arms, and the cell click sends the cell', async () => {
    const cast = thunderwave();
    render(<Harness declarations={[cast]} />);

    act(() => latest.onSelectDeclaration(cast));
    expect(latest.cellCastArmed).toBe(true);
    await act(async () => {
      latest.onCellClick({ x: 2, y: -1 });
      await Promise.resolve();
    });

    expect(hoisted.castFn).toHaveBeenCalledTimes(1);
    expect(hoisted.castFn.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        declarationId: 'selector.cast.thunderwave',
        cell: { x: 2, y: -1 },
        targets: [],
      })
    );
  });

  it('a cast with options opens the tray, and the chosen option sends', async () => {
    const cast = thunderclap(['loud', 'louder']);
    render(<Harness declarations={[cast]} />);

    act(() => latest.onSelectDeclaration(cast));
    expect(latest.presentationState.optionDeclarationId).toBe(cast.id);
    expect(hoisted.castFn).not.toHaveBeenCalled();
    await act(async () => {
      latest.onSelectCastOption('louder');
      await Promise.resolve();
    });

    expect(hoisted.castFn).toHaveBeenCalledTimes(1);
    expect(hoisted.castFn.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        declarationId: 'selector.cast.thunderclap',
        option: 'louder',
      })
    );
  });

  it('an area cast with no options sends on the row click', async () => {
    const cast = thunderclap();
    render(<Harness declarations={[cast]} />);

    await act(async () => {
      latest.onSelectDeclaration(cast);
      await Promise.resolve();
    });

    expect(hoisted.castFn).toHaveBeenCalledTimes(1);
    expect(hoisted.castFn.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        declarationId: 'selector.cast.thunderclap',
        targets: [],
      })
    );
  });
});

describe('an untargeted Activate on the world clock declares on click', () => {
  it('Dodge sends at once, arms nothing and asks for no target', async () => {
    const dodge = create(DeclarationSchema, {
      id: 'selector.activate.dodge',
      verb: Verb.ACTIVATE,
      slot: Slot.NONE,
      available: true,
      targetKind: TargetKind.NONE,
      ability: create(AbilityRefSchema, {
        ref: 'dnd5e:actions:dodge',
        name: 'Dodge',
      }),
    });
    render(<Harness declarations={[dodge, longsword()]} />);

    await act(async () => {
      latest.onSelectDeclaration(dodge);
    });

    expect(hoisted.activateFn).toHaveBeenCalledTimes(1);
    expect(hoisted.activateFn.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        session: 'castle',
        member: 'fighter-1',
        declarationId: 'selector.activate.dodge',
        target: '',
      })
    );
    expect(screen.getByTestId('armed').textContent).toBe('none');
    expect(screen.getByTestId('highlighted').textContent).toBe('none');
  });

  it('beside it, the Attack row still arms targeting', () => {
    const attack = longsword();
    render(<Harness declarations={[attack]} />);

    act(() => latest.onSelectDeclaration(attack));

    expect(latest.phase).toBe('targeting');
    expect(screen.getByTestId('armed').textContent).toBe(attack.id);
    expect(hoisted.activateFn).not.toHaveBeenCalled();
  });
});

describe('the turn clock is unchanged', () => {
  it('an Attack off the actor’s turn neither arms nor sends', async () => {
    const attack = longsword();
    render(
      <Harness
        declarations={[attack]}
        clock={ClockKind.TURN}
        active="captain"
      />
    );

    act(() => latest.onSelectDeclaration(attack));
    await act(async () => {
      latest.onTargetClick('captain');
    });

    expect(screen.getByTestId('armed').textContent).toBe('none');
    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });

  it('an Attack on the actor’s own turn arms and sends', async () => {
    const attack = longsword();
    render(
      <Harness
        declarations={[attack]}
        clock={ClockKind.TURN}
        active="fighter-1"
      />
    );

    act(() => latest.onSelectDeclaration(attack));
    await act(async () => {
      latest.onTargetClick('captain');
    });

    expect(hoisted.attackFn).toHaveBeenCalledTimes(1);
  });

  it('nothing arms while the clock is unsettled', () => {
    const attack = longsword();
    render(<Harness declarations={[attack]} clock={ClockKind.UNSPECIFIED} />);

    act(() => latest.onSelectDeclaration(attack));

    expect(screen.getByTestId('armed').textContent).toBe('none');
  });
});
