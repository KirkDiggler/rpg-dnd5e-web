import { create } from '@bufbuild/protobuf';
import { EntityStateSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { EntityType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { EncounterMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEncounterState } from '../hooks/useEncounterState';
import { hexKey, protoPositionToHex } from '../utils/hexCoord';
import { createFakeStream, type FakeStream } from './fakeEncounterStream';
import { v2PositionToV1 } from './positionConvert';

function makeEvent(caseName: string, value: unknown): EncounterEvent {
  return { event: { case: caseName, value } } as unknown as EncounterEvent;
}

const hoisted = vi.hoisted(() => ({
  fakeRef: { current: null as FakeStream | null },
}));

vi.mock('./client', () => ({
  encounterClient: {
    streamEncounter: vi.fn(() => hoisted.fakeRef.current!.iterator),
  },
}));

import { useEncounterStream } from './useEncounterStream';

let fake: FakeStream;
beforeEach(() => {
  fake = createFakeStream();
  hoisted.fakeRef.current = fake;
});
afterEach(() => {
  hoisted.fakeRef.current = null;
});

/**
 * Test harness — exactly mirrors LobbyView's v2 wiring (Task 7.3) so the
 * integration test exercises the same callback graph the production code uses.
 * Returns the encounter state directly for assertions.
 */
function useTestHarness(encounterId: string) {
  const state = useEncounterState();
  useEncounterStream(encounterId, 'alice', {
    onSnapshotDelivered: () => {
      /* noop — payload empty in slice 1, just a sync barrier */
    },
    onEntityMoved: (e) => {
      // rpg-dnd5e-web#542: mirrors EncounterView.tsx's real wiring — pass
      // the whole actualPath, not just its last element, so state.entities
      // carries movePath/moveSeq for HexEntity's walk-clip interpolation.
      const last = e.actualPath[e.actualPath.length - 1];
      if (last)
        state.applyEntityPositionUpdate(
          e.entityId,
          v2PositionToV1(last),
          e.actualPath.map(v2PositionToV1)
        );
    },
    onGeometryRevealed: (e) => {
      const positions = e.hexes
        .map((h) => h.position)
        .filter((p): p is NonNullable<typeof p> => p !== undefined);
      state.applyHexRevealed(positions.map(protoPositionToHex));
    },
    onEntityAppeared: (e) => {
      if (!e.entity || !e.entity.position) return;
      const stub = create(EntityStateSchema, {
        entityId: e.entity.id,
        position: v2PositionToV1(e.entity.position),
        entityType: EntityType.UNSPECIFIED,
      });
      state.applyEntityAppeared(stub);
    },
    onEntityDisappeared: (e) => {
      if (e.lastKnownPosition) {
        state.applyEntityDisappeared(
          e.entityId,
          protoPositionToHex(e.lastKnownPosition)
        );
      }
    },
    onDoorOpened: (e) => {
      state.applyDoorOpened(e.doorEntityId);
    },
    onEntityDamaged: (e) => {
      state.applyEntityDamaged(e);
    },
    onStatusApplied: (e) => {
      state.applyStatusApplied(e);
    },
    onModeChanged: (e) => {
      state.applyModeChanged(e);
    },
    onTurnStarted: (e) => {
      state.applyTurnStarted(e);
    },
    onTurnEnded: () => {
      state.applyTurnEnded();
    },
  });
  return state.state;
}

describe('useEncounterStream + useEncounterState — integration', () => {
  it('EntityMoved teleports the entity to last hex of actual_path', async () => {
    const { result } = renderHook(() => useTestHarness('enc-1'));

    // Stream up
    act(() => fake.push(makeEvent('snapshotDelivered', {})));

    // Seed alice via EntityAppeared so subsequent move has a target
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: { id: 'alice', position: { x: 0, y: 0, z: 0 }, reason: '' },
        })
      )
    );
    await waitFor(() => {
      expect(result.current.entities.has('alice')).toBe(true);
    });

    act(() =>
      fake.push(
        makeEvent('entityMoved', {
          entityId: 'alice',
          actualPath: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: -1, z: 0 },
            { x: 2, y: -2, z: 0 },
          ],
        })
      )
    );
    await waitFor(() => {
      // v2PositionToV1 uses create(PositionSchema) which adds $typeName;
      // individual field assertions avoid proto-branding false negatives.
      const pos = result.current.entities.get('alice')?.position;
      expect(pos?.x).toBe(2);
      expect(pos?.y).toBe(-2);
      expect(pos?.z).toBe(0);
      // rpg-dnd5e-web#542: the full 3-hex actualPath also lands in
      // movePath/moveSeq for HexEntity's walk-clip interpolation to
      // consume — this is the real end-to-end path from wire event to
      // state, not just the unit-level mergeEntityPosition contract.
      const entity = result.current.entities.get('alice');
      expect(entity?.movePath).toHaveLength(3);
      expect(entity?.movePath?.[2]).toMatchObject({ x: 2, y: -2, z: 0 });
      expect(entity?.moveSeq).toBe(1);
    });
  });

  it('EntityDisappeared marks ghost and updates position to last_known', async () => {
    const { result } = renderHook(() => useTestHarness('enc-1'));

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: { id: 'goblin', position: { x: 1, y: -1, z: 0 } },
        })
      )
    );
    act(() =>
      fake.push(
        makeEvent('entityDisappeared', {
          entityId: 'goblin',
          lastKnownPosition: { x: 3, y: -2, z: -1 },
        })
      )
    );

    await waitFor(() => {
      const g = result.current.entities.get('goblin');
      expect(g?.ghost).toBe(true);
      // applyEntityDisappeared uses create(PositionSchema) which adds $typeName;
      // individual field assertions avoid proto-branding false negatives.
      expect(g?.position?.x).toBe(3);
      expect(g?.position?.y).toBe(-2);
      expect(g?.position?.z).toBe(-1);
    });
  });

  it('GeometryRevealed adds to revealedHexes set', async () => {
    const { result } = renderHook(() => useTestHarness('enc-1'));

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    // GeometryRevealed.hexes is Hex[]; each Hex wraps a Position via .position.
    act(() =>
      fake.push(
        makeEvent('geometryRevealed', {
          hexes: [
            { position: { x: 5, y: -3, z: -2 }, terrain: 0 },
            { position: { x: 6, y: -3, z: -3 }, terrain: 0 },
          ],
          walls: [],
        })
      )
    );

    await waitFor(() => {
      expect(
        result.current.revealedHexes.has(hexKey({ q: 5, r: -3, s: -2 }))
      ).toBe(true);
      expect(
        result.current.revealedHexes.has(hexKey({ q: 6, r: -3, s: -3 }))
      ).toBe(true);
    });
  });

  it('DoorOpened + GeometryRevealed flow into both openDoors and revealedHexes (cause/effect split)', async () => {
    // Wave 2.7: the toolkit emits DoorOpened (cause, no hex data) and a
    // parallel GeometryRevealed (effect, with newly-visible hexes). The two
    // reducers must update independently — door state on one, hex set on the
    // other — without either swallowing the other.
    const { result } = renderHook(() => useTestHarness('enc-1'));

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
          hexes: [{ position: { x: 4, y: -2, z: -2 } }],
        })
      )
    );

    await waitFor(() => {
      expect(result.current.openDoors.has('door-east')).toBe(true);
      expect(
        result.current.revealedHexes.has(hexKey({ q: 4, r: -2, s: -2 }))
      ).toBe(true);
    });
  });

  it('appear → move → disappear → appear sequence settles cleanly', async () => {
    const { result } = renderHook(() => useTestHarness('enc-1'));

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: { id: 'mover', position: { x: 0, y: 0, z: 0 } },
        })
      )
    );
    await waitFor(() => {
      expect(result.current.entities.get('mover')?.ghost).toBeFalsy();
    });

    act(() =>
      fake.push(
        makeEvent('entityMoved', {
          entityId: 'mover',
          actualPath: [
            { x: 0, y: 0, z: 0 },
            { x: 1, y: -1, z: 0 },
          ],
        })
      )
    );
    await waitFor(() => {
      // v2PositionToV1 uses create(PositionSchema) which adds $typeName;
      // individual field assertions avoid proto-branding false negatives.
      const pos = result.current.entities.get('mover')?.position;
      expect(pos?.x).toBe(1);
      expect(pos?.y).toBe(-1);
      expect(pos?.z).toBe(0);
    });

    act(() =>
      fake.push(
        makeEvent('entityDisappeared', {
          entityId: 'mover',
          lastKnownPosition: { x: 2, y: -1, z: -1 },
        })
      )
    );
    await waitFor(() => {
      const m = result.current.entities.get('mover');
      expect(m?.ghost).toBe(true);
      // applyEntityDisappeared uses create(PositionSchema) which adds $typeName;
      // individual field assertions avoid proto-branding false negatives.
      expect(m?.position?.x).toBe(2);
      expect(m?.position?.y).toBe(-1);
      expect(m?.position?.z).toBe(-1);
    });

    act(() =>
      fake.push(
        makeEvent('entityAppeared', {
          entity: { id: 'mover', position: { x: 5, y: -3, z: -2 } },
        })
      )
    );
    await waitFor(() => {
      const m = result.current.entities.get('mover');
      expect(m?.ghost).toBeFalsy();
      // v2PositionToV1 uses create(PositionSchema) which adds $typeName;
      // individual field assertions avoid proto-branding false negatives.
      expect(m?.position?.x).toBe(5);
      expect(m?.position?.y).toBe(-3);
      expect(m?.position?.z).toBe(-2);
      // rpg-dnd5e-web#542: the earlier move's movePath/moveSeq must NOT
      // survive the disappear→reappear round-trip — a revive that kept
      // them would make HexEntity's useHexMovePath think a fresh move
      // just started on reconnect, animating a walk from nowhere.
      expect(m?.movePath).toBeUndefined();
      expect(m?.moveSeq).toBeUndefined();
    });
  });

  it('combat sequence: ModeChanged → TurnStarted → EntityDamaged → StatusApplied → TurnEnded', async () => {
    // Wave 2.8: a player's combat round threads five distinct event types
    // through the dispatcher into the unified state. Verifies the dispatch
    // graph wires every reducer correctly and the v2 combat delta state
    // accumulates as expected.
    const { result } = renderHook(() => useTestHarness('enc-1'));

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
    await waitFor(() => {
      expect(result.current.mode).toBe(EncounterMode.TURN_BASED);
    });

    act(() =>
      fake.push(
        makeEvent('turnStarted', {
          entityId: 'alice',
          round: 1,
        })
      )
    );
    await waitFor(() => {
      expect(result.current.activeEntityId).toBe('alice');
      expect(result.current.round).toBe(1);
    });

    act(() =>
      fake.push(
        makeEvent('entityDamaged', {
          entityId: 'goblin-1',
          amount: 5,
          hpAfter: { current: 2, max: 7 },
          sourceEntityId: 'alice',
        })
      )
    );
    await waitFor(() => {
      expect(result.current.entityHP.get('goblin-1')).toEqual({
        current: 2,
        max: 7,
      });
    });

    act(() =>
      fake.push(
        makeEvent('statusApplied', {
          entityId: 'goblin-1',
          status: {
            source: { module: 'dnd5e', type: 'condition', id: 'frightened' },
            displayName: 'Frightened',
          },
          sourceEntityId: 'alice',
        })
      )
    );
    await waitFor(() => {
      expect(result.current.entityStatuses.get('goblin-1')).toHaveLength(1);
      expect(result.current.entityStatuses.get('goblin-1')?.[0].source.id).toBe(
        'frightened'
      );
    });

    act(() => fake.push(makeEvent('turnEnded', { entityId: 'alice' })));
    // TurnEnded is a no-op on local state — activeEntityId stays as alice
    // until the next TurnStarted overwrites it.
    await waitFor(() => {
      expect(result.current.activeEntityId).toBe('alice');
    });

    act(() =>
      fake.push(makeEvent('turnStarted', { entityId: 'goblin-1', round: 1 }))
    );
    await waitFor(() => {
      expect(result.current.activeEntityId).toBe('goblin-1');
    });
  });
});
