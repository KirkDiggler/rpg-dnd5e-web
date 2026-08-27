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
    viewerName: 'Aldric Vale',
    viewerClassRefId: 'fighter',
    memberNames: new Map(
      fixture.participants.map((participant) => [
        participant.member,
        participant.name,
      ])
    ),
    clock: fixture.clock,
    round: fixture.round,
    participants: fixture.participants,
    declarations: fixture.declarations,
    characterData: fixture.characterData,
    privateStatus: 'ready',
    authorityFresh: true,
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

/** The tooltip card a button describes itself by. */
function tooltipOf(button: HTMLElement): HTMLElement {
  const id = button.getAttribute('aria-describedby');
  const tooltip = id ? document.getElementById(id) : null;
  if (!tooltip) throw new Error('button has no tooltip');
  return tooltip;
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

  it('defaults to the fixed review frame and requires an explicit fill-parent layout', () => {
    const { rerender } = render(<CombatExperience {...propsFor()} />);
    const shell = screen.getByTestId('combat-experience-shell');

    expect(shell.parentElement?.dataset.layout).toBe('review-frame');
    expect(shell.parentElement?.className).not.toContain(
      'combatExperienceFillParent'
    );

    rerender(<CombatExperience {...propsFor()} layout="fill-parent" />);
    expect(shell.parentElement?.dataset.layout).toBe('fill-parent');
    expect(shell.parentElement?.className).toContain(
      'combatExperienceFillParent'
    );
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

  it('renders an explicit retryable private status area without private badges or equipment when the initial owner read is unavailable', () => {
    const retry = vi.fn();
    render(
      <CombatExperience
        {...propsFor(fresh, {
          characterData: undefined,
          privateStatus: 'unavailable',
          privateStatusMessage: 'Private status unavailable.',
          onRetryPrivateStatus: retry,
          onOpenEquipment: vi.fn(),
        })}
      />
    );

    screen.getByText('Private status unavailable');
    expect(screen.queryByText(/level 3/i)).toBeNull();
    expect(screen.queryByText('22/28')).toBeNull();
    expect(screen.queryByText('Dueling')).toBeNull();
    expect(screen.queryByTestId('session-combat-equipment-button')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: /retry private status/i })
    );
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /longsword/i })).toBeTruthy();
  });

  it('keeps last-good private status visible with an explicit stale warning after a background error', () => {
    render(
      <CombatExperience
        {...propsFor(fresh, {
          privateStatus: 'stale',
          privateStatusMessage: 'Temporary owner read failure.',
          onRetryPrivateStatus: vi.fn(),
        })}
      />
    );

    screen.getByText('Private status may be out of date');
    screen.getByText('22/28');
    screen.getByText('Dueling');
  });

  it('displays last-good declarations as stale but disables every command while authority is invalid', () => {
    const onSelectDeclaration = vi.fn();
    const onEndTurn = vi.fn();
    render(
      <CombatExperience
        {...propsFor(fresh, {
          authorityFresh: false,
          onSelectDeclaration,
          onEndTurn,
        })}
      />
    );

    screen.getByText('Actions may be out of date');
    const attack = screen.getByRole('button', { name: /Longsword/ });
    const move = screen.getByRole('button', { name: /Move/ });
    const end = screen.getByRole('button', { name: /End turn/ });
    expect((attack as HTMLButtonElement).disabled).toBe(true);
    expect((move as HTMLButtonElement).disabled).toBe(true);
    expect((end as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(attack);
    fireEvent.click(move);
    fireEvent.click(end);
    expect(onSelectDeclaration).not.toHaveBeenCalled();
    expect(onEndTurn).not.toHaveBeenCalled();
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
    expect(attack.dataset.attackRef).toBe('dnd5e:weapons:longsword');
    // Refusal copy verbatim, and Move's feet shown as a number -- never
    // converted into a path price.
    expect(tooltipOf(attack).textContent).toContain(
      'Action: 1 needed, 0 left.'
    );
    expect(
      tooltipOf(screen.getByRole('button', { name: /Move/ })).textContent
    ).toContain('10 ft left');
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

  it('keeps canvas rings equivalent to an accessible named target list with native available/unavailable buttons', () => {
    const attack = fresh.declarations.find(
      (declaration) => declaration.verb === Verb.ATTACK
    )!;
    const onTargetClick = vi.fn();
    render(
      <CombatExperience
        {...propsFor(fresh, {
          phase: 'targeting',
          presentationState: {
            ...emptyState,
            armedDeclarationId: attack.id,
          },
          onTargetClick,
        })}
      />
    );

    // Canvas receives exactly the same available subset.
    expect(
      screen.getByRole('button', { name: 'Shared target skeleton-guard' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: 'Shared target skeleton-archer',
      })
    ).toBeNull();

    const list = screen.getByRole('list', { name: 'Longsword targets' });
    const available = screen.getByRole('button', {
      name: /Skeleton Guard.*Available/i,
    });
    const unavailable = screen.getByRole('button', {
      name: /Skeleton Archer.*Unavailable.*outside this attack’s reach/i,
    });
    expect(list.contains(available)).toBe(true);
    expect(list.contains(unavailable)).toBe(true);
    expect((available as HTMLButtonElement).disabled).toBe(false);
    expect((unavailable as HTMLButtonElement).disabled).toBe(true);

    available.focus();
    expect(document.activeElement).toBe(available);
    // A keyboard-initiated native button activation is delivered as click
    // detail=0; no custom key handler is needed or wanted.
    fireEvent.click(available, { detail: 0 });
    fireEvent.click(unavailable);
    expect(onTargetClick).toHaveBeenCalledTimes(1);
    expect(onTargetClick).toHaveBeenCalledWith('skeleton-guard');
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
    expect(css).not.toMatch(/\.combatExperience\s+\.gameFrame\s*\{/);
    expect(css).toMatch(
      /\.combatExperienceFillParent\s+\.gameFrame\s*\{[^}]*height:\s*100%;[^}]*border-radius:\s*0;/s
    );
  });
});

describe('damage toasts', () => {
  it('raises a toast on the map when a hit is revealed, and none before', () => {
    const { rerender } = render(<CombatExperience {...propsFor()} />);
    expect(screen.queryByTestId('damage-toasts')).toBeNull();

    rerender(
      <CombatExperience
        {...propsFor(fresh, {
          result: {
            attackId: 'atk-1',
            actor: 'Aldric Vale',
            target: 'Skeleton Guard',
            action: 'Longsword',
            d20: 18,
            total: 23,
            against: 13,
            hit: true,
            critical: false,
            damage: 8,
            damageType: 'slashing',
            targetIsViewer: false,
          },
        })}
      />
    );

    const toasts = screen.getByTestId('damage-toasts');
    expect(toasts.textContent).toContain('8 slashing damage');
    expect(toasts.textContent).toContain('Skeleton Guard');
    expect(toasts.textContent).toContain('−8');
  });

  it('says nothing on a miss', () => {
    render(
      <CombatExperience
        {...propsFor(fresh, {
          result: {
            attackId: 'atk-2',
            actor: 'Skeleton Guard',
            target: 'Aldric Vale',
            action: 'Shortsword',
            d20: 3,
            total: 5,
            against: 16,
            hit: false,
            critical: false,
            targetIsViewer: true,
          },
        })}
      />
    );
    expect(screen.queryByTestId('damage-toasts')).toBeNull();
  });
});
