import type { EntityState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import type {
  EndTurnResponse,
  InteractResponse,
  MoveEntityResponse,
  SubmitCheckResponse,
  TakeActionResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import { EncounterMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeStream,
  type FakeStream,
} from '../../api/fakeEncounterStream2';

function makeEvent(caseName: string, value: unknown): EncounterEvent {
  return { event: { case: caseName, value } } as unknown as EncounterEvent;
}

// vi.hoisted so the mock factory can close over the refs before imports run
const hoisted = vi.hoisted(() => ({
  fakeRef: { current: null as FakeStream | null },
  moveEntityFn: vi.fn<() => Promise<MoveEntityResponse>>(),
  interactFn: vi.fn<() => Promise<InteractResponse>>(),
  takeActionFn: vi.fn<() => Promise<TakeActionResponse>>(),
  endTurnFn: vi.fn<() => Promise<EndTurnResponse>>(),
  submitCheckFn: vi.fn<() => Promise<SubmitCheckResponse>>(),
}));

vi.mock('../../api/client', () => ({
  encounterClientV2: {
    streamEncounter: vi.fn(() => {
      if (!hoisted.fakeRef.current) {
        throw new Error('fakeRef.current is null — set it in beforeEach');
      }
      return hoisted.fakeRef.current.iterator;
    }),
    moveEntity: hoisted.moveEntityFn,
    interact: hoisted.interactFn,
    takeAction: hoisted.takeActionFn,
    endTurn: hoisted.endTurnFn,
    submitCheck: hoisted.submitCheckFn,
  },
}));

// Import the component AFTER vi.mock
import { PlaytestHarness } from './PlaytestHarness';

let fake: FakeStream;

beforeEach(() => {
  fake = createFakeStream();
  hoisted.fakeRef.current = fake;
  hoisted.moveEntityFn.mockReset();
  hoisted.moveEntityFn.mockResolvedValue({} as MoveEntityResponse);
  hoisted.interactFn.mockReset();
  hoisted.interactFn.mockResolvedValue({} as InteractResponse);
  hoisted.takeActionFn.mockReset();
  hoisted.takeActionFn.mockResolvedValue({} as TakeActionResponse);
  hoisted.endTurnFn.mockReset();
  hoisted.endTurnFn.mockResolvedValue({} as EndTurnResponse);
  hoisted.submitCheckFn.mockReset();
  hoisted.submitCheckFn.mockResolvedValue({
    success: true,
    total: 18,
  } as SubmitCheckResponse);

  // Set up URL with both params
  window.history.pushState({}, '', '?encounterId=enc-1&playerId=alice');
});

afterEach(() => {
  hoisted.fakeRef.current = null;
  window.history.pushState({}, '', '/');
});

describe('PlaytestHarness', () => {
  it('renders error when playerId is missing from URL', () => {
    window.history.pushState({}, '', '?encounterId=enc-1');
    render(<PlaytestHarness />);
    // getByText throws if not found — presence is asserted implicitly
    expect(screen.getByText(/playerId.*required/i)).toBeTruthy();
  });

  it('shows encounterId and playerId in the header', () => {
    const { container } = render(<PlaytestHarness />);
    // The header renders encounterId and playerId in separate <strong> elements;
    // check the raw text content of the header div instead.
    const header = container.querySelector('[data-testid="harness-header"]');
    expect(header?.textContent).toContain('enc-1');
    expect(header?.textContent).toContain('alice');
  });

  it('defaults encounterId to dev-encounter when not in URL', () => {
    window.history.pushState({}, '', '?playerId=alice');
    render(<PlaytestHarness />);
    expect(screen.getByText(/dev-encounter/)).toBeTruthy();
  });

  it('shows entity in table after EntityAppeared event', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: {
            id: 'char-alice',
            position: { x: 0, y: 0, z: 0 },
            reason: '',
          },
        })
      )
    );

    await waitFor(() => {
      expect(screen.getByText('char-alice')).toBeTruthy();
    });
  });

  it('updates entity row after EntityMoved event', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: {
            id: 'char-alice',
            position: { x: 0, y: 0, z: 0 },
            reason: '',
          },
        })
      )
    );
    await waitFor(() => expect(screen.getByText('char-alice')).toBeTruthy());

    act(() =>
      fake.push(
        makeEvent('entityMoved', {
          entityId: 'char-alice',
          actualPath: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: -1, z: 0 },
          ],
        })
      )
    );

    // Entity remains in table after move
    await waitFor(() => {
      expect(screen.getByText('char-alice')).toBeTruthy();
    });
  });

  it('calls moveEntity with char-alice entityId and correct path on Move button click', async () => {
    render(<PlaytestHarness />);

    // Seed entity with position so the Move button becomes enabled
    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: {
            id: 'char-alice',
            position: { x: 0, y: 0, z: 0 },
          } as unknown as EntityState,
        })
      )
    );

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /move there/i });
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    });

    // Default inputs are Q=0, R=0, S=0 — click move
    act(() =>
      fireEvent.click(screen.getByRole('button', { name: /move there/i }))
    );

    await waitFor(() => {
      expect(hoisted.moveEntityFn).toHaveBeenCalledOnce();
    });

    // path = [current(0,0,0), target(0,0,0)] — 2 elements
    expect(hoisted.moveEntityFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        entityId: 'char-alice',
        proposedPath: [
          expect.objectContaining({ x: 0, y: 0, z: 0 }),
          expect.objectContaining({ x: 0, y: 0, z: 0 }),
        ],
      })
    );
  });

  it('shows move error when RPC fails', async () => {
    hoisted.moveEntityFn.mockRejectedValue(new Error('network gone'));

    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: { id: 'char-alice', position: { x: 0, y: 0, z: 0 } },
        })
      )
    );

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /move there/i });
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    });

    act(() =>
      fireEvent.click(screen.getByRole('button', { name: /move there/i }))
    );

    await waitFor(() => {
      expect(screen.getByText(/network gone/i)).toBeTruthy();
    });
  });

  it('shows event log entry after EntityMoved', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityMoved', {
          entityId: 'char-alice',
          actualPath: [{ x: 1, y: -1, z: 0 }],
        })
      )
    );

    await waitFor(() => {
      expect(screen.getByText(/EntityMoved/i)).toBeTruthy();
    });
  });

  it('renders the open-door section with input and button disabled by default', () => {
    render(<PlaytestHarness />);
    // The "Open door" heading should render (the button has the same text,
    // so use the role:heading filter to disambiguate)
    expect(screen.getByRole('heading', { name: /^open door$/i })).toBeTruthy();
    expect(screen.getByText(/Open doors \(0\)/)).toBeTruthy();
    const input = screen.getByLabelText(/door id/i) as HTMLInputElement;
    expect(input).toBeTruthy();
    const btn = screen.getByRole('button', {
      name: /open door/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('calls interact RPC with target door id and "open" kind on click', async () => {
    render(<PlaytestHarness />);

    const input = screen.getByLabelText(/door id/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'door-east' } });
    });

    const btn = screen.getByRole('button', {
      name: /open door/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));

    act(() => fireEvent.click(btn));

    await waitFor(() => {
      expect(hoisted.interactFn).toHaveBeenCalledOnce();
    });

    expect(hoisted.interactFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        targetEntityId: 'door-east',
        interactionKind: 'open',
      })
    );
  });

  it('logs DoorOpened and reflects open door in the open-doors list on event', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('doorOpened', {
          doorEntityId: 'door-east',
          revealedHexes: [],
          revealedWalls: [],
          removedWalls: [],
        })
      )
    );

    await waitFor(() => {
      expect(screen.getByText(/DoorOpened door-east/i)).toBeTruthy();
    });
    expect(screen.getByText(/Open doors \(1\):.*door-east/)).toBeTruthy();
  });

  it('logs both DoorOpened and GeometryRevealed independently (cause/effect split)', async () => {
    // Wave 2.7: the toolkit emits the cause (DoorOpened, no hexes) and the
    // effect (GeometryRevealed, with hexes) as two separate events. The
    // harness must surface both in the log; the dispatcher must not collapse
    // them.
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('doorOpened', {
          doorEntityId: 'door-east',
          revealedHexes: [],
          revealedWalls: [],
          removedWalls: [],
        })
      )
    );
    act(() =>
      fake.push(
        makeEvent('geometryRevealed', {
          hexes: [
            { position: { x: 1, y: -1, z: 0 } },
            { position: { x: 2, y: -2, z: 0 } },
          ],
        })
      )
    );

    await waitFor(() => {
      expect(screen.getByText(/DoorOpened door-east/i)).toBeTruthy();
      expect(screen.getByText(/GeometryRevealed 2 hex/i)).toBeTruthy();
    });
  });

  it('shows interact error when RPC fails', async () => {
    hoisted.interactFn.mockRejectedValue(new Error('door is locked'));

    render(<PlaytestHarness />);

    const input = screen.getByLabelText(/door id/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'door-east' } });
    });

    const btn = screen.getByRole('button', {
      name: /open door/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));

    act(() => fireEvent.click(btn));

    await waitFor(() => {
      expect(screen.getByText(/door is locked/i)).toBeTruthy();
    });
  });

  // ---------- Wave 2.8 combat -----------------------------------------------

  it('renders mode + active actor + round in the header', async () => {
    render(<PlaytestHarness />);

    // Header initially shows UNSPECIFIED + (none) + round 0 — pre-stream defaults.
    const header = screen
      .getByTestId('harness-header')
      .textContent?.toLowerCase();
    expect(header).toContain('mode:');
    expect(header).toContain('unspecified');
    expect(header).toContain('active:');
    expect(header).toContain('(none)');
    expect(header).toContain('round:');

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: 'ambush',
        })
      )
    );
    act(() =>
      fake.push(makeEvent('turnStarted', { entityId: 'char-alice', round: 1 }))
    );

    await waitFor(() => {
      const updated = screen
        .getByTestId('harness-header')
        .textContent?.toLowerCase();
      expect(updated).toContain('turn_based');
      expect(updated).toContain('char-alice');
      expect(updated).toContain('round:');
    });
  });

  it('renders the combat section with attack + end turn buttons disabled outside TURN_BASED', () => {
    render(<PlaytestHarness />);

    expect(screen.getByRole('heading', { name: /^combat$/i })).toBeTruthy();
    expect(
      screen.getByText(/combat actions enabled only in TURN_BASED mode/i)
    ).toBeTruthy();
    const attackBtn = screen.getByRole('button', {
      name: /^attack$/i,
    }) as HTMLButtonElement;
    const endTurnBtn = screen.getByRole('button', {
      name: /^end turn$/i,
    }) as HTMLButtonElement;
    expect(attackBtn.disabled).toBe(true);
    expect(endTurnBtn.disabled).toBe(true);
  });

  it('enables combat buttons only when TURN_BASED + active actor is local player', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: '',
        })
      )
    );
    // Wrong active actor: end turn stays disabled.
    act(() =>
      fake.push(makeEvent('turnStarted', { entityId: 'goblin-1', round: 1 }))
    );
    await waitFor(() => {
      const endTurnBtn = screen.getByRole('button', {
        name: /^end turn$/i,
      }) as HTMLButtonElement;
      expect(endTurnBtn.disabled).toBe(true);
      expect(screen.getByText(/waiting for your turn/i)).toBeTruthy();
    });

    // Correct active actor: end turn enables.
    act(() =>
      fake.push(makeEvent('turnStarted', { entityId: 'char-alice', round: 1 }))
    );
    await waitFor(() => {
      const endTurnBtn = screen.getByRole('button', {
        name: /^end turn$/i,
      }) as HTMLButtonElement;
      expect(endTurnBtn.disabled).toBe(false);
    });
  });

  it('calls takeAction with correct request shape on Attack click', async () => {
    render(<PlaytestHarness />);

    // Flip into TURN_BASED + alice's turn so combat enables
    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: '',
        })
      )
    );
    act(() =>
      fake.push(makeEvent('turnStarted', { entityId: 'char-alice', round: 1 }))
    );

    const input = screen.getByLabelText(
      /attack target id/i
    ) as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'goblin-1' } });
    });

    const attackBtn = screen.getByRole('button', {
      name: /^attack$/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(attackBtn.disabled).toBe(false));

    act(() => fireEvent.click(attackBtn));

    await waitFor(() => {
      expect(hoisted.takeActionFn).toHaveBeenCalledOnce();
    });

    expect(hoisted.takeActionFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        actorEntityId: 'char-alice',
        actionRef: expect.objectContaining({
          module: 'dnd5e',
          type: 'action',
          id: 'attack',
        }),
        target: expect.objectContaining({
          kind: expect.objectContaining({
            case: 'entityId',
            value: 'goblin-1',
          }),
        }),
      })
    );
  });

  it('calls endTurn with encounterId + entityId on End turn click', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: '',
        })
      )
    );
    act(() =>
      fake.push(makeEvent('turnStarted', { entityId: 'char-alice', round: 1 }))
    );

    const endTurnBtn = screen.getByRole('button', {
      name: /^end turn$/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(endTurnBtn.disabled).toBe(false));

    act(() => fireEvent.click(endTurnBtn));

    await waitFor(() => {
      expect(hoisted.endTurnFn).toHaveBeenCalledOnce();
    });

    expect(hoisted.endTurnFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        entityId: 'char-alice',
      })
    );
  });

  it('renders HP in entities table row after EntityDamaged event', async () => {
    // HP is now shown inline in the entities table, not a separate HP table.
    // goblin-1 must appear first (EntityAppeared) so it has a row in the table.
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: { id: 'goblin-1', position: { x: 1, y: 0, z: -1 } },
        })
      )
    );
    act(() =>
      fake.push(
        makeEvent('entityDamaged', {
          entityId: 'goblin-1',
          amount: 5,
          hpAfter: { current: 2, max: 7 },
          sourceEntityId: 'char-alice',
        } as unknown as EntityState)
      )
    );

    await waitFor(() => {
      expect(screen.getByText(/EntityDamaged goblin-1/i)).toBeTruthy();
      // HP appears inline in the entity row, not a separate table
      expect(screen.getAllByText('2/7').length).toBeGreaterThan(0);
    });
  });

  it('logs ModeChanged, TurnStarted, EntityDamaged, StatusApplied, TurnEnded independently', async () => {
    // Wave 2.8: each event type is its own line in the harness log. The
    // dispatcher must not collapse them; the log must show the flow.
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: 'ambush',
        })
      )
    );
    act(() =>
      fake.push(makeEvent('turnStarted', { entityId: 'char-alice', round: 1 }))
    );
    act(() =>
      fake.push(
        makeEvent('entityDamaged', {
          entityId: 'goblin-1',
          amount: 5,
          hpAfter: { current: 2, max: 7 },
        })
      )
    );
    act(() =>
      fake.push(
        makeEvent('statusApplied', {
          entityId: 'goblin-1',
          status: {
            source: { module: 'dnd5e', type: 'condition', id: 'frightened' },
            displayName: 'Frightened',
          },
        })
      )
    );
    act(() => fake.push(makeEvent('turnEnded', { entityId: 'char-alice' })));

    await waitFor(() => {
      expect(screen.getByText(/ModeChanged FREE_ROAM/i)).toBeTruthy();
      expect(screen.getByText(/TurnStarted char-alice/i)).toBeTruthy();
      expect(screen.getByText(/EntityDamaged goblin-1/i)).toBeTruthy();
      expect(screen.getByText(/StatusApplied goblin-1/i)).toBeTruthy();
      expect(screen.getByText(/TurnEnded char-alice/i)).toBeTruthy();
    });
  });

  it('shows takeAction error when RPC fails', async () => {
    hoisted.takeActionFn.mockRejectedValue(new Error('not your turn'));

    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: '',
        })
      )
    );
    act(() =>
      fake.push(makeEvent('turnStarted', { entityId: 'char-alice', round: 1 }))
    );

    const input = screen.getByLabelText(
      /attack target id/i
    ) as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'goblin-1' } });
    });

    const attackBtn = screen.getByRole('button', {
      name: /^attack$/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(attackBtn.disabled).toBe(false));

    act(() => fireEvent.click(attackBtn));

    await waitFor(() => {
      expect(screen.getByText(/not your turn/i)).toBeTruthy();
    });
  });

  it('shows endTurn error when RPC fails', async () => {
    hoisted.endTurnFn.mockRejectedValue(new Error('cannot end turn now'));

    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: '',
        })
      )
    );
    act(() =>
      fake.push(makeEvent('turnStarted', { entityId: 'char-alice', round: 1 }))
    );

    const endTurnBtn = screen.getByRole('button', {
      name: /^end turn$/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(endTurnBtn.disabled).toBe(false));

    act(() => fireEvent.click(endTurnBtn));

    await waitFor(() => {
      expect(screen.getByText(/cannot end turn now/i)).toBeTruthy();
    });
  });

  // ---------- Wave 2.8 display fixes (#397, #398, #399, #400) ---------------

  it('shows HP inline in entities table after EntityDamaged (fix #398)', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: { id: 'goblin-1', position: { x: 1, y: 0, z: -1 } },
        })
      )
    );
    act(() =>
      fake.push(
        makeEvent('entityDamaged', {
          entityId: 'goblin-1',
          amount: 3,
          hpAfter: { current: 4, max: 7 },
        })
      )
    );

    await waitFor(() => {
      // HP should appear in the entities table row
      expect(screen.getAllByText('4/7').length).toBeGreaterThan(0);
    });
  });

  it('shows entity type in entities table after EntityAppeared with v1alpha2 entity type (fix #397)', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    // Send an EntityAppeared event with a monster entity carrying type + data
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: {
            id: 'goblin-1',
            type: 2, // EntityType.MONSTER = 2 in v1alpha2
            position: { x: 1, y: 0, z: -1 },
            data: { case: 'monster', value: { monsterRef: { id: 'goblin' } } },
          },
        })
      )
    );

    await waitFor(() => {
      expect(screen.getByText(/MONSTER.*goblin/i)).toBeTruthy();
    });
  });

  it('seeds HP in entities table from EntityAppeared initial hp (fix #397 + #398)', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: {
            id: 'goblin-1',
            type: 2,
            position: { x: 1, y: 0, z: -1 },
            hp: { current: 7, max: 7 },
          },
        })
      )
    );

    await waitFor(() => {
      // Initial HP should appear in the entities table before any damage events
      expect(screen.getAllByText('7/7').length).toBeGreaterThan(0);
    });
  });

  it('highlights active actor row distinctly from local player row (fix #400)', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    // Seed both entities
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: { id: 'char-alice', position: { x: 0, y: 0, z: 0 } },
        })
      )
    );
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: { id: 'goblin-1', position: { x: 1, y: 0, z: -1 } },
        })
      )
    );
    act(() =>
      fake.push(
        makeEvent('modeChanged', {
          from: 0, // FREE_ROAM
          to: 2, // TURN_BASED
          reason: '',
        })
      )
    );
    act(() =>
      fake.push(makeEvent('turnStarted', { entityId: 'goblin-1', round: 1 }))
    );

    await waitFor(() => {
      // The active actor indicator (→) should appear next to goblin-1
      expect(screen.getByText(/→.*goblin-1/)).toBeTruthy();
      // char-alice row should still be present (local player) but not marked active
      expect(screen.getByText('char-alice')).toBeTruthy();
    });
  });

  it('shows initiative order in the header when snapshot carries turn state (fix #399)', async () => {
    render(<PlaytestHarness />);

    // Simulate a SnapshotDelivered event with encounter.turnState populated
    act(() =>
      fake.push(
        makeEvent('snapshotDelivered', {
          encounter: {
            id: 'enc-1',
            mode: 2, // TURN_BASED
            turnState: {
              initiativeOrder: ['char-alice', 'goblin-1'],
              activeEntityId: 'char-alice',
              round: 1,
            },
          },
        })
      )
    );

    await waitFor(() => {
      const header = screen
        .getByTestId('harness-header')
        .textContent?.toLowerCase();
      expect(header).toContain('initiative:');
      expect(header).toContain('char-alice');
      expect(header).toContain('goblin-1');
    });
  });

  it('does not show initiative row in header when no snapshot turn state (fix #399)', () => {
    render(<PlaytestHarness />);
    // No snapshot delivered — initiative order section should be absent
    const header = screen.getByTestId('harness-header');
    expect(header.textContent?.toLowerCase()).not.toContain('initiative:');
  });

  // ---------- Wave 2.9 prompt modal ----------------------------------------

  it('renders skill-check prompt section when interact returns inputRequired', async () => {
    const skillCheckPrompt = {
      inputRequired: {
        kind: {
          case: 'skillCheck',
          value: { dc: 12, ability: 'DEX', tool: undefined },
        },
      },
    } as unknown as InteractResponse;
    hoisted.interactFn.mockResolvedValue(skillCheckPrompt);

    render(<PlaytestHarness />);

    const input = screen.getByLabelText(/door id/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'door-east' } });
    });

    const btn = screen.getByRole('button', {
      name: /open door/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));

    act(() => fireEvent.click(btn));

    await waitFor(() => {
      expect(screen.getByTestId('skill-check-prompt')).toBeTruthy();
    });

    // Verify header text
    expect(screen.getByText(/Skill check: DEX \(DC 12\)/)).toBeTruthy();
    // Roll input and submit button are present
    expect(screen.getByLabelText(/roll \(1-20\)/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /submit roll/i })).toBeTruthy();
  });

  it('calls submitCheck RPC with correct args on submit click', async () => {
    const skillCheckPrompt = {
      inputRequired: {
        kind: {
          case: 'skillCheck',
          value: { dc: 15, ability: 'STR', tool: undefined },
        },
      },
    } as unknown as InteractResponse;
    hoisted.interactFn.mockResolvedValue(skillCheckPrompt);

    render(<PlaytestHarness />);

    const doorInput = screen.getByLabelText(/door id/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(doorInput, { target: { value: 'door-east' } });
    });
    const openBtn = screen.getByRole('button', {
      name: /open door/i,
    }) as HTMLButtonElement;
    await waitFor(() => expect(openBtn.disabled).toBe(false));
    act(() => fireEvent.click(openBtn));

    await waitFor(() =>
      expect(screen.getByTestId('skill-check-prompt')).toBeTruthy()
    );

    // Change the roll value
    const rollInput = screen.getByLabelText(
      /roll \(1-20\)/i
    ) as HTMLInputElement;
    act(() => {
      fireEvent.change(rollInput, { target: { value: '17' } });
    });

    const submitBtn = screen.getByRole('button', { name: /submit roll/i });
    act(() => fireEvent.click(submitBtn));

    await waitFor(() => {
      expect(hoisted.submitCheckFn).toHaveBeenCalledOnce();
    });

    expect(hoisted.submitCheckFn).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: 'enc-1',
        entityId: 'char-alice',
        roll: 17,
      })
    );
  });

  it('shows transient result after submitCheck resolves', async () => {
    const skillCheckPrompt = {
      inputRequired: {
        kind: {
          case: 'skillCheck',
          value: { dc: 12, ability: 'DEX', tool: undefined },
        },
      },
    } as unknown as InteractResponse;
    hoisted.interactFn.mockResolvedValue(skillCheckPrompt);
    hoisted.submitCheckFn.mockResolvedValue({
      success: true,
      total: 18,
    } as SubmitCheckResponse);

    render(<PlaytestHarness />);

    const doorInput = screen.getByLabelText(/door id/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(doorInput, { target: { value: 'door-east' } });
    });
    const openBtn = screen.getByRole('button', { name: /open door/i });
    await waitFor(() =>
      expect((openBtn as HTMLButtonElement).disabled).toBe(false)
    );
    act(() => fireEvent.click(openBtn));

    await waitFor(() =>
      expect(screen.getByTestId('skill-check-prompt')).toBeTruthy()
    );

    const submitBtn = screen.getByRole('button', { name: /submit roll/i });
    act(() => fireEvent.click(submitBtn));

    // Result appears immediately after resolve — the auto-clear timer fires 2s
    // later; we just verify the result text is shown while still pending clear.
    await waitFor(() => {
      expect(screen.getByTestId('prompt-result')).toBeTruthy();
    });
    expect(screen.getByTestId('prompt-result').textContent).toContain(
      'success!'
    );
  });

  it('clears prompt when Dismiss button is clicked', async () => {
    const skillCheckPrompt = {
      inputRequired: {
        kind: {
          case: 'skillCheck',
          value: { dc: 12, ability: 'DEX', tool: undefined },
        },
      },
    } as unknown as InteractResponse;
    hoisted.interactFn.mockResolvedValue(skillCheckPrompt);

    render(<PlaytestHarness />);

    const doorInput = screen.getByLabelText(/door id/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(doorInput, { target: { value: 'door-east' } });
    });
    const openBtn = screen.getByRole('button', { name: /open door/i });
    await waitFor(() =>
      expect((openBtn as HTMLButtonElement).disabled).toBe(false)
    );
    act(() => fireEvent.click(openBtn));

    await waitFor(() =>
      expect(screen.getByTestId('skill-check-prompt')).toBeTruthy()
    );

    // Click Dismiss — prompt should clear immediately
    act(() =>
      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    );

    await waitFor(() => {
      expect(screen.queryByTestId('skill-check-prompt')).toBeNull();
    });
  });

  it('renders unsupported placeholder for dialogue prompt kind', async () => {
    const dialoguePrompt = {
      inputRequired: {
        kind: {
          case: 'dialogue',
          value: { options: [] },
        },
      },
    } as unknown as InteractResponse;
    hoisted.interactFn.mockResolvedValue(dialoguePrompt);

    render(<PlaytestHarness />);

    const doorInput = screen.getByLabelText(/door id/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(doorInput, { target: { value: 'door-east' } });
    });
    const openBtn = screen.getByRole('button', { name: /open door/i });
    await waitFor(() =>
      expect((openBtn as HTMLButtonElement).disabled).toBe(false)
    );
    act(() => fireEvent.click(openBtn));

    await waitFor(() => {
      expect(screen.getByTestId('unsupported-prompt')).toBeTruthy();
    });
    expect(screen.getByTestId('unsupported-prompt').textContent).toContain(
      '2.10+'
    );
  });

  // ---------- Wave 2.10 encounter resolution ----------------------------------

  it('does not render encounter-ended banner before EncounterEnded event', () => {
    render(<PlaytestHarness />);
    expect(screen.queryByTestId('encounter-ended-banner')).toBeNull();
  });

  it('renders encounter-ended banner with reason after EncounterEnded event', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('encounterEnded', { reason: 'all hostiles defeated' })
      )
    );

    await waitFor(() => {
      expect(screen.getByTestId('encounter-ended-banner')).toBeTruthy();
    });
    expect(screen.getByTestId('encounter-ended-banner').textContent).toContain(
      'all hostiles defeated'
    );
  });

  it('renders encounter-ended banner with no reason text when reason is empty', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() => fake.push(makeEvent('encounterEnded', { reason: '' })));

    await waitFor(() => {
      expect(screen.getByTestId('encounter-ended-banner')).toBeTruthy();
    });
    // Banner shows without a colon suffix when reason is empty
    expect(screen.getByTestId('encounter-ended-banner').textContent).toContain(
      'Encounter ended'
    );
  });

  it('logs EncounterEnded event in the event log', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('encounterEnded', { reason: 'all hostiles defeated' })
      )
    );

    await waitFor(() => {
      expect(
        screen.getByText(/EncounterEnded: all hostiles defeated/i)
      ).toBeTruthy();
    });
  });

  it('disables Attack and End-turn buttons after EncounterEnded', async () => {
    render(<PlaytestHarness />);

    // Bring encounter into TURN_BASED with local player's turn active
    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('modeChanged', {
          from: EncounterMode.FREE_ROAM,
          to: EncounterMode.TURN_BASED,
          reason: '',
        })
      )
    );
    act(() =>
      fake.push(makeEvent('turnStarted', { entityId: 'char-alice', round: 1 }))
    );

    // Verify combat buttons enabled first
    const attackInput = screen.getByLabelText(
      /attack target id/i
    ) as HTMLInputElement;
    act(() => {
      fireEvent.change(attackInput, { target: { value: 'goblin-1' } });
    });
    await waitFor(() => {
      expect(
        (
          screen.getByRole('button', {
            name: /^end turn$/i,
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false);
    });

    // Fire EncounterEnded — buttons must disable
    act(() =>
      fake.push(
        makeEvent('encounterEnded', { reason: 'all hostiles defeated' })
      )
    );

    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: /^attack$/i }) as HTMLButtonElement)
          .disabled
      ).toBe(true);
      expect(
        (
          screen.getByRole('button', {
            name: /^end turn$/i,
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true);
    });
  });

  it('removes entity from table after EntityRemoved event', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: { id: 'goblin-1', position: { x: 1, y: 0, z: -1 } },
        })
      )
    );

    await waitFor(() => expect(screen.getByText('goblin-1')).toBeTruthy());

    act(() =>
      fake.push(
        makeEvent('entityRemoved', {
          entityId: 'goblin-1',
          reason: 'destroyed',
        })
      )
    );

    await waitFor(() => {
      expect(screen.queryByText('goblin-1')).toBeNull();
    });
  });

  it('logs EntityDied with killer info in the event log', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityDied', {
          entityId: 'goblin-1',
          killerEntityId: 'char-alice',
        })
      )
    );

    await waitFor(() => {
      expect(
        screen.getByText(/EntityDied goblin-1 by char-alice/i)
      ).toBeTruthy();
    });
  });

  it('logs EntityRemoved in the event log', async () => {
    render(<PlaytestHarness />);

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityRemoved', {
          entityId: 'goblin-1',
          reason: 'destroyed',
        })
      )
    );

    await waitFor(() => {
      expect(
        screen.getByText(/EntityRemoved goblin-1.*destroyed/i)
      ).toBeTruthy();
    });
  });

  it('shows tool name in skill check prompt when tool is set', async () => {
    const promptWithTool = {
      inputRequired: {
        kind: {
          case: 'skillCheck',
          value: {
            dc: 12,
            ability: 'DEX',
            tool: { module: 'dnd5e', type: 'item', id: 'thieves-tools' },
          },
        },
      },
    } as unknown as InteractResponse;
    hoisted.interactFn.mockResolvedValue(promptWithTool);

    render(<PlaytestHarness />);

    const doorInput = screen.getByLabelText(/door id/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(doorInput, { target: { value: 'door-east' } });
    });
    const openBtn = screen.getByRole('button', { name: /open door/i });
    await waitFor(() =>
      expect((openBtn as HTMLButtonElement).disabled).toBe(false)
    );
    act(() => fireEvent.click(openBtn));

    await waitFor(() => {
      expect(screen.getByTestId('skill-check-prompt')).toBeTruthy();
    });
    expect(screen.getByText(/thieves-tools/)).toBeTruthy();
  });
});
