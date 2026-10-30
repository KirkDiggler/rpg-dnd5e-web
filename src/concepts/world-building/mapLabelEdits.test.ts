import { describe, expect, it } from 'vitest';
import {
  createMapLabel,
  deleteMapLabel,
  moveMapLabel,
  renameMapLabel,
} from './mapLabelEdits';
import { createRegion, setRegionLighting } from './regionEdits';
import {
  createRoomDraft,
  paintCells,
  stringifyRoomDraft,
  validateRoomDocument,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import { validateMapLabels } from './serialization';
import { MAX_WORLD_COORD } from './worldBounds';

const empty = () => createRoomDraft(createEmptyScene('scene'), 'room');
describe('immutable presentation-only map label intents', () => {
  it('preserves all non-label authored content, using explicit stable IDs', () => {
    const draft = paintCells(empty(), [{ q: 0, r: 0 }]),
      before = structuredClone(draft);
    const created = createMapLabel(draft, 'kitchen', ' Kitchen ', {
      x: 0.125,
      z: 0.25,
    });
    expect(created.scene.mapLabels).toEqual([
      { id: 'kitchen', text: 'Kitchen', location: { x: 0.125, z: 0.25 } },
    ]);
    expect(created.scene.version).toBe(2);
    expect(created.coordinateFrame).toBe(draft.coordinateFrame);
    expect(created.room).toBe(draft.room);
    const moved = moveMapLabel(created, 'kitchen', { x: 1.1, z: -0.4 });
    const renamed = renameMapLabel(moved, 'kitchen', 'Courtyard');
    expect(renamed.scene.mapLabels).toEqual([
      { id: 'kitchen', text: 'Courtyard', location: { x: 1.1, z: -0.4 } },
    ]);
    expect(renamed.room).toBe(draft.room);
    expect(renamed.room).toEqual(before.room);
    const deleted = deleteMapLabel(renamed, 'kitchen');
    expect(Object.hasOwn(deleted.scene, 'mapLabels')).toBe(false);
    expect(deleted.scene.version).toBe(2);
    expect(draft.scene).toEqual(before.scene);
  });
  it('returns the identical input on missing-target or normalized no-op', () => {
    const draft = createMapLabel(empty(), 'label', 'Kitchen', { x: 0, z: 0 });
    expect(moveMapLabel(draft, 'label', { x: 0, z: 0 })).toBe(draft);
    expect(renameMapLabel(draft, 'label', ' Kitchen ')).toBe(draft);
    expect(moveMapLabel(draft, 'missing', { x: NaN, z: 0 })).toBe(draft);
    expect(renameMapLabel(draft, 'missing', '')).toBe(draft);
    expect(deleteMapLabel(draft, 'missing')).toBe(draft);
  });
  it('uses label-local identities, allows repeated text, and refuses duplicate or oversized IDs', () => {
    const draft = empty();
    draft.scene.items.push({
      id: 'same',
      kind: 'prop',
      assetRef: 'dnd5e:props:books',
      label: 'books',
      transform: { x: 0, y: 0, z: 0, rotationY: 0 },
    });
    const labels = createMapLabel(
      createMapLabel(draft, 'same', 'Kitchen', { x: 0, z: 0 }),
      'other',
      'Kitchen',
      { x: 0, z: 0 }
    );
    expect(labels.scene.mapLabels).toHaveLength(2);
    expect(() =>
      createMapLabel(labels, 'same', 'Again', { x: 0, z: 0 })
    ).toThrow(/duplicate/);
    for (const id of ['', 'a'.repeat(121)])
      expect(() =>
        createMapLabel(draft, id, 'Kitchen', { x: 0, z: 0 })
      ).toThrow(/id/);
  });
  it('rejects malformed, null, unknown and oversized data without mutating input', () => {
    const valid = { id: 'label', text: 'Kitchen', location: { x: 0, z: 0 } };
    for (const labels of [
      null,
      {},
      [null],
      [{ ...valid, unknown: true }],
      [{ ...valid, location: null }],
      [{ ...valid, location: { x: 0, z: 0, y: 1 } }],
      [{ ...valid, location: { x: Infinity, z: 0 } }],
      [{ ...valid, text: '   ' }],
      [{ ...valid, text: 'a'.repeat(121) }],
    ])
      expect(() => validateMapLabels(labels)).toThrow();
    const labels = Array.from({ length: 256 }, (_, i) => ({
      ...valid,
      id: `label-${i}`,
    }));
    expect(validateMapLabels(labels)).toHaveLength(256);
    const draft = {
        ...empty(),
        scene: { ...empty().scene, version: 2 as const, mapLabels: labels },
      },
      before = structuredClone(draft);
    expect(() => createMapLabel(draft, '257', 'extra', { x: 0, z: 0 })).toThrow(
      /256/
    );
    expect(draft).toEqual(before);
  });
  // The canvas is unbounded (rpg-project#725): a label is refused only past
  // the world bound, never for leaving a stored workspace.
  it('accepts label points anywhere within the world bound and refuses past it', () => {
    const far = createMapLabel(empty(), 'label', 'Kitchen', {
      x: 500,
      z: -900,
    });
    expect(far.scene.mapLabels![0].location).toEqual({ x: 500, z: -900 });
    expect(() => validateRoomDocument({ draft: far, scope: {} })).not.toThrow();
    const atEdge = moveMapLabel(far, 'label', {
      x: MAX_WORLD_COORD,
      z: -MAX_WORLD_COORD,
    });
    expect(atEdge.scene.mapLabels![0].location.x).toBe(MAX_WORLD_COORD);
    const before = stringifyRoomDraft(atEdge);
    expect(() =>
      moveMapLabel(atEdge, 'label', { x: MAX_WORLD_COORD + 1, z: 0 })
    ).toThrow(/location\.x/);
    expect(stringifyRoomDraft(atEdge)).toBe(before);
    expect(() =>
      createMapLabel(empty(), 'label', 'Kitchen', {
        x: 0,
        z: -MAX_WORLD_COORD - 1,
      })
    ).toThrow(/location\.z/);
  });
});

// Map labels are notes only (rpg-project#725): no label is linked to a region
// (a region's label is its name), so no label edit touches a region and
// deleting any label never refuses.
describe('labels are notes beside the regions', () => {
  it('rename, move, create and delete keep the regions, room and scene version', () => {
    let draft = createRegion(empty(), 'hall', 'Hall');
    draft = setRegionLighting(
      paintCells(draft, [{ q: 0, r: 0 }], 'hall'),
      'hall',
      0.153728
    );
    draft = createMapLabel(draft, 'label', 'Kitchen', { x: 0, z: 0 });
    draft.scene.version = 6;
    const bytes = stringifyRoomDraft(draft);
    expect(renameMapLabel(draft, 'label', ' Kitchen ')).toBe(draft);
    expect(moveMapLabel(draft, 'label', { x: 0, z: 0 })).toBe(draft);
    const renamed = renameMapLabel(draft, 'label', 'Hall');
    const moved = moveMapLabel(renamed, 'label', { x: 1, z: 0 });
    const note = createMapLabel(moved, 'note', 'Annotation', { x: 0, z: 0 });
    const deletedNote = deleteMapLabel(note, 'note');
    const deletedLabel = deleteMapLabel(note, 'label');
    for (const next of [renamed, moved, note, deletedNote, deletedLabel]) {
      expect(next.scene.version).toBe(6);
      expect(next.room).toBe(draft.room);
    }
    expect(deletedLabel.scene.mapLabels!.map((label) => label.id)).toEqual([
      'note',
    ]);
    expect(stringifyRoomDraft(draft)).toBe(bytes);
  });
});
