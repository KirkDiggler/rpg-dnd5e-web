/**
 * Arming a targeted ACTIVATE, and it staying armed.
 *
 * WHY THIS IS AN INTEGRATION TEST. The bug lived between the click handler and
 * the coherence check that runs on the next render: arming set the id, and an
 * effect one render later judged the armed offer incoherent and replaced it
 * with "that option changed". Neither half is wrong alone — the handler armed
 * exactly what the server offered, and the check correctly tears down an offer
 * that really did change — so only driving both catches it.
 *
 * ON THE WALK it read as a dead button: Bardic Inspiration was clickable, the
 * notice appeared, and no RPC was ever sent. Two reads of Afford returned the
 * declaration byte for byte, id included, so nothing had changed.
 */
import { create } from '@bufbuild/protobuf';
import {
  AbilityRefSchema,
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
  activateFn: vi.fn(),
  attackFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    activate: hoisted.activateFn,
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
const fighter = create(ParticipantSchema, {
  member: 'fighter-1',
  name: 'Aldric',
  kind: MemberKind.PLAYER,
  standing: Standing.UP,
  active: false,
});

/** The row Afford sends for Bardic Inspiration, read off the live walk env. */
function inspirationDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'v2.uoO_sMsBgQBG8J-YuOmTQosGT1-NnqqRj4a0pnFQa2s',
    verb: Verb.ACTIVATE,
    slot: Slot.BONUS,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, { member: 'fighter-1', available: true }),
    ],
    ability: create(AbilityRefSchema, {
      ref: 'dnd5e:features:bardic_inspiration',
      name: 'Bardic Inspiration',
    }),
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
      create(TargetCandidateSchema, { member: 'fighter-1', available: true }),
    ],
  });
}

let latest: ReturnType<typeof useSessionCombatExperience>;

function Harness({ declarations }: { declarations: readonly Declaration[] }) {
  latest = useSessionCombatExperience({
    session: 'crypt-run',
    member: 'bard-1',
    clock: ClockKind.TURN,
    active: 'bard-1',
    authorityFresh: true,
    memberNames: new Map([
      ['bard-1', 'Lyric'],
      ['fighter-1', 'Aldric'],
    ]),
    participants: [bard, fighter],
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

describe('arming an activation that prompts for a member', () => {
  it('stays armed, and says nothing changed', () => {
    const declaration = inspirationDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));

    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);
    // THE MESSAGE IS THE BUG. Nothing about the offer changed — this is the
    // first click on a fresh turn — so there is nothing to review.
    expect(screen.getByTestId('notice').textContent).toBe('none');
  });

  it('leaves Attack arming exactly as it was', () => {
    const declaration = attackDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));

    expect(screen.getByTestId('armed').textContent).toBe('selector.attack.1');
    expect(screen.getByTestId('notice').textContent).toBe('none');
  });

  it('still tears down an offer the server really did withdraw', () => {
    const declaration = inspirationDeclaration();
    const { rerender } = render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));
    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);

    // The next Afford no longer offers it: THAT is when the notice belongs.
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
      memberNames={
        new Map([
          ['bard-1', 'Lyric'],
          ['fighter-1', 'Aldric'],
        ])
      }
      location={{ name: 'The Reference Tomb', area: 'Current chamber' }}
      renderMap={({ attackableTargets }) => (
        <span data-testid="highlighted">
          {attackableTargets.length ? attackableTargets.join(',') : 'none'}
        </span>
      )}
      onTargetClick={() => {}}
    />
  );
}

describe('who the map highlights while an offer is armed', () => {
  it('highlights an ally candidate for a member-targeted activation', () => {
    const declaration = inspirationDeclaration();
    render(<Surface declarations={[declaration]} armedId={declaration.id} />);

    // AFFORD'S LIST IS THE TRUTH. The fighter is an ally and is named as the
    // one candidate, so the map must offer them; reading the verb instead
    // left the only clickable member unclickable.
    expect(screen.getByTestId('highlighted').textContent).toBe('fighter-1');
    expect(screen.getByText('Bardic Inspiration armed')).toBeTruthy();
    expect(screen.getByText('Choose a target')).toBeTruthy();
  });

  it('still highlights an attack candidate, named by the weapon', () => {
    const declaration = attackDeclaration();
    render(<Surface declarations={[declaration]} armedId={declaration.id} />);

    expect(screen.getByTestId('highlighted').textContent).toBe('fighter-1');
    expect(screen.getByText('Attack armed')).toBeTruthy();
  });

  it('highlights nobody when a candidate the server refused is the only one', () => {
    const declaration = inspirationDeclaration();
    declaration.candidates[0]!.available = false;
    render(<Surface declarations={[declaration]} armedId={declaration.id} />);

    expect(screen.getByTestId('highlighted').textContent).toBe('none');
  });
});

describe('answering with a candidate the server named', () => {
  beforeEach(() => {
    hoisted.activateFn.mockReset();
    hoisted.activateFn.mockResolvedValue({});
    hoisted.attackFn.mockReset();
    hoisted.attackFn.mockResolvedValue({});
  });

  it('sends Activate for the ally, with the armed selector', async () => {
    const declaration = inspirationDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('fighter-1');
    });

    expect(hoisted.activateFn).toHaveBeenCalledTimes(1);
    const sent = hoisted.activateFn.mock.calls[0][0];
    expect(sent.declarationId).toBe(declaration.id);
    expect(sent.target).toBe('fighter-1');
    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });

  it('refuses a member the attack’s own candidate list does not name', async () => {
    const declaration = attackDeclaration();
    declaration.candidates = [];
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('fighter-1');
    });

    // NO CANDIDATE LIST, NO CLICK. Side is not what decides this — the
    // absence of the member from Afford's own list is.
    expect(hoisted.attackFn).not.toHaveBeenCalled();
    expect(screen.getByTestId('notice').textContent).toContain(
      'That option changed'
    );
  });
});
