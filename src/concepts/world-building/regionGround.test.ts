import {
  decodeRoomDocumentJson,
  encodeRoomDocument,
} from '@/compositions/roomDocument';
import { describe, expect, it } from 'vitest';
import { createRegion, removeRegion } from './regionEdits';
import {
  groundRefAt,
  paintRegionGround,
  setRegionGroundBase,
} from './regionGround';
import {
  cellOwners,
  createRoomDraft,
  eraseCells,
  paintCells,
  parseRoomDraftJson,
  stringifyRoomDraft,
  type RoomDraft,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';

const GRASS = 'dnd5e:ground:fantasy-kingdom:grass_01';
const DIRT = 'dnd5e:ground:fantasy-kingdom:dirt_01';
const STONE = 'dnd5e:ground:dungeon:stone_01';
const A = { q: 0, r: 0 };
const B = { q: 1, r: 0 };
const C = { q: 2, r: 0 };

function room(): RoomDraft {
  let draft = createRoomDraft(createEmptyScene('ground-scene'), 'ground-room');
  draft = createRegion(draft, 'court', 'Courtyard');
  draft = paintCells(draft, [A, B, C], 'court');
  draft = createRegion(draft, 'hall', 'Hall');
  return paintCells(draft, [{ q: 3, r: 0 }], 'hall');
}
const court = (draft: RoomDraft) =>
  draft.room.regions.find((r) => r.id === 'court')!;

// Each case protects appearance intent, not an implementation-specific structure.
describe('region ground edits', () => {
  it('changes only the target base, leaving ownership, scene and other regions alone', () => {
    const before = room();
    const saved = structuredClone(before);
    const next = setRegionGroundBase(before, 'court', GRASS);
    expect(court(next).ground).toEqual({ baseRef: GRASS });
    expect(groundRefAt(court(next), A)).toBe(GRASS);
    expect(cellOwners(next)).toEqual(cellOwners(before));
    expect(next.scene).toBe(before.scene);
    expect(next.room.regions.find((r) => r.id === 'hall')).toBe(
      before.room.regions.find((r) => r.id === 'hall')
    );
    expect(before).toEqual(saved);
    expect(setRegionGroundBase(next, 'court', GRASS)).toBe(next);
  });

  it('keeps explicit paint equal to the old base when the base changes', () => {
    const base = setRegionGroundBase(room(), 'court', GRASS);
    const same = paintRegionGround(base, 'court', [A], GRASS);
    const dirt = paintRegionGround(same, 'court', [B], DIRT);
    const changed = setRegionGroundBase(dirt, 'court', STONE);
    expect([A, B, C].map((c) => groundRefAt(court(changed), c))).toEqual([
      GRASS,
      DIRT,
      STONE,
    ]);
    expect(court(changed).ground?.paint).toEqual([
      { ref: DIRT, cells: [{ r: 0, q: [[1, 1]] }] },
      { ref: GRASS, cells: [{ r: 0, q: [[0, 0]] }] },
    ]);
    expect(paintRegionGround(changed, 'court', [B, B], DIRT)).toBe(changed);
  });

  it('replaces paint and erases back to the current base without clearing other cells', () => {
    let draft = setRegionGroundBase(room(), 'court', GRASS);
    draft = paintRegionGround(draft, 'court', [C, A, B, B], DIRT);
    expect(court(draft).ground?.paint).toEqual([
      { ref: DIRT, cells: [{ r: 0, q: [[0, 2]] }] },
    ]);
    draft = paintRegionGround(draft, 'court', [B], STONE);
    draft = paintRegionGround(draft, 'court', [A], null);
    expect([A, B, C].map((c) => groundRefAt(court(draft), c))).toEqual([
      GRASS,
      STONE,
      DIRT,
    ]);
    expect(paintRegionGround(draft, 'court', [A], null)).toBe(draft);
    expect(paintRegionGround(draft, 'court', [], DIRT)).toBe(draft);
    const reset = setRegionGroundBase(draft, 'court', null);
    expect(groundRefAt(court(reset), A)).toBeUndefined();
    expect(groundRefAt(court(reset), B)).toBe(STONE);
    expect(setRegionGroundBase(reset, 'court', null)).toBe(reset);
  });

  it('returns to genuine absence after clearing the only authored ground choice', () => {
    const before = room();
    expect(groundRefAt(court(before), A)).toBeUndefined();
    const painted = paintRegionGround(before, 'court', [A], DIRT);
    const erased = paintRegionGround(painted, 'court', [A], null);
    expect(court(erased)).not.toHaveProperty('ground');
    expect(erased).toEqual(before);
  });

  it('refuses invalid references, stale targets and off-region strokes atomically', () => {
    const before = room();
    const saved = structuredClone(before);
    for (const bad of ['', ' ', ' grass ']) {
      expect(() => setRegionGroundBase(before, 'court', bad)).toThrow(/ref/i);
      expect(() => paintRegionGround(before, 'court', [A], bad)).toThrow(
        /ref/i
      );
    }
    expect(() => setRegionGroundBase(before, 'gone', GRASS)).toThrow(/region/i);
    expect(() =>
      paintRegionGround(before, 'court', [A, { q: 3, r: 0 }], DIRT)
    ).toThrow(/region/i);
    expect(() =>
      paintRegionGround(before, 'court', [{ q: 0.5, r: 0 }], DIRT)
    ).toThrow(/cell|hex/i);
    expect(before).toEqual(saved);
  });

  it('prunes paint when floor is removed or moved, without copying the old look into the destination', () => {
    let before = setRegionGroundBase(room(), 'court', GRASS);
    before = paintRegionGround(before, 'court', [A, B], DIRT);
    const erased = eraseCells(before, [A]);
    expect(court(erased).ground?.paint).toEqual([
      { ref: DIRT, cells: [{ r: 0, q: [[1, 1]] }] },
    ]);
    const moved = paintCells(erased, [B], 'hall');
    expect(court(moved).ground).toEqual({ baseRef: GRASS });
    expect(moved.room.regions.find((r) => r.id === 'hall')).not.toHaveProperty(
      'ground'
    );
    expect(court(before).ground?.paint).toEqual([
      { ref: DIRT, cells: [{ r: 0, q: [[0, 1]] }] },
    ]);
    expect(() =>
      stringifyRoomDraft(removeRegion(before, 'court'))
    ).not.toThrow();
  });
});

describe('region ground persistence', () => {
  it('retains base and explicit same-as-base paint through local, composition and native YAML round trips', () => {
    let draft = setRegionGroundBase(room(), 'court', GRASS);
    draft = paintRegionGround(draft, 'court', [A], GRASS);
    draft = paintRegionGround(draft, 'court', [B], DIRT);
    const expected = {
      baseRef: GRASS,
      paint: [
        { ref: DIRT, cells: [{ r: 0, q: [[1, 1]] }] },
        { ref: GRASS, cells: [{ r: 0, q: [[0, 0]] }] },
      ],
    };
    const local = parseRoomDraftJson(stringifyRoomDraft(draft));
    const composition = decodeRoomDocumentJson(encodeRoomDocument(draft));
    const site = decodeSingleRoomDungeon(
      encodeSingleRoomDungeon({ key: 'ground-test', draft })
    ).draft;
    for (const restored of [local, composition, site])
      expect(court(restored).ground).toEqual(expected);
    expect(court(room())).not.toHaveProperty('ground');
    expect(
      court(parseRoomDraftJson(stringifyRoomDraft(room())))
    ).not.toHaveProperty('ground');
  });

  it('preserves unknown future ground fields while editing known intent', () => {
    const draft = room();
    Object.assign(court(draft), {
      ground: { baseRef: GRASS, future: { value: 7 } },
    });
    const restored = parseRoomDraftJson(stringifyRoomDraft(draft));
    const changed = paintRegionGround(restored, 'court', [A], DIRT);
    expect(court(changed).ground).toMatchObject({ future: { value: 7 } });
  });

  it.each([
    null,
    { baseRef: null },
    { baseRef: '' },
    { paint: null },
    { paint: [{ ref: '', cells: [{ r: 0, q: [[0, 0]] }] }] },
    { paint: [{ ref: DIRT, cells: [{ r: 0, q: [[3, 3]] }] }] },
    { paint: [{ ref: DIRT, cells: [{ r: 0, q: [[1, 0]] }] }] },
    { paint: [{ ref: DIRT, cells: [{ r: 0, q: [[0, 16777216]] }] }] },
    {
      paint: [
        { ref: DIRT, cells: [{ r: 0, q: [[0, 0]] }] },
        { ref: GRASS, cells: [{ r: 0, q: [[0, 0]] }] },
      ],
    },
  ])(
    'refuses malformed, conflicting or orphan ground assignments: %j',
    (ground) => {
      const draft = room();
      Object.assign(court(draft), { ground });
      expect(() => stringifyRoomDraft(draft)).toThrow(/ground/);
    }
  );
});
