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
import { describe, expect, it, vi } from 'vitest';
import { useSessionCombatExperience } from './useSessionCombatExperience';

vi.mock('@/api/client', () => ({
  sessionClient: {
    activate: vi.fn(),
    attack: vi.fn(),
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
