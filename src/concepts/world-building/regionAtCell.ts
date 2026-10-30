import type { RoomDraft, RoomHexCell, RoomRegion } from './roomDraft';
import { isFloorCell } from './roomDraft';

/** The region that owns one cell, or none (rpg-project#725: no cell belongs
 * to two regions). PRESENTATION ONLY: this names the place drawn at the cell
 * for the inspector, never membership for a rule. */
export function regionsAtCell(input: {
  draft: Readonly<Pick<RoomDraft, 'room'>>;
  cell: RoomHexCell;
}): RoomRegion[] {
  const { draft, cell } = input;
  if (!isFloorCell(draft, cell)) return [];
  return draft.room.regions.filter((region) =>
    region.cells.some(
      (row) =>
        row.r === cell.r && row.q.some(([a, b]) => cell.q >= a && cell.q <= b)
    )
  );
}
