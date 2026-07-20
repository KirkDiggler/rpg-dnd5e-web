import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import type {
  EndTurnResponse,
  InteractResponse,
  MoveEntityResponse,
  SetReactionReadyResponse,
  TakeActionResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import {
  EconomySlot,
  EncounterMode,
  EntityType,
  TargetKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeStream,
  type FakeStream,
} from '../../api/fakeEncounterStream';

function makeEvent(caseName: string, value: unknown): EncounterEvent {
  return { event: { case: caseName, value } } as unknown as EncounterEvent;
}

const hoisted = vi.hoisted(() => ({
  fakeRef: { current: null as FakeStream | null },
  moveEntityFn: vi.fn<() => Promise<MoveEntityResponse>>(),
  takeActionFn: vi.fn<(req: unknown) => Promise<TakeActionResponse>>(),
  endTurnFn: vi.fn<() => Promise<EndTurnResponse>>(),
  setReactionReadyFn:
    vi.fn<(req: unknown) => Promise<SetReactionReadyResponse>>(),
  interactFn: vi.fn<(req: unknown) => Promise<InteractResponse>>(),
}));

vi.mock('../../api/client', () => ({
  encounterClient: {
    streamEncounter: vi.fn(() => {
      if (!hoisted.fakeRef.current) {
        throw new Error('fakeRef.current is null — set it in beforeEach');
      }
      return hoisted.fakeRef.current.iterator;
    }),
    moveEntity: hoisted.moveEntityFn,
    takeAction: hoisted.takeActionFn,
    endTurn: hoisted.endTurnFn,
    setReactionReady: hoisted.setReactionReadyFn,
    interact: hoisted.interactFn,
  },
}));

// EncounterMap wraps HexGrid (Three.js / React Three Fiber), which needs a
// WebGL canvas not available in jsdom. Stub it and expose the turn-order
// props via data-* attributes so this test can assert on the mode-gating fix
// (#445 Copilot review) without rendering WebGL.
vi.mock('./EncounterMap', () => ({
  EncounterMap: (props: {
    initiativeOrder: string[];
    activeEntityId: string;
    myEntityId: string;
    openDoorIds?: string[];
    onMove: (path: Array<{ x: number; y: number; z: number }>) => void;
    onEntityClick: (entityId: string) => void;
    onDoorClick?: (doorId: string) => void;
  }) => (
    <div
      data-testid="encounter-map-stub"
      data-initiative-order={props.initiativeOrder.join(',')}
      data-active-entity-id={props.activeEntityId}
      data-my-entity-id={props.myEntityId}
      data-open-door-ids={(props.openDoorIds ?? []).join(',')}
    >
      <button
        data-testid="stub-move"
        onClick={() => props.onMove([{ x: 1, y: 0, z: -1 }])}
      >
        move
      </button>
      <button
        data-testid="stub-click-goblin"
        onClick={() => props.onEntityClick('goblin-1')}
      >
        click goblin
      </button>
      <button
        data-testid="stub-click-door"
        onClick={() => props.onDoorClick?.('door-1')}
      >
        click door
      </button>
    </div>
  ),
}));

import { EncounterView } from './EncounterView';

beforeEach(() => {
  hoisted.fakeRef.current = createFakeStream();
  hoisted.moveEntityFn.mockReset();
  hoisted.takeActionFn.mockReset();
  hoisted.endTurnFn.mockReset();
  hoisted.setReactionReadyFn.mockReset();
  hoisted.interactFn.mockReset();
});

afterEach(() => {
  hoisted.fakeRef.current = null;
});

describe('EncounterView turn-order props (mode gating)', () => {
  it('passes the live initiative order through to EncounterMap while TURN_BASED', async () => {
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    await act(async () => {
      hoisted.fakeRef.current?.push(makeEvent('snapshotDelivered', {}));
      await Promise.resolve();
    });

    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: 'combat started',
        })
      );
      hoisted.fakeRef.current?.push(
        makeEvent('turnStarted', { entityId: 'char-alice', round: 1 })
      );
      await Promise.resolve();
    });

    const stub = screen.getByTestId('encounter-map-stub');
    expect(stub.getAttribute('data-active-entity-id')).toBe('char-alice');
  });

  it('clears initiativeOrder/activeEntityId from the props passed to EncounterMap when mode leaves TURN_BASED, even though applyModeChanged alone does not clear encounterState (Copilot review #446)', async () => {
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    await act(async () => {
      hoisted.fakeRef.current?.push(makeEvent('snapshotDelivered', {}));
      await Promise.resolve();
    });

    // Enter TURN_BASED with an active turn — the overlay should show it.
    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: 'combat started',
        })
      );
      hoisted.fakeRef.current?.push(
        makeEvent('turnStarted', { entityId: 'char-alice', round: 1 })
      );
      await Promise.resolve();
    });

    let stub = screen.getByTestId('encounter-map-stub');
    expect(stub.getAttribute('data-active-entity-id')).toBe('char-alice');

    // ModeChanged back to FREE_ROAM WITHOUT a follow-up snapshot — the raw
    // encounterState.initiativeOrder/activeEntityId are untouched by
    // applyModeChanged (only mode flips), but EncounterView must still gate
    // what it hands to EncounterMap so the overlay doesn't show stale data.
    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('modeChanged', {
          from: EncounterMode.TURN_BASED,
          to: EncounterMode.FREE_ROAM,
          reason: 'combat ended',
        })
      );
      await Promise.resolve();
    });

    stub = screen.getByTestId('encounter-map-stub');
    expect(stub.getAttribute('data-active-entity-id')).toBe('');
    expect(stub.getAttribute('data-initiative-order')).toBe('');
  });
});

describe('EncounterView resume-after-refresh entity resolution (#444)', () => {
  it('resolves entityId from the snapshot roster when characterId is not supplied', async () => {
    render(
      <EncounterView encounterId="enc-1" playerId="alice" onBack={() => {}} />
    );

    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('snapshotDelivered', {
          encounter: {
            space: {
              entities: [
                {
                  id: 'char-alice-resolved',
                  position: { x: 0, y: 0, z: 0 },
                  type: EntityType.CHARACTER,
                  data: { case: 'character', value: { playerId: 'alice' } },
                },
                {
                  id: 'char-bob',
                  position: { x: 1, y: 0, z: -1 },
                  type: EntityType.CHARACTER,
                  data: { case: 'character', value: { playerId: 'bob' } },
                },
                {
                  id: 'goblin-1',
                  position: { x: 2, y: 0, z: -2 },
                  type: EntityType.MONSTER,
                  data: {
                    case: 'monster',
                    value: { monsterRef: { id: 'goblin' } },
                  },
                },
              ],
            },
          },
        })
      );
      await Promise.resolve();
    });

    const stub = screen.getByTestId('encounter-map-stub');
    expect(stub.getAttribute('data-my-entity-id')).toBe('char-alice-resolved');
  });

  it('prefers the supplied characterId over roster resolution when both are available', async () => {
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-explicit"
        playerId="alice"
        onBack={() => {}}
      />
    );

    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('snapshotDelivered', {
          encounter: {
            space: {
              entities: [
                {
                  id: 'char-alice-resolved',
                  position: { x: 0, y: 0, z: 0 },
                  type: EntityType.CHARACTER,
                  data: { case: 'character', value: { playerId: 'alice' } },
                },
              ],
            },
          },
        })
      );
      await Promise.resolve();
    });

    const stub = screen.getByTestId('encounter-map-stub');
    expect(stub.getAttribute('data-my-entity-id')).toBe('char-explicit');
  });
});

describe('EncounterView ignores interaction before entityId resolves (#461 Copilot review)', () => {
  it('does not call moveEntity when a move is triggered before entityId is resolved', async () => {
    render(
      <EncounterView encounterId="enc-1" playerId="alice" onBack={() => {}} />
    );

    // No snapshot pushed yet — entityId is still unresolved ('').
    fireEvent.click(screen.getByTestId('stub-move'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.moveEntityFn).not.toHaveBeenCalled();
  });

  it('does not call takeAction when a monster is clicked before entityId is resolved', async () => {
    render(
      <EncounterView encounterId="enc-1" playerId="alice" onBack={() => {}} />
    );

    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('snapshotDelivered', {
          encounter: {
            space: {
              entities: [
                {
                  id: 'goblin-1',
                  position: { x: 2, y: 0, z: -2 },
                  type: EntityType.MONSTER,
                  data: {
                    case: 'monster',
                    value: { monsterRef: { id: 'goblin' } },
                  },
                },
              ],
            },
          },
        })
      );
      await Promise.resolve();
    });

    // The snapshot above has no CHARACTER entity for playerId "alice", so
    // entityId is still unresolved ('') even after this snapshot — the
    // realistic shape of the actual race window (goblins can appear on the
    // stream before the player's own character entry is processed).
    fireEvent.click(screen.getByTestId('stub-click-goblin'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.takeActionFn).not.toHaveBeenCalled();
  });
});

describe('EncounterView door click -> Interact bridge (rpg-dnd5e-web#526)', () => {
  it('calls interact(encounterId, doorId, "open") when a door is clicked', async () => {
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    fireEvent.click(screen.getByTestId('stub-click-door'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.interactFn).toHaveBeenCalledOnce();
    expect(hoisted.interactFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        targetEntityId: 'door-1',
        interactionKind: 'open',
      })
    );
  });

  it('is NOT gated on entityId resolution — the door click carries no actor id (unlike move/attack)', async () => {
    // No characterId prop and no snapshot pushed — entityId stays
    // unresolved (''), the realistic race window #461 covers for
    // move/attack. A door interaction has no actor field on the wire
    // (InteractRequest{encounter_id, target_entity_id, interaction_kind}),
    // so it must NOT be blocked by that same guard.
    render(
      <EncounterView encounterId="enc-1" playerId="alice" onBack={() => {}} />
    );

    fireEvent.click(screen.getByTestId('stub-click-door'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.interactFn).toHaveBeenCalledOnce();
  });
});

describe('EncounterView renders condition badges hydrated from the snapshot (#462)', () => {
  it('shows the badge for a condition active before this connect (reconnect scenario)', async () => {
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-bob"
        playerId="bob"
        onBack={() => {}}
      />
    );

    // No live StatusApplied ever fires here — this is the reconnect case:
    // the condition was already active before this stream connection, so
    // the ONLY way the badge can appear is via the snapshot itself.
    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('snapshotDelivered', {
          encounter: {
            space: {
              entities: [
                {
                  id: 'char-bob',
                  position: { x: 0, y: 0, z: 0 },
                  type: EntityType.CHARACTER,
                  data: { case: 'character', value: { playerId: 'bob' } },
                  statusEffects: [
                    {
                      source: {
                        module: 'dnd5e',
                        type: 'conditions',
                        id: 'raging',
                      },
                      displayName: 'Raging',
                    },
                  ],
                },
              ],
            },
          },
        })
      );
      await Promise.resolve();
    });

    // 'raging' has a Synty HUD icon mapped (#467) — the badge renders that
    // PNG instead of the emoji, so assert on the image rather than matching
    // the old emoji-only text content. The icon is decorative (empty alt +
    // aria-hidden) since the visible label right after it already carries
    // the semantics for assistive tech (Copilot review, PR #473).
    const badges = screen.getByTestId('my-status-badges');
    expect(badges.textContent).toContain('Raging');
    const icon = badges.querySelector('img');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('alt')).toBe('');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('src')).toBe(
      '/models/synty/ui/status/ICON_FantasyWarrior_Status_AttackUp01_Clean.png'
    );
  });

  it('shows no badge when the snapshot carries no statusEffects', async () => {
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-bob"
        playerId="bob"
        onBack={() => {}}
      />
    );

    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('snapshotDelivered', {
          encounter: {
            space: {
              entities: [
                {
                  id: 'char-bob',
                  position: { x: 0, y: 0, z: 0 },
                  type: EntityType.CHARACTER,
                  data: { case: 'character', value: { playerId: 'bob' } },
                  statusEffects: [],
                },
              ],
            },
          },
        })
      );
      await Promise.resolve();
    });

    expect(screen.queryByTestId('my-status-badges')).toBeNull();
  });
});

describe('EncounterView reaction-readiness HUD (rpg-dnd5e-web#432 harness-parity)', () => {
  it('arms a reaction via SetReactionReady and optimistically mirrors it as READY (no snapshot round-trip needed)', async () => {
    hoisted.setReactionReadyFn.mockResolvedValue(
      {} as SetReactionReadyResponse
    );

    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    // #525 slice 1: reaction readiness is a SETTING now (Kirk: "opportunity
    // attack is just a setting") — the toggles live behind the gear popover,
    // not in the bar. Open it first.
    fireEvent.click(screen.getByLabelText('Combat settings'));
    const oaToggle = screen.getByTestId(
      'reaction-toggle-dnd5e:conditions:opportunity_attack'
    );
    // rpg-dnd5e-web#519: compact mode abbreviates the visible label ("OA"/
    // "?") — aria-label still carries the full state for assistive tech and
    // is what this test asserts on now.
    expect(oaToggle.getAttribute('aria-label')).toContain('unknown');

    await act(async () => {
      fireEvent.click(oaToggle);
      await Promise.resolve();
    });

    expect(hoisted.setReactionReadyFn).toHaveBeenCalledOnce();
    const request = hoisted.setReactionReadyFn.mock.calls[0]![0] as unknown as {
      encounterId: string;
      characterId: string;
      reactionRef: { module: string; type: string; id: string };
      ready: boolean;
    };
    expect(request.encounterId).toBe('enc-1');
    expect(request.characterId).toBe('char-alice');
    expect(request.reactionRef).toMatchObject({
      module: 'dnd5e',
      type: 'conditions',
      id: 'opportunity_attack',
    });
    expect(request.ready).toBe(true);

    expect(
      screen
        .getByTestId('reaction-toggle-dnd5e:conditions:opportunity_attack')
        .getAttribute('aria-label')
    ).toContain('READY');
  });

  it('surfaces a SetReactionReady RPC error without mirroring the toggle locally', async () => {
    hoisted.setReactionReadyFn.mockRejectedValue(new Error('boom'));

    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('Combat settings'));
    await act(async () => {
      fireEvent.click(
        screen.getByTestId('reaction-toggle-dnd5e:spells:shield')
      );
      await Promise.resolve();
    });

    expect(screen.getByText(/Reaction ready error: boom/)).toBeTruthy();
    expect(
      screen
        .getByTestId('reaction-toggle-dnd5e:spells:shield')
        .getAttribute('aria-label')
    ).toContain('unknown');
  });

  it('disables the reaction toggles while entityId is unresolved (Copilot review #475)', async () => {
    // No characterId prop and no snapshot pushed yet — entityId stays ''
    // for the resume-after-refresh window (matches the #461 pattern this
    // file already tests for ActionMenu/move/attack).
    render(
      <EncounterView encounterId="enc-1" playerId="alice" onBack={() => {}} />
    );

    fireEvent.click(screen.getByLabelText('Combat settings'));
    const oa = screen.getByTestId(
      'reaction-toggle-dnd5e:conditions:opportunity_attack'
    ) as HTMLButtonElement;
    const shield = screen.getByTestId(
      'reaction-toggle-dnd5e:spells:shield'
    ) as HTMLButtonElement;
    expect(oa.disabled).toBe(true);
    expect(shield.disabled).toBe(true);

    fireEvent.click(oa);
    await act(async () => {
      await Promise.resolve();
    });
    expect(hoisted.setReactionReadyFn).not.toHaveBeenCalled();
  });
});

describe('EncounterView combat-log parity with PlaytestHarness (rpg-dnd5e-web#432 harness-parity, wave web#471)', () => {
  it('renders ActionResolved, DeathSaveRolled, and EntityStabilized in the Combat Log panel', async () => {
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('actionResolved', {
          actorEntityId: 'char-alice',
          actionRef: { module: 'dnd5e', type: 'action', id: 'attack' },
          targetEntityId: 'goblin-1',
        })
      );
      hoisted.fakeRef.current?.push(
        makeEvent('deathSaveRolled', {
          entityId: 'char-bob',
          roll: 20,
          successes: 2,
          failures: 0,
          isCriticalSuccess: true,
          regainedConsciousness: true,
          hpRestored: 1,
        })
      );
      hoisted.fakeRef.current?.push(
        makeEvent('entityStabilized', { entityId: 'char-carol' })
      );
      await Promise.resolve();
    });

    // Round 7 (#525 slice 2): the log is OPEN by default — the floating
    // panel is already rendering; assert entries directly.
    expect(screen.getByTestId('floating-log')).toBeTruthy();

    expect(
      screen.getByTestId('combat-log-entry-actionResolved-0').textContent
    ).toContain('char-alice');
    expect(
      screen.getByTestId('combat-log-entry-deathSaveRolled-1').textContent
    ).toContain('nat-20');
    expect(
      screen.getByTestId('combat-log-entry-entityStabilized-2').textContent
    ).toContain('char-carol');
  });

  it('tracks a DoorOpened door id in state.openDoors, verified via EncounterMap.openDoorIds (Copilot review #474)', async () => {
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    // Before the event: openDoorIds is empty, same testid/attribute other
    // wiring tests in this file already use to observe state passed
    // through to EncounterMap (data-active-entity-id, data-my-entity-id).
    expect(
      screen
        .getByTestId('encounter-map-stub')
        .getAttribute('data-open-door-ids')
    ).toBe('');

    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('doorOpened', {
          doorEntityId: 'door-1',
          revealedHexes: [],
          revealedWalls: [],
          removedWalls: [],
        })
      );
      await Promise.resolve();
    });

    // The door id is actually present in state.openDoors (via
    // applyDoorOpened), not just "the view didn't crash" — EncounterMap
    // receives it as a real prop and exposes it on its own DOM, the same
    // way EncounterMap surfaces every other piece of wired-through state.
    expect(
      screen
        .getByTestId('encounter-map-stub')
        .getAttribute('data-open-door-ids')
    ).toBe('door-1');
  });
});

describe('EncounterView action-selection survives stray clicks (rpg-dnd5e-web#511)', () => {
  // Wire-true ref.type: the real menu emits "combat_abilities" (see
  // rpg-api translate_combat) — matters since #525 slice 1, where the dock
  // renders core types flat and folds other types into the grouped menu.
  const HELP_REF = { module: 'dnd5e', type: 'combat_abilities', id: 'help' };

  function enterTurnWithHelpArmable() {
    act(() =>
      hoisted.fakeRef.current?.push(makeEvent('snapshotDelivered', {}))
    );
    act(() =>
      hoisted.fakeRef.current?.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: '',
        })
      )
    );
    act(() =>
      hoisted.fakeRef.current?.push(
        makeEvent('turnStarted', { entityId: 'char-alice', round: 1 })
      )
    );
    act(() =>
      hoisted.fakeRef.current?.push(
        makeEvent('turnStateChanged', {
          turnState: {
            economy: {
              actionsRemaining: 1,
              bonusActionsRemaining: 1,
              reactionsRemaining: 1,
              movementRemaining: 30,
            },
            availableActions: [
              {
                ref: HELP_REF,
                displayName: 'Help',
                available: true,
                unavailableReason: '',
                economySlot: EconomySlot.ACTION,
                targetKind: TargetKind.SINGLE_ENTITY,
              },
            ],
          },
        })
      )
    );
  }

  function renderAtCharAlice() {
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
  }

  it('arms on click without dispatching (no target chosen yet)', async () => {
    renderAtCharAlice();
    enterTurnWithHelpArmable();

    const helpBtn = await screen.findByTestId(
      'action-dnd5e:combat_abilities:help'
    );
    fireEvent.click(helpBtn);
    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.takeActionFn).not.toHaveBeenCalled();
    expect(helpBtn.getAttribute('data-armed')).toBe('true');
  });

  it('survives an exploratory move click (armed action is not cleared)', async () => {
    renderAtCharAlice();
    enterTurnWithHelpArmable();

    const helpBtn = await screen.findByTestId(
      'action-dnd5e:combat_abilities:help'
    );
    fireEvent.click(helpBtn);
    await act(async () => {
      await Promise.resolve();
    });

    // A move click is exploratory relative to the armed action — it can't
    // resolve it (no entity target), so per #511 it must not disarm.
    fireEvent.click(screen.getByTestId('stub-move'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.takeActionFn).not.toHaveBeenCalled();
    expect(helpBtn.getAttribute('data-armed')).toBe('true');
  });

  it('resolves the armed action (not the hardcoded attack shortcut) on the next entity click', async () => {
    hoisted.takeActionFn.mockResolvedValue({} as TakeActionResponse);
    renderAtCharAlice();
    enterTurnWithHelpArmable();

    fireEvent.click(
      await screen.findByTestId('action-dnd5e:combat_abilities:help')
    );
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId('stub-click-goblin'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.takeActionFn).toHaveBeenCalledOnce();
    const request = hoisted.takeActionFn.mock.calls[0]![0] as unknown as {
      actionRef: { module: string; type: string; id: string };
      target: { kind: { case: string; value: string } };
    };
    // The ARMED "help" ref resolved — not ATTACK_ACTION_REF, confirming an
    // explicitly armed action takes priority over the click-a-monster
    // shortcut once one exists.
    expect(request.actionRef).toMatchObject(HELP_REF);
    expect(request.target.kind).toMatchObject({
      case: 'entityId',
      value: 'goblin-1',
    });

    const helpBtn = screen.getByTestId('action-dnd5e:combat_abilities:help');
    expect(helpBtn.getAttribute('data-armed')).toBeNull(); // unarmed = attribute absent (VerbButton)
  });

  it('re-clicking the armed action cancels it (no dispatch)', async () => {
    renderAtCharAlice();
    enterTurnWithHelpArmable();

    const helpBtn = await screen.findByTestId(
      'action-dnd5e:combat_abilities:help'
    );
    fireEvent.click(helpBtn);
    await act(async () => {
      await Promise.resolve();
    });
    expect(helpBtn.getAttribute('data-armed')).toBe('true');

    fireEvent.click(helpBtn);
    await act(async () => {
      await Promise.resolve();
    });

    expect(helpBtn.getAttribute('data-armed')).toBeNull(); // unarmed = attribute absent (VerbButton)
    expect(hoisted.takeActionFn).not.toHaveBeenCalled();
  });

  it('Escape cancels the armed action', async () => {
    renderAtCharAlice();
    enterTurnWithHelpArmable();

    const helpBtn = await screen.findByTestId(
      'action-dnd5e:combat_abilities:help'
    );
    fireEvent.click(helpBtn);
    await act(async () => {
      await Promise.resolve();
    });
    expect(helpBtn.getAttribute('data-armed')).toBe('true');

    fireEvent.keyDown(window, { key: 'Escape' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(helpBtn.getAttribute('data-armed')).toBeNull(); // unarmed = attribute absent (VerbButton)
  });

  it('a rejected dispatch leaves the action armed (retry, not silent disarm)', async () => {
    hoisted.takeActionFn.mockRejectedValue(new Error('illegal target'));
    renderAtCharAlice();
    enterTurnWithHelpArmable();

    fireEvent.click(
      await screen.findByTestId('action-dnd5e:combat_abilities:help')
    );
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByTestId('stub-click-goblin'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.takeActionFn).toHaveBeenCalledOnce();
    const helpBtn = screen.getByTestId('action-dnd5e:combat_abilities:help');
    expect(helpBtn.getAttribute('data-armed')).toBe('true');
    expect(screen.getByText(/Action error: illegal target/)).toBeTruthy();
  });

  it('clears the armed action when the turn ends (Copilot review #514: a stale armed action must not survive past its own turn)', async () => {
    renderAtCharAlice();
    enterTurnWithHelpArmable();

    const helpBtn = await screen.findByTestId(
      'action-dnd5e:combat_abilities:help'
    );
    fireEvent.click(helpBtn);
    await act(async () => {
      await Promise.resolve();
    });
    expect(helpBtn.getAttribute('data-armed')).toBe('true');

    // Someone else's turn starts — combatEnabled (isMyTurn) goes false.
    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('turnStarted', { entityId: 'char-wendy', round: 1 })
      );
      await Promise.resolve();
    });

    // #525 slice 1: spectators get no action surface at all — the verb
    // unmounts (stronger than the old disabled-but-armed-cleared render).
    expect(
      screen.queryByTestId('action-dnd5e:combat_abilities:help')
    ).toBeNull();
    // And the armed action really cleared: a goblin click now takes the
    // basic-attack shortcut path (an armed action would take priority and
    // dispatch HELP_REF instead).
    hoisted.takeActionFn.mockClear();
    fireEvent.click(screen.getByTestId('stub-click-goblin'));
    await act(async () => {
      await Promise.resolve();
    });
    const calls = hoisted.takeActionFn.mock.calls as unknown as Array<
      [{ actionRef: { id: string } }]
    >;
    expect(calls.every(([req]) => req.actionRef.id !== 'help')).toBe(true);
  });

  it('does not stay armed across a full turn handover that round-trips back in ONE batch (rpg-dnd5e-web#544)', async () => {
    // The live repro: END TURN → instant NPC turns → your round-2 turn, all
    // committed at once. A guard on a derived boolean (combatEnabled) never
    // sees the intermediate state. Both new mechanisms catch this shape
    // (the round changed, so the turnKey derivation alone would too); the
    // pocket-reentry test below is the one that ISOLATES the event-level
    // disarm, via a round-trip that lands back on the SAME turnKey.
    renderAtCharAlice();
    enterTurnWithHelpArmable();

    const helpBtn = await screen.findByTestId(
      'action-dnd5e:combat_abilities:help'
    );
    fireEvent.click(helpBtn);
    await act(async () => {
      await Promise.resolve();
    });
    expect(helpBtn.getAttribute('data-armed')).toBe('true');

    // One batch: goblin's turn AND alice's next turn AND the fresh menu.
    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('turnStarted', { entityId: 'char-goblin', round: 1 })
      );
      hoisted.fakeRef.current?.push(
        makeEvent('turnStarted', { entityId: 'char-alice', round: 2 })
      );
      hoisted.fakeRef.current?.push(
        makeEvent('turnStateChanged', {
          turnState: {
            economy: {
              actionsRemaining: 1,
              bonusActionsRemaining: 1,
              reactionsRemaining: 1,
              movementRemaining: 30,
            },
            availableActions: [
              {
                ref: HELP_REF,
                displayName: 'Help',
                available: true,
                unavailableReason: '',
                economySlot: EconomySlot.ACTION,
                targetKind: TargetKind.SINGLE_ENTITY,
              },
            ],
          },
        })
      );
      await Promise.resolve();
    });

    // It's alice's turn again, the verb is back — but NOT armed.
    const helpBtnRound2 = await screen.findByTestId(
      'action-dnd5e:combat_abilities:help'
    );
    expect(helpBtnRound2.getAttribute('data-armed')).not.toBe('true');
    // And a goblin click takes the basic-attack shortcut, not stale HELP.
    hoisted.takeActionFn.mockClear();
    fireEvent.click(screen.getByTestId('stub-click-goblin'));
    await act(async () => {
      await Promise.resolve();
    });
    const round2Calls = hoisted.takeActionFn.mock.calls as unknown as Array<
      [{ actionRef: { id: string } }]
    >;
    expect(round2Calls.every(([req]) => req.actionRef.id !== 'help')).toBe(
      true
    );
  });

  it('does not stay armed across a batched mode exit-and-return with the SAME turn key (rpg-dnd5e-web#544 pocket re-entry)', async () => {
    // Combat pocket clears and a new pocket re-enters with round 1 + alice
    // active again — identical turnKey, so only the event-level disarm on
    // modeChanged can catch this shape.
    renderAtCharAlice();
    enterTurnWithHelpArmable();

    const helpBtn = await screen.findByTestId(
      'action-dnd5e:combat_abilities:help'
    );
    fireEvent.click(helpBtn);
    await act(async () => {
      await Promise.resolve();
    });
    expect(helpBtn.getAttribute('data-armed')).toBe('true');

    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('modeChanged', {
          from: EncounterMode.TURN_BASED,
          to: EncounterMode.FREE_ROAM,
          reason: 'pocket cleared',
        })
      );
      hoisted.fakeRef.current?.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: 'new pocket',
        })
      );
      hoisted.fakeRef.current?.push(
        makeEvent('turnStarted', { entityId: 'char-alice', round: 1 })
      );
      await Promise.resolve();
    });

    const helpBtnAfter = await screen.findByTestId(
      'action-dnd5e:combat_abilities:help'
    );
    expect(helpBtnAfter.getAttribute('data-armed')).not.toBe('true');
  });

  it('an armed POSITION-kind action does not resolve on an entity click (Copilot review #514: entityId is the wrong target shape for POSITION/AREA)', async () => {
    renderAtCharAlice();
    act(() =>
      hoisted.fakeRef.current?.push(makeEvent('snapshotDelivered', {}))
    );
    act(() =>
      hoisted.fakeRef.current?.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: '',
        })
      )
    );
    act(() =>
      hoisted.fakeRef.current?.push(
        makeEvent('turnStarted', { entityId: 'char-alice', round: 1 })
      )
    );
    act(() =>
      hoisted.fakeRef.current?.push(
        makeEvent('turnStateChanged', {
          turnState: {
            economy: {
              actionsRemaining: 1,
              bonusActionsRemaining: 1,
              reactionsRemaining: 1,
              movementRemaining: 30,
            },
            availableActions: [
              {
                ref: {
                  module: 'dnd5e',
                  type: 'combat_abilities',
                  id: 'move-to',
                },
                displayName: 'Move To',
                available: true,
                unavailableReason: '',
                economySlot: EconomySlot.MOVEMENT,
                targetKind: TargetKind.POSITION,
              },
            ],
          },
        })
      )
    );

    const moveBtn = await screen.findByTestId(
      'action-dnd5e:combat_abilities:move-to'
    );
    fireEvent.click(moveBtn);
    await act(async () => {
      await Promise.resolve();
    });
    expect(moveBtn.getAttribute('data-armed')).toBe('true');

    fireEvent.click(screen.getByTestId('stub-click-goblin'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.takeActionFn).not.toHaveBeenCalled();
    expect(
      screen
        .getByTestId('action-dnd5e:combat_abilities:move-to')
        .getAttribute('data-armed')
    ).toBe('true');
  });
});
