import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import type {
  EndTurnResponse,
  MoveEntityResponse,
  TakeActionResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/service_pb';
import {
  EncounterMode,
  EntityType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { act, render, screen } from '@testing-library/react';
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
  takeActionFn: vi.fn<() => Promise<TakeActionResponse>>(),
  endTurnFn: vi.fn<() => Promise<EndTurnResponse>>(),
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
  }) => (
    <div
      data-testid="encounter-map-stub"
      data-initiative-order={props.initiativeOrder.join(',')}
      data-active-entity-id={props.activeEntityId}
      data-my-entity-id={props.myEntityId}
    />
  ),
}));

import { EncounterView } from './EncounterView';

beforeEach(() => {
  hoisted.fakeRef.current = createFakeStream();
  hoisted.moveEntityFn.mockReset();
  hoisted.takeActionFn.mockReset();
  hoisted.endTurnFn.mockReset();
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
