import type { EntityState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import type { MoveEntityResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
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
});
