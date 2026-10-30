import { describe, expect, it } from 'vitest';
import { fromRows, toRows } from './regionRuns';

// A region's cells are ROW RUNS (rpg-project#725 R2): canonical, lossless,
// and refused in the toolkit's own words (`dungeonspec.ExpandRows`) when they
// are not canonical, so a file the studio writes is one the engine reads and a
// file the engine refuses is refused here first, at the same path.
const path = 'room.room.regions[0].cells';

describe('toRows', () => {
  it('writes the castle gatehouse row as one span', () => {
    expect(toRows([-2, -1, 0, 1, 2].map((q) => ({ q, r: -6 })))).toEqual([
      { r: -6, q: [[-2, 2]] },
    ]);
  });

  it('is canonical whatever order the cells arrive in: rows ascend, spans merge and split at gaps', () => {
    const cells = [
      { q: 9, r: -5 },
      { q: -3, r: -5 },
      { q: 3, r: -5 },
      { q: 0, r: -6 },
      ...[-2, -1, 0, 1, 2].map((q) => ({ q, r: -5 })),
      { q: 6, r: -5 },
      { q: 7, r: -5 },
      { q: 8, r: -5 },
      { q: 0, r: -6 },
    ];
    expect(toRows(cells)).toEqual([
      { r: -6, q: [[0, 0]] },
      {
        r: -5,
        q: [
          [-3, 3],
          [6, 9],
        ],
      },
    ]);
  });

  it('writes no row for no cells', () => {
    expect(toRows([])).toEqual([]);
  });
});

describe('fromRows', () => {
  it('expands rows in canonical axial order and round-trips toRows', () => {
    const rows = [
      { r: -6, q: [[-2, 2]] },
      {
        r: -5,
        q: [
          [-3, 3],
          [6, 9],
        ],
      },
    ];
    const cells = fromRows(rows, path);
    expect(cells).toHaveLength(5 + 7 + 4);
    expect(cells[0]).toEqual({ q: -2, r: -6 });
    expect(cells.at(-1)).toEqual({ q: 9, r: -5 });
    expect(toRows(cells)).toEqual(rows);
  });

  it('refuses touching spans at the second span', () => {
    expect(() =>
      fromRows(
        [
          {
            r: 0,
            q: [
              [1, 3],
              [4, 6],
            ],
          },
        ],
        path
      )
    ).toThrow(`${path}[0].q[1]: spans must be ascending and merged`);
  });

  it('refuses a descending span', () => {
    expect(() => fromRows([{ r: 0, q: [[3, 1]] }], path)).toThrow(
      `${path}[0].q[0]: must not be descending`
    );
  });

  it('refuses unsorted rows and a repeated row', () => {
    expect(() =>
      fromRows(
        [
          { r: 2, q: [[0, 0]] },
          { r: 1, q: [[0, 0]] },
        ],
        path
      )
    ).toThrow(`${path}[1]: rows must be ascending by r`);
    expect(() =>
      fromRows(
        [
          { r: 1, q: [[0, 0]] },
          { r: 1, q: [[4, 4]] },
        ],
        path
      )
    ).toThrow(`${path}[1]: rows must be ascending by r`);
  });

  it('refuses a span that is not a pair of integers, and a row with no span', () => {
    expect(() => fromRows([{ r: 0, q: [[1, 2.5]] }], path)).toThrow(
      `${path}[0].q[0]: must be a pair of integers`
    );
    expect(() => fromRows([{ r: 0, q: [[1, 2, 3]] }], path)).toThrow(
      `${path}[0].q[0]: must be a pair of integers`
    );
    expect(() => fromRows([{ r: 0, q: [] }], path)).toThrow(
      `${path}[0].q: must not be empty`
    );
    expect(() => fromRows([{ r: 0.5, q: [[0, 0]] }], path)).toThrow(
      `${path}[0].r: must be an integer`
    );
  });

  it('refuses an unknown key on a row and a non-list cells value', () => {
    expect(() => fromRows([{ r: 0, q: [[0, 0]], s: 1 }], path)).toThrow(
      `${path}[0] has an unsupported field: s.`
    );
    expect(() => fromRows({ r: 0 }, path)).toThrow(`${path}: must be a list`);
  });

  it('refuses a coordinate beyond the toolkit bound', () => {
    expect(() => fromRows([{ r: 0, q: [[0, 2 ** 24 + 1]] }], path)).toThrow(
      `${path}[0].q[0]: is beyond the coordinate bound`
    );
  });
});
