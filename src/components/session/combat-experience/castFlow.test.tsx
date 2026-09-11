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
  CostComponentSchema,
  Currency,
  DeclarationSchema,
  MemberKind,
  ParticipantSchema,
  Slot,
  SpellRefSchema,
  Standing,
  TargetCandidateSchema,
  TargetKind,
  UnresolvedReason,
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
    minTargets: 1,
    maxTargets: 1,
    candidates: [
      create(TargetCandidateSchema, { member: 'skeleton-1', available: true }),
    ],
    spell: create(SpellRefSchema, {
      ref: 'dnd5e:spells:vicious-mockery',
      name: 'Vicious Mockery',
    }),
  });
}

/** Bane: one to three ordered creatures, priced by the provider. */
function baneDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.cast.bane',
    verb: Verb.CAST,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    minTargets: 1,
    maxTargets: 3,
    candidates: [
      create(TargetCandidateSchema, { member: 'skeleton-1', available: true }),
      create(TargetCandidateSchema, { member: 'skeleton-2', available: true }),
      create(TargetCandidateSchema, { member: 'skeleton-3', available: true }),
      create(TargetCandidateSchema, { member: 'skeleton-4', available: true }),
      create(TargetCandidateSchema, { member: 'ghost-1', available: false }),
    ],
    cost: [
      create(CostComponentSchema, {
        currency: Currency.CHARGES,
        needed: 1,
        label: 'Level 1 spell slot',
      }),
    ],
    spell: create(SpellRefSchema, {
      ref: 'dnd5e:spells:bane',
      name: 'Bane',
    }),
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
    spell: create(SpellRefSchema, {
      ref: 'dnd5e:spells:true-strike',
      name: 'True Strike',
    }),
  });
}

/**
 * An AREA cast: the content declares a shape and the SERVER works out who is
 * standing in it, so the declaration carries no candidates at all.
 */
function thunderclapDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.cast.thunderclap',
    verb: Verb.CAST,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.AREA,
    spell: create(SpellRefSchema, {
      ref: 'dnd5e:spells:thunderclap',
      name: 'Thunderclap',
    }),
  });
}

/**
 * A CELL cast: the caster AIMS the shape. Thunderwave's cube starts at the
 * caster's own edge and points at a cell the player picks off the ground, so
 * the declaration carries no candidates and still cannot fire on the row
 * click — there is exactly one thing left to say, and it is not a creature.
 */
function thunderwaveDeclaration(): Declaration {
  return create(DeclarationSchema, {
    id: 'selector.cast.thunderwave',
    verb: Verb.CAST,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.CELL,
    cost: [
      create(CostComponentSchema, {
        currency: Currency.CHARGES,
        needed: 1,
        label: 'Level 1 spell slot',
      }),
    ],
    spell: create(SpellRefSchema, {
      ref: 'dnd5e:spells:thunderwave',
      name: 'Thunderwave',
    }),
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

    // TWO ROWS THAT READ DIFFERENTLY, each named by the spell itself through
    // `Declaration.spell`. Two rows both saying "Cast" would be an affordance
    // the player cannot tell apart.
    expect(
      screen.getByRole('button', { name: /^Vicious Mockery/ })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /^True Strike/ })).toBeTruthy();
    // Each is priced as the action Afford said it costs.
    expect(screen.getAllByTitle('Action')).toHaveLength(2);
  });

  it('draws no Cast row for a fighter', () => {
    render(<Dock declarations={[attackDeclaration()]} />);

    // AFFORD DECIDES, NOT THE CLIENT. A build with no castable cantrip is
    // offered no Cast declaration, so there is nothing here to filter out.
    expect(
      screen.queryByRole('button', { name: /Vicious Mockery|True Strike/ })
    ).toBeNull();
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
    // The armed prompt names the spell, not the verb.
    expect(screen.getByText('Vicious Mockery armed')).toBeTruthy();
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
      // The legacy scalar remains empty; current cast code uses the canonical
      // ordered field, including the empty list for a no-target spell.
      target: '',
      targets: [],
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
      target: '',
      targets: ['skeleton-1'],
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
  it('collects Bane targets in click order, caps them at the provider maximum, and submits once', async () => {
    const declaration = baneDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    act(() => latest.onTargetClick('skeleton-1'));
    act(() => latest.onTargetClick('skeleton-1')); // duplicate
    act(() => latest.onTargetClick('ghost-1')); // unavailable
    act(() => latest.onTargetClick('skeleton-2'));
    act(() => latest.onTargetClick('skeleton-3'));
    act(() => latest.onTargetClick('skeleton-4')); // fourth

    expect(latest.presentationState.selectedCandidateMembers).toEqual([
      'skeleton-1',
      'skeleton-2',
      'skeleton-3',
    ]);
    expect(hoisted.castFn).not.toHaveBeenCalled();

    await act(async () => {
      latest.onConfirmTargets();
      latest.onConfirmTargets();
      await Promise.resolve();
    });

    expect(hoisted.castFn).toHaveBeenCalledTimes(1);
    expect(hoisted.castFn.mock.calls[0]![0]).toEqual({
      session: 'crypt-run',
      member: 'bard-1',
      declarationId: 'selector.cast.bane',
      target: '',
      targets: ['skeleton-1', 'skeleton-2', 'skeleton-3'],
    });
  });

  it('shows Bane target cardinality and provider-authored cost', () => {
    const declaration = baneDeclaration();
    const selection = selectCombatExperience([declaration], {
      armedDeclarationId: declaration.id,
      selectedCandidateMember: null,
      selectedCandidateMembers: ['skeleton-1'],
      changedOptionNotice: null,
    });

    render(
      <TargetSurface
        phase="targeting"
        selection={selection}
        isViewerTurn
        showTurnNotice={false}
        memberNames={new Map()}
        location={{ name: 'The Reference Tomb', area: 'Current chamber' }}
        renderMap={() => null}
        onTargetClick={() => {}}
        onConfirmTargets={() => {}}
      />
    );

    expect(screen.getByText('Choose 1–3 targets')).toBeTruthy();
    expect(screen.getByText('1 Level 1 spell slot')).toBeTruthy();
    expect(screen.getByText('1/3 selected')).toBeTruthy();
  });

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

describe('a declaration that fires on the click clears whatever was armed', () => {
  it('unarms a creature-target cast when an immediate cast is clicked', () => {
    const mockery = mockeryDeclaration();
    const trueStrike = trueStrikeDeclaration();
    render(<Harness declarations={[mockery, trueStrike]} />);

    // Arm the one that names a creature, the way a player would before
    // changing their mind.
    act(() => latest.onSelectDeclaration(mockery));
    expect(screen.getByTestId('armed').textContent).toBe(mockery.id);

    // Then click one that needs nobody. It fires immediately — and the row
    // that was armed has to stop being armed.
    act(() => latest.onSelectDeclaration(trueStrike));

    expect(hoisted.castFn).toHaveBeenCalled();
    // THE BUG THIS PINS: the immediate path used to call runCast without
    // clearing the interaction, so the spell went out on the wire while the
    // panel still showed Vicious Mockery selected and the target surface still
    // open. Move and Death Save always cleared; the cast and activate paths
    // did not, and nothing the player could see said which action had gone.
    expect(screen.getByTestId('armed').textContent).toBe('none');
  });
});

describe('an area cast fires on the click', () => {
  // Its own reset: the mock-clearing beforeEach above belongs to 'sending the
  // cast', and a shared spy that counts calls from a previous block reports a
  // failure that has nothing to do with this test.
  beforeEach(() => {
    hoisted.castFn.mockReset();
    hoisted.castFn.mockResolvedValue({});
  });

  it('sends no targets, because nobody was chosen', async () => {
    const declaration = thunderclapDeclaration();
    render(<Harness declarations={[declaration]} />);

    await act(async () => {
      latest.onSelectDeclaration(declaration);
      await Promise.resolve();
    });

    // THE BUG THIS PINS: onCast used to demand TargetKind.NONE exactly, so an
    // AREA declaration failed the guard and returned bare — the row drew, the
    // click did nothing, and nothing was logged. It reached a player as a
    // spell that simply would not cast.
    expect(hoisted.castFn).toHaveBeenCalledTimes(1);
    expect(hoisted.castFn.mock.calls[0]![0]).toEqual({
      session: 'crypt-run',
      member: 'bard-1',
      declarationId: 'selector.cast.thunderclap',
      target: '',
      targets: [],
    });
    // Nothing armed and no prompt: an area cast chooses nobody, which is a
    // different reason from True Strike's but the same outcome here.
    expect(screen.getByTestId('armed').textContent).toBe('none');
  });

  it('tells the caster who it reached and could not touch', async () => {
    hoisted.castFn.mockResolvedValue({
      caught: [
        {
          member: 'demo-merchant-1',
          kind: MemberKind.WORLD,
          reason: UnresolvedReason.NO_SHEET,
        },
      ],
    });
    const declaration = thunderclapDeclaration();
    render(<Harness declarations={[declaration]} />);

    await act(async () => {
      latest.onSelectDeclaration(declaration);
      await Promise.resolve();
    });

    // WITHOUT THIS the response is discarded and a shopkeeper standing in the
    // blast is indistinguishable from an empty room — a missing capability
    // wearing the appearance of a spell that missed.
    expect(latest.presentationState.changedOptionNotice).toContain(
      'demo-merchant-1'
    );
  });
});

describe('a cast that aims at a cell', () => {
  beforeEach(() => {
    hoisted.castFn.mockReset();
    hoisted.castFn.mockResolvedValue({ caught: [] });
  });

  it('arms on the row click and sends nothing yet', async () => {
    const declaration = thunderwaveDeclaration();
    render(<Harness declarations={[declaration]} />);

    await act(async () => {
      latest.onSelectDeclaration(declaration);
      await Promise.resolve();
    });

    // NOT AREA, THOUGH IT CARRIES NO CANDIDATES EITHER. Thunderclap fires on
    // the row click because nobody and nothing is chosen; Thunderwave still
    // needs the direction the cube points, so it waits exactly as a
    // creature-target cast waits.
    expect(hoisted.castFn).not.toHaveBeenCalled();
    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);
    expect(latest.cellCastArmed).toBe(true);
  });

  it('sends the clicked cell with the armed selector and disarms', async () => {
    const declaration = thunderwaveDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onCellClick({ x: 2, y: -1 });
      await Promise.resolve();
    });

    expect(hoisted.castFn).toHaveBeenCalledTimes(1);
    expect(hoisted.castFn.mock.calls[0]![0]).toEqual({
      session: 'crypt-run',
      member: 'bard-1',
      declarationId: 'selector.cast.thunderwave',
      target: '',
      targets: [],
      cell: { x: 2, y: -1 },
    });
    expect(screen.getByTestId('armed').textContent).toBe('none');
    expect(latest.cellCastArmed).toBe(false);
  });

  it('ignores a creature click while it is armed', async () => {
    const declaration = thunderwaveDeclaration();
    render(<Harness declarations={[declaration]} />);

    act(() => latest.onSelectDeclaration(declaration));
    await act(async () => {
      latest.onTargetClick('skeleton-1');
      await Promise.resolve();
    });

    // A CREATURE IS NOT A CELL. Entity clicks win over the ground in the
    // canvas, so clicking a skeleton while this is armed must not be read as
    // a member target and must not tear the arm down either — the player is
    // still one ground click away from casting.
    expect(hoisted.castFn).not.toHaveBeenCalled();
    expect(screen.getByTestId('armed').textContent).toBe(declaration.id);
    expect(latest.presentationState.changedOptionNotice).toBeNull();
  });

  it('sends nothing when no cell cast is armed', async () => {
    const declaration = thunderwaveDeclaration();
    render(<Harness declarations={[declaration]} />);

    await act(async () => {
      latest.onCellClick({ x: 2, y: -1 });
      await Promise.resolve();
    });

    expect(hoisted.castFn).not.toHaveBeenCalled();
  });

  it('asks for a cell rather than a target', () => {
    const declaration = thunderwaveDeclaration();
    const selection = selectCombatExperience([declaration], {
      armedDeclarationId: declaration.id,
      selectedCandidateMember: null,
      selectedCandidateMembers: [],
      changedOptionNotice: null,
    });

    render(
      <TargetSurface
        phase="targeting"
        selection={selection}
        isViewerTurn
        showTurnNotice={false}
        memberNames={new Map()}
        location={{ name: 'The Reference Tomb', area: 'Current chamber' }}
        renderMap={() => null}
        onTargetClick={() => {}}
      />
    );

    expect(screen.getByText('Thunderwave armed')).toBeTruthy();
    expect(screen.getByText('Pick a cell to aim toward')).toBeTruthy();
    expect(screen.queryByText('Choose a target')).toBeNull();
  });
});
