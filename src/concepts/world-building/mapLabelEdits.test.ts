import { describe, expect, it } from 'vitest';
import {
  createMapLabel,
  deleteMapLabel,
  moveMapLabel,
  renameMapLabel,
} from './mapLabelEdits';
import {
  createRoomDraft,
  resizeRoomWorkspace,
  stringifyRoomDraft,
  validateRoomDocument,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import { validateMapLabels } from './serialization';

const empty = () => createRoomDraft(createEmptyScene('scene'), 'room');
describe('immutable presentation-only map label intents', () => {
  it('preserves all non-label authored content and legacy workspace, using explicit stable IDs', () => {
    const draft = empty(),
      before = structuredClone(draft);
    draft.room.walkableHexes = [{ q: 0, r: 0 }];
    const created = createMapLabel(draft, 'kitchen', ' Kitchen ', {
      x: 0.125,
      z: 0.25,
    });
    expect(created.scene.mapLabels).toEqual([
      { id: 'kitchen', text: 'Kitchen', location: { x: 0.125, z: 0.25 } },
    ]);
    expect(created.scene.version).toBe(2);
    expect(created.workspace).toBe(draft.workspace);
    expect(created.room).toBe(draft.room);
    const moved = moveMapLabel(created, 'kitchen', { x: 1.1, z: -0.4 });
    const renamed = renameMapLabel(moved, 'kitchen', 'Courtyard');
    expect(renamed.scene.mapLabels).toEqual([
      { id: 'kitchen', text: 'Courtyard', location: { x: 1.1, z: -0.4 } },
    ]);
    expect(renamed.room).toBe(draft.room);
    expect(renamed.workspace).toEqual(before.workspace);
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
  it('refuses label points outside the closed workspace union, not just the enclosing square', () => {
    const draft = resizeRoomWorkspace(
      { draft: empty(), scope: {} },
      1,
      1
    ).draft;
    expect(() =>
      createMapLabel(draft, 'label', 'Kitchen', { x: 0.8, z: 0.8 })
    ).toThrow(/workspace/);
    const atEdge = createMapLabel(draft, 'label', 'Kitchen', { x: 0, z: 1 });
    expect(() =>
      validateRoomDocument({ draft: atEdge, scope: {} })
    ).not.toThrow();
    const before = stringifyRoomDraft(atEdge);
    expect(() => moveMapLabel(atEdge, 'label', { x: 12, z: 12 })).toThrow(
      /workspace/
    );
    expect(stringifyRoomDraft(atEdge)).toBe(before);
    expect(() =>
      createMapLabel(empty(), 'label', 'Kitchen', { x: 12, z: 12 })
    ).toThrow(/workspace/);
  });
});

describe('scene3 linked-label preservation', () => {
  it('preserves accepted witness/version under rename, move, new note and note deletion; raw linked deletion refuses', () => {
    const draft = createMapLabel(empty(), 'label', 'Kitchen', { x: 0, z: 0 });
    draft.scene.version = 3;
    draft.scene.authoringRegions = [
      {
        id: 'region',
        labelId: 'label',
        boundary: {
          kind: 'automatic',
          witness: {
            walk: [
              { wallId: 'C', direction: 'start-to-end' },
              { wallId: 'A', direction: 'start-to-end' },
              { wallId: 'B', direction: 'start-to-end' },
            ],
          },
        },
      },
    ];
    const bytes = stringifyRoomDraft(draft);
    expect(renameMapLabel(draft, 'label', ' Kitchen ')).toBe(draft);
    expect(moveMapLabel(draft, 'label', { x: 0, z: 0 })).toBe(draft);
    const renamed = renameMapLabel(draft, 'label', 'Hall');
    const moved = moveMapLabel(renamed, 'label', { x: 1, z: 0 });
    const note = createMapLabel(moved, 'note', 'Annotation', { x: 0, z: 0 });
    const deleted = deleteMapLabel(note, 'note');
    for (const next of [renamed, moved, note, deleted]) {
      expect(next.scene.version).toBe(3);
      expect(next.scene.authoringRegions).toBe(draft.scene.authoringRegions);
      expect(next.room).toBe(draft.room);
    }
    expect(() => deleteMapLabel(draft, 'label')).toThrow(/region-and-label/);
    expect(stringifyRoomDraft(draft)).toBe(bytes);
  });
});
