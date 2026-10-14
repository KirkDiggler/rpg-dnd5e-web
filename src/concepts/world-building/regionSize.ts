import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import type { RegionResolution } from './authoringRegions';
import { exactPoint, pointInRing } from './regionBoundaryPredicates';
import type { RoomDraft, RoomHexCell } from './roomDraft';
import { workspaceCells } from './workspaceGeometry';

export interface RegionSize {
  /** The counted cells: a hex-union's own cells, or the workspace cells
   * whose centre is inside a polygon's ring (the rule `regionsAtCell` uses). */
  readonly cells: readonly RoomHexCell[];
  readonly hexes: number;
  /** Odd-r column span of the counted cells. */
  readonly width: number;
  /** Row span of the counted cells. */
  readonly height: number;
}

/** How big a drawn region is, from its resolution, never from geometry the
 * studio guesses. PRESENTATION ONLY: the counted cells are where the region
 * is drawn, not membership for a rule. Null when unresolved. */
export function regionSize(
  draft: Readonly<Pick<RoomDraft, 'workspace'>>,
  resolution: RegionResolution
): RegionSize | null {
  if (resolution.status !== 'resolved') return null;
  const area = resolution.area;
  let cells: RoomHexCell[];
  if (area.kind === 'hex-union')
    cells = area.cells.map((cell) => ({ ...cell }));
  else {
    const ring = area.ring.map(exactPoint);
    cells = workspaceCells(draft.workspace).filter((cell) => {
      const centre = cubeToWorld(
        { x: cell.q, y: -cell.q - cell.r, z: cell.r },
        HEX_SIZE
      );
      return pointInRing(ring, { x: centre.x, z: centre.z }) === 'inside';
    });
  }
  if (!cells.length) return { cells, hexes: 0, width: 0, height: 0 };
  let minCol = Infinity,
    maxCol = -Infinity,
    minRow = Infinity,
    maxRow = -Infinity;
  for (const cell of cells) {
    const col = cell.q + Math.floor(cell.r / 2);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
    minRow = Math.min(minRow, cell.r);
    maxRow = Math.max(maxRow, cell.r);
  }
  return {
    cells,
    hexes: cells.length,
    width: maxCol - minCol + 1,
    height: maxRow - minRow + 1,
  };
}

/** "27 hexes · 9 × 4", or "unresolved". */
export function regionSizeText(size: RegionSize | null): string {
  if (!size) return 'unresolved';
  return `${size.hexes} ${size.hexes === 1 ? 'hex' : 'hexes'} · ${size.width} × ${size.height}`;
}
