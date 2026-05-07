import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { describe, expect, it, vi } from 'vitest';
import {
  dispatchEncounterStream2Event,
  type EncounterStream2Options,
} from './encounterStream2Dispatch';

function makeEvent<K extends string, V>(caseName: K, value: V): EncounterEvent {
  return {
    event: { case: caseName, value },
    // Other EncounterEvent fields (eventId, deliveredAt) — minimal shape;
    // tests are checking dispatch only, not full proto validity
  } as unknown as EncounterEvent;
}

describe('dispatchEncounterStream2Event', () => {
  it('routes snapshotDelivered to onSnapshotDelivered', () => {
    const onSnapshotDelivered = vi.fn();
    const options: EncounterStream2Options = { onSnapshotDelivered };
    const event = makeEvent('snapshotDelivered', { encounter: undefined });
    dispatchEncounterStream2Event(event, options);
    expect(onSnapshotDelivered).toHaveBeenCalledTimes(1);
  });

  it('routes entityMoved to onEntityMoved', () => {
    const onEntityMoved = vi.fn();
    const options: EncounterStream2Options = { onEntityMoved };
    const event = makeEvent('entityMoved', {
      entityId: 'a',
      actualPath: [{ x: 0, y: 0, z: 0 }],
    });
    dispatchEncounterStream2Event(event, options);
    expect(onEntityMoved).toHaveBeenCalledTimes(1);
  });

  it('routes geometryRevealed to onGeometryRevealed', () => {
    const onGeometryRevealed = vi.fn();
    const options: EncounterStream2Options = { onGeometryRevealed };
    const event = makeEvent('geometryRevealed', { hexes: [] });
    dispatchEncounterStream2Event(event, options);
    expect(onGeometryRevealed).toHaveBeenCalledTimes(1);
  });

  it('routes entityAppeared to onEntityAppeared', () => {
    const onEntityAppeared = vi.fn();
    const options: EncounterStream2Options = { onEntityAppeared };
    // NOTE: v1alpha2 Entity uses `id` (not `entityId`); see types_pb.ts.
    const event = makeEvent('entityAppeared', {
      entity: { id: 'g', position: { x: 1, y: -1, z: 0 } },
      reason: '',
    });
    dispatchEncounterStream2Event(event, options);
    expect(onEntityAppeared).toHaveBeenCalledTimes(1);
  });

  it('routes entityDisappeared to onEntityDisappeared', () => {
    const onEntityDisappeared = vi.fn();
    const options: EncounterStream2Options = { onEntityDisappeared };
    const event = makeEvent('entityDisappeared', {
      entityId: 'g',
      lastKnownPosition: { x: 2, y: -2, z: 0 },
    });
    dispatchEncounterStream2Event(event, options);
    expect(onEntityDisappeared).toHaveBeenCalledTimes(1);
  });

  it('logs a warning for unknown event cases without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const event = makeEvent('someUnknownCase' as 'snapshotDelivered', {});
    expect(() => dispatchEncounterStream2Event(event, {})).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is a no-op when no callback is registered for the event type', () => {
    const event = makeEvent('entityMoved', {
      entityId: 'x',
      actualPath: [],
    });
    expect(() => dispatchEncounterStream2Event(event, {})).not.toThrow();
  });
});
