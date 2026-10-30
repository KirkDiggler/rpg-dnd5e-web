import { objectShape, rejectUnknownKeys } from './strictShape';
import type { RoomHexCell } from './workspaceGeometry';

/**
 * A REGION'S CELLS ARE ROW RUNS (rpg-project#725, design R2).
 *
 * For each axial row `r`, the inclusive `[qStart, qEnd]` spans of `q` the
 * region owns. The runs are CANONICAL — rows ascend by `r` with no repeat,
 * spans ascend and neither overlap nor touch — so one cell set has exactly one
 * spelling and a repaint diffs per row. They are what the compiler reads; no
 * bitmap, outline-fill or hole grammar exists.
 *
 * The refusals are the toolkit's own (`dungeonspec.ExpandRows`), word for
 * word and at the same path, so a file the studio refuses is the file the
 * engine would refuse, and a file the studio writes is one the engine reads.
 */
export interface RoomCellRow {
  r: number;
  /** Inclusive `[qStart, qEnd]` spans, ascending and merged. */
  q: Array<[number, number]>;
}

/** The toolkit's integer defence (`maxSiteCoord`): not a map size. */
export const MAX_SITE_COORD = 2 ** 24;

const ROW_KEYS = ['r', 'q'] as const;

const inBound = (v: number) => v <= MAX_SITE_COORD && v >= -MAX_SITE_COORD;

/** The canonical rows of a cell set, whatever order or repeats it came in. */
export function toRows(cells: readonly RoomHexCell[]): RoomCellRow[] {
  const byRow = new Map<number, number[]>();
  for (const { q, r } of cells) {
    const row = byRow.get(r);
    if (row) row.push(q);
    else byRow.set(r, [q]);
  }
  return [...byRow.keys()]
    .sort((a, b) => a - b)
    .map((r) => {
      const qs = [...new Set(byRow.get(r))].sort((a, b) => a - b);
      const spans: Array<[number, number]> = [];
      for (const q of qs) {
        const last = spans.at(-1);
        if (last && q === last[1] + 1) last[1] = q;
        else spans.push([q, q]);
      }
      return { r, q: spans };
    });
}

/** The cells the rows list, in canonical axial order (ascending r, then q).
 * Throws the first way the rows are not canonical, as `<path>...: <why>`. */
export function fromRows(value: unknown, path: string): RoomHexCell[] {
  if (!Array.isArray(value)) throw new Error(`${path}: must be a list`);
  const out: RoomHexCell[] = [];
  let previous: number | undefined;
  value.forEach((source, j) => {
    const rowPath = `${path}[${j}]`;
    const row = objectShape(source, rowPath);
    rejectUnknownKeys(row, ROW_KEYS, rowPath);
    const r = row.r;
    if (typeof r !== 'number' || !Number.isInteger(r))
      throw new Error(`${rowPath}.r: must be an integer`);
    if (previous !== undefined && r <= previous)
      throw new Error(`${rowPath}: rows must be ascending by r`);
    if (!inBound(r))
      throw new Error(`${rowPath}.r: is beyond the coordinate bound`);
    previous = r;
    if (!Array.isArray(row.q)) throw new Error(`${rowPath}.q: must be a list`);
    if (row.q.length === 0) throw new Error(`${rowPath}.q: must not be empty`);
    let end: number | undefined;
    row.q.forEach((span: unknown, k: number) => {
      const spanPath = `${rowPath}.q[${k}]`;
      if (
        !Array.isArray(span) ||
        span.length !== 2 ||
        !span.every((v) => typeof v === 'number' && Number.isInteger(v))
      )
        throw new Error(`${spanPath}: must be a pair of integers`);
      const [start, stop] = span as [number, number];
      if (!inBound(start) || !inBound(stop))
        throw new Error(`${spanPath}: is beyond the coordinate bound`);
      if (start > stop) throw new Error(`${spanPath}: must not be descending`);
      if (end !== undefined && start <= end + 1)
        throw new Error(`${spanPath}: spans must be ascending and merged`);
      end = stop;
      for (let q = start; q <= stop; q++) out.push({ q, r });
    });
  });
  return out;
}

/** How many cells canonical rows list, without listing them. */
export function rowCellCount(rows: readonly RoomCellRow[]): number {
  let count = 0;
  for (const row of rows) for (const [a, b] of row.q) count += b - a + 1;
  return count;
}
