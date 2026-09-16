/**
 * Arming Intimidate, picking a target, and sending the threat
 * (rpg-project#454, the first shenanigan).
 *
 * WHY THIS IS AN INTEGRATION TEST, for `activationTargetingFlow`'s reason
 * exactly: arming and the coherence check that runs a render later are two
 * halves that only fail together. A verb left out of the arming check reads
 * as a dead button on the walk — clickable, then "that option changed", and
 * no RPC ever sent — which is what happened to Bardic Inspiration and to
 * Thunderwave before it. Intimidate is the third verb to prompt for a member
 * and the same gap was waiting for it.
 *
 * IT REUSES THE ATTACK AFFORDANCE AND BUILDS NO PICKER OF ITS OWN. The offer
 * carries `TargetKind.MEMBER` and a candidate list the server ruled, which is
 * the same shape a swing has, so the existing arm-then-click path does the
 * whole job.
 */
import { create } from '@bufbuild/protobuf';
import {
  AttackRefSchema,
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
import { TargetSurface } from './TargetSurface';
import { selectCombatExperience } from './selection';
import { useSessionCombatExperience } from './useSessionCombatExperience';

const hoisted = vi.hoisted(() => ({
  intimidateFn: vi.fn(),
  attackFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    intimidate: hoisted.intimidateFn,
    attack: hoisted.attackFn,
  },
}));

const fighter = create(ParticipantSchema, {
  member: 'fighter-1',
  name: 'Aldric',
  kind: MemberKind.PLAYER,
  standing: Standing.UP,
  active: true,
});
const goblin = create(ParticipantSchema, {
  member: 'goblin-2',
  name: 'goblin-2',
  kind: MemberKind.MONSTER,
  standing: Standing.UP,
  active: false,
});

const names = new Map([
  ['fighter-1', 'Aldric'],
  ['goblin-2', 'goblin-2'],
]);

/**
 * The row Afford sends for a threat: the standard action, a member target,
 * and the WITNESSES as candidates.
 *
 * NO AttackRef AND NO AbilityRef, deliberately. A threat compiles no action
 * definition — the seam sends a sealed selector variant — so the dock names
 * the row itself rather than reading a server-authored label.
 */
function intimidateDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'v2.intimidate.sealed.1',
    verb: Verb.INTIMIDATE,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, { member: 'goblin-2', available: true }),
    ],
  });
}

/** An Attack row, for the regression that must not move. */
function attackDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.attack.1',
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, { member: 'goblin-2', available: true }),
    ],
    attack: create(AttackRefSchema, {
      ref: 'dnd5e:weapons:longsword',
      name: 'Longsword',
    }),
  });
}

let latest: ReturnType<typeof useSessionCombatExperience>;

function Harness({ declarations }: { declarations: readonly Declaration[] }) {
  latest = useSessionCombatExperience({
    session: 'three-minds',
    member: 'fighter-1',
    clock: ClockKind.TURN,
    active: 'fighter-1',
    authorityFresh: true,
    memberNames: names,
    participants: [fighter, goblin],
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

describe('arming a threat', () => {
  it('stays armed, and says nothing changed', () => {
    const declaration = intimidateDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));

    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);
    // THE MESSAGE WOULD BE THE BUG. Nothing about the offer changed — this
    // is the first click of the turn — so there is nothing to review.
    expect(screen.getByTestId('notice').textContent).toBe('none');
  });

  it('still tears down an offer the server really did withdraw', () => {
    const declaration = intimidateDeclaration();
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

/** The map surface, driven by whatever the hook currently has armed. */
function Surface({
  declarations,
  armedId,
}: {
  declarations: readonly Declaration[];
  armedId: string | null;
}) {
  const selection = selectCombatExperience(declarations, {
    armedDeclarationId: armedId,
    selectedCandidateMember: null,
    changedOptionNotice: null,
  });
  return (
    <TargetSurface
      phase="targeting"
      selection={selection}
      isViewerTurn
      showTurnNotice={false}
      memberNames={names}
      location={{ name: 'The Three Minds', area: 'Entrance' }}
      renderMap={({ attackableTargets }) => (
        <span data-testid="highlighted">
          {attackableTargets.length ? attackableTargets.join(',') : 'none'}
        </span>
      )}
      onTargetClick={() => {}}
    />
  );
}

describe('who the map offers while a threat is armed', () => {
  it('highlights the candidate Afford named, and calls the row Intimidate', () => {
    const declaration = intimidateDeclaration();
    render(<Surface declarations={[declaration]} armedId={declaration.id} />);

    // AFFORD'S LIST IS THE TRUTH, and for this verb it is the list of people
    // who can see the ACTOR — not the people the actor can see. Reading the
    // verb instead of the list would get the direction backwards.
    expect(screen.getByTestId('highlighted').textContent).toBe('goblin-2');
    expect(screen.getByText('Intimidate armed')).toBeTruthy();
    expect(screen.getByText('Choose a target')).toBeTruthy();
  });

  it('highlights nobody when the only candidate is one the server refused', () => {
    const declaration = intimidateDeclaration();
    declaration.candidates[0]!.available = false;
    render(<Surface declarations={[declaration]} armedId={declaration.id} />);

    expect(screen.getByTestId('highlighted').textContent).toBe('none');
  });
});

describe('sending the threat', () => {
  beforeEach(() => {
    hoisted.intimidateFn.mockReset();
    hoisted.intimidateFn.mockResolvedValue({});
    hoisted.attackFn.mockReset();
    hoisted.attackFn.mockResolvedValue({});
  });

  it('sends session/member/target and NO selector — the request has no field for one', async () => {
    const declaration = intimidateDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('goblin-2');
    });

    expect(hoisted.intimidateFn).toHaveBeenCalledTimes(1);
    const sent = hoisted.intimidateFn.mock.calls[0][0];
    expect(sent).toEqual({
      session: 'three-minds',
      member: 'fighter-1',
      target: 'goblin-2',
    });
    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });

  it('refuses a member the offer’s own candidate list does not name', async () => {
    const declaration = intimidateDeclaration();
    declaration.candidates = [];
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('goblin-2');
    });

    // NO CANDIDATE LIST, NO CLICK. Whether the goblin can see the fighter is
    // the server's answer, and its absence from Afford's list is the only
    // thing this client reads.
    expect(hoisted.intimidateFn).not.toHaveBeenCalled();
    expect(screen.getByTestId('notice').textContent).toContain(
      'That option changed'
    );
  });

  it('a threat the door refuses is shown as a refusal, not as a stale offer', async () => {
    // The panel asks who the ACTOR can see; the verb asks the other
    // direction and can still refuse. There is no selector for the server to
    // reject as stale — the request carries none — so the only honest thing
    // to show is the refusal itself.
    hoisted.intimidateFn.mockRejectedValueOnce(
      new Error('target cannot see the actor')
    );
    const declaration = intimidateDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('goblin-2');
    });

    expect(hoisted.intimidateFn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('notice').textContent).toContain(
      'Intimidate failed'
    );
    expect(screen.getByTestId('armed').textContent).toBe('none');
  });

  it('leaves Attack sending exactly as it was', async () => {
    const declaration = attackDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('goblin-2');
    });

    expect(hoisted.attackFn).toHaveBeenCalledTimes(1);
    expect(hoisted.attackFn.mock.calls[0][0].declarationId).toBe(
      'selector.attack.1'
    );
    expect(hoisted.intimidateFn).not.toHaveBeenCalled();
  });
});
