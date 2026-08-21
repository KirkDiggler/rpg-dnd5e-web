import { create } from '@bufbuild/protobuf';
import {
  SeenSchema,
  SightingSchema,
  type Sighting,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  monsterRefIdFromSubject,
  sightingsToEntities,
} from './sightingEntities';

function sighting(overrides: Partial<Sighting> = {}): Sighting {
  return create(SightingSchema, {
    subject: 'skeleton-1',
    payload: new Uint8Array(),
    channel: 'sight',
    at: 1n,
    currentVia: ['sight'],
    status: 'live',
    ...overrides,
  });
}

describe('monsterRefIdFromSubject', () => {
  it('strips the trailing -<ordinal> to recover the toolkit monster ref id', () => {
    expect(monsterRefIdFromSubject('skeleton-1')).toBe('skeleton');
    expect(monsterRefIdFromSubject('skeleton-12')).toBe('skeleton');
  });

  it('a multi-hyphen ref id keeps its own hyphens -- only the trailing ordinal is stripped', () => {
    expect(monsterRefIdFromSubject('skeleton-captain-1')).toBe(
      'skeleton-captain'
    );
    expect(monsterRefIdFromSubject('skeleton-captain-9')).toBe(
      'skeleton-captain'
    );
  });

  it('a subject with no trailing ordinal is returned unchanged (defensive)', () => {
    expect(monsterRefIdFromSubject('skeleton')).toBe('skeleton');
  });
});

describe('sightingsToEntities', () => {
  it('maps a live sighting to a drawable entity at its seen cell', () => {
    const s = sighting({
      subject: 'skeleton-1',
      seen: create(SeenSchema, { position: { x: 10, y: 3 } }),
      currentVia: ['sight'],
    });
    const entities = sightingsToEntities([s], 'char-1');
    expect(entities).toEqual([
      {
        subject: 'skeleton-1',
        monsterRefId: 'skeleton',
        // positionBridge.positionToCube(q=10, r=3): x=q, y=-q-r, z=r
        position: { x: 10, y: -13, z: 3 },
        remembered: false,
      },
    ]);
  });

  it('a sighting with seen unset (no position known) draws nothing -- never guessed', () => {
    const s = sighting({ subject: 'skeleton-1', seen: undefined });
    expect(sightingsToEntities([s], 'char-1')).toEqual([]);
  });

  it('an empty currentVia (a memory, not a live sighting) is drawn as remembered at its last seen cell', () => {
    const s = sighting({
      subject: 'skeleton-1',
      seen: create(SeenSchema, { position: { x: 2, y: 2 } }),
      currentVia: [],
    });
    const entities = sightingsToEntities([s], 'char-1');
    expect(entities).toHaveLength(1);
    expect(entities[0]!.remembered).toBe(true);
  });

  it('the local player’s own subject is filtered out -- never drawn twice (defensive; GetView already skips self server-side)', () => {
    const own = sighting({
      subject: 'char-1',
      seen: create(SeenSchema, { position: { x: 0, y: 0 } }),
    });
    const other = sighting({
      subject: 'skeleton-1',
      seen: create(SeenSchema, { position: { x: 1, y: 1 } }),
    });
    const entities = sightingsToEntities([own, other], 'char-1');
    expect(entities.map((e) => e.subject)).toEqual(['skeleton-1']);
  });

  it('multiple sightings resolve independently, skipping only the unset-seen ones', () => {
    const withSeen = sighting({
      subject: 'skeleton-1',
      seen: create(SeenSchema, { position: { x: 1, y: 0 } }),
    });
    const noSeen = sighting({ subject: 'zombie-2', seen: undefined });
    const entities = sightingsToEntities([withSeen, noSeen], 'char-1');
    expect(entities).toHaveLength(1);
    expect(entities[0]!.subject).toBe('skeleton-1');
  });

  it('an empty sightings list resolves to no entities', () => {
    expect(sightingsToEntities([], 'char-1')).toEqual([]);
  });
});
