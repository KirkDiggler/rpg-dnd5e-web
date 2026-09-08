/**
 * The cast door, from the row to the RPC.
 *
 * TWO HALVES, AND BETWEEN THEM EVERY CANTRIP. True Strike names nobody and
 * fires on the click; Vicious Mockery names one creature, so it arms, waits
 * for a candidate the server ruled, and sends that member back with the
 * selector. Anything a cantrip can ask for is one of those two shapes (design
 * rpg-project#405, R1).
 *
 * DRIVEN THROUGH THE HOOK RATHER THAN THE HANDLER, for the reason
 * `activationTargetingFlow.test.tsx` gives: arming and the coherence check
 * that runs one render later are different code, and only running both catches
 * an offer that arms and is then judged incoherent.
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
import { ActionDock } from './ActionDock';
import { selectCombatExperience } from './selection';
import { TargetSurface } from './TargetSurface';
import { useSessionCombatExperience } from './useSessionCombatExperience';

const hoisted = vi.hoisted(() => ({
  castFn: vi.fn(),
  activateFn: vi.fn(),
  attackFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    cast: hoisted.castFn,
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
const skeleton = create(ParticipantSchema, {
  member: 'skeleton-1',
  name: 'Skeleton',
  kind: MemberKind.MONSTER,
  standing: Standing.UP,
  active: false,
});

/** Vicious Mockery: one creature, in range and in sight. */
function mockeryDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.cast.mockery',
    verb: Verb.CAST,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, { member: 'skeleton-1', available: true }),
    ],
  });
}

/** True Strike: cast on the caster, so it prompts for nobody. */
function trueStrikeDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.cast.true-strike',
    verb: Verb.CAST,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.NONE,
  });
}

/** A fighter's swing, for the rows that must not change. */
function attackDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.attack.1',
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, { member: 'skeleton-1', available: true }),
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
      ['skeleton-1', 'Skeleton'],
    ]),
    participants: [bard, skeleton],
    declarations,
    invalidateAuthoritySnapshots: () => {},
    scheduleRefresh: () => {},
  });
  return (
    <span data-testid="armed">
      {latest.presentationState.armedDeclarationId ?? 'none'}
    </span>
  );
}

function Dock({ declarations }: { declarations: readonly Declaration[] }) {
  return (
    <ActionDock
      clock={ClockKind.TURN}
      viewerMember="bard-1"
      participants={[bard, skeleton]}
      declarations={declarations}
      armedDeclarationId={undefined}
      authorityFresh
      rollWindow={null}
      onSelectDeclaration={() => {}}
      onEndTurn={() => {}}
    />
  );
}

describe('the dock draws a Cast row per castable cantrip', () => {
  it('draws one row for each of the two cantrips, priced as an action', () => {
    render(
      <Dock declarations={[mockeryDeclaration(), trueStrikeDeclaration()]} />
    );

    // The label is "Cast" for both today: `Declaration` carries no SpellRef,
    // so there is no server-authored spell name to draw, and deriving one
    // from a ref is what the ability row refuses to do. When the field lands
    // this expectation becomes the two spell names.
    const rows = screen.getAllByRole('button', { name: /^Cast/ });
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.textContent).toContain('Cast'));
    // Each is priced as the action Afford said it costs.
    expect(screen.getAllByTitle('Action')).toHaveLength(2);
  });

  it('draws no Cast row for a fighter', () => {
    render(<Dock declarations={[attackDeclaration()]} />);

    // AFFORD DECIDES, NOT THE CLIENT. A build with no castable cantrip is
    // offered no Cast declaration, so there is nothing here to filter out.
    expect(screen.queryByRole('button', { name: /^Cast/ })).toBeNull();
  });
});

describe('arming a cast that names a creature', () => {
  it('stays armed on the selector the server sent', () => {
    const declaration = mockeryDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));

    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);
  });

  it('highlights the candidate the server named', () => {
    const declaration = mockeryDeclaration();
    const selection = selectCombatExperience([declaration], {
      armedDeclarationId: declaration.id,
      selectedCandidateMember: null,
      changedOptionNotice: null,
    });
    render(
      <TargetSurface
        phase="targeting"
        selection={selection}
        isViewerTurn
        showTurnNotice={false}
        memberNames={
          new Map([
            ['bard-1', 'Lyric'],
            ['skeleton-1', 'Skeleton'],
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

    expect(screen.getByTestId('highlighted').textContent).toBe('skeleton-1');
    expect(screen.getByText('Choose a target')).toBeTruthy();
  });
});

describe('sending the cast', () => {
  beforeEach(() => {
    hoisted.castFn.mockReset();
    hoisted.castFn.mockResolvedValue({});
    hoisted.activateFn.mockReset();
    hoisted.activateFn.mockResolvedValue({});
    hoisted.attackFn.mockReset();
    hoisted.attackFn.mockResolvedValue({});
  });

  it('a self cast fires on the click, with no target', async () => {
    const declaration = trueStrikeDeclaration();
    render(<Harness declarations={[declaration]} />);

    await act(async () => {
      latest.onSelectDeclaration(declaration);
      await Promise.resolve();
    });

    expect(hoisted.castFn).toHaveBeenCalledTimes(1);
    expect(hoisted.castFn.mock.calls[0]![0]).toEqual({
      session: 'crypt-run',
      member: 'bard-1',
      declarationId: 'selector.cast.true-strike',
      // EMPTY, NOT ABSENT. A populated target on a TARGET_KIND_NONE cast is
      // INVALID_ARGUMENT rather than a value quietly ignored.
      target: '',
    });
    // Nothing armed and no target prompt: there was nothing to wait for.
    expect(screen.getByTestId('armed').textContent).toBe('none');
  });

  it('a one-creature cast sends the chosen member with the armed selector', async () => {
    const declaration = mockeryDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('skeleton-1');
      await Promise.resolve();
    });

    expect(hoisted.castFn).toHaveBeenCalledTimes(1);
    expect(hoisted.castFn.mock.calls[0]![0]).toEqual({
      session: 'crypt-run',
      member: 'bard-1',
      declarationId: 'selector.cast.mockery',
      target: 'skeleton-1',
    });
    expect(hoisted.activateFn).not.toHaveBeenCalled();
    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });

  /**
   * THE TARGET-KIND GATE IS LOAD-BEARING, and this is what would break if it
   * were not. A MEMBER cast must not fire on the row click: doing so would
   * send Vicious Mockery at nobody, which the server refuses, and would skip
   * the target ring the player picks from. Flipping the arming branch to fire
   * unconditionally turns this test red and nothing else does.
   */
  it('a one-creature cast sends nothing until a target is chosen', async () => {
    const declaration = mockeryDeclaration();
    render(<Harness declarations={[declaration]} />);

    await act(async () => {
      latest.onSelectDeclaration(declaration);
      await Promise.resolve();
    });

    expect(hoisted.castFn).not.toHaveBeenCalled();
    expect(screen.getByTestId('armed').textContent).toBe(
      'selector.cast.mockery'
    );
  });

  /**
   * The other half of the same gate: a self cast must not wait for a target
   * it will never be given. Flipping the branch the other way — arming a
   * TARGET_KIND_NONE cast — leaves the bard holding a spell with no candidate
   * to click, which is the dead-button shape slice one's walk kept finding.
   */
  it('a self cast never arms', async () => {
    const declaration = trueStrikeDeclaration();
    render(<Harness declarations={[declaration]} />);

    await act(async () => {
      latest.onSelectDeclaration(declaration);
      await Promise.resolve();
    });

    expect(screen.getByTestId('armed').textContent).toBe('none');
    expect(hoisted.castFn).toHaveBeenCalledTimes(1);
  });
});
