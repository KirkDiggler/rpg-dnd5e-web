import { describe, expect, it } from 'vitest';
import { resolveRegions } from '../world-building/regionBoundaryGeometry';
import type { RoomHexCell } from '../world-building/roomDraft';
import { createCastleKeepDocument } from './fixtures/castleKeep';
import {
  CAST_PALETTE,
  castColour,
  REGION_PALETTE,
  regionColours,
  regionOverview,
} from './overviewColours';

// The colouring reads only ids; cells come from `cellsOf`.
const region = (id: string) => ({ id });
const row = (q0: number, q1: number, r = 0): RoomHexCell[] =>
  Array.from({ length: q1 - q0 + 1 }, (_, i) => ({ q: q0 + i, r }));
const alone = (id: string): number =>
  REGION_PALETTE.indexOf(
    regionColours({ regions: [region(id)], cellsOf: () => row(0, 0) }).get(
      id
    ) as (typeof REGION_PALETTE)[number]
  );

describe('overview colours', () => {
  it('the same regions always get the same colours', () => {
    const input = {
      regions: ['hall', 'yard', 'gate'].map(region),
      cellsOf: (id: string) =>
        id === 'hall' ? row(0, 2) : id === 'yard' ? row(3, 5) : row(6, 8),
    };
    expect([...regionColours(input)]).toEqual([...regionColours(input)]);
    expect(castColour('dnd5e:monsters:guard')).toBe(
      castColour('dnd5e:monsters:guard')
    );
    expect(CAST_PALETTE).toContain(castColour('dnd5e:monsters:guard'));
  });

  it('two adjacent regions never share a slot on the castle fixture', () => {
    const document = createCastleKeepDocument();
    const overview = regionOverview(
      document.draft,
      resolveRegions(document.draft)
    );
    // Regions are the floor (rpg-project#725): the castle's painted regions.
    const regions = document.draft.room.regions.filter(
      (r) => overview.sizes.get(r.id) !== null
    );
    expect(regions.length).toBeGreaterThan(1);
    const keys = new Map(
      regions.map((r) => [
        r.id,
        new Set(overview.sizes.get(r.id)!.cells.map((c) => `${c.q},${c.r}`)),
      ])
    );
    const touches = (a: string, b: string): boolean =>
      [...overview.sizes.get(a)!.cells].some((c) =>
        [
          [0, 0],
          [1, 0],
          [1, -1],
          [0, -1],
          [-1, 0],
          [-1, 1],
          [0, 1],
        ].some(([dq, dr]) => keys.get(b)!.has(`${c.q + dq},${c.r + dr}`))
      );
    let pairs = 0;
    for (const a of regions)
      for (const b of regions)
        if (a.id < b.id && touches(a.id, b.id)) {
          pairs++;
          expect(overview.colours.get(a.id)).not.toBe(
            overview.colours.get(b.id)
          );
        }
    expect(pairs).toBeGreaterThan(0);
  });

  it('a collision steps to the next free slot in authored order', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `room-${i}`);
    const first = ids.find((id) =>
      ids.some((other) => other !== id && alone(other) === alone(id))
    )!;
    const second = ids.find(
      (other) => other !== first && alone(other) === alone(first)
    )!;
    const colours = regionColours({
      regions: [region(first), region(second)],
      cellsOf: (id) => (id === first ? row(0, 2) : row(3, 5)),
    });
    expect(colours.get(first)).toBe(REGION_PALETTE[alone(first)]);
    expect(colours.get(second)).toBe(
      REGION_PALETTE[(alone(first) + 1) % REGION_PALETTE.length]
    );
    // Not neighbours: both keep their hash slot.
    const apart = regionColours({
      regions: [region(first), region(second)],
      cellsOf: (id) => (id === first ? row(0, 2) : row(10, 12)),
    });
    expect(apart.get(second)).toBe(REGION_PALETTE[alone(first)]);
  });

  it("deleting a region with no collisions leaves the others' colours unchanged", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `area-${i}`);
    const picked: string[] = [];
    for (const id of ids)
      if (picked.length < 3 && !picked.some((p) => alone(p) === alone(id)))
        picked.push(id);
    const cells = (id: string): RoomHexCell[] => {
      const index = picked.indexOf(id);
      return row(index * 3, index * 3 + 2);
    };
    const all = regionColours({ regions: picked.map(region), cellsOf: cells });
    const without = regionColours({
      regions: [picked[0], picked[2]].map(region),
      cellsOf: cells,
    });
    expect(without.get(picked[0])).toBe(all.get(picked[0]));
    expect(without.get(picked[2])).toBe(all.get(picked[2]));
  });
});
