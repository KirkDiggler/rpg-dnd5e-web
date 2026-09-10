/**
 * The POST-ROLL window, end to end through the client: the beat that carries
 * the d20, the declaration Afford poses on the roller's own turn, the panel
 * the dock draws for it, and the React RPC the answer reaches.
 *
 * WHY THIS IS AN INTEGRATION TEST AND NOT THREE UNIT TESTS. The numbers and
 * the question arrive on two different channels — the roll on the event
 * stream, the offer in Afford — and the panel is the only place they meet. A
 * dock tested alone would draw a question with numbers nobody delivered; a
 * hook tested alone would record a roll no panel reads. The gate this catches
 * is also real: the hook filtered the answer on `TARGET_KIND_MEMBER`, which
 * this window is not.
 */
import { create } from '@bufbuild/protobuf';
import {
  EventKind,
  EventSchema,
  RollWindowOpenedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { AttackResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AttackRefSchema,
  ClockKind,
  DamageType,
  DeclarationSchema,
  MemberKind,
  ParticipantSchema,
  ReactChoice,
  ReactionRefSchema,
  Slot,
  Standing,
  TargetCandidateSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionDock } from './ActionDock';
import { useSessionCombatExperience } from './useSessionCombatExperience';

const hoisted = vi.hoisted(() => ({
  attackFn: vi.fn(),
  reactFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    attack: hoisted.attackFn,
    react: hoisted.reactFn,
  },
}));

/** THE INITIATIVE IS THE ROLLER'S OWN. That is what separates this window from
 * the movement one: the fight is frozen part-way through the viewer's turn,
 * inside the attack they themselves declared. */
const fighter = create(ParticipantSchema, {
  member: 'fighter-1',
  name: 'Aldric',
  kind: MemberKind.PLAYER,
  standing: Standing.UP,
  active: true,
});
const skeleton = create(ParticipantSchema, {
  member: 'skeleton-1',
  name: 'Skeleton Guard',
  kind: MemberKind.MONSTER,
  standing: Standing.UP,
  active: false,
});

const memberNames = new Map([
  ['fighter-1', 'Aldric'],
  ['skeleton-1', 'Skeleton Guard'],
]);
const memberRoles = new Map<string, 'player' | 'monster'>([
  ['fighter-1', 'player'],
  ['skeleton-1', 'monster'],
]);

const INSPIRATION_REF = 'dnd5e:conditions:inspired';

function attackDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.attack.1',
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    attack: create(AttackRefSchema, {
      ref: 'dnd5e:weapons:longsword',
      name: 'Longsword',
      damageType: DamageType.SLASHING,
    }),
    candidates: [
      create(TargetCandidateSchema, {
        member: 'skeleton-1',
        available: true,
      }),
    ],
  });
}

function pausedAttackResponse() {
  return create(AttackResponseSchema, {
    roll: 9,
    total: 13,
    seq: 7n,
    attack: create(AttackRefSchema, {
      ref: 'dnd5e:weapons:longsword',
      name: 'Longsword',
      damageType: DamageType.SLASHING,
    }),
    presentationId: 'provider~attack-window-1',
  });
}

/** Afford's row for the post-roll window: no slot to spend, no target, no
 * candidates — the question is about a die already rolled. */
function rollWindowDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.postroll.1',
    verb: Verb.REACT,
    slot: Slot.NONE,
    available: true,
    targetKind: TargetKind.NONE,
    reaction: create(ReactionRefSchema, {
      ref: INSPIRATION_REF,
      name: 'Bardic Inspiration',
    }),
  });
}

/** The movement window, unchanged, for the regression that matters most. */
function movementWindowDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.window.1',
    verb: Verb.REACT,
    slot: Slot.REACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, { member: 'skeleton-1', available: true }),
    ],
    reaction: create(ReactionRefSchema, {
      ref: 'dnd5e:conditions:opportunity_attack',
      name: 'Opportunity Attack',
    }),
  });
}

function rollWindowBeat(
  audience: string,
  roll: number,
  total: number,
  presentationId = ''
) {
  return create(EventSchema, {
    session: 'crypt-run',
    recipient: audience,
    kind: EventKind.ROLL_WINDOW_OPENED,
    seq: 7n,
    body: {
      case: 'rollWindowOpened',
      value: create(RollWindowOpenedSchema, {
        presentationId,
        audience,
        roll,
        total,
        offer: create(ReactionRefSchema, {
          ref: INSPIRATION_REF,
          name: 'Bardic Inspiration',
        }),
      }),
    },
  });
}

interface HarnessProps {
  declarations: readonly Declaration[];
  /** Delivered once on mount, exactly as the stream would. */
  beat?: ReturnType<typeof rollWindowBeat>;
  source?: 'live' | 'catchup';
  viewer?: string;
}

/** The live wiring: the real hook driving the real dock, as `CombatExperience`
 * mounts them, with the stream's own entry point used for the beat. */
function Harness({
  declarations,
  beat,
  source = 'live',
  viewer = 'fighter-1',
}: HarnessProps) {
  const combat = useSessionCombatExperience({
    session: 'crypt-run',
    member: viewer,
    clock: ClockKind.TURN,
    active: 'fighter-1',
    authorityFresh: true,
    memberNames,
    memberRoles,
    participants: [fighter, skeleton],
    declarations,
    invalidateAuthoritySnapshots: () => {},
    scheduleRefresh: () => {},
  });
  const delivered = useDeliverOnce(combat.acceptStreamEvent, beat, source);
  const request = combat.diceEvents.find(
    (event) => event.type === 'dice-presentation-requested'
  );
  return (
    <>
      <span data-testid="delivered">{delivered ? 'yes' : 'no'}</span>
      <span data-testid="roll-window-presentation-id">
        {combat.rollWindow?.presentationId ?? ''}
      </span>
      <span data-testid="active-dice-presentation-id">
        {request?.presentationId ?? ''}
      </span>
      <span data-testid="roll-window-awaits-dice">
        {combat.rollWindow?.awaitsDiceSettlement ? 'yes' : 'no'}
      </span>
      <button type="button" onClick={() => combat.onTargetClick('skeleton-1')}>
        Choose Skeleton
      </button>
      <ActionDock
        clock={ClockKind.TURN}
        viewerMember={viewer}
        participants={[fighter, skeleton]}
        declarations={declarations}
        authorityFresh
        memberNames={memberNames}
        rollWindow={combat.rollWindow}
        onSelectDeclaration={combat.onSelectDeclaration}
        onEndTurn={combat.onEndTurn}
      />
    </>
  );
}

function useDeliverOnce(
  accept: (
    event: ReturnType<typeof rollWindowBeat>,
    metadata: { source: 'live' | 'catchup' }
  ) => void,
  beat: ReturnType<typeof rollWindowBeat> | undefined,
  source: 'live' | 'catchup'
): boolean {
  const [delivered, setDelivered] = useState(false);
  useEffect(() => {
    if (!beat || delivered) return;
    accept(beat, { source });
    setDelivered(true);
  }, [accept, beat, delivered, source]);
  return delivered;
}

describe('answering a post-roll window on your own d20', () => {
  beforeEach(() => {
    hoisted.attackFn.mockReset();
    hoisted.reactFn.mockReset();
    hoisted.reactFn.mockResolvedValue({ saved: true });
  });

  it('pairs response-first and event-later through the provider presentation token', async () => {
    hoisted.attackFn.mockResolvedValue(pausedAttackResponse());
    const view = render(<Harness declarations={[attackDeclaration()]} />);

    fireEvent.click(screen.getByRole('button', { name: /^Longsword/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose Skeleton' }));
    await waitFor(() => expect(hoisted.attackFn).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen.getByTestId('active-dice-presentation-id').textContent
      ).toBe('provider~attack-window-1')
    );

    view.rerender(
      <Harness
        declarations={[rollWindowDeclaration()]}
        beat={rollWindowBeat('fighter-1', 9, 13)}
      />
    );

    await waitFor(() =>
      expect(
        screen.getByTestId('roll-window-presentation-id').textContent
      ).toBe('provider~attack-window-1')
    );
    expect(screen.getByTestId('roll-window-awaits-dice').textContent).toBe(
      'yes'
    );
  });

  it('keeps event-first closed, then pairs it when the attack response arrives', async () => {
    let resolveAttack!: (
      value: ReturnType<typeof pausedAttackResponse>
    ) => void;
    hoisted.attackFn.mockReturnValue(
      new Promise<ReturnType<typeof pausedAttackResponse>>((resolve) => {
        resolveAttack = resolve;
      })
    );
    const view = render(<Harness declarations={[attackDeclaration()]} />);

    fireEvent.click(screen.getByRole('button', { name: /^Longsword/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose Skeleton' }));
    await waitFor(() => expect(hoisted.attackFn).toHaveBeenCalledOnce());

    view.rerender(
      <Harness
        declarations={[rollWindowDeclaration()]}
        beat={rollWindowBeat('fighter-1', 9, 13)}
      />
    );
    await screen.findByText('yes', {
      selector: '[data-testid="delivered"]',
    });
    expect(screen.getByTestId('roll-window-presentation-id').textContent).toBe(
      ''
    );
    expect(screen.getByTestId('roll-window-awaits-dice').textContent).toBe(
      'yes'
    );

    resolveAttack(pausedAttackResponse());
    await waitFor(() =>
      expect(
        screen.getByTestId('roll-window-presentation-id').textContent
      ).toBe('provider~attack-window-1')
    );
    expect(screen.getByTestId('active-dice-presentation-id').textContent).toBe(
      'provider~attack-window-1'
    );
  });

  it('leaves an event-first window answerable when its Attack response is lost', async () => {
    let rejectAttack!: (reason: Error) => void;
    hoisted.attackFn.mockReturnValue(
      new Promise<ReturnType<typeof pausedAttackResponse>>((_, reject) => {
        rejectAttack = reject;
      })
    );
    const view = render(<Harness declarations={[attackDeclaration()]} />);

    fireEvent.click(screen.getByRole('button', { name: /^Longsword/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose Skeleton' }));
    await waitFor(() => expect(hoisted.attackFn).toHaveBeenCalledOnce());
    view.rerender(
      <Harness
        declarations={[rollWindowDeclaration()]}
        beat={rollWindowBeat('fighter-1', 9, 13)}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId('roll-window-awaits-dice').textContent).toBe(
        'yes'
      )
    );

    rejectAttack(new Error('response lost'));
    await waitFor(() =>
      expect(screen.getByTestId('roll-window-awaits-dice').textContent).toBe(
        'no'
      )
    );
  });

  it('draws the roll, the total and the die on offer, with Spend and Keep', async () => {
    render(
      <Harness
        declarations={[rollWindowDeclaration()]}
        beat={rollWindowBeat('fighter-1', 9, 13)}
      />
    );

    const panel = await screen.findByTestId('reaction-window');
    await waitFor(() =>
      expect(panel.textContent).toContain('You rolled d20 9 + 4 = 13')
    );
    expect(panel.getAttribute('data-window-kind')).toBe('roll');
    expect(panel.textContent).toContain('Bardic Inspiration');
    expect(panel.textContent).toContain('Spend it, or keep it.');
    expect(screen.getByTestId('reaction-strike').textContent).toContain(
      'Spend'
    );
    expect(screen.getByTestId('reaction-hold').textContent).toContain('Keep');
    // THE AC IS NOT ON THE PANEL. Nothing on the wire carries it and nothing
    // here invents it: the decision is about the roll, not about whether the
    // roll already landed.
    expect(panel.textContent).not.toContain('AC');
    // There was no local Attack response on this mounted client. Treat the
    // live beat like reconnect recovery: it has no local physical die to wait
    // for and must leave the provider window answerable.
    expect(screen.getByTestId('roll-window-awaits-dice').textContent).toBe(
      'no'
    );
  });

  it('marks catch-up windows as immediately answerable', async () => {
    render(
      <Harness
        declarations={[rollWindowDeclaration()]}
        beat={rollWindowBeat('fighter-1', 9, 13)}
        source="catchup"
      />
    );

    await screen.findByTestId('reaction-window');
    expect(screen.getByTestId('roll-window-awaits-dice').textContent).toBe(
      'no'
    );
  });

  it('sends Strike with the window’s own selector, past the target-kind gate', async () => {
    render(
      <Harness
        declarations={[rollWindowDeclaration()]}
        beat={rollWindowBeat('fighter-1', 9, 13)}
      />
    );

    fireEvent.click(await screen.findByTestId('reaction-strike'));

    await waitFor(() => expect(hoisted.reactFn).toHaveBeenCalledTimes(1));
    expect(hoisted.reactFn).toHaveBeenCalledWith({
      session: 'crypt-run',
      member: 'fighter-1',
      declarationId: 'selector.postroll.1',
      choice: ReactChoice.STRIKE,
    });
  });

  it('sends Hold when the die is kept, never an absent answer', async () => {
    render(
      <Harness
        declarations={[rollWindowDeclaration()]}
        beat={rollWindowBeat('fighter-1', 9, 13)}
      />
    );

    fireEvent.click(await screen.findByTestId('reaction-hold'));

    await waitFor(() => expect(hoisted.reactFn).toHaveBeenCalledTimes(1));
    expect(hoisted.reactFn.mock.calls[0][0].choice).toBe(ReactChoice.HOLD);
    expect(hoisted.reactFn.mock.calls[0][0].choice).not.toBe(
      ReactChoice.UNSPECIFIED
    );
  });

  it('uses the identified window for a witness die without exposing owner controls', async () => {
    const beat = rollWindowBeat('fighter-1', 9, 13, 'provider~window-die');
    beat.recipient = 'bard-1';
    render(<Harness viewer="bard-1" declarations={[]} beat={beat} />);
    await screen.findByText('yes');
    expect(screen.getByTestId('active-dice-presentation-id').textContent).toBe(
      'provider~window-die'
    );
    expect(screen.getByTestId('roll-window-presentation-id').textContent).toBe(
      ''
    );
    expect(screen.queryByTestId('reaction-window')).toBeNull();
    expect(hoisted.reactFn).not.toHaveBeenCalled();
  });

  it('arms the identified owner window before its RPC response exists', async () => {
    render(
      <Harness
        declarations={[rollWindowDeclaration()]}
        beat={rollWindowBeat('fighter-1', 9, 13, 'provider~early-window')}
      />
    );
    await waitFor(() =>
      expect(
        screen.getByTestId('active-dice-presentation-id').textContent
      ).toBe('provider~early-window')
    );
    expect(screen.getByTestId('roll-window-presentation-id').textContent).toBe(
      'provider~early-window'
    );
    expect(screen.getByTestId('roll-window-awaits-dice').textContent).toBe(
      'yes'
    );
  });

  it('shows no panel to a member the window was not posed to', async () => {
    render(
      <Harness
        viewer="bard-1"
        declarations={[]}
        beat={rollWindowBeat('fighter-1', 9, 13)}
      />
    );

    await screen.findByText('yes');
    expect(screen.queryByTestId('reaction-window')).toBeNull();
    expect(hoisted.reactFn).not.toHaveBeenCalled();
  });

  it('never records somebody else’s roll as this viewer’s own', async () => {
    // The bard watches the fighter's window open. Everyone on the stream
    // receives the beat; only its audience is deciding about it. If the bard's
    // own window opened a moment later, the fighter's numbers must not be
    // sitting in it.
    render(
      <Harness
        viewer="bard-1"
        declarations={[rollWindowDeclaration()]}
        beat={rollWindowBeat('fighter-1', 9, 13)}
      />
    );

    await screen.findByText('yes');
    const panel = screen.getByTestId('reaction-window');
    expect(panel.textContent).toContain('Your roll is on the table');
    expect(panel.textContent).not.toContain('You rolled 13');
  });

  it('poses the question even before the beat lands, with no invented numbers', () => {
    render(<Harness declarations={[rollWindowDeclaration()]} />);

    const panel = screen.getByTestId('reaction-window');
    expect(panel.textContent).toContain('Your roll is on the table');
    expect(panel.textContent).not.toContain('d20');
    expect(screen.getByTestId('reaction-strike')).toBeTruthy();
  });

  it('never draws one window’s numbers under another window’s question', async () => {
    const beat = rollWindowBeat('fighter-1', 9, 13);
    const { rerender } = render(
      <Harness declarations={[rollWindowDeclaration()]} beat={beat} />
    );
    await waitFor(() =>
      expect(screen.getByTestId('reaction-window').textContent).toContain(
        'You rolled d20 9 + 4 = 13'
      )
    );

    // A DIFFERENT OFFER REACHES THE SAME LIVE HOOK, with the first window's
    // roll still recorded in it. Rerendering rather than mounting again is the
    // whole point: a fresh mount would start with no numbers and prove
    // nothing about the match.
    const other = rollWindowDeclaration();
    other.id = 'selector.postroll.2';
    other.reaction = create(ReactionRefSchema, {
      ref: 'dnd5e:conditions:cutting_words',
      name: 'Cutting Words',
    });
    rerender(<Harness declarations={[other]} beat={beat} />);

    const panel = screen.getByTestId('reaction-window');
    expect(panel.textContent).toContain('Cutting Words');
    expect(panel.textContent).toContain('Your roll is on the table');
    expect(panel.textContent).not.toContain('You rolled 13');
  });

  it('leaves the movement window reading Strike and Hold, unchanged', () => {
    render(<Harness declarations={[movementWindowDeclaration()]} />);

    const panel = screen.getByTestId('reaction-window');
    expect(panel.getAttribute('data-window-kind')).toBe('movement');
    expect(panel.textContent).toContain('Skeleton Guard is leaving your reach');
    expect(screen.getByTestId('reaction-strike').textContent).toContain(
      'Strike'
    );
    expect(screen.getByTestId('reaction-hold').textContent).toContain('Hold');
    expect(panel.textContent).not.toContain('d20');
  });
});
