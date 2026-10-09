// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createMapLabel,
  deleteMapLabel,
  moveMapLabel,
  renameMapLabel,
} from './mapLabelEdits';
import { resolveAuthoringRegions } from './regionBoundaryGeometry';
import {
  createRoomLabel,
  removeRegionAndLabel,
  setExplicitRegionArea,
  useEnclosingWalls,
} from './regionEdits';
import {
  createRoomDraft,
  parseRoomDocumentJson,
  stringifyRoomDraft,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import type { StructuralWall } from './structuralWalls';
function base() {
  return createRoomDraft(createEmptyScene('scene'), 'room');
}
function enclosed() {
  const draft = base();
  const points = [
    { x: -4, z: -4 },
    { x: 4, z: -4 },
    { x: 4, z: 4 },
    { x: -4, z: 4 },
  ];
  draft.room.walls = points.map(
    (start, i): StructuralWall => ({
      id: `wall-${i}`,
      label: 'Wall',
      line: { start, end: points[(i + 1) % 4] },
      openings: [],
      appearance: {
        assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
        height: 3,
        thickness: 0.2,
        elevation: 0,
      },
      blocker: {
        footprint: { width: 1, depth: 0.2, offsetX: 0, offsetZ: 0 },
        blocksMovement: true,
        blocksLineOfSight: true,
      },
    })
  );
  return draft;
}
describe('explicit region definition transactions', () => {
  it('creates the pair, acquires only certified geometry, keeps all unrelated author data unchanged', () => {
    const draft = enclosed();
    const before = JSON.stringify(draft);
    const next = createRoomLabel(draft, 'region', 'label', ' Room ', {
      x: 0,
      z: 0,
    });
    expect(next.scene.version).toBe(3);
    expect(next.scene.mapLabels![0]).toMatchObject({
      id: 'label',
      text: 'Room',
    });
    expect(next.scene.authoringRegions![0]).toMatchObject({
      id: 'region',
      labelId: 'label',
      boundary: {
        kind: 'automatic',
        witness: {
          walk: [
            { wallId: 'wall-0', direction: 'start-to-end' },
            { wallId: 'wall-1', direction: 'start-to-end' },
            { wallId: 'wall-2', direction: 'start-to-end' },
            { wallId: 'wall-3', direction: 'start-to-end' },
          ],
        },
      },
    });
    expect(next.room).toBe(draft.room);
    expect(next.workspace).toBe(draft.workspace);
    expect(JSON.stringify(draft)).toBe(before);
    expect(resolveAuthoringRegions(next)[0].status).toBe('resolved');
  });
  it('open/empty definitions are persisted intent, bind refusal/noop leaves the exact draft', () => {
    const open = createRoomLabel(base(), 'region', 'label', 'Forest', {
      x: 0,
      z: 0,
    });
    expect(resolveAuthoringRegions(open)[0]).toMatchObject({
      reason: 'unbound',
    });
    const before = JSON.stringify(open);
    expect(() => useEnclosingWalls(open, 'region')).toThrow('open');
    expect(JSON.stringify(open)).toBe(before);
    const empty = setExplicitRegionArea(open, 'region', []);
    expect(resolveAuthoringRegions(empty)[0]).toMatchObject({
      reason: 'empty-explicit',
    });
    expect(setExplicitRegionArea(empty, 'region', [])).toBe(empty);
    expect(
      parseRoomDocumentJson(stringifyRoomDraft(empty, {})).draft.scene
        .authoringRegions
    ).toEqual(empty.scene.authoringRegions);
    const bound = createRoomLabel(enclosed(), 'region', 'label', 'Room', {
      x: 0,
      z: 0,
    });
    expect(useEnclosingWalls(bound, 'region')).toBe(bound);
  });
  it('canonicalizes explicit cells, preserves set-equal noops including unsorted saved cells, and refuses invalid input atomically', () => {
    const draft = createRoomLabel(base(), 'region', 'label', 'Forest', {
      x: 0,
      z: 0,
    });
    const next = setExplicitRegionArea(draft, 'region', [
      { q: 1, r: 0 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]);
    expect(next.scene.authoringRegions![0].boundary).toEqual({
      kind: 'explicit',
      cells: [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
    });
    expect(
      setExplicitRegionArea(next, 'region', [
        { q: 1, r: 0 },
        { q: 0, r: 0 },
      ])
    ).toBe(next);
    const unsorted = {
      ...next,
      scene: {
        ...next.scene,
        authoringRegions: [
          {
            id: 'region',
            labelId: 'label',
            boundary: {
              kind: 'explicit' as const,
              cells: [
                { q: 1, r: 0 },
                { q: 0, r: 0 },
              ],
            },
          },
        ],
      },
    };
    expect(
      setExplicitRegionArea(unsorted, 'region', [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ])
    ).toBe(unsorted);
    const before = JSON.stringify(next);
    for (const cell of [
      { q: 0.5, r: 0 },
      { q: 100, r: 0 },
      { q: NaN, r: 0 },
    ])
      expect(() => setExplicitRegionArea(next, 'region', [cell])).toThrow();
    expect(JSON.stringify(next)).toBe(before);
    expect(next.room).toBe(draft.room);
  });
  it('explicit auto replacement requires bind; label edits retain the witness; only pair removal can delete its label', () => {
    let draft = createRoomLabel(enclosed(), 'region', 'label', 'Room', {
      x: 0,
      z: 0,
    });
    const witness = draft.scene.authoringRegions![0].boundary;
    draft = createMapLabel(draft, 'note', 'Note', { x: 1, z: 1 });
    const edited = moveMapLabel(
      renameMapLabel(draft, 'label', 'Name'),
      'label',
      { x: 1, z: 0 }
    );
    expect(edited.scene.authoringRegions![0].boundary).toEqual(witness);
    expect(() => deleteMapLabel(edited, 'label')).toThrow('region-and-label');
    const explicit = setExplicitRegionArea(edited, 'region', [{ q: 0, r: 0 }]);
    const rebound = useEnclosingWalls(explicit, 'region');
    expect(rebound.scene.authoringRegions![0].boundary).toEqual(witness);
    const removed = removeRegionAndLabel(explicit, 'region');
    expect(removed.scene.version).toBe(3);
    expect(removed.scene).not.toHaveProperty('authoringRegions');
    expect(removed.scene.mapLabels).toEqual([
      { id: 'note', text: 'Note', location: { x: 1, z: 1 } },
    ]);
    expect(removed.room).toBe(explicit.room);
    expect(removed.workspace).toBe(explicit.workspace);
    expect(() => removeRegionAndLabel(removed, 'region')).toThrow(
      'no longer exists'
    );
  });
  it('never resolves explicit adjacency as overlap; overlap marks both, without transferring cells', () => {
    let draft = createRoomLabel(base(), 'a', 'la', 'A', { x: 0, z: 0 });
    draft = createRoomLabel(draft, 'b', 'lb', 'B', { x: 2, z: 0 });
    draft = setExplicitRegionArea(
      setExplicitRegionArea(draft, 'a', [{ q: 0, r: 0 }]),
      'b',
      [{ q: 1, r: 0 }]
    );
    expect(resolveAuthoringRegions(draft).map((r) => r.status)).toEqual([
      'resolved',
      'resolved',
    ]);
    const conflict = setExplicitRegionArea(draft, 'b', [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]);
    const before = JSON.stringify(conflict);
    expect(
      resolveAuthoringRegions(conflict).map((r) =>
        r.status === 'unresolved' ? r.reason : ''
      )
    ).toEqual(['overlap', 'overlap']);
    expect(JSON.stringify(conflict)).toBe(before);
  });
  it('detects polygon/explicit containment and positive-area crossings conservatively', () => {
    let draft = createRoomLabel(enclosed(), 'a', 'la', 'Room', { x: 0, z: 0 });
    draft = createRoomLabel(draft, 'b', 'lb', 'Forest', { x: 6, z: 0 });
    const contained = setExplicitRegionArea(draft, 'b', [{ q: 0, r: 0 }]);
    expect(
      resolveAuthoringRegions(contained).map((r) =>
        r.status === 'unresolved' ? r.reason : ''
      )
    ).toEqual(['overlap', 'overlap']);
    const crossed = setExplicitRegionArea(draft, 'b', [{ q: 2, r: 0 }]);
    expect(
      resolveAuthoringRegions(crossed).map((r) =>
        r.status === 'unresolved' ? r.reason : ''
      )
    ).toEqual(['overlap', 'overlap']);
    const separated = setExplicitRegionArea(draft, 'b', [{ q: 4, r: 0 }]);
    expect(resolveAuthoringRegions(separated).map((r) => r.status)).toEqual([
      'resolved',
      'resolved',
    ]);
  });
  it('rejects duplicate/missing/colliding identities without mutating the original', () => {
    const draft = createRoomLabel(base(), 'region', 'label', 'Room', {
      x: 0,
      z: 0,
    });
    const before = JSON.stringify(draft);
    expect(() =>
      createRoomLabel(draft, 'region', 'other-label', 'Other', { x: 0, z: 0 })
    ).toThrow();
    expect(() =>
      createRoomLabel(draft, 'other-region', 'label', 'Other', { x: 0, z: 0 })
    ).toThrow();
    expect(() =>
      createRoomLabel(draft, 'room', 'other-label', 'Other', { x: 0, z: 0 })
    ).toThrow();
    expect(() => setExplicitRegionArea(draft, 'missing', [])).toThrow(
      'no longer exists'
    );
    expect(JSON.stringify(draft)).toBe(before);
  });
});
