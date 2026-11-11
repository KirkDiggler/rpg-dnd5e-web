/**
 * Arming Speak, picking who to talk to, picking a line, and sending it
 * (rpg-project#569). Speak replaced Intimidate and Persuade, whose flows this
 * file inherits.
 *
 * WHY THIS IS AN INTEGRATION TEST: arming and the coherence check that runs a
 * render later are two halves that only fail together, and Speak adds a third
 * — the line step — that only exists once a target click has NOT sent. The
 * hook and the surface are driven together here so a target click that sent
 * early, or a line list that drew a gated line, is a red test rather than a
 * walk finding.
 */
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  ClockKind,
  DeclarationSchema,
  MemberKind,
  ParticipantSchema,
  ReactChoice,
  ReactionRefSchema,
  Slot,
  SpeakOptionSchema,
  Standing,
  TargetCandidateSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TargetSurface } from './TargetSurface';
import { selectCombatExperience } from './selection';
import { useSessionCombatExperience } from './useSessionCombatExperience';

const hoisted = vi.hoisted(() => ({
  speakFn: vi.fn(),
  attackFn: vi.fn(),
  scheduleRefresh: vi.fn(),
  reactFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    speak: hoisted.speakFn,
    attack: hoisted.attackFn,
    react: hoisted.reactFn,
  },
}));

const bard = create(ParticipantSchema, {
  member: 'bard-1',
  name: 'Standre',
  kind: MemberKind.PLAYER,
  standing: Standing.UP,
  active: false,
});
const goblin = create(ParticipantSchema, {
  member: 'front-goblin',
  name: 'Goblin',
  kind: MemberKind.MONSTER,
  standing: Standing.UP,
  active: false,
});

const names = new Map([
  ['bard-1', 'Standre'],
  ['front-goblin', 'Goblin'],
  ['cook-3', 'Cook'],
  ['rogue-2', 'Vex'],
]);

/**
 * The Speak row as Afford sends it in the front room: the goblin and the cook
 * as candidates, the altar reachable only through its option rows, and one
 * goblin line gated behind a `requires` this bard does not meet.
 */
function speakDeclaration(slot = Slot.UNSPECIFIED): Declaration {
  return create(DeclarationSchema, {
    id: 'v2.speak.sealed.1',
    verb: Verb.SPEAK,
    slot,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, {
        member: 'front-goblin',
        available: true,
      }),
      create(TargetCandidateSchema, { member: 'cook-3', available: true }),
    ],
    speakOptions: [
      create(SpeakOptionSchema, {
        target: { case: 'memberId', value: 'front-goblin' },
        optionId: 'troupe',
        line: "We're the troupe for the feast.",
        available: true,
      }),
      create(SpeakOptionSchema, {
        target: { case: 'memberId', value: 'front-goblin' },
        optionId: 'kitchen-word',
        line: 'The cook sent us.',
        available: false,
      }),
      create(SpeakOptionSchema, {
        target: { case: 'memberId', value: 'front-goblin' },
        optionId: 'threat',
        line: 'Move, or be moved.',
        available: true,
        interactionId: 'gate-talk',
        revision: 4n,
      }),
      create(SpeakOptionSchema, {
        target: { case: 'memberId', value: 'cook-3' },
        optionId: 'gossip',
        line: 'Heard anything?',
        available: false,
      }),
      create(SpeakOptionSchema, {
        target: { case: 'propId', value: 'altar-1' },
        optionId: 'pray',
        line: 'Grant us passage.',
        available: true,
      }),
    ],
  });
}

let latest: ReturnType<typeof useSessionCombatExperience>;

/** The hook and the surface it drives, wired the way CombatExperience does. */
function Harness({
  declarations,
  clock = ClockKind.WORLD,
  active = '',
  authorityFresh = true,
}: {
  declarations: readonly Declaration[];
  clock?: ClockKind;
  active?: string;
  authorityFresh?: boolean;
}) {
  latest = useSessionCombatExperience({
    session: 'front-room',
    member: 'bard-1',
    clock,
    active,
    authorityFresh,
    memberNames: names,
    participants: [bard, goblin],
    declarations,
    invalidateAuthoritySnapshots: () => {},
    scheduleRefresh: hoisted.scheduleRefresh,
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
        location={{ name: 'The Castle', area: 'Front room' }}
        renderMap={({ attackableTargets }) => (
          <span data-testid="highlighted">
            {attackableTargets.length ? attackableTargets.join(',') : 'none'}
          </span>
        )}
        onTargetClick={latest.onTargetClick}
        speakTarget={state.speakTarget}
        onChooseSpeakTarget={latest.onChooseSpeakTarget}
        onSpeakOption={latest.onSpeakOption}
        onCancelSelection={latest.onCancelSelection}
      />
    </>
  );
}

function lineButtons(): string[] {
  const list = screen.queryByRole('list', { name: /^Lines for/ });
  if (!list) return [];
  return Array.from(list.querySelectorAll('button')).map(
    (button) => button.textContent ?? ''
  );
}

beforeEach(() => {
  hoisted.speakFn.mockReset();
  hoisted.speakFn.mockResolvedValue({});
  hoisted.attackFn.mockReset();
  hoisted.attackFn.mockResolvedValue({});
  hoisted.scheduleRefresh.mockReset();
  hoisted.reactFn.mockReset();
  hoisted.reactFn.mockResolvedValue({});
});

describe('arming Speak on the world clock (R3)', () => {
  it('arms with nobody holding a turn, and says nothing changed', () => {
    const declaration = speakDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));

    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);
    expect(screen.getByTestId('notice').textContent).toBe('none');
    expect(screen.getByRole('region', { name: 'Conversation' })).toBeTruthy();
    expect(screen.getByText('Choose who to speak to')).toBeTruthy();
  });

  it('still tears down an offer the server really did withdraw', () => {
    const declaration = speakDeclaration();
    const { rerender } = render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));

    rerender(<Harness declarations={[]} />);

    expect(screen.getByTestId('armed').textContent).toBe('none');
    expect(screen.getByTestId('notice').textContent).toContain(
      'That option changed'
    );
  });
});

describe('the target step', () => {
  it('lists every target with an available line — a prop included — and only those', () => {
    const declaration = speakDeclaration();
    render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));

    const targets = screen.getByRole('list', { name: 'Speak targets' });
    const labels = Array.from(targets.querySelectorAll('button')).map(
      (button) => button.textContent
    );
    // The cook's only line is gated, so the cook is not a target at all.
    expect(labels).toEqual(['Goblin', 'altar-1']);
    // The map lights the creature; a prop is never a map member.
    expect(screen.getByTestId('highlighted').textContent).toBe('front-goblin');
  });

  it('a target click SENDS NOTHING — it opens that target’s lines', async () => {
    const declaration = speakDeclaration();
    render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));

    await act(async () => {
      latest.onTargetClick('front-goblin');
    });

    expect(hoisted.speakFn).not.toHaveBeenCalled();
    expect(screen.getByText('What do you say to Goblin?')).toBeTruthy();
  });

  it('a creature with no available line opens nothing', async () => {
    const declaration = speakDeclaration();
    render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));

    await act(async () => {
      latest.onTargetClick('cook-3');
    });

    expect(lineButtons()).toEqual([]);
    expect(screen.getByText('Choose who to speak to')).toBeTruthy();
    expect(hoisted.speakFn).not.toHaveBeenCalled();
  });
});

describe('the line step', () => {
  it('lists only the chosen target’s AVAILABLE lines', async () => {
    const declaration = speakDeclaration();
    render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('front-goblin');
    });

    // `kitchen-word` is the goblin's and gated, so it is not drawn; the
    // altar's line belongs to another target.
    expect(lineButtons()).toEqual([
      "“We're the troupe for the feast.”",
      '“Move, or be moved.”',
    ]);
  });

  it('sends session, member, target, option and the offered revision — and no selector', async () => {
    const declaration = speakDeclaration();
    render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('front-goblin');
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Move, or be moved/ })
      );
    });

    expect(hoisted.speakFn).toHaveBeenCalledTimes(1);
    expect(hoisted.speakFn.mock.calls[0][0]).toEqual({
      session: 'front-room',
      member: 'bard-1',
      target: { case: 'memberId', value: 'front-goblin' },
      optionId: 'threat',
      revision: 4n,
    });
    expect(hoisted.attackFn).not.toHaveBeenCalled();
    expect(screen.getByTestId('armed').textContent).toBe('none');
  });

  it('speaks to a prop picked from the list', async () => {
    const declaration = speakDeclaration();
    render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'altar-1' }));
    });
    expect(lineButtons()).toEqual(['“Grant us passage.”']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Grant us passage/ }));
    });

    expect(hoisted.speakFn.mock.calls[0][0]).toEqual({
      session: 'front-room',
      member: 'bard-1',
      target: { case: 'propId', value: 'altar-1' },
      optionId: 'pray',
      revision: 0n,
    });
  });

  it('steps back to the target list without sending', async () => {
    const declaration = speakDeclaration();
    render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('front-goblin');
    });

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Speak to someone else' })
      );
    });

    expect(screen.getByText('Choose who to speak to')).toBeTruthy();
    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);
    expect(hoisted.speakFn).not.toHaveBeenCalled();
  });

  it('a fresh Afford that gates the chosen target’s last line tears the offer down', async () => {
    const declaration = speakDeclaration();
    const { rerender } = render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'altar-1' }));
    });

    const refreshed = speakDeclaration();
    refreshed.speakOptions = refreshed.speakOptions.filter(
      (option) => option.optionId !== 'pray'
    );
    rerender(<Harness declarations={[refreshed]} />);

    expect(screen.getByTestId('armed').textContent).toBe('none');
    expect(screen.getByTestId('notice').textContent).toContain(
      'That option changed'
    );
  });

  it('a line the door refuses is shown as a refusal, not a stale offer', async () => {
    hoisted.speakFn.mockRejectedValueOnce(new Error('no such option'));
    const declaration = speakDeclaration();
    render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('front-goblin');
    });

    await act(async () => {
      latest.onSpeakOption('troupe');
    });

    expect(hoisted.speakFn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('notice').textContent).toContain(
      'Speak failed: no such option'
    );
    expect(screen.getByTestId('armed').textContent).toBe('none');
  });

  it('refuses a line id the chosen target does not offer as available', async () => {
    const declaration = speakDeclaration();
    render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('front-goblin');
    });

    await act(async () => {
      latest.onSpeakOption('kitchen-word');
      latest.onSpeakOption('pray');
    });

    expect(hoisted.speakFn).not.toHaveBeenCalled();
  });
});

describe('Speak on the turn clock', () => {
  it('sends on the actor’s own turn, where it costs an action', async () => {
    const declaration = speakDeclaration(Slot.ACTION);
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
    await act(async () => {
      latest.onSpeakOption('troupe');
    });

    expect(hoisted.speakFn).toHaveBeenCalledTimes(1);
  });

  it('sends nothing off the actor’s turn', async () => {
    const declaration = speakDeclaration(Slot.ACTION);
    render(
      <Harness
        declarations={[declaration]}
        clock={ClockKind.TURN}
        active="front-goblin"
      />
    );
    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('front-goblin');
      latest.onSpeakOption('troupe');
    });

    expect(hoisted.speakFn).not.toHaveBeenCalled();
  });
});

describe('gate slice 4: reserve before dice (rpg-project#924)', () => {
  /** The goblin's lines with `threat` held by another speaker's waiting roll. */
  function heldDeclaration(id = 'v2.speak.sealed.1', holder = 'rogue-2') {
    const declaration = speakDeclaration();
    declaration.id = id;
    for (const option of declaration.speakOptions) {
      if (option.optionId === 'threat') {
        option.pending = true;
        option.pendingOnMemberId = holder;
      }
    }
    return declaration;
  }

  async function openGoblin(declaration: Declaration): Promise<void> {
    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('front-goblin');
    });
  }

  it('draws a pending line as waiting on the holder by name, and it cannot be sent', async () => {
    const declaration = heldDeclaration();
    render(<Harness declarations={[declaration]} />);
    await openGoblin(declaration);

    const waiting = screen.getByRole('button', { name: /Move, or be moved/ });
    expect((waiting as HTMLButtonElement).disabled).toBe(true);
    expect(waiting.hasAttribute('data-speak-pending')).toBe(true);
    expect(waiting.hasAttribute('data-speak-choice')).toBe(false);
    expect(waiting.textContent).toContain("Waiting on Vex's roll");
    // The free line beside it is untouched.
    const free = screen.getByRole('button', { name: /troupe for the feast/ });
    expect((free as HTMLButtonElement).disabled).toBe(false);
    expect(free.textContent).not.toContain('Waiting');

    await act(async () => {
      fireEvent.click(waiting);
      latest.onSpeakOption('threat');
    });
    expect(hoisted.speakFn).not.toHaveBeenCalled();
  });

  it('names no holder it cannot place: "Waiting on a roll"', async () => {
    const declaration = heldDeclaration('v2.speak.sealed.1', '');
    render(<Harness declarations={[declaration]} />);
    await openGoblin(declaration);

    expect(
      screen.getByRole('button', { name: /Move, or be moved/ }).textContent
    ).toContain('Waiting on a roll');
  });

  it('ABORTED is no error: the panel stays on the target, re-reads, and says the conversation moved on', async () => {
    hoisted.speakFn.mockRejectedValueOnce(
      new ConnectError('revision moved', Code.Aborted)
    );
    const declaration = speakDeclaration();
    render(<Harness declarations={[declaration]} />);
    await openGoblin(declaration);

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Move, or be moved/ })
      );
    });

    expect(hoisted.speakFn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('notice').textContent).toBe(
      'The conversation moved on — pick again.'
    );
    expect(screen.getByTestId('notice').textContent).not.toContain('failed');
    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);
    expect(screen.getByText('What do you say to Goblin?')).toBeTruthy();
    expect(hoisted.scheduleRefresh).toHaveBeenCalledWith(['turn', 'afford']);
  });

  it('FAILED_PRECONDITION on a line believed free re-reads the same way, and the line comes back pending', async () => {
    hoisted.speakFn.mockRejectedValueOnce(
      new ConnectError('line reserved', Code.FailedPrecondition)
    );
    const declaration = speakDeclaration();
    const { rerender } = render(<Harness declarations={[declaration]} />);
    await openGoblin(declaration);

    await act(async () => {
      latest.onSpeakOption('threat');
    });
    expect(screen.getByTestId('notice').textContent).not.toContain('failed');

    // The refreshed offer mints a new selector and holds the line.
    rerender(<Harness declarations={[heldDeclaration('v2.speak.sealed.2')]} />);

    expect(screen.getByTestId('armed').textContent).toBe('v2.speak.sealed.2');
    expect(
      screen.getByRole('button', { name: /Move, or be moved/ }).textContent
    ).toContain("Waiting on Vex's roll");
  });

  it('an open panel is carried across an authority refresh and re-reads the hold without the player acting', async () => {
    const declaration = speakDeclaration();
    const { rerender } = render(<Harness declarations={[declaration]} />);
    await openGoblin(declaration);

    // Another player's roll starts: an act arrives, authority is revoked.
    act(() => latest.invalidateAuthority());
    rerender(<Harness declarations={[declaration]} authorityFresh={false} />);
    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);
    expect(latest.presentationState.speakTarget).toEqual({
      case: 'memberId',
      value: 'front-goblin',
    });
    // Nothing can be sent while the offer is being re-read.
    await act(async () => {
      latest.onSpeakOption('troupe');
    });
    expect(hoisted.speakFn).not.toHaveBeenCalled();

    // The fresh offer holds the line: the same panel shows it waiting.
    rerender(<Harness declarations={[heldDeclaration('v2.speak.sealed.2')]} />);
    expect(screen.getByTestId('armed').textContent).toBe('v2.speak.sealed.2');
    expect(screen.getByTestId('notice').textContent).toBe('none');
    expect(
      screen.getByRole('button', { name: /Move, or be moved/ }).textContent
    ).toContain("Waiting on Vex's roll");

    // The roll settles: the next refresh frees the line again.
    act(() => latest.invalidateAuthority());
    rerender(
      <Harness
        declarations={[heldDeclaration('v2.speak.sealed.2')]}
        authorityFresh={false}
      />
    );
    const freed = speakDeclaration();
    freed.id = 'v2.speak.sealed.3';
    rerender(<Harness declarations={[freed]} />);
    const line = screen.getByRole('button', { name: /Move, or be moved/ });
    expect((line as HTMLButtonElement).disabled).toBe(false);
    expect(line.textContent).not.toContain('Waiting');
  });

  it('a free-roam REACT row is answered beside the open panel; ABORTED keeps the panel and says the conversation moved on', async () => {
    hoisted.reactFn.mockRejectedValueOnce(
      new ConnectError('hold released', Code.Aborted)
    );
    const declaration = speakDeclaration();
    const window = create(DeclarationSchema, {
      id: 'selector.window.roll',
      verb: Verb.REACT,
      slot: Slot.NONE,
      available: true,
      targetKind: TargetKind.NONE,
      reaction: create(ReactionRefSchema, {
        ref: 'dnd5e:features:bardic_inspiration',
        name: 'Bardic Inspiration',
      }),
    });
    render(<Harness declarations={[declaration, window]} />);
    await openGoblin(declaration);

    await act(async () => {
      latest.onSelectDeclaration(window, ReactChoice.HOLD);
    });

    expect(hoisted.reactFn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('notice').textContent).toBe(
      'The conversation moved on — pick again.'
    );
    expect(screen.getByTestId('notice').textContent).not.toContain('failed');
    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);
    expect(screen.getByText('What do you say to Goblin?')).toBeTruthy();
    expect(hoisted.scheduleRefresh).toHaveBeenCalled();
  });
});
