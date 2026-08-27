import { afterEach, describe, expect, it } from 'vitest';
import { createSharedTableDiceEvidencePublisher } from './sharedTableDiceEvidence';

afterEach(() => {
  delete window.__sharedTableDiceEvidence;
});

function keys(value: unknown, found = new Set<string>()) {
  if (value === null || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    found.add(key.toLowerCase());
    keys(child, found);
  }
  return found;
}

function expectFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectFrozen(child);
}

const mount = {
  presentationId: 'concept:shared-table:run:1:attack',
  groupKey: 'attack' as const,
  witnessRole: 'roller' as const,
  rendererGeneration: -100_001,
  dieIds: ['die:attack:d20'] as const,
};

const diagnostic = {
  presentationId: mount.presentationId,
  groupKey: mount.groupKey,
  witnessRole: mount.witnessRole,
  rendererGeneration: mount.rendererGeneration,
  dieId: mount.dieIds[0],
  projectedAnchor: [12, 34] as [number, number],
  heldPoseApplied: true,
  frameSequence: 1,
};

describe('shared table dice evidence publisher', () => {
  it('publishes a recursively frozen exact safe snapshot with a monotonic revision', () => {
    const publisher = createSharedTableDiceEvidencePublisher();
    publisher.activate(mount);

    expect(publisher.publish(diagnostic)).toBe(true);
    const first = window.__sharedTableDiceEvidence!;
    expect(first).toEqual({
      revision: expect.any(Number),
      presentationId: mount.presentationId,
      groupKey: 'attack',
      witnessRole: 'roller',
      rendererGeneration: -100_001,
      dieId: 'die:attack:d20',
      projectedAnchor: [12, 34],
      heldPoseApplied: true,
      frameSequence: 1,
    });
    expect(first.revision).toBeGreaterThan(0);
    expectFrozen(first);

    diagnostic.projectedAnchor[0] = 999;
    expect(first.projectedAnchor).toEqual([12, 34]);

    expect(
      publisher.publish({
        ...diagnostic,
        projectedAnchor: [20, 40],
        frameSequence: 2,
      })
    ).toBe(true);
    expect(window.__sharedTableDiceEvidence?.revision).toBeGreaterThan(
      first.revision
    );
    expect(window.__sharedTableDiceEvidence?.frameSequence).toBe(2);
  });

  it('rejects stale generations, unknown dice, malformed anchors, and regressive frame sequences', () => {
    const publisher = createSharedTableDiceEvidencePublisher();
    publisher.activate(mount);
    expect(
      publisher.publish({ ...diagnostic, projectedAnchor: [12, 34] })
    ).toBe(true);
    const accepted = window.__sharedTableDiceEvidence;

    for (const rejected of [
      { ...diagnostic, projectedAnchor: [12, 34], frameSequence: 1 },
      { ...diagnostic, projectedAnchor: [12, 34], frameSequence: 0 },
      {
        ...diagnostic,
        projectedAnchor: [12, 34],
        rendererGeneration: -100_002,
        frameSequence: 2,
      },
      {
        ...diagnostic,
        projectedAnchor: [12, 34],
        presentationId: 'concept:shared-table:stale',
        frameSequence: 2,
      },
      {
        ...diagnostic,
        projectedAnchor: [12, 34],
        dieId: 'die:unknown',
        frameSequence: 2,
      },
      { ...diagnostic, projectedAnchor: [Number.NaN, 4], frameSequence: 2 },
      { ...diagnostic, projectedAnchor: [3], frameSequence: 2 },
      { ...diagnostic, projectedAnchor: [3, 4], heldPoseApplied: false },
    ])
      expect(publisher.publish(rejected)).toBe(false);

    expect(window.__sharedTableDiceEvidence).toBe(accepted);
  });

  it('invalidates its published snapshot immediately when the active fence changes', () => {
    const publisher = createSharedTableDiceEvidencePublisher();
    publisher.activate(mount);
    expect(
      publisher.publish({ ...diagnostic, projectedAnchor: [12, 34] })
    ).toBe(true);
    const attackSnapshot = window.__sharedTableDiceEvidence;

    publisher.activate(mount);
    expect(window.__sharedTableDiceEvidence).toBe(attackSnapshot);

    publisher.activate({
      presentationId: 'concept:shared-table:run:1:damage',
      groupKey: 'damage',
      witnessRole: 'roller',
      rendererGeneration: -100_002,
      dieIds: ['die:damage:d8'],
    });

    expect(window.__sharedTableDiceEvidence).toBeUndefined();
    expect(
      publisher.publish({
        ...diagnostic,
        projectedAnchor: [20, 40],
        frameSequence: 2,
      })
    ).toBe(false);
    expect(window.__sharedTableDiceEvidence).toBeUndefined();
  });

  it('never republishes raw pointer, result, damage, URL, or renderer-resource fields', () => {
    const publisher = createSharedTableDiceEvidencePublisher();
    publisher.activate(mount);
    const hostile = {
      ...diagnostic,
      projectedAnchor: [7, 8],
      pointerId: 42,
      clientX: 100,
      result: 20,
      damage: 99,
      url: 'https://example.invalid/provider.glb',
      renderer: { gl: {}, canvas: {} },
      resources: { textures: 4, programs: 2 },
    };

    expect(publisher.publish(hostile)).toBe(true);
    expect(Object.keys(window.__sharedTableDiceEvidence!)).toEqual([
      'revision',
      'presentationId',
      'groupKey',
      'witnessRole',
      'rendererGeneration',
      'dieId',
      'projectedAnchor',
      'heldPoseApplied',
      'frameSequence',
    ]);
    const publishedKeys = keys(window.__sharedTableDiceEvidence);
    for (const forbidden of [
      'pointerid',
      'clientx',
      'result',
      'damage',
      'url',
      'renderer',
      'resources',
      'textures',
      'programs',
      'canvas',
      'gl',
    ])
      expect(publishedKeys.has(forbidden)).toBe(false);
  });

  it('clears its generation fences and never deletes a newer publisher bridge', () => {
    const firstPublisher = createSharedTableDiceEvidencePublisher();
    firstPublisher.activate(mount);
    expect(
      firstPublisher.publish({ ...diagnostic, projectedAnchor: [12, 34] })
    ).toBe(true);

    const secondPublisher = createSharedTableDiceEvidencePublisher();
    secondPublisher.activate({
      ...mount,
      presentationId: 'concept:shared-table:run:2:attack',
      rendererGeneration: -100_010,
    });
    expect(
      secondPublisher.publish({
        ...diagnostic,
        presentationId: 'concept:shared-table:run:2:attack',
        rendererGeneration: -100_010,
        projectedAnchor: [21, 22],
      })
    ).toBe(true);
    const newer = window.__sharedTableDiceEvidence;

    firstPublisher.clear();
    expect(window.__sharedTableDiceEvidence).toBe(newer);
    secondPublisher.clear();
    expect(window.__sharedTableDiceEvidence).toBeUndefined();
    expect(
      secondPublisher.publish({
        ...diagnostic,
        presentationId: 'concept:shared-table:run:2:attack',
        rendererGeneration: -100_010,
        projectedAnchor: [23, 24],
        frameSequence: 2,
      })
    ).toBe(false);
  });
});
