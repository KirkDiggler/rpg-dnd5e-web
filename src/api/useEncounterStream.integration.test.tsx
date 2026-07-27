import { create } from '@bufbuild/protobuf';
import { EntityStateSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import {
  EncounterMode,
  type Position,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEncounterState } from '../hooks/useEncounterState';
import { hexKey } from '../utils/hexCoord';
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
 *
 * v1alpha2 hex-knowledge contract (rpg-api-protos#197): entities and walls
 * no longer arrive via live per-entity/per-geometry events (EntityAppeared/
 * EntityDisappeared/GeometryRevealed are gone) — both now ride only on
 * SnapshotDelivered, mirroring EncounterView.tsx's real wiring exactly:
 * entity position comes from a hex's `contents` (an entity says only what
 * it is, not where), and walls come from flattening every hex's `edges`
 * (not a flat `Space.walls` list anymore).
 */
function useTestHarness(encounterId: string) {
  const state = useEncounterState();
  useEncounterStream(encounterId, 'alice', {
    onSnapshotDelivered: (e) => {
      const hexes = e.encounter?.space?.hexes ?? [];
      state.applySnapshotRegionState(
        e.encounter?.space?.theme ?? '',
        e.encounter?.space?.zones ?? [],
        hexes
      );
      const positionByEntityId = new Map<string, Position>();
      for (const hex of hexes) {
        if (!hex.position) continue;
        for (const placement of hex.contents ?? []) {
          positionByEntityId.set(placement.entityId, hex.position);
        }
      }
      const entityEntries = (e.encounter?.space?.entities ?? [])
        .filter((entity) => positionByEntityId.has(entity.id))
        .map((entity) => ({
          entity: create(EntityStateSchema, {
            entityId: entity.id,
            position: v2PositionToV1(positionByEntityId.get(entity.id)!),
          }),
          type: entity.type,
          monsterRefId: undefined,
          initialHP: undefined,
          initialAC: undefined,
        }));
      if (entityEntries.length > 0) {
        state.applyEntityAppearedBatch(entityEntries);
      }
      const walls = hexes.flatMap((hex) => hex.edges ?? []);
      if (walls.length > 0) {
        state.applyWallsRevealed(walls);
      }
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

    // Stream up, seeding alice via the snapshot's hex `contents` (entity
    // position now rides the occupied hex, not the entity itself).
    act(() =>
      fake.push(
        makeEvent('snapshotDelivered', {
          encounter: {
            space: {
              entities: [{ id: 'alice', type: 1 }],
              hexes: [
                {
                  position: { x: 0, y: 0, z: 0 },
                  contents: [{ entityId: 'alice' }],
                },
              ],
            },
          },
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

  it('replaces snapshot region truth across reconnects', async () => {
    const { result } = renderHook(() => useTestHarness('enc-1'));

    act(() =>
      fake.push(
        makeEvent('snapshotDelivered', {
          encounter: {
            space: {
              theme: 'crypt',
              zones: [
                { id: 'entrance', name: 'Entrance', archetype: 'entrance' },
                { id: 'chamber', name: 'Chamber', archetype: 'chamber' },
              ],
              hexes: [
                { position: { x: 0, y: 0, z: 0 }, zoneId: 'entrance' },
                { position: { x: 1, y: -1, z: 0 }, zoneId: 'chamber' },
              ],
            },
          },
        })
      )
    );

    await waitFor(() => {
      expect(result.current.theme).toBe('crypt');
      expect(
        result.current.revealedHexes.get(hexKey({ q: 0, r: 0, s: 0 }))?.zoneId
      ).toBe('entrance');
      expect(
        result.current.revealedHexes.get(hexKey({ q: 1, r: -1, s: 0 }))?.zoneId
      ).toBe('chamber');
    });

    act(() =>
      fake.push(
        makeEvent('snapshotDelivered', {
          encounter: {
            space: {
              theme: 'cave',
              zones: [{ id: 'boss', name: 'Boss', archetype: 'boss' }],
              hexes: [{ position: { x: 2, y: -2, z: 0 }, zoneId: 'boss' }],
            },
          },
        })
      )
    );

    await waitFor(() => {
      expect(result.current.theme).toBe('cave');
      expect(result.current.zones.has('entrance')).toBe(false);
      expect(
        result.current.revealedHexes.has(hexKey({ q: 0, r: 0, s: 0 }))
      ).toBe(false);
      expect(
        result.current.revealedHexes.get(hexKey({ q: 2, r: -2, s: 0 }))?.zoneId
      ).toBe('boss');
    });
  });

  it('DoorOpened marks the door open in openDoors', async () => {
    // rpg-api-protos#197: DoorOpened is now a pure notification (door
    // identity only) — the world-changing geometry no longer rides a
    // parallel event, it arrives on the next snapshot's HexRecord.edges.
    const { result } = renderHook(() => useTestHarness('enc-1'));

    act(() => fake.push(makeEvent('snapshotDelivered', {})));
    act(() =>
      fake.push(
        makeEvent('doorOpened', {
          doorEntityId: 'door-east',
        })
      )
    );

    await waitFor(() => {
      expect(result.current.openDoors.has('door-east')).toBe(true);
    });
  });

  it('snapshot walls flatten from every hex edges into the sticky wall map', async () => {
    // rpg-api-protos#197: walls no longer ride a flat Space.walls list —
    // each hex carries its own boundary segments as `edges`. This exercises
    // the real production remap (EncounterView.tsx/PlaytestHarness.tsx),
    // not just applyWallsRevealed in isolation.
    const { result } = renderHook(() => useTestHarness('enc-1'));

    act(() =>
      fake.push(
        makeEvent('snapshotDelivered', {
          encounter: {
            space: {
              hexes: [
                {
                  position: { x: 0, y: 0, z: 0 },
                  edges: [
                    {
                      from: { x: 0, y: 0, z: 0 },
                      to: { x: 1, y: -1, z: 0 },
                      kind: 1,
                    },
                  ],
                },
                {
                  position: { x: 1, y: -1, z: 0 },
                  edges: [
                    {
                      from: { x: 1, y: -1, z: 0 },
                      to: { x: 2, y: -2, z: 0 },
                      kind: 1,
                    },
                  ],
                },
              ],
            },
          },
        })
      )
    );

    await waitFor(() => {
      expect(result.current.walls.size).toBe(2);
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
