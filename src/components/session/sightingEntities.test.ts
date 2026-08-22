import type {
  Seen,
  Sighting,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { Standing } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  isSightedDowned,
  monsterRefIdFromSubject,
  sightingsToEntities,
} from './sightingEntities';

function seen(overrides: Partial<Seen> = {}): Seen {
  return {
    position: { x: 0, y: 0 },
    standing: Standing.UP,
    ...overrides,
  } as Seen;
}

function sighting(overrides: Partial<Sighting> = {}): Sighting {
  return {
    subject: 'skeleton-1',
    payload: new Uint8Array(),
    channel: 'sight',
    at: 1n,
    currentVia: ['sight'],
    status: 'live',
    name: 'skeleton-1',
    ...overrides,
  } as Sighting;
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
  it('maps a live sighting to a drawable entity at its seen cell, carrying name and standing', () => {
    const s = sighting({
      subject: 'skeleton-1',
      name: 'skeleton-1',
      seen: seen({ position: { x: 10, y: 3 } as never, standing: Standing.UP }),
      currentVia: ['sight'],
    });
    const entities = sightingsToEntities([s], 'char-1');
    expect(entities).toEqual([
      {
        subject: 'skeleton-1',
        name: 'skeleton-1',
        monsterRefId: 'skeleton',
        // positionBridge.positionToCube(q=10, r=3): x=q, y=-q-r, z=r
        position: { x: 10, y: -13, z: 3 },
        remembered: false,
        standing: Standing.UP,
      },
    ]);
  });

  it('a sighting with an empty name falls back to the subject id -- never blank', () => {
    const s = sighting({
      subject: 'skeleton-1',
      name: '',
      seen: seen({ position: { x: 0, y: 0 } as never }),
    });
    expect(sightingsToEntities([s], 'char-1')[0]!.name).toBe('skeleton-1');
  });

  it('carries a downed standing through verbatim', () => {
    const s = sighting({
      subject: 'skeleton-1',
      seen: seen({ standing: Standing.DOWNED }),
    });
    expect(sightingsToEntities([s], 'char-1')[0]!.standing).toBe(
      Standing.DOWNED
    );
  });

  it('a sighting with seen unset (no position known) draws nothing -- never guessed', () => {
    const s = sighting({ subject: 'skeleton-1', seen: undefined });
    expect(sightingsToEntities([s], 'char-1')).toEqual([]);
  });

  it('an empty currentVia (a memory, not a live sighting) is drawn as remembered at its last seen cell', () => {
    const s = sighting({
      subject: 'skeleton-1',
      seen: seen({ position: { x: 2, y: 2 } as never }),
      currentVia: [],
    });
    const entities = sightingsToEntities([s], 'char-1');
    expect(entities).toHaveLength(1);
    expect(entities[0]!.remembered).toBe(true);
  });

  it('the local player’s own subject is filtered out -- never drawn twice (defensive; GetView already skips self server-side)', () => {
    const own = sighting({
      subject: 'char-1',
      seen: seen({ position: { x: 0, y: 0 } as never }),
    });
    const other = sighting({
      subject: 'skeleton-1',
      seen: seen({ position: { x: 1, y: 1 } as never }),
    });
    const entities = sightingsToEntities([own, other], 'char-1');
    expect(entities.map((e) => e.subject)).toEqual(['skeleton-1']);
  });

  it('multiple sightings resolve independently, skipping only the unset-seen ones', () => {
    const withSeen = sighting({
      subject: 'skeleton-1',
      seen: seen({ position: { x: 1, y: 0 } as never }),
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

describe('isSightedDowned', () => {
  it('true only for Standing.DOWNED', () => {
    expect(isSightedDowned(Standing.DOWNED)).toBe(true);
    expect(isSightedDowned(Standing.UP)).toBe(false);
    expect(isSightedDowned(Standing.UNSPECIFIED)).toBe(false);
  });
});
