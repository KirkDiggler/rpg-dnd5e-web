// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { regionsAtCell } from './regionAtCell';
import { createRegion } from './regionEdits';
import { createRoomDraft, eraseCells, paintCells } from './roomDraft';
import { createEmptyScene } from './sceneState';

function hallAndNook() {
  let draft = createRoomDraft(createEmptyScene('scene'), 'room');
  draft = paintCells(draft, [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 2, r: 0 },
  ]);
  draft = createRegion(draft, 'nook', 'Nook');
  return paintCells(draft, [{ q: 1, r: 1 }], 'nook');
}

describe('regionsAtCell', () => {
  it('names the region that owns a painted cell', () => {
    const draft = hallAndNook();
    expect(
      regionsAtCell({ draft, cell: { q: 1, r: 1 } }).map((r) => r.id)
    ).toEqual(['nook']);
    expect(
      regionsAtCell({ draft, cell: { q: 2, r: 0 } }).map((r) => r.id)
    ).toEqual(['room-region']);
  });

  it('a cell that is not floor belongs to no region', () => {
    const draft = hallAndNook();
    expect(regionsAtCell({ draft, cell: { q: 0, r: 1 } })).toEqual([]);
    expect(
      regionsAtCell({
        draft: eraseCells(draft, [{ q: 1, r: 1 }]),
        cell: { q: 1, r: 1 },
      })
    ).toEqual([]);
  });

  // No cell belongs to two regions (rpg-project#725): painting a cell into a
  // region moves it out of the one that held it, so a cell never reports two.
  it('repainting a cell moves it, so one region at most is reported', () => {
    const draft = paintCells(hallAndNook(), [{ q: 0, r: 0 }], 'nook');
    expect(
      regionsAtCell({ draft, cell: { q: 0, r: 0 } }).map((r) => r.id)
    ).toEqual(['nook']);
  });

  it('a declared, unpainted region is never reported', () => {
    const draft = createRegion(hallAndNook(), 'cellar', 'Cellar');
    for (const cell of [
      { q: 0, r: 0 },
      { q: 1, r: 1 },
      { q: 5, r: 5 },
    ])
      expect(
        regionsAtCell({ draft, cell }).some((r) => r.id === 'cellar')
      ).toBe(false);
  });
});
