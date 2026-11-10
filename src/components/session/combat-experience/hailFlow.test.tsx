/**
 * THE HAIL OPENS THE PANEL (rpg-project#923). A guard addressing this member
 * rides `Declaration.address` on the member's own Speak row; the client arms
 * Speak on him and opens the reply panel with no click, once per address.
 *
 * Driven through the hook and the real surface together, as speakFlow is:
 * the open, the coherence check a render later, and the close on the address
 * ending are three halves that only fail together.
 */
import { create } from '@bufbuild/protobuf';
import {
  ClockKind,
  DeclarationSchema,
  MemberKind,
  ParticipantSchema,
  Slot,
  SpeakAddressSchema,
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
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    speak: hoisted.speakFn,
    attack: hoisted.attackFn,
  },
}));

const visitor = create(ParticipantSchema, {
  member: 'visitor-1',
  name: 'Wren',
  kind: MemberKind.PLAYER,
  standing: Standing.UP,
});
const guard = create(ParticipantSchema, {
  member: 'gate-1',
  name: 'Gate guard',
  kind: MemberKind.MONSTER,
  standing: Standing.UP,
});

const names = new Map([
  ['visitor-1', 'Wren'],
  ['gate-1', 'Gate guard'],
  ['rat-1', 'Rat'],
]);

/** The visitor's Speak row at the held gate; `addressed` adds the hail. */
function speakRow(addressed: boolean, id = 'v2.speak.gate.1'): Declaration {
  return create(DeclarationSchema, {
    id,
    verb: Verb.SPEAK,
    slot: Slot.UNSPECIFIED,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, { member: 'gate-1', available: true }),
    ],
    speakOptions: [
      create(SpeakOptionSchema, {
        target: { case: 'memberId', value: 'gate-1' },
        optionId: 'troupe',
        line: "We're the troupe for the feast.",
        available: true,
      }),
    ],
    address: addressed
      ? create(SpeakAddressSchema, {
          guardMemberId: 'gate-1',
          interactionId: 'front-gate',
        })
      : undefined,
  });
}

function attackRow(): Declaration {
  return create(DeclarationSchema, {
    id: 'v2.attack.1',
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, { member: 'rat-1', available: true }),
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
    session: 'gate',
    member: 'visitor-1',
    clock,
    active,
    authorityFresh: true,
    memberNames: names,
    participants: [visitor, guard],
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
        location={{ name: 'The Castle', area: 'Front gate' }}
        renderMap={() => null}
        onTargetClick={latest.onTargetClick}
        speakTarget={state.speakTarget}
        onChooseSpeakTarget={latest.onChooseSpeakTarget}
        onSpeakOption={latest.onSpeakOption}
        onCancelSelection={latest.onCancelSelection}
      />
    </>
  );
}

const hailText = 'What do you say to Gate guard?';

function panelOpen(): boolean {
  return screen.queryByText(hailText) !== null;
}

function pressEscape() {
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' });
  });
}

beforeEach(() => {
  hoisted.speakFn.mockReset();
  hoisted.speakFn.mockResolvedValue({});
  hoisted.attackFn.mockReset();
  hoisted.attackFn.mockResolvedValue({});
});

describe('the hail opens the reply panel', () => {
  it('an address on the Speak row opens the panel on the guard, no click', () => {
    render(<Harness declarations={[speakRow(true)]} />);

    expect(panelOpen()).toBe(true);
    expect(screen.getByTestId('armed').textContent).toBe('v2.speak.gate.1');
    expect(latest.presentationState.speakTarget).toEqual({
      case: 'memberId',
      value: 'gate-1',
    });
    expect(hoisted.speakFn).not.toHaveBeenCalled();
  });

  it('no address opens nothing', () => {
    render(<Harness declarations={[speakRow(false)]} />);

    expect(panelOpen()).toBe(false);
    expect(screen.getByTestId('armed').textContent).toBe('none');
    expect(latest.hailFocus).toBeNull();
  });

  it('opens on the world clock only: an address on a turn opens nothing', () => {
    render(
      <Harness
        declarations={[speakRow(true)]}
        clock={ClockKind.TURN}
        active="visitor-1"
      />
    );

    expect(panelOpen()).toBe(false);
  });

  it('Escape closes it, and it stays closed while the same address stands', () => {
    const { rerender } = render(<Harness declarations={[speakRow(true)]} />);
    expect(panelOpen()).toBe(true);

    pressEscape();
    expect(panelOpen()).toBe(false);

    // A later Afford read: the same guard, the same interaction, still there.
    rerender(<Harness declarations={[speakRow(true)]} />);
    rerender(<Harness declarations={[speakRow(true)]} />);
    expect(panelOpen()).toBe(false);
    expect(screen.getByTestId('armed').textContent).toBe('none');
  });

  it('the address gone and back opens it again', () => {
    const { rerender } = render(<Harness declarations={[speakRow(true)]} />);
    pressEscape();
    expect(panelOpen()).toBe(false);

    rerender(<Harness declarations={[speakRow(false)]} />);
    expect(panelOpen()).toBe(false);
    rerender(<Harness declarations={[speakRow(true)]} />);

    expect(panelOpen()).toBe(true);
  });

  it('the address ending closes the panel it opened, quietly', () => {
    const { rerender } = render(<Harness declarations={[speakRow(true)]} />);
    expect(panelOpen()).toBe(true);

    rerender(<Harness declarations={[speakRow(false)]} />);

    expect(panelOpen()).toBe(false);
    expect(screen.getByTestId('armed').textContent).toBe('none');
    expect(screen.getByTestId('notice').textContent).toBe('none');
    expect(latest.hailFocus).toBeNull();
  });

  it('the address ending with the Speak row gone too still closes quietly', () => {
    const { rerender } = render(<Harness declarations={[speakRow(true)]} />);
    expect(panelOpen()).toBe(true);

    rerender(<Harness declarations={[]} />);

    expect(panelOpen()).toBe(false);
    expect(screen.getByTestId('notice').textContent).toBe('none');
  });

  it('a manual Speak on the guard is left open when no address stands', () => {
    const row = speakRow(false);
    const { rerender } = render(<Harness declarations={[row]} />);
    act(() => latest.onSelectDeclaration(row));
    act(() => latest.onTargetClick('gate-1'));
    expect(panelOpen()).toBe(true);

    rerender(<Harness declarations={[speakRow(false)]} />);

    expect(panelOpen()).toBe(true);
  });

  it('never yanks an armed non-Speak action; opens once the player is idle', () => {
    const attack = attackRow();
    const { rerender } = render(
      <Harness declarations={[attack, speakRow(false)]} />
    );
    act(() => latest.onSelectDeclaration(attack));
    expect(screen.getByTestId('armed').textContent).toBe('v2.attack.1');

    rerender(<Harness declarations={[attack, speakRow(true)]} />);
    expect(screen.getByTestId('armed').textContent).toBe('v2.attack.1');
    expect(panelOpen()).toBe(false);

    // Putting the attack down is a cancel, and a cancel while addressed is
    // the player closing the hail: it stays closed while the address stands.
    pressEscape();
    rerender(<Harness declarations={[attack, speakRow(true)]} />);
    expect(panelOpen()).toBe(false);
  });

  it('a line said is not a dismissal: the next addressed offer reopens', async () => {
    const { rerender } = render(<Harness declarations={[speakRow(true)]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /We're the troupe/ }));
    });
    expect(hoisted.speakFn).toHaveBeenCalledTimes(1);

    rerender(<Harness declarations={[speakRow(true, 'v2.speak.gate.2')]} />);

    expect(panelOpen()).toBe(true);
    expect(screen.getByTestId('armed').textContent).toBe('v2.speak.gate.2');
  });
});

describe('the hail takes focus', () => {
  it('names the guard for the camera, under a key fresh per opening', () => {
    const { rerender } = render(<Harness declarations={[speakRow(true)]} />);
    const first = latest.hailFocus;
    expect(first?.guard).toBe('gate-1');

    rerender(<Harness declarations={[speakRow(false)]} />);
    expect(latest.hailFocus).toBeNull();
    rerender(<Harness declarations={[speakRow(true)]} />);

    expect(latest.hailFocus?.guard).toBe('gate-1');
    expect(latest.hailFocus?.key).not.toBe(first?.key);
  });

  it('keeps the same key while one opening stands, so the camera centres once', () => {
    const { rerender } = render(<Harness declarations={[speakRow(true)]} />);
    const first = latest.hailFocus;

    rerender(<Harness declarations={[speakRow(true)]} />);

    expect(latest.hailFocus).toBe(first);
  });
});
