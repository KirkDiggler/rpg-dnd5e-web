import { SESSION_COMBAT_FIXTURES } from '@/concepts/session-combat/fixtures';
import {
  ClockKind,
  Verb,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CombatExperience } from './CombatExperience';
import { standingActionsBlocked } from './standingActions';
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
  it('keeps dice UI absent while no local attack roll is armed', () => {
    render(<CombatExperience {...propsFor()} />);

    expect(screen.getByTestId('combat-experience-shell')).toBeTruthy();
    expect(screen.getByTestId('session-combat-initiative')).toBeTruthy();
    expect(screen.getByTestId('session-combat-map')).toBeTruthy();
    expect(screen.getByTestId('session-combat-dock')).toBeTruthy();
    expect(screen.getByTestId('session-combat-log')).toBeTruthy();
    expect(screen.queryByTestId('session-combat-dice-drawer')).toBeNull();
    expect(screen.queryByTestId('local-world-die-tile')).toBeNull();
  });

  it('shows one compact local tile for an armed roller without mounting the legacy tray', () => {
    render(
      <CombatExperience
        {...propsFor(fresh, {
          phase: 'awaiting-roll',
          diceWitnessRole: 'roller',
          onDiceReleaseRequest: vi.fn(),
          onDiceSemanticReleaseRequest: vi.fn(),
        })}
      />
    );

    expect(screen.getByTestId('local-world-die-tile')).toBeTruthy();
    expect(screen.getByText('Shared d20 ready')).toBeTruthy();
    expect(screen.getByLabelText('Shared d20')).toBeTruthy();
    expect(screen.queryByTestId('session-combat-dice-drawer')).toBeNull();
    expect(screen.queryByTestId('real-dice-presentation')).toBeNull();
  });

  it('keeps the local tile actor-only and preserves explicit semantic reveal', () => {
    const onReveal = vi.fn();
    const { rerender } = render(
      <CombatExperience
        {...propsFor(fresh, {
          phase: 'awaiting-roll',
          diceWitnessRole: 'spectator',
        })}
      />
    );
    expect(screen.queryByTestId('local-world-die-tile')).toBeNull();

    rerender(
      <CombatExperience
        {...propsFor(fresh, {
          phase: 'awaiting-roll',
          diceWitnessRole: 'roller',
          diceSemanticFallback: true,
          onDiceReleaseRequest: vi.fn(),
          onDiceSemanticReleaseRequest: onReveal,
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reveal result' }));
    expect(onReveal).toHaveBeenCalledTimes(1);
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

  it('keeps the strike and the downed line out of the log while the die rolls', () => {
    // Kirk 2026-08-28: "the damage and downed is showing in the combat log
    // before the roll has finished". A die IS presented here, so the whole
    // tail from the strike onward waits for it to land.
    render(
      <CombatExperience
        {...propsFor(fresh, {
          // The hold protects the viewer's OWN roll; a spectator has no
          // suspense to keep.
          diceWitnessRole: 'roller',
          diceEvents: [
            {
              schemaVersion: 1,
              type: 'dice-presentation-requested',
              eventId: 'atk-1:request',
              presentationId: 'atk-1',
              roller: { entityId: 'aldric', role: 'player' },
              die: {
                presetId: 'dice.original.carved.d20',
                authoritativeResult: 18,
              },
            },
          ] as never,
          story: [
            {
              id: 'turn-start',
              eyebrow: 'Combat',
              headline: 'Round 2',
              detail: '',
              tone: 'neutral',
            },
            {
              id: 'atk-1',
              eyebrow: 'Aldric Vale · Longsword',
              headline: 'Aldric Vale strikes Skeleton Guard',
              detail: '8 slashing damage',
              tone: 'success',
            },
            {
              id: 'downed-1',
              eyebrow: 'Combat',
              headline: 'Skeleton Guard is downed',
              detail: '',
              tone: 'danger',
            },
          ],
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

    const log = screen.getByTestId('session-combat-log');
    expect(log.textContent).toContain('Round 2');
    expect(log.textContent).not.toContain('strikes Skeleton Guard');
    expect(log.textContent).not.toContain('is downed');
    expect(log.textContent).not.toContain('8 slashing');
    // ...and no toast either, for the same reason.
    expect(screen.queryByTestId('damage-toasts')).toBeNull();
  });
});

describe('Loot, Hold and Leave on the action surface (rpg-project#368)', () => {
  it('draws ONE Loot button per downed body, in the order given', () => {
    // Design P3: every downed body is lootable and the panel neither
    // reorders nor annotates them. A button that named only the captain
    // would say which corpse carries intel.
    render(
      <CombatExperience
        {...propsFor(fresh, {
          lootTargets: [
            { subject: 'skeleton-1', name: 'Skeleton' },
            { subject: 'captain-1', name: 'Skeleton Captain' },
          ],
          onLoot: vi.fn(),
        })}
      />
    );
    const buttons = screen.getAllByTestId(/session-combat-loot-/);
    expect(buttons.map((b) => b.getAttribute('data-testid'))).toEqual([
      'session-combat-loot-skeleton-1',
      'session-combat-loot-captain-1',
    ]);
    // Same shape for both: nothing distinguishes the captain's button.
    expect(buttons[0].textContent).toBe('🖐Loot Skeleton');
    expect(buttons[1].textContent).toBe('🖐Loot Skeleton Captain');
  });

  it('sends the subject the view named, and nothing it computed', () => {
    const onLoot = vi.fn();
    render(
      <CombatExperience
        {...propsFor(fresh, {
          lootTargets: [{ subject: 'captain-1', name: 'Skeleton Captain' }],
          onLoot,
        })}
      />
    );
    fireEvent.click(screen.getByTestId('session-combat-loot-captain-1'));
    expect(onLoot).toHaveBeenCalledWith('captain-1');
  });

  it('draws no Loot button when nothing is down beside the viewer', () => {
    render(<CombatExperience {...propsFor(fresh, { onLoot: vi.fn() })} />);
    expect(screen.queryAllByTestId(/session-combat-loot-/)).toHaveLength(0);
  });

  it('names the prop by its ref and sends its placement id', () => {
    const onHold = vi.fn();
    render(
      <CombatExperience
        {...propsFor(fresh, {
          holdTargets: [{ id: 'heirloom', ref: 'dnd5e:props:reliquary' }],
          onHold,
        })}
      />
    );
    const button = screen.getByTestId('session-combat-hold-heirloom');
    // The button says what the thing IS; the request says which one.
    expect(button.textContent).toContain('Hold the reliquary');
    fireEvent.click(button);
    expect(onHold).toHaveBeenCalledWith('heirloom');
  });

  it('never says “take”, in the label or the tooltip (design R10)', () => {
    render(
      <CombatExperience
        {...propsFor(fresh, {
          holdTargets: [{ id: 'heirloom', ref: 'dnd5e:props:reliquary' }],
          onHold: vi.fn(),
        })}
      />
    );
    const button = screen.getByTestId('session-combat-hold-heirloom');
    expect(button.textContent).not.toMatch(/take/i);
    expect(button.getAttribute('title')).not.toMatch(/take/i);
  });

  it('offers Leave wherever the viewer stands — the server decides what it means', () => {
    // `AtlasExit`'s own law: the exits list is for DRAWING the way out,
    // never for gating it. R9 needs the carrier able to leave from the
    // vault, which is where the artifact then lies.
    const onLeave = vi.fn();
    render(<CombatExperience {...propsFor(fresh, { onLeave })} />);
    const button = screen.getByTestId('session-combat-leave-button');
    expect(button.textContent).toBe('🚪Leave');
    expect(button.getAttribute('title')).toContain('stays where you stood');
    fireEvent.click(button);
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('names what leaving would DROP, before the click', () => {
    // The walk finding (Kirk, 2026-09-04): he left one cell short of the
    // entrance and learned the price afterwards. Away from a way out and
    // carrying something, the button says what it costs.
    render(
      <CombatExperience
        {...propsFor(fresh, { onLeave: vi.fn(), leaveHolding: ['heirloom'] })}
      />
    );
    expect(screen.getByTestId('session-combat-leave-button').textContent).toBe(
      '🚪Leave (drops the heirloom)'
    );
  });

  it('threatens no drop when the viewer is carrying nothing', () => {
    // There is no price to warn about, and a button that claims one is a
    // worse lie than one that stays quiet.
    render(<CombatExperience {...propsFor(fresh, { onLeave: vi.fn() })} />);
    expect(screen.getByTestId('session-combat-leave-button').textContent).toBe(
      '🚪Leave'
    );
  });

  it('on a way out, states what is carried and CLAIMS NOTHING about its safety', () => {
    // The client cannot know which exit the SCENARIO BOUND —
    // `GetAtlasResponse.exits` is every authored way out, structure
    // rather than scenario — so leaving through this one may still drop
    // the artifact. Saying only "Leave through the sally port" would read
    // as reassurance this client has no standing to give, and would be
    // Kirk's walk again with the button covering for it.
    render(
      <CombatExperience
        {...propsFor(fresh, {
          onLeave: vi.fn(),
          leaveExitId: 'entrance',
          leaveHolding: ['heirloom'],
        })}
      />
    );
    const label = screen.getByTestId('session-combat-leave-button').textContent;
    expect(label).toBe('🚪Leave through the entrance with the heirloom');
    // The two facts, and neither promise.
    expect(label).not.toMatch(/safe|keeps|wins/i);
    expect(label).not.toMatch(/drops/i);
  });

  it('names the way out when the viewer is standing on one', () => {
    render(
      <CombatExperience
        {...propsFor(fresh, { onLeave: vi.fn(), leaveExitId: 'front-gate' })}
      />
    );
    // The LABEL is the claim — it is what the player reads. The old
    // `data-exit` attribute went with the skinny button; the dock draws
    // every action the same way, and a bespoke attribute on one of them
    // would be a testing convenience nothing else uses.
    expect(screen.getByTestId('session-combat-leave-button').textContent).toBe(
      '🚪Leave through the front gate'
    );
  });

  it('disables the buttons while their verb is in flight, without hiding them', () => {
    render(
      <CombatExperience
        {...propsFor(fresh, {
          lootTargets: [{ subject: 'captain-1', name: 'Skeleton Captain' }],
          onLoot: vi.fn(),
          lootPending: true,
          holdTargets: [{ id: 'heirloom', ref: 'dnd5e:props:reliquary' }],
          onHold: vi.fn(),
          holdPending: true,
          onLeave: vi.fn(),
          leavePending: true,
        })}
      />
    );
    for (const id of [
      'session-combat-loot-captain-1',
      'session-combat-hold-heirloom',
      'session-combat-leave-button',
    ]) {
      expect((screen.getByTestId(id) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('offers none of the three when the view hands it no handler', () => {
    render(<CombatExperience {...propsFor(fresh)} />);
    expect(screen.queryAllByTestId(/session-combat-loot-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/session-combat-hold-/)).toHaveLength(0);
    expect(screen.queryByTestId('session-combat-leave-button')).toBeNull();
  });
});

describe('the standing verbs live in the action bar (Kirk’s second walk)', () => {
  const withVerbs = (overrides: Partial<CombatExperienceProps> = {}) =>
    propsFor(fresh, {
      onSearch: vi.fn(),
      onLeave: vi.fn(),
      holdTargets: [{ id: 'obelisk', ref: 'dnd5e:props:obelisk' }],
      onHold: vi.fn(),
      ...overrides,
    });

  it('draws them in the dock, not as a skinny row beside it', () => {
    // "these should be buttons like the other actions I can take" — same
    // component, same style, same group as the server's declarations.
    render(<CombatExperience {...withVerbs()} />);
    const group = screen.getByTestId('standing-actions');
    expect(
      group.contains(screen.getByTestId('session-combat-search-button'))
    ).toBe(true);
    expect(
      group.contains(screen.getByTestId('session-combat-hold-obelisk'))
    ).toBe(true);
    expect(
      group.contains(screen.getByTestId('session-combat-leave-button'))
    ).toBe(true);
  });
});

describe('standingActionsBlocked — free on your turn, refused off it', () => {
  const you = 'char-1';
  const yours = [
    { member: you, active: true },
    { member: 'skeleton-1', active: false },
  ] as unknown as Participant[];
  const theirs = [
    { member: you, active: false },
    { member: 'skeleton-1', active: true, name: 'Skeleton' },
  ] as unknown as Participant[];

  it('is free out of combat — there is no turn economy on the world clock', () => {
    expect(standingActionsBlocked(ClockKind.WORLD, you, [], true)).toBeNull();
  });

  it('is free in a fight ON YOUR TURN (design §4.4)', () => {
    // THE WALK FINDING. Every one of Kirk's four runs was inside a fight
    // from round 1, so a dock that only offered these out of combat
    // offered them never — and the obelisk he had authored intel onto was
    // never picked up.
    expect(standingActionsBlocked(ClockKind.TURN, you, yours, true)).toBeNull();
  });

  it('says "Not your turn" off-turn, rather than sending a call that comes back refused', () => {
    expect(standingActionsBlocked(ClockKind.TURN, you, theirs, true)).toBe(
      'Not your turn'
    );
  });

  it('says so while authority is stale, on either clock', () => {
    expect(standingActionsBlocked(ClockKind.WORLD, you, [], false)).toBe(
      'Actions may be out of date'
    );
    expect(standingActionsBlocked(ClockKind.TURN, you, yours, false)).toBe(
      'Actions may be out of date'
    );
  });

  it('says so before the clock is even known', () => {
    expect(standingActionsBlocked(ClockKind.UNSPECIFIED, you, [], true)).toBe(
      'Waiting for authority'
    );
  });
});
