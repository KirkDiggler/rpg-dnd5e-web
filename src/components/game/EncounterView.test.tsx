import type {
  EquipItemResponse,
  UnequipItemResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/character/service_pb';
import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import type {
  EndTurnResponse,
  InteractResponse,
  MoveEntityResponse,
  SetReactionReadyResponse,
  SubmitCheckResponse,
  TakeActionResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import {
  EconomySlot,
  EncounterMode,
  EntityType,
  HexState,
  TargetKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EncounterEventMetadata,
  EncounterStreamOptions,
} from '../../api/encounterStreamDispatch';
import {
  createFakeStream,
  type FakeStream,
} from '../../api/fakeEncounterStream';

function makeEvent(caseName: string, value: unknown): EncounterEvent {
  return { event: { case: caseName, value } } as unknown as EncounterEvent;
}

const hoisted = vi.hoisted(() => ({
  fakeRef: { current: null as FakeStream | null },
  captureStreamCallbacks: false,
  streamCallbacks: null as EncounterStreamOptions | null,
  moveEntityFn: vi.fn<() => Promise<MoveEntityResponse>>(),
  takeActionFn: vi.fn<(req: unknown) => Promise<TakeActionResponse>>(),
  endTurnFn: vi.fn<() => Promise<EndTurnResponse>>(),
  setReactionReadyFn:
    vi.fn<(req: unknown) => Promise<SetReactionReadyResponse>>(),
  interactFn: vi.fn<(req: unknown) => Promise<InteractResponse>>(),
  submitCheckFn: vi.fn<(req: unknown) => Promise<SubmitCheckResponse>>(),
  equipItemFn: vi.fn<(req: unknown) => Promise<EquipItemResponse>>(),
  unequipItemFn: vi.fn<(req: unknown) => Promise<UnequipItemResponse>>(),
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
    submitCheck: hoisted.submitCheckFn,
  },
  characterV2Client: {
    equipItem: hoisted.equipItemFn,
    unequipItem: hoisted.unequipItemFn,
  },
}));

vi.mock('../../api/useEncounterStream', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../api/useEncounterStream')>();
  return {
    ...actual,
    useEncounterStream: (
      ...args: Parameters<typeof actual.useEncounterStream>
    ) => {
      if (hoisted.captureStreamCallbacks) {
        hoisted.streamCallbacks = args[2];
        return { connectionState: 'connected' as const, error: null };
      }
      return actual.useEncounterStream(...args);
    },
  };
});

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
    theme?: string;
    entities: Map<string, { position?: { x: number; y: number; z: number } }>;
    entityHP: Map<string, { current: number; max: number }>;
    onMove: (path: Array<{ x: number; y: number; z: number }>) => void;
    onEntityClick: (entityId: string) => void;
    onDoorClick?: (doorId: string) => void;
    onEntityMovementPresentationComplete?: (
      entityId: string,
      moveSeq: number
    ) => void;
  }) => (
    <div
      data-testid="encounter-map-stub"
      data-initiative-order={props.initiativeOrder.join(',')}
      data-active-entity-id={props.activeEntityId}
      data-my-entity-id={props.myEntityId}
      data-open-door-ids={(props.openDoorIds ?? []).join(',')}
      data-theme={props.theme ?? ''}
      // rpg-dnd5e-web#651: expose the resolved entity->position cache so
      // tests can assert VISIBLE-over-REMEMBERED precedence without
      // reaching into Three.js internals.
      data-entity-positions={JSON.stringify(
        [...props.entities.entries()].map(([id, e]) => [id, e.position])
      )}
      data-entity-hp={JSON.stringify([...props.entityHP.entries()])}
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
      <button
        data-testid="stub-finish-stale-goblin-move"
        onClick={() =>
          props.onEntityMovementPresentationComplete?.('goblin-1', 0)
        }
      >
        finish stale goblin move
      </button>
      <button
        data-testid="stub-finish-goblin-move"
        onClick={() =>
          props.onEntityMovementPresentationComplete?.('goblin-1', 1)
        }
      >
        finish goblin move
      </button>
      <button
        data-testid="stub-finish-goblin-move-2"
        onClick={() =>
          props.onEntityMovementPresentationComplete?.('goblin-1', 2)
        }
      >
        finish goblin move 2
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
  // Default: the unlocked-door answer — an empty InteractResponse. The real
  // RPC always resolves with a message (the prompt field is optional), so
  // leaving this as bare undefined would let a caller that mishandles the
  // response still pass. See the #589 tests below.
  hoisted.interactFn.mockResolvedValue({} as InteractResponse);
  hoisted.submitCheckFn.mockReset();
  hoisted.submitCheckFn.mockResolvedValue({
    success: true,
    total: 18,
  } as SubmitCheckResponse);
  hoisted.equipItemFn.mockReset();
  hoisted.unequipItemFn.mockReset();
});

afterEach(() => {
  hoisted.fakeRef.current = null;
  hoisted.captureStreamCallbacks = false;
  hoisted.streamCallbacks = null;
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

describe('EncounterView theme wiring (rpg-dnd5e-web#558 real-route theme consumption)', () => {
  it("threads a crypt-themed snapshot's Space.theme through to EncounterMap's theme prop", async () => {
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
        makeEvent('snapshotDelivered', {
          encounter: { space: { theme: 'crypt' } },
        })
      );
      await Promise.resolve();
    });

    const stub = screen.getByTestId('encounter-map-stub');
    expect(stub.getAttribute('data-theme')).toBe('crypt');
  });

  it('a snapshot with no theme (the vast majority of dungeons today) passes an empty theme through to EncounterMap — the regression guard for byte-identical default-dungeon rendering', async () => {
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
        makeEvent('snapshotDelivered', { encounter: { space: {} } })
      );
      await Promise.resolve();
    });

    const stub = screen.getByTestId('encounter-map-stub');
    expect(stub.getAttribute('data-theme')).toBe('');
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
              // resolveMyEntityId reads this roster directly off the wire
              // event (case/playerId match) — it never consumes placement,
              // so these entities are deliberately left unplaced (no hexes).
              entities: [
                {
                  id: 'char-alice-resolved',
                  type: EntityType.CHARACTER,
                  data: { case: 'character', value: { playerId: 'alice' } },
                },
                {
                  id: 'char-bob',
                  type: EntityType.CHARACTER,
                  data: { case: 'character', value: { playerId: 'bob' } },
                },
                {
                  id: 'goblin-1',
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

describe('EncounterView snapshot position resolution: VISIBLE beats REMEMBERED (rpg-dnd5e-web#651)', () => {
  // Real regression: rpg-api#732 restates a mover's WHOLE known set (visible
  // + remembered) on every move, so this snapshot's own `hexes` array
  // legitimately carries the SAME entity in both a REMEMBERED hex (their
  // just-vacated one, still listing them per HexRecord's frozen-observation
  // contract) and a VISIBLE hex (where they actually are now) in one event.
  // The old reverse-index loop resolved plain array order, so whichever hex
  // sorted last silently won — this pins that the VISIBLE one always wins,
  // in both orderings.
  function snapshotWith(hexes: unknown[]) {
    return {
      encounter: {
        space: {
          entities: [
            {
              id: 'goblin-1',
              type: EntityType.MONSTER,
              data: {
                case: 'monster',
                value: { monsterRef: { id: 'goblin' } },
              },
            },
          ],
          hexes,
        },
      },
    };
  }

  const rememberedOrigin = {
    position: { x: 0, y: 0, z: 0 },
    state: HexState.REMEMBERED,
    contents: [{ entityId: 'goblin-1', facing: 0 }],
  };
  const visibleDestination = {
    position: { x: 1, y: -1, z: 0 },
    state: HexState.VISIBLE,
    contents: [{ entityId: 'goblin-1', facing: 0 }],
  };

  it('resolves to the VISIBLE hex when the REMEMBERED record sorts LAST in the snapshot', async () => {
    render(
      <EncounterView encounterId="enc-1" playerId="alice" onBack={() => {}} />
    );

    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent(
          'snapshotDelivered',
          snapshotWith([visibleDestination, rememberedOrigin])
        )
      );
      await Promise.resolve();
    });

    const stub = screen.getByTestId('encounter-map-stub');
    const positions = JSON.parse(
      stub.getAttribute('data-entity-positions')!
    ) as Array<[string, { x: number; y: number; z: number } | undefined]>;
    const goblinPosition = positions.find(([id]) => id === 'goblin-1')?.[1];
    expect(goblinPosition).toMatchObject({ x: 1, y: -1, z: 0 });
  });

  it('resolves to the VISIBLE hex when the REMEMBERED record sorts FIRST in the snapshot', async () => {
    render(
      <EncounterView encounterId="enc-1" playerId="alice" onBack={() => {}} />
    );

    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent(
          'snapshotDelivered',
          snapshotWith([rememberedOrigin, visibleDestination])
        )
      );
      await Promise.resolve();
    });

    const stub = screen.getByTestId('encounter-map-stub');
    const positions = JSON.parse(
      stub.getAttribute('data-entity-positions')!
    ) as Array<[string, { x: number; y: number; z: number } | undefined]>;
    const goblinPosition = positions.find(([id]) => id === 'goblin-1')?.[1];
    expect(goblinPosition).toMatchObject({ x: 1, y: -1, z: 0 });
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

describe('EncounterView locked-door skill-check prompt (rpg-dnd5e-web#589)', () => {
  // A locked door answers Interact with InputRequired{skill_check} on the RPC
  // RESPONSE. That is the ONLY delivery channel for it: rpg-api's interact.go
  // behavior contract says the prompt is "caller-private (no broker event)",
  // and the server's PublishInputRequired is only ever called for *reaction*
  // prompts (take_action.go). Nothing re-delivers it either — the Encounter
  // snapshot message carries no prompt field, so a reconnect resync can't
  // recover one.
  //
  // That makes dropping the response a soft-lock, not a cosmetic miss: the
  // prompt is persisted server-side, so every subsequent verb is refused with
  // "resolve the pending prompt before issuing another action" while the
  // player sees no prompt at all. That is the live bug in #589.
  function lockedDoorResponse(): InteractResponse {
    return {
      inputRequired: {
        kind: { case: 'skillCheck', value: { dc: 12, ability: 'DEX' } },
      },
    } as unknown as InteractResponse;
  }

  it('renders the skill-check prompt carried on the Interact response', async () => {
    hoisted.interactFn.mockResolvedValue(lockedDoorResponse());

    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    fireEvent.click(screen.getByTestId('stub-click-door'));

    await waitFor(() =>
      expect(screen.getByTestId('skill-check-prompt')).toBeTruthy()
    );
    expect(screen.getByText(/Skill check: DEX \(DC 12\)/)).toBeTruthy();
    // The roll + submit path must be reachable — a visible prompt with no
    // way to resolve it is the same soft-lock wearing a hat. rpg-dnd5e-web
    // #597 replaced the hand-typed roll with a real client-rolled d20 — see
    // the "rolls a real d20" describe block below for that behavior.
    expect(screen.getByTestId('rolled-value')).toBeTruthy();
    expect(screen.getByRole('button', { name: /submit roll/i })).toBeTruthy();
  });

  it('offers no Dismiss escape hatch — the prompt blocks server-side and there is no cancel verb', async () => {
    // PromptModal's Dismiss only clears CLIENT state. The server-side
    // PendingPrompt survives it, so dismissing in the real game silently
    // re-enters the exact soft-lock this issue is about. There is no cancel
    // RPC to wire it to (SubmitCheck is the only resolver), so the real game
    // route must not present the button at all. The playtest harness keeps it
    // deliberately — see PromptModal's allowDismiss prop.
    hoisted.interactFn.mockResolvedValue(lockedDoorResponse());

    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    fireEvent.click(screen.getByTestId('stub-click-door'));

    await waitFor(() =>
      expect(screen.getByTestId('skill-check-prompt')).toBeTruthy()
    );
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
  });

  it('leaves no prompt up for an unlocked door (empty InteractResponse)', async () => {
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

    expect(screen.queryByTestId('skill-check-prompt')).toBeNull();
  });
});

describe('EncounterView rolls a real d20 for skill checks (rpg-dnd5e-web#597)', () => {
  // The pre-#597 bug: PromptModal's skill-check branch was a bare
  // <input type="number"> defaulting to 10 — the player typed their own
  // roll and the server accepted it outright. The real game route must
  // instead roll a real d20 client-side, show it, and submit exactly that
  // value. (The playtest harness keeps the typed input on purpose — see
  // PlaytestHarness.test.tsx — since its tests depend on forcing specific
  // rolls; that path is unaffected by this describe block.)
  function lockedDoorResponse(): InteractResponse {
    return {
      inputRequired: {
        kind: { case: 'skillCheck', value: { dc: 12, ability: 'DEX' } },
      },
    } as unknown as InteractResponse;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows no editable roll input — the value is not hand-typed', async () => {
    hoisted.interactFn.mockResolvedValue(lockedDoorResponse());

    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    fireEvent.click(screen.getByTestId('stub-click-door'));

    await waitFor(() =>
      expect(screen.getByTestId('skill-check-prompt')).toBeTruthy()
    );

    const promptEl = screen.getByTestId('skill-check-prompt');
    expect(promptEl.querySelector('input')).toBeNull();
  });

  it('submits the client-rolled value, and shows the player that same value', async () => {
    // Deterministic under test — rollD20 is Math.random-backed by default,
    // so pin the RNG rather than depending on real Math.random output.
    // 0.65 -> Math.floor(0.65 * 20) + 1 = 14.
    vi.spyOn(Math, 'random').mockReturnValue(0.65);
    hoisted.interactFn.mockResolvedValue(lockedDoorResponse());

    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    fireEvent.click(screen.getByTestId('stub-click-door'));

    await waitFor(() =>
      expect(screen.getByTestId('skill-check-prompt')).toBeTruthy()
    );

    // The rolled value shown to the player...
    const rolledEl = screen.getByTestId('rolled-value');
    expect(rolledEl.textContent).toContain('14');

    fireEvent.click(screen.getByRole('button', { name: /submit roll/i }));

    // ...is exactly the value submitted to the server.
    await waitFor(() => {
      expect(hoisted.submitCheckFn).toHaveBeenCalledOnce();
    });
    expect(hoisted.submitCheckFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        entityId: 'char-alice',
        roll: 14,
      })
    );
  });

  it('rolls a value within [1, 20] regardless of the RNG draw', async () => {
    hoisted.interactFn.mockResolvedValue(lockedDoorResponse());

    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    fireEvent.click(screen.getByTestId('stub-click-door'));

    await waitFor(() =>
      expect(screen.getByTestId('skill-check-prompt')).toBeTruthy()
    );

    const rolled = Number(
      screen.getByTestId('rolled-value').textContent?.match(/\d+/)?.[0]
    );
    expect(rolled).toBeGreaterThanOrEqual(1);
    expect(rolled).toBeLessThanOrEqual(20);
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
              hexes: [
                {
                  position: { x: 0, y: 0, z: 0 },
                  contents: [{ entityId: 'char-bob' }],
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
                  type: EntityType.CHARACTER,
                  data: { case: 'character', value: { playerId: 'bob' } },
                  statusEffects: [],
                },
              ],
              hexes: [
                {
                  position: { x: 0, y: 0, z: 0 },
                  contents: [{ entityId: 'char-bob' }],
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

describe('EncounterView equip/unequip (rpg-dnd5e-web#571)', () => {
  function pushCharacterSnapshot() {
    act(() =>
      hoisted.fakeRef.current?.push(
        makeEvent('snapshotDelivered', {
          encounter: {
            space: {
              entities: [
                {
                  id: 'char-alice',
                  type: EntityType.CHARACTER,
                  data: {
                    case: 'character',
                    value: {
                      playerId: 'alice',
                      equipped: {
                        main_hand: {
                          module: 'dnd5e',
                          type: 'item',
                          id: 'longsword',
                        },
                      },
                      inventory: [
                        {
                          ref: {
                            module: 'dnd5e',
                            type: 'item',
                            id: 'longsword',
                          },
                          name: 'Longsword',
                          statLine: '1d8 slashing',
                          iconKey: '',
                          kind: 'weapon',
                          slotKeys: ['main_hand', 'off_hand'],
                        },
                        {
                          ref: { module: 'dnd5e', type: 'item', id: 'shield' },
                          name: 'Shield',
                          statLine: '+2 AC',
                          iconKey: '',
                          kind: 'shield',
                          slotKeys: ['off_hand'],
                        },
                      ],
                      slots: [
                        {
                          key: 'main_hand',
                          displayLabel: 'Main hand',
                          accepts: ['weapon'],
                        },
                        {
                          key: 'off_hand',
                          displayLabel: 'Off hand',
                          accepts: ['weapon', 'shield'],
                        },
                      ],
                      armorClassDetail: { total: 16, note: '16 base' },
                      mainHandDamage: '1d8 slashing',
                    },
                  },
                },
              ],
              hexes: [
                {
                  position: { x: 0, y: 0, z: 0 },
                  contents: [{ entityId: 'char-alice' }],
                },
              ],
            },
          },
        })
      )
    );
  }

  it('a rejected EquipItem leaves the equipment display unchanged and surfaces an error', async () => {
    hoisted.equipItemFn.mockRejectedValue(new Error('item not in inventory'));
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    pushCharacterSnapshot();
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByLabelText('Open equipment'));
    const shieldRow = screen.getByTestId(
      'inv-dnd5e:item:shield'
    ) as HTMLButtonElement;
    fireEvent.click(shieldRow);
    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.equipItemFn).toHaveBeenCalledOnce();
    // No optimistic update: handleEquipIntent only calls
    // applyCharacterEquipment on RPC success, so a rejected call leaves
    // the snapshot-hydrated state exactly as it was — main hand still
    // Longsword, off hand still empty, shield still carried.
    expect(
      screen.getByLabelText('Main hand: Longsword — click to unequip')
    ).toBeTruthy();
    expect(screen.getByLabelText('Off hand: empty')).toBeTruthy();
    expect(screen.getByTestId('inv-dnd5e:item:shield')).toBeTruthy();
    expect(screen.getByText(/Equip error: item not in inventory/)).toBeTruthy();
  });

  it('a rejected UnequipItem leaves the equipped slot unchanged and surfaces an error', async () => {
    hoisted.unequipItemFn.mockRejectedValue(new Error('slot already empty'));
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    pushCharacterSnapshot();
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByLabelText('Open equipment'));
    fireEvent.click(
      screen.getByLabelText('Main hand: Longsword — click to unequip')
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(hoisted.unequipItemFn).toHaveBeenCalledOnce();
    expect(
      screen.getByLabelText('Main hand: Longsword — click to unequip')
    ).toBeTruthy();
    expect(screen.getByText(/Equip error: slot already empty/)).toBeTruthy();
  });
});

describe('EncounterView combat pacing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const attack = (overrides = {}) =>
    makeEvent('attackResolved', {
      attackerEntityId: 'char-alice',
      targetEntityId: 'goblin-1',
      attackRoll: 14,
      attackBonus: 5,
      targetAc: 16,
      hit: true,
      critical: false,
      ...overrides,
    });

  it('keeps a snapshot-resolved local attack viewer-controlled when callbacks batch before commit', async () => {
    hoisted.captureStreamCallbacks = true;
    render(
      <EncounterView encounterId="enc-1" playerId="alice" onBack={() => {}} />
    );

    const callbacks = hoisted.streamCallbacks;
    if (!callbacks)
      throw new Error('EncounterView did not subscribe to the stream');

    // Invoke both callbacks in one synchronous act. The snapshot resolves
    // Alice's entity id, but React cannot commit that state update before the
    // immediately following AttackResolved callback runs.
    act(() => {
      callbacks.onSnapshotDelivered?.(
        {
          encounter: {
            space: {
              entities: [
                {
                  id: 'char-alice-resolved',
                  type: EntityType.CHARACTER,
                  data: { case: 'character', value: { playerId: 'alice' } },
                },
              ],
            },
          },
        } as never,
        {} as never
      );
      callbacks.onAttackResolved?.(
        {
          attackerEntityId: 'char-alice-resolved',
          targetEntityId: 'goblin-1',
          attackRoll: 14,
          attackBonus: 5,
          targetAc: 16,
          hit: true,
          critical: false,
        } as never,
        {} as never
      );
    });

    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
  });

  it('keeps queued attack outcomes FIFO and advances from viewer to autoplay attack without later-log leakage', async () => {
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
      hoisted.fakeRef.current?.push(attack());
      hoisted.fakeRef.current?.push(
        attack({ attackerEntityId: 'npc-1', hit: false, attackRoll: 8 })
      );
      await Promise.resolve();
    });
    expect(screen.queryByTestId('combat-log-entry-attack-0')).toBeNull();
    expect(screen.queryByTestId('combat-log-entry-attack-1')).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    act(() => vi.advanceTimersByTime(2000 + 1600 + 900 + 300));
    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.getByTestId('combat-log-entry-attack-0')).toBeTruthy();
    expect(screen.queryByTestId('combat-log-entry-attack-1')).toBeNull();
    expect(
      screen.getByTestId('combat-presentation').getAttribute('data-beat')
    ).toBe('cue');
    act(() => vi.advanceTimersByTime(300));
    act(() => vi.advanceTimersByTime(2000));
    expect(
      screen.getByTestId('combat-presentation').getAttribute('data-beat')
    ).toBe('verdict');
    expect(screen.getByTestId('combat-log-entry-attack-1')).toBeTruthy();
  });

  it('waits for the attacking actor current move instance and ignores stale movement completion', () => {
    hoisted.captureStreamCallbacks = true;
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    const callbacks = hoisted.streamCallbacks;
    if (!callbacks) throw new Error('stream callbacks not captured');

    act(() => {
      callbacks.onSnapshotDelivered?.(
        {
          encounter: {
            space: {
              entities: [{ id: 'goblin-1', type: EntityType.MONSTER }],
              hexes: [
                {
                  position: { x: 0, y: 0, z: 0 },
                  contents: [{ entityId: 'goblin-1' }],
                },
              ],
            },
          },
        } as never,
        {} as never
      );
      callbacks.onEntityMoved?.(
        {
          entityId: 'goblin-1',
          actualPath: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: -1, z: 0 },
          ],
        } as never,
        {} as never
      );
      callbacks.onAttackResolved?.(
        {
          attackerEntityId: 'goblin-1',
          targetEntityId: 'char-alice',
          attackRoll: 12,
          attackBonus: 4,
          targetAc: 14,
          hit: true,
          critical: false,
        } as never,
        {} as never
      );
    });

    expect(screen.queryByTestId('combat-presentation')).toBeNull();
    fireEvent.click(screen.getByTestId('stub-finish-stale-goblin-move'));
    expect(screen.queryByTestId('combat-presentation')).toBeNull();
    fireEvent.click(screen.getByTestId('stub-finish-goblin-move'));
    expect(screen.getByTestId('combat-presentation')).toBeTruthy();
  });

  it('accepts the production moveSeq after a presentation flush instead of restarting a local generation', () => {
    hoisted.captureStreamCallbacks = true;
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    const callbacks = hoisted.streamCallbacks;
    if (!callbacks) throw new Error('stream callbacks not captured');

    act(() => {
      callbacks.onSnapshotDelivered?.(
        {
          encounter: {
            space: {
              entities: [{ id: 'goblin-1', type: EntityType.MONSTER }],
              hexes: [
                {
                  position: { x: 0, y: 0, z: 0 },
                  contents: [{ entityId: 'goblin-1' }],
                },
              ],
            },
          },
        } as never,
        {} as never
      );
      callbacks.onEntityMoved?.(
        {
          entityId: 'goblin-1',
          actualPath: [{ x: 1, y: -1, z: 0 }],
        } as never,
        {} as never
      );
    });
    fireEvent.click(screen.getByTestId('stub-finish-goblin-move'));
    act(() => {
      callbacks.onModeChanged?.(
        {
          from: EncounterMode.TURN_BASED,
          to: EncounterMode.FREE_ROAM,
        } as never,
        {} as never
      );
      callbacks.onEntityMoved?.(
        {
          entityId: 'goblin-1',
          actualPath: [{ x: 2, y: -2, z: 0 }],
        } as never,
        {} as never
      );
      callbacks.onAttackResolved?.(
        {
          attackerEntityId: 'goblin-1',
          targetEntityId: 'char-alice',
          hit: false,
          critical: false,
          attackRoll: 7,
          attackBonus: 4,
          targetAc: 14,
        } as never,
        {} as never
      );
    });

    expect(screen.queryByTestId('combat-presentation')).toBeNull();
    fireEvent.click(screen.getByTestId('stub-finish-goblin-move'));
    expect(screen.queryByTestId('combat-presentation')).toBeNull();
    fireEvent.click(screen.getByTestId('stub-finish-goblin-move-2'));
    expect(screen.getByTestId('combat-presentation')).toBeTruthy();
  });

  it('keeps an already-known removed monster as a tombstone through lethal impact, then releases current removal behavior', () => {
    hoisted.captureStreamCallbacks = true;
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    const callbacks = hoisted.streamCallbacks;
    if (!callbacks) throw new Error('stream callbacks not captured');
    const metadata = {
      sequence: 2n,
      timestamp: undefined,
      correlationId: 'corr-lethal',
    } as EncounterEventMetadata;

    act(() => {
      callbacks.onSnapshotDelivered?.(
        {
          encounter: {
            space: {
              entities: [
                {
                  id: 'goblin-1',
                  type: EntityType.MONSTER,
                  hp: { current: 5, max: 5, temp: 0 },
                },
              ],
              hexes: [
                {
                  position: { x: 2, y: -2, z: 0 },
                  contents: [{ entityId: 'goblin-1' }],
                },
              ],
            },
          },
        } as never,
        {} as never
      );
    });
    act(() => {
      callbacks.onAttackResolved?.(
        {
          attackerEntityId: 'char-alice',
          targetEntityId: 'goblin-1',
          attackRoll: 18,
          attackBonus: 5,
          targetAc: 12,
          hit: true,
          critical: false,
        } as never,
        metadata
      );
      callbacks.onEntityDamaged?.(
        {
          entityId: 'goblin-1',
          sourceEntityId: 'char-alice',
          amount: 5,
          damageBreakdown: [],
          hpAfter: { current: 0, max: 5, temp: 0 },
        } as never,
        metadata
      );
      callbacks.onEntityDied?.(
        { entityId: 'goblin-1', killerEntityId: 'char-alice' } as never,
        metadata
      );
      callbacks.onEntityRemoved?.(
        { entityId: 'goblin-1', reason: 'dead' } as never,
        metadata
      );
    });

    const map = screen.getByTestId('encounter-map-stub');
    expect(map.getAttribute('data-entity-positions')).toContain('goblin-1');
    expect(map.getAttribute('data-entity-hp')).toContain('"current":5');

    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    act(() => vi.advanceTimersByTime(2000 + 1600));
    expect(map.getAttribute('data-entity-positions')).toContain('goblin-1');
    expect(map.getAttribute('data-entity-hp')).toContain('"current":0');
    expect(screen.getByTestId('combat-log-entry-removed-3')).toBeTruthy();

    act(() => vi.advanceTimersByTime(900 + 300));
    expect(map.getAttribute('data-entity-positions')).not.toContain('goblin-1');
  });

  it('keeps canonical HP current while releasing visible HP, damage, and correlated logs together at impact', async () => {
    hoisted.captureStreamCallbacks = true;
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );

    const callbacks = hoisted.streamCallbacks;
    if (!callbacks) {
      throw new Error('EncounterView did not capture stream callbacks');
    }

    const snapshotMeta: EncounterEventMetadata = {
      sequence: 1n,
      timestamp: undefined,
      correlationId: 'corr-snapshot',
    };
    const attackMeta: EncounterEventMetadata = {
      sequence: 2n,
      timestamp: undefined,
      correlationId: 'corr-attack-7',
    };
    const damageMeta: EncounterEventMetadata = {
      sequence: 3n,
      timestamp: undefined,
      correlationId: 'corr-attack-7',
    };

    act(() => {
      callbacks.onSnapshotDelivered?.(
        {
          encounter: {
            space: {
              entities: [
                {
                  id: 'char-alice',
                  type: EntityType.CHARACTER,
                  hp: { current: 20, max: 20, temp: 0 },
                },
              ],
              hexes: [
                {
                  position: { x: 0, y: 0, z: 0 },
                  contents: [{ entityId: 'char-alice' }],
                },
              ],
            },
          },
        } as never,
        snapshotMeta
      );
      callbacks.onAttackResolved?.(
        {
          attackerEntityId: 'goblin-1',
          targetEntityId: 'char-alice',
          attackRoll: 14,
          attackBonus: 5,
          targetAc: 16,
          hit: true,
          critical: false,
        } as never,
        attackMeta
      );
      callbacks.onEntityDamaged?.(
        {
          entityId: 'char-alice',
          sourceEntityId: 'goblin-1',
          amount: 7,
          damageType: { module: 'dnd5e', type: 'damage', id: 'slashing' },
          damageBreakdown: [],
          hpAfter: { current: 13, max: 20, temp: 0 },
        } as never,
        damageMeta
      );
    });

    // Canonical hp_after has already reached useEncounterState, while the
    // visible projection and correlated log remain at the pre-impact story.
    expect(screen.getByTitle('HP 20/20')).toBeTruthy();
    expect(screen.queryByTestId('combat-log-entry-attack-0')).toBeNull();
    expect(screen.queryByTestId('combat-log-entry-damage-1')).toBeNull();
    expect(screen.queryByTestId('beat-damage')).toBeNull();

    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByTestId('beat-damage')).toBeNull();
    act(() => vi.advanceTimersByTime(2000 + 1600));
    expect(
      screen.getByTestId('combat-presentation').getAttribute('data-beat')
    ).toBe('impact');
    expect(screen.getByTestId('beat-damage').textContent).toContain('7 damage');
    expect(screen.getByTitle('HP 13/20')).toBeTruthy();
    expect(screen.getByTestId('combat-log-entry-attack-0')).toBeTruthy();
    expect(screen.getByTestId('combat-log-entry-damage-1')).toBeTruthy();
  });

  it('drains a final-enemy terminal burst through its result beat instead of flushing on EncounterEnded', () => {
    hoisted.captureStreamCallbacks = true;
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    const callbacks = hoisted.streamCallbacks;
    if (!callbacks) throw new Error('stream callbacks not captured');
    const metadata = {
      sequence: 10n,
      timestamp: undefined,
      correlationId: 'corr-final-enemy',
    } as EncounterEventMetadata;
    act(() => {
      callbacks.onSnapshotDelivered?.(
        {
          encounter: {
            space: {
              entities: [
                {
                  id: 'goblin-1',
                  type: EntityType.MONSTER,
                  hp: { current: 4, max: 4, temp: 0 },
                },
              ],
              hexes: [
                {
                  position: { x: 1, y: -1, z: 0 },
                  contents: [{ entityId: 'goblin-1' }],
                },
              ],
            },
          },
        } as never,
        {} as never
      );
      callbacks.onAttackResolved?.(
        {
          attackerEntityId: 'char-alice',
          targetEntityId: 'goblin-1',
          hit: true,
          critical: false,
          attackRoll: 19,
        } as never,
        metadata
      );
      callbacks.onEntityDamaged?.(
        {
          entityId: 'goblin-1',
          sourceEntityId: 'char-alice',
          amount: 4,
          damageBreakdown: [],
          hpAfter: { current: 0, max: 4, temp: 0 },
        } as never,
        metadata
      );
      callbacks.onEntityDied?.(
        { entityId: 'goblin-1', killerEntityId: 'char-alice' } as never,
        metadata
      );
      callbacks.onEntityRemoved?.(
        { entityId: 'goblin-1', reason: 'dead' } as never,
        metadata
      );
      callbacks.onEncounterEnded?.(
        { reason: 'all hostiles defeated' } as never,
        { ...metadata, correlationId: '' }
      );
    });

    expect(screen.getByTestId('combat-presentation')).toBeTruthy();
    expect(
      screen
        .getByTestId('encounter-map-stub')
        .getAttribute('data-entity-positions')
    ).toContain('goblin-1');
    expect(screen.queryByTestId('encounter-ended-banner')).toBeNull();
    expect(screen.queryByText('Encounter ended')).toBeNull();
    expect(screen.queryByTestId('combat-log-entry-attack-0')).toBeNull();
    expect(
      screen.queryByTestId('combat-log-entry-encounterEnded-4')
    ).toBeNull();

    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    act(() => vi.advanceTimersByTime(2000 + 1600));
    expect(screen.getByTestId('combat-log-entry-attack-0')).toBeTruthy();
    expect(screen.getByTestId('combat-log-entry-damage-1')).toBeTruthy();
    expect(screen.getByTestId('combat-log-entry-died-2')).toBeTruthy();
    expect(screen.getByTestId('combat-log-entry-removed-3')).toBeTruthy();
    expect(
      screen.getByTestId('combat-log-entry-encounterEnded-4')
    ).toBeTruthy();
    expect(screen.getByTestId('encounter-ended-banner')).toBeTruthy();
    expect(
      screen
        .getByTestId('encounter-map-stub')
        .getAttribute('data-entity-positions')
    ).toContain('goblin-1');

    act(() => vi.advanceTimersByTime(900));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByTestId('combat-presentation')).toBeNull();
    expect(
      screen
        .getByTestId('encounter-map-stub')
        .getAttribute('data-entity-positions')
    ).not.toContain('goblin-1');
  });

  it('releases delayed correlated damage and terminal envelopes when they arrive after the result beat without double-releasing the lifecycle', () => {
    hoisted.captureStreamCallbacks = true;
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    const callbacks = hoisted.streamCallbacks;
    if (!callbacks) throw new Error('stream callbacks not captured');
    const metadata = {
      sequence: 2n,
      timestamp: undefined,
      correlationId: 'corr-delayed',
    } as EncounterEventMetadata;
    act(() => {
      callbacks.onSnapshotDelivered?.(
        {
          encounter: {
            space: {
              entities: [
                {
                  id: 'char-alice',
                  type: EntityType.CHARACTER,
                  hp: { current: 20, max: 20, temp: 0 },
                },
              ],
              hexes: [
                {
                  position: { x: 0, y: 0, z: 0 },
                  contents: [{ entityId: 'char-alice' }],
                },
              ],
            },
          },
        } as never,
        {} as never
      );
      callbacks.onAttackResolved?.(
        {
          attackerEntityId: 'goblin-1',
          targetEntityId: 'char-alice',
          hit: true,
          critical: false,
          attackRoll: 17,
          attackBonus: 4,
          targetAc: 14,
        } as never,
        metadata
      );
    });
    act(() => vi.advanceTimersByTime(300));
    act(() => vi.advanceTimersByTime(2000));
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByTestId('combat-log-entry-attack-0')).toBeTruthy();

    act(() => {
      callbacks.onEntityDamaged?.(
        {
          entityId: 'char-alice',
          sourceEntityId: 'goblin-1',
          amount: 20,
          damageBreakdown: [],
          hpAfter: { current: 0, max: 20, temp: 0 },
        } as never,
        metadata
      );
      callbacks.onEntityDied?.(
        { entityId: 'char-alice', killerEntityId: 'goblin-1' } as never,
        metadata
      );
      callbacks.onEntityRemoved?.(
        { entityId: 'char-alice', reason: 'dead' } as never,
        metadata
      );
    });

    expect(screen.getByTestId('combat-log-entry-damage-1')).toBeTruthy();
    expect(screen.getByTestId('combat-log-entry-died-2')).toBeTruthy();
    expect(screen.getByTestId('combat-log-entry-removed-3')).toBeTruthy();
    expect(screen.getByTitle('HP 0/20')).toBeTruthy();
    act(() => vi.advanceTimersByTime(900 + 300));
    expect(screen.queryByTestId('combat-presentation')).toBeNull();
  });

  it.each(['', 'corr-reused'])(
    'uses entity identity when correlation %j cannot distinguish queued attacks',
    (correlationId) => {
      hoisted.captureStreamCallbacks = true;
      render(
        <EncounterView
          encounterId="enc-1"
          characterId="char-alice"
          playerId="alice"
          onBack={() => {}}
        />
      );
      const callbacks = hoisted.streamCallbacks;
      if (!callbacks) throw new Error('stream callbacks not captured');
      const emptyMetadata = {
        sequence: 1n,
        timestamp: undefined,
        correlationId,
      } as EncounterEventMetadata;
      act(() => {
        callbacks.onAttackResolved?.(
          {
            attackerEntityId: 'char-alice',
            targetEntityId: 'goblin-1',
            hit: true,
            critical: false,
            attackRoll: 16,
          } as never,
          emptyMetadata
        );
        callbacks.onAttackResolved?.(
          {
            attackerEntityId: 'char-alice',
            targetEntityId: 'goblin-2',
            hit: true,
            critical: false,
            attackRoll: 18,
          } as never,
          emptyMetadata
        );
        // Reverse outcome arrival makes correlation-only first-unfilled matching
        // attach goblin-2's damage to goblin-1's theater.
        callbacks.onEntityDamaged?.(
          {
            entityId: 'goblin-2',
            sourceEntityId: 'char-alice',
            amount: 8,
            damageBreakdown: [],
            hpAfter: { current: 2, max: 10, temp: 0 },
          } as never,
          emptyMetadata
        );
        callbacks.onEntityDamaged?.(
          {
            entityId: 'goblin-1',
            sourceEntityId: 'char-alice',
            amount: 3,
            damageBreakdown: [],
            hpAfter: { current: 7, max: 10, temp: 0 },
          } as never,
          emptyMetadata
        );
      });
      act(() => vi.advanceTimersByTime(300));
      fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
      act(() => vi.advanceTimersByTime(2000 + 1600));
      expect(screen.getByTestId('beat-damage').textContent).toContain(
        '3 damage'
      );
      act(() => vi.advanceTimersByTime(900));
      act(() => vi.advanceTimersByTime(300));
      act(() => vi.advanceTimersByTime(300));
      fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
      act(() => vi.advanceTimersByTime(2000));
      act(() => vi.advanceTimersByTime(1600));
      expect(screen.getByTestId('beat-damage').textContent).toContain(
        '8 damage'
      );
    }
  );

  it('binds same-entity uncorrelated death/removal to the most recent damage story in stream order', () => {
    hoisted.captureStreamCallbacks = true;
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    const callbacks = hoisted.streamCallbacks;
    if (!callbacks) throw new Error('stream callbacks not captured');
    const metadata = {
      sequence: 1n,
      timestamp: undefined,
      correlationId: 'corr-shared',
    } as EncounterEventMetadata;
    act(() => {
      callbacks.onSnapshotDelivered?.(
        {
          encounter: {
            space: {
              entities: [
                {
                  id: 'goblin-1',
                  type: EntityType.MONSTER,
                  hp: { current: 10, max: 10, temp: 0 },
                },
              ],
              hexes: [
                {
                  position: { x: 1, y: -1, z: 0 },
                  contents: [{ entityId: 'goblin-1' }],
                },
              ],
            },
          },
        } as never,
        metadata
      );
      for (const attackRoll of [14, 19]) {
        callbacks.onAttackResolved?.(
          {
            attackerEntityId: 'char-alice',
            targetEntityId: 'goblin-1',
            hit: true,
            critical: false,
            attackRoll,
          } as never,
          metadata
        );
      }
      callbacks.onEntityDamaged?.(
        {
          entityId: 'goblin-1',
          sourceEntityId: 'char-alice',
          amount: 3,
          damageBreakdown: [],
          hpAfter: { current: 7, max: 10, temp: 0 },
        } as never,
        metadata
      );
      callbacks.onEntityDamaged?.(
        {
          entityId: 'goblin-1',
          sourceEntityId: 'char-alice',
          amount: 7,
          damageBreakdown: [],
          hpAfter: { current: 0, max: 10, temp: 0 },
        } as never,
        metadata
      );
      callbacks.onEntityDied?.(
        { entityId: 'goblin-1', killerEntityId: 'char-alice' } as never,
        { ...metadata, correlationId: '' }
      );
      callbacks.onEntityRemoved?.(
        { entityId: 'goblin-1', reason: 'dead' } as never,
        { ...metadata, correlationId: '' }
      );
    });

    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    act(() => vi.advanceTimersByTime(2000 + 1600));
    expect(screen.getByTestId('beat-damage').textContent).toContain('3 damage');
    expect(screen.queryByTestId('combat-log-entry-died-2')).toBeNull();
    expect(screen.queryByTestId('combat-log-entry-removed-3')).toBeNull();
    expect(
      screen
        .getByTestId('encounter-map-stub')
        .getAttribute('data-entity-positions')
    ).toContain('goblin-1');

    act(() => vi.advanceTimersByTime(900));
    act(() => vi.advanceTimersByTime(300));
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    act(() => vi.advanceTimersByTime(2000 + 1600));
    expect(screen.getByTestId('beat-damage').textContent).toContain('7 damage');
    expect(screen.getByTestId('combat-log-entry-died-4')).toBeTruthy();
    expect(screen.getByTestId('combat-log-entry-removed-5')).toBeTruthy();
    expect(
      screen
        .getByTestId('encounter-map-stub')
        .getAttribute('data-entity-positions')
    ).toContain('goblin-1');

    act(() => vi.advanceTimersByTime(900));
    act(() => vi.advanceTimersByTime(300));
    expect(
      screen
        .getByTestId('encounter-map-stub')
        .getAttribute('data-entity-positions')
    ).not.toContain('goblin-1');
  });

  it('holds queued terminal-story banner, dock, log, and tombstone until that story result', () => {
    hoisted.captureStreamCallbacks = true;
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    const callbacks = hoisted.streamCallbacks;
    if (!callbacks) throw new Error('stream callbacks not captured');
    const firstMetadata = {
      sequence: 1n,
      timestamp: undefined,
      correlationId: 'corr-first',
    } as EncounterEventMetadata;
    const terminalMetadata = {
      sequence: 2n,
      timestamp: undefined,
      correlationId: 'corr-terminal',
    } as EncounterEventMetadata;
    const emptyTerminalMetadata = {
      sequence: 3n,
      timestamp: undefined,
      correlationId: '',
    } as EncounterEventMetadata;
    act(() => {
      callbacks.onSnapshotDelivered?.(
        {
          encounter: {
            space: {
              entities: [
                {
                  id: 'goblin-2',
                  type: EntityType.MONSTER,
                  hp: { current: 5, max: 5, temp: 0 },
                },
              ],
              hexes: [
                {
                  position: { x: 2, y: -2, z: 0 },
                  contents: [{ entityId: 'goblin-2' }],
                },
              ],
            },
          },
        } as never,
        firstMetadata
      );
      callbacks.onAttackResolved?.(
        {
          attackerEntityId: 'char-alice',
          targetEntityId: 'goblin-1',
          hit: false,
          critical: false,
          attackRoll: 4,
        } as never,
        firstMetadata
      );
      callbacks.onAttackResolved?.(
        {
          attackerEntityId: 'char-alice',
          targetEntityId: 'goblin-2',
          hit: true,
          critical: false,
          attackRoll: 18,
        } as never,
        terminalMetadata
      );
      callbacks.onEntityDamaged?.(
        {
          entityId: 'goblin-2',
          sourceEntityId: 'char-alice',
          amount: 5,
          damageBreakdown: [],
          hpAfter: { current: 0, max: 5, temp: 0 },
        } as never,
        terminalMetadata
      );
      callbacks.onEntityDied?.(
        { entityId: 'goblin-2', killerEntityId: 'char-alice' } as never,
        emptyTerminalMetadata
      );
      callbacks.onEntityRemoved?.(
        { entityId: 'goblin-2', reason: 'dead' } as never,
        emptyTerminalMetadata
      );
      callbacks.onEncounterEnded?.(
        { reason: 'all hostiles defeated' } as never,
        emptyTerminalMetadata
      );
    });

    expect(screen.queryByText(/Encounter ended/)).toBeNull();
    expect(
      screen.queryByTestId('combat-log-entry-encounterEnded-5')
    ).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByTestId('beat-verdict').textContent).toContain('MISS');
    expect(screen.queryByText(/Encounter ended/)).toBeNull();
    act(() => vi.advanceTimersByTime(1600));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByText(/Encounter ended/)).toBeNull();

    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    act(() => vi.advanceTimersByTime(2000));
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getByTestId('encounter-ended-banner')).toBeTruthy();
    expect(
      screen.getByTestId('combat-log-entry-encounterEnded-5')
    ).toBeTruthy();
    expect(
      screen
        .getByTestId('encounter-map-stub')
        .getAttribute('data-entity-positions')
    ).toContain('goblin-2');
    act(() => vi.advanceTimersByTime(900));
    act(() => vi.advanceTimersByTime(300));
    expect(
      screen
        .getByTestId('encounter-map-stub')
        .getAttribute('data-entity-positions')
    ).not.toContain('goblin-2');
  });

  it.each([
    ['snapshotDelivered', {}],
    [
      'modeChanged',
      {
        from: EncounterMode.TURN_BASED,
        to: EncounterMode.FREE_ROAM,
        reason: 'leave combat',
      },
    ],
    ['encounterEnded', { reason: 'complete' }],
  ])(
    'flushes staged outcome exactly once on %s without leaking its log',
    async (caseName, value) => {
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
        hoisted.fakeRef.current?.push(attack());
        await Promise.resolve();
      });
      await act(async () => {
        hoisted.fakeRef.current?.push(makeEvent(caseName, value));
        await Promise.resolve();
      });
      act(() => vi.runAllTimers());
      expect(screen.queryByTestId('combat-presentation')).toBeNull();
      expect(screen.queryByTestId('combat-log-entry-attack-0')).toBeNull();
    }
  );

  it('keeps theater through normal turn boundaries', async () => {
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
      hoisted.fakeRef.current?.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: 'combat started',
        })
      );
      hoisted.fakeRef.current?.push(
        attack({ attackerEntityId: 'npc-1', hit: false, attackRoll: 8 })
      );
      hoisted.fakeRef.current?.push(
        makeEvent('turnEnded', { entityId: 'npc-1', round: 1 })
      );
      hoisted.fakeRef.current?.push(
        makeEvent('turnStarted', { entityId: 'char-alice', round: 2 })
      );
      await Promise.resolve();
    });
    expect(
      screen
        .getByTestId('encounter-map-stub')
        .getAttribute('data-active-entity-id')
    ).toBe('char-alice');
    expect(
      screen.getByTestId('combat-presentation').getAttribute('data-beat')
    ).toBe('cue');
    act(() => vi.advanceTimersByTime(300 + 2000));
    expect(screen.getByTestId('beat-verdict').textContent).toContain('MISS');
  });

  it('does not intercept the existing map click while theater is armed', async () => {
    hoisted.takeActionFn.mockResolvedValue({} as TakeActionResponse);
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
        makeEvent('snapshotDelivered', {
          encounter: {
            space: {
              entities: [
                {
                  id: 'goblin-1',
                  type: EntityType.MONSTER,
                  data: {
                    case: 'monster',
                    value: { monsterRef: { id: 'goblin' } },
                  },
                },
              ],
              hexes: [
                {
                  position: { x: 1, y: 0, z: -1 },
                  contents: [{ entityId: 'goblin-1' }],
                },
              ],
            },
          },
        })
      );
      hoisted.fakeRef.current?.push(attack());
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByTestId('stub-click-goblin'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByTestId('combat-presentation-overlay').style.pointerEvents
    ).toBe('none');
    expect(hoisted.takeActionFn).toHaveBeenCalledOnce();
  });

  it('cancels timer callbacks on unmount', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const view = render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    await act(async () => {
      hoisted.fakeRef.current?.push(makeEvent('snapshotDelivered', {}));
      hoisted.fakeRef.current?.push(attack());
      await Promise.resolve();
    });
    view.unmount();
    act(() => vi.runAllTimers());
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
