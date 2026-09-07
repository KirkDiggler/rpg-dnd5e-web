/**
 * The window, end to end through the client: a declaration the server posed on
 * the MOVER's turn, the panel the dock draws for it, and the React RPC the
 * player's answer reaches.
 *
 * WHY THIS IS AN INTEGRATION TEST AND NOT TWO UNIT TESTS. The thing that can
 * break here lives exactly between the two: the dock draws the panel ahead of
 * its not-your-turn return, and the hook lets this one verb past the same gate.
 * Either half alone still passes with the other half broken — a panel nobody
 * can answer, or an answer nothing can pose — and the play walk cannot provoke
 * a monster pass-by to catch it.
 */
import { create } from '@bufbuild/protobuf';
import {
  ClockKind,
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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionDock } from './ActionDock';
import { useSessionCombatExperience } from './useSessionCombatExperience';

const hoisted = vi.hoisted(() => ({
  reactFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    react: hoisted.reactFn,
  },
}));

/** The initiative is the SKELETON's. That is the whole point of the slice: the
 * fight is frozen part-way through somebody else's turn. */
const skeleton = create(ParticipantSchema, {
  member: 'skeleton-1',
  name: 'Skeleton Guard',
  kind: MemberKind.MONSTER,
  standing: Standing.UP,
  active: true,
});
const fighter = create(ParticipantSchema, {
  member: 'fighter-1',
  name: 'Aldric',
  kind: MemberKind.PLAYER,
  standing: Standing.UP,
  active: false,
});

const memberNames = new Map([
  ['fighter-1', 'Aldric'],
  ['skeleton-1', 'Skeleton Guard'],
]);

function windowDeclaration(): Declaration {
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

/** The live wiring: the real hook driving the real dock, exactly as
 * `CombatExperience` mounts them. */
function Harness({ declarations }: { declarations: readonly Declaration[] }) {
  const combat = useSessionCombatExperience({
    session: 'crypt-run',
    member: 'fighter-1',
    clock: ClockKind.TURN,
    active: 'skeleton-1',
    authorityFresh: true,
    memberNames,
    participants: [skeleton, fighter],
    declarations,
    invalidateAuthoritySnapshots: () => {},
    scheduleRefresh: () => {},
  });
  return (
    <ActionDock
      clock={ClockKind.TURN}
      viewerMember="fighter-1"
      participants={[skeleton, fighter]}
      declarations={declarations}
      authorityFresh
      memberNames={memberNames}
      onSelectDeclaration={combat.onSelectDeclaration}
      onEndTurn={combat.onEndTurn}
    />
  );
}

describe('answering a reaction window on the mover’s turn', () => {
  beforeEach(() => {
    hoisted.reactFn.mockReset();
    hoisted.reactFn.mockResolvedValue({ saved: true });
  });

  it('draws the window instead of “Watching”, and names the reaction and the mover', () => {
    render(<Harness declarations={[windowDeclaration()]} />);

    const panel = screen.getByTestId('reaction-window');
    expect(panel.textContent).toContain('Opportunity Attack');
    expect(panel.textContent).toContain('Skeleton Guard is leaving your reach');
    expect(screen.queryByText(/Skeleton Guard’s turn/)).toBeNull();
    expect(screen.getByTestId('reaction-strike')).toBeTruthy();
    expect(screen.getByTestId('reaction-hold')).toBeTruthy();
  });

  it('sends Strike with the window’s own selector, past the not-your-turn gate', async () => {
    render(<Harness declarations={[windowDeclaration()]} />);

    fireEvent.click(screen.getByTestId('reaction-strike'));

    await waitFor(() => expect(hoisted.reactFn).toHaveBeenCalledTimes(1));
    expect(hoisted.reactFn).toHaveBeenCalledWith({
      session: 'crypt-run',
      member: 'fighter-1',
      declarationId: 'selector.window.1',
      choice: ReactChoice.STRIKE,
    });
  });

  it('sends Hold as its own answer, never as an absent one', async () => {
    render(<Harness declarations={[windowDeclaration()]} />);

    fireEvent.click(screen.getByTestId('reaction-hold'));

    await waitFor(() => expect(hoisted.reactFn).toHaveBeenCalledTimes(1));
    expect(hoisted.reactFn.mock.calls[0][0].choice).toBe(ReactChoice.HOLD);
    expect(hoisted.reactFn.mock.calls[0][0].choice).not.toBe(
      ReactChoice.UNSPECIFIED
    );
  });

  it('is back to “Watching”, and silent, with no window posed', () => {
    render(<Harness declarations={[]} />);

    expect(screen.queryByTestId('reaction-window')).toBeNull();
    expect(screen.getByText(/Skeleton Guard’s turn/)).toBeTruthy();
    expect(hoisted.reactFn).not.toHaveBeenCalled();
  });
});
