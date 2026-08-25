import { SESSION_COMBAT_FIXTURES } from '@/concepts/session-combat/fixtures';
import {
  ClockKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CombatExperience } from './CombatExperience';
import type {
  CombatExperiencePresentationState,
  CombatExperienceProps,
} from './types';

const fresh = SESSION_COMBAT_FIXTURES[0]!;
const emptyState: CombatExperiencePresentationState = {
  armedDeclarationId: null,
  selectedCandidateMember: null,
  changedOptionNotice: null,
};

function propsFor(
  fixture = fresh,
  overrides: Partial<CombatExperienceProps> = {}
): CombatExperienceProps {
  return {
    viewerMember: fixture.viewerMember,
    clock: fixture.clock,
    round: fixture.round,
    participants: fixture.participants,
    declarations: fixture.declarations,
    characterData: fixture.characterData,
    presentationState: emptyState,
    phase: 'fresh',
    showTurnNotice: false,
    logMode: 'story',
    streamState: fixture.streamState,
    story: fixture.story,
    debug: fixture.debug,
    diceEvents: [],
    location: { name: 'Reference Tomb', area: 'South reliquary' },
    renderMap: ({ attackableTargets, onTargetClick }) => (
      <div data-testid="shared-map-render">
        {attackableTargets.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => onTargetClick(target)}
          >
            Shared target {target}
          </button>
        ))}
      </div>
    ),
    onSelectDeclaration: vi.fn(),
    onTargetClick: vi.fn(),
    onEndTurn: vi.fn(),
    onLogModeChange: vi.fn(),
    diceWitnessRole: 'spectator',
    ...overrides,
  } as CombatExperienceProps;
}

describe('CombatExperience shared production shell', () => {
  it('owns the approved five-region composition at the 1024px structure floor', () => {
    render(<CombatExperience {...propsFor()} />);

    expect(screen.getByTestId('combat-experience-shell')).toBeTruthy();
    expect(screen.getByTestId('session-combat-initiative')).toBeTruthy();
    expect(screen.getByTestId('session-combat-map')).toBeTruthy();
    expect(screen.getByTestId('session-combat-dock')).toBeTruthy();
    expect(screen.getByTestId('session-combat-dice-drawer')).toBeTruthy();
    expect(screen.getByTestId('session-combat-log')).toBeTruthy();
  });

  it('renders only provider-declared Attack, Move, and separate End Turn gameplay controls', () => {
    render(<CombatExperience {...propsFor()} />);

    expect(screen.getByRole('button', { name: /Longsword/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Move/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'End turn' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Dodge|Dash/ })).toBeNull();
    expect(screen.queryByText('Spells')).toBeNull();
    expect(screen.queryByText('Healing Potion')).toBeNull();
    expect(screen.queryByText('Blessed')).toBeNull();
  });

  it('keeps Fighter features, conditions, and resources informational without invented detail', () => {
    render(<CombatExperience {...propsFor()} />);

    expect(screen.getByText('Dueling').dataset.informational).toBe('true');
    expect(screen.getByText('Dueling').title).toBe('Dueling');
    expect(screen.getByText('Action Surge').dataset.informational).toBe('true');
    expect(screen.getByText('Action Surge').title).toBe('Action Surge');
    expect(screen.getByText('Second Wind 1/1').dataset.informational).toBe(
      'true'
    );
    expect(screen.queryByRole('button', { name: /Action Surge/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Second Wind/ })).toBeNull();
  });

  it('uses authored attack identity and refusal copy and displays Move remaining without pricing a path', () => {
    const spent = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'spent-turn'
    )!;
    render(<CombatExperience {...propsFor(spent)} />);

    const attack = screen.getByRole('button', { name: /Longsword/ });
    expect((attack as HTMLButtonElement).disabled).toBe(true);
    expect(attack.title).toBe('Action: 1 needed, 0 left.');
    expect(screen.getByRole('button', { name: /Move/ }).title).toBe(
      '10 ft remaining'
    );
    expect(
      (screen.getByRole('button', { name: 'End turn' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it('suppresses Attack, Move, and End Turn callbacks when their declarations are disabled', () => {
    const blockers = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'spectating'
    )!.declarations;
    const onSelectDeclaration = vi.fn();
    const onEndTurn = vi.fn();
    render(
      <CombatExperience
        {...propsFor(fresh, {
          declarations: blockers,
          onSelectDeclaration,
          onEndTurn,
        })}
      />
    );

    const attack = screen.getByRole('button', {
      name: /Attack.*Unavailable: Not your turn\./,
    });
    const move = screen.getByRole('button', {
      name: /Move.*Unavailable: Not your turn\./,
    });
    const endTurn = screen.getByRole('button', {
      name: /End turn.*Unavailable: Not your turn\./,
    });
    fireEvent.click(attack);
    fireEvent.click(move);
    fireEvent.click(endTurn);

    expect((attack as HTMLButtonElement).disabled).toBe(true);
    expect((move as HTMLButtonElement).disabled).toBe(true);
    expect((endTurn as HTMLButtonElement).disabled).toBe(true);
    expect(endTurn.title).toBe('Not your turn.');
    expect(onSelectDeclaration).not.toHaveBeenCalled();
    expect(onEndTurn).not.toHaveBeenCalled();
  });

  it('exposes only available members from the armed declaration while retaining provider why text', () => {
    const attack = fresh.declarations.find(
      (declaration) => declaration.verb === Verb.ATTACK
    )!;
    render(
      <CombatExperience
        {...propsFor(fresh, {
          phase: 'targeting',
          presentationState: {
            ...emptyState,
            armedDeclarationId: attack.id,
          },
        })}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Shared target skeleton-guard' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: 'Shared target skeleton-archer',
      })
    ).toBeNull();
    expect(screen.getByText(/outside this attack’s reach/)).toBeTruthy();
  });

  it('renders spectating, world-clock, and reconnect states from the same shell', () => {
    const spectating = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'spectating'
    )!;
    const world = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.clock === ClockKind.WORLD
    )!;
    const reconnect = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'reconnected'
    )!;
    const { rerender } = render(<CombatExperience {...propsFor(spectating)} />);

    expect(screen.getByText('Skeleton Archer’s turn')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Longsword/ })).toBeNull();

    rerender(<CombatExperience {...propsFor(world)} />);
    expect(screen.getByTestId('session-combat-free-roam')).toBeTruthy();
    expect(screen.getByText('Click the floor to move')).toBeTruthy();

    rerender(<CombatExperience {...propsFor(reconnect)} />);
    expect(screen.getByText('Caught up')).toBeTruthy();
    expect(screen.getByText('You are caught up')).toBeTruthy();
  });

  it('keeps native callbacks on exact generated declarations', () => {
    const onSelectDeclaration = vi.fn();
    const onEndTurn = vi.fn();
    render(
      <CombatExperience
        {...propsFor(fresh, { onSelectDeclaration, onEndTurn })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Longsword/ }));
    fireEvent.click(screen.getByRole('button', { name: /Move/ }));
    fireEvent.click(screen.getByRole('button', { name: 'End turn' }));

    expect(onSelectDeclaration).toHaveBeenNthCalledWith(
      1,
      fresh.declarations[0]
    );
    expect(onSelectDeclaration).toHaveBeenNthCalledWith(
      2,
      fresh.declarations[1]
    );
    expect(onEndTurn).toHaveBeenCalledWith(fresh.declarations[2]);
  });
});

describe('CombatExperience responsive and accessibility contract', () => {
  it('retains focus, reduced-motion, 768px floor, and horizontal action overflow CSS', () => {
    const css = readFileSync(
      'src/components/session/combat-experience/CombatExperience.module.css',
      'utf8'
    );

    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('height: 768px');
    expect(css).toContain('overflow-x: auto');
  });
});
