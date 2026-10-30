import type { RegionResolution } from './authoringRegions';
import type { RoomHexCell } from './roomDraft';

export interface RegionSize {
  /** The region's own cells. */
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
export function regionSize(resolution: RegionResolution): RegionSize | null {
  if (resolution.status !== 'resolved') return null;
  const cells = resolution.area.cells.map((cell) => ({ ...cell }));
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

/** "27 hexes · 9 × 4", or "no hexes" for a declared, unpainted region. */
export function regionSizeText(size: RegionSize | null): string {
  if (!size) return 'no hexes';
  return `${size.hexes} ${size.hexes === 1 ? 'hex' : 'hexes'} · ${size.width} × ${size.height}`;
}
