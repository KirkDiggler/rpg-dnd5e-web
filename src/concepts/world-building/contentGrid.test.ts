import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readDraftYaml } from '../encounter-studio/draftFile';
import { contentWorkspace } from './contentGrid';
import {
  createRoomDraft,
  paintCells,
  validateRoomDocument,
  type RoomDraft,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import { decodeSingleRoomDungeon } from './singleRoomDungeon';
import {
  containsWorkspaceCell,
  MAX_GRID_HEXES,
  MAX_GRID_SIDE,
  rectangleOf,
} from './workspaceGeometry';

/** The three documents from the #1351 review: each is accepted by the draft
 * gate and round-trips, and each spans more than the drawn grid's cap. */
function farFloor(): RoomDraft {
  return paintCells(createRoomDraft(createEmptyScene('s'), 'room'), [
    { q: 0, r: 0 },
    { q: 5000, r: 0 },
  ]);
}
function farPartyStart(): RoomDraft {
  const sample = decodeSingleRoomDungeon(
    readFileSync(
      'src/concepts/world-building/fixtures/samples/01-minimal.yaml',
      'utf8'
    )
  ).draft;
  return {
    ...sample,
    room: { ...sample.room, partyStart: { q: 99999, r: 0 } },
  };
}
function farCastleProp(): RoomDraft {
  const read = readDraftYaml(
    readFileSync(
      'src/concepts/encounter-studio/fixtures/the-mad-king.yaml',
      'utf8'
    )
  );
  if (!read.ok) throw new Error(read.refusal);
  const draft = structuredClone(read.draft);
  draft.scene.items[0]!.transform.x = 9999;
  return draft;
}

// THE DRAWN GRID NEVER THROWS ON ACCEPTED CONTENT (rpg-project#725 R3,
// #1351 review): content wider than the cap is drawn as a capped window.
describe('contentWorkspace on content wider than the grid cap', () => {
  it.each([
    ['a floor at q 0 and q 5000', farFloor],
    ['a party start at q 99999', farPartyStart],
    ['a castle prop at x 9999', farCastleProp],
  ])('%s is accepted, and draws a capped window', (_name, make) => {
    const draft = make();
    expect(() => validateRoomDocument({ draft, scope: {} })).not.toThrow();
    const grid = contentWorkspace(draft);
    const rect = rectangleOf(grid)!;
    expect(rect.widthHexes).toBeLessThanOrEqual(MAX_GRID_SIDE);
    expect(rect.heightHexes).toBeLessThanOrEqual(MAX_GRID_SIDE);
    expect(rect.widthHexes * rect.heightHexes).toBeLessThanOrEqual(
      MAX_GRID_HEXES
    );
  });

  it('centres the window on the view: the cell under the view centre is drawn', () => {
    const draft = farFloor();
    for (const around of [
      { x: 0, z: 0 },
      { x: 4300, z: 0 },
      { x: 8660, z: 0 },
    ]) {
      const grid = contentWorkspace(draft, undefined, around);
      const q = Math.round(around.x / Math.sqrt(3));
      expect(containsWorkspaceCell(grid, { q, r: 0 })).toBe(true);
    }
  });

  it('draws the whole content plus margin while it fits the cap', () => {
    const grid = contentWorkspace(
      paintCells(createRoomDraft(createEmptyScene('s'), 'room'), [
        { q: 0, r: 0 },
        { q: 100, r: 0 },
      ])
    );
    expect(containsWorkspaceCell(grid, { q: 0, r: 0 })).toBe(true);
    expect(containsWorkspaceCell(grid, { q: 100, r: 0 })).toBe(true);
  });
});
