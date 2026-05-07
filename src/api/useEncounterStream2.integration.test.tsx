import type { EntityState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEncounterState } from '../hooks/useEncounterState';
import { hexKey, protoPositionToHex } from '../utils/hexCoord';
import { createFakeStream, type FakeStream } from './fakeEncounterStream2';

function makeEvent(caseName: string, value: unknown): EncounterEvent {
  return { event: { case: caseName, value } } as unknown as EncounterEvent;
}

const hoisted = vi.hoisted(() => ({
  fakeRef: { current: null as FakeStream | null },
}));

vi.mock('./client', () => ({
  encounterClientV2: {
    streamEncounter: vi.fn(() => hoisted.fakeRef.current!.iterator),
  },
}));

import { useEncounterStream2 } from './useEncounterStream2';

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
  useEncounterStream2(encounterId, 'alice', {
    onSnapshotDelivered: () => {
      /* noop — payload empty in slice 1, just a sync barrier */
    },
    onEntityMoved: (e) => {
      const last = e.actualPath[e.actualPath.length - 1];
      // v2 Position and v1 Position are both {x,y,z} structs but different
      // TS brands. Double-cast through unknown to satisfy the type checker.
      // Mirrors LobbyView's wiring at the equivalent dispatch site.
      if (last)
        state.applyEntityPositionUpdate(
          e.entityId,
          last as unknown as Parameters<
            typeof state.applyEntityPositionUpdate
          >[1]
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
      // v1alpha2 Entity.id ↔ v1 EntityState.entityId; minimal stub for slice 2
      const stub = {
        entityId: e.entity.id,
        position: e.entity.position,
      } as unknown as EntityState;
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
  });
  return state.state;
}

describe('useEncounterStream2 + useEncounterState — integration', () => {
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
      expect(result.current.entities.get('alice')?.position).toEqual({
        x: 2,
        y: -2,
        z: 0,
      });
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
      expect(result.current.entities.get('mover')?.position).toEqual({
        x: 1,
        y: -1,
        z: 0,
      });
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
      expect(m?.position).toEqual({ x: 5, y: -3, z: -2 });
    });
  });
});
