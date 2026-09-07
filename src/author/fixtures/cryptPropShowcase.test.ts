import { describe, expect, it } from 'vitest';
import { HEX_SIZE } from '../../components/hex-grid/hexMath';
import { segmentsToWallRuns } from '../../components/session/atlasWallRuns';
import { sandboxDocForSearch } from '../DungeonBuilderSandbox';
import { emitDungeon, parseDungeon } from '../dungeonYaml';
import { latticeKey, latticeOf, type PositionRef } from '../hexGeometry';
import { fromOffset } from '../hexOffset';
import { cryptPropShowcaseDoc } from './cryptPropShowcase';
import { fixtureAtlasOf } from './fixtureAtlas';

describe('cryptPropShowcaseDoc', () => {
  it('is a continuous crypt floor with crypt-only regions', () => {
    const doc = cryptPropShowcaseDoc();
    expect(doc.regions.length).toBeGreaterThan(1);
    expect(doc.regions.every((region) => region.archetype === 'crypt')).toBe(
      true
    );

    const expected = new Set(
      Array.from({ length: 12 }, (_, row) =>
        Array.from({ length: 20 }, (_, col) => {
          const cell = fromOffset('pointy', [col, row]);
          return `${cell.q},${cell.r}`;
        })
      ).flat()
    );
    const actual = new Set(
      doc.regions.flatMap((region) =>
        region.cells.map((cell) => `${cell.q},${cell.r}`)
      )
    );
    expect(actual).toEqual(expected);
  });

  it('four walls share a T-junction and a plain corner, and span both heights (rpg-project#360 slice 2)', () => {
    const doc = cryptPropShowcaseDoc();
    expect(doc.walls).toHaveLength(4);

    // The junction is one position THREE walls end at (west wall's end,
    // east wall's start, the raised branch's start) — a genuine
    // T-junction, not a chain fitted from crossings. The east end is a
    // position only TWO walls share — a plain corner.
    const posKey = (p: PositionRef) =>
      latticeKey(latticeOf(doc.orientation, p));
    const degree = new Map<string, number>();
    for (const wall of doc.walls) {
      for (const end of [wall.start, wall.end]) {
        const key = posKey(end);
        degree.set(key, (degree.get(key) ?? 0) + 1);
      }
    }
    const junctionKey = latticeKey({ u: 43, v: 9 });
    const eastEndKey = latticeKey({ u: 59, v: 9 });
    expect(degree.get(junctionKey)).toBe(3);
    expect(degree.get(eastEndKey)).toBe(2);

    expect(doc.walls.some((wall) => wall.height === undefined)).toBe(true);
    expect(doc.walls.some((wall) => wall.height === 2)).toBe(true);
  });

  it('renders the locked gate splitting the west wall into two runs, the other three walls whole', () => {
    const doc = cryptPropShowcaseDoc();
    const atlas = fixtureAtlasOf(doc);
    const scene = segmentsToWallRuns(atlas, HEX_SIZE);

    expect(scene.doorGaps).toHaveLength(1);
    // 4 authored walls; the door sits inside the west wall's span alone,
    // splitting it into 2 runs — 5 runs in all.
    expect(scene.wallRuns).toHaveLength(5);
  });

  it('contains the locked doorway whose leaf must remain closed', () => {
    const doc = cryptPropShowcaseDoc();
    expect(doc.doors).toHaveLength(1);
    expect(doc.doors[0]).toMatchObject({
      id: 'crypt-sealed-gate',
      locked: [{ ability: 'dex', dc: 15 }],
    });
    expect(doc.doors[0]?.closed).toBeUndefined();
  });

  it('contains exactly the three first-wave refs with authored facing and offset', () => {
    const doc = cryptPropShowcaseDoc();
    expect(doc.place.map((p) => p.ref)).toEqual([
      'dnd5e:props:skeleton-cage',
      'dnd5e:props:skeleton-table',
      'dnd5e:props:rug',
    ]);
    expect(doc.place.map((p) => [p.facing, p.offset])).toEqual([
      ['se', [0, 0]],
      ['e', [0, 0]],
      ['e', [0, 0]],
    ]);
  });

  it('round-trips byte-for-byte and projects the same three atlas refs', () => {
    const doc = cryptPropShowcaseDoc();
    const yaml = emitDungeon(doc);
    expect(emitDungeon(parseDungeon(yaml))).toBe(yaml);
    expect(fixtureAtlasOf(doc).props.map((p) => p.ref)).toEqual(
      doc.place.map((p) => p.ref)
    );
  });

  it('returns the reference tomb for an empty search', () => {
    expect(sandboxDocForSearch('').key).toBe('reference-tomb');
  });

  it('returns the crypt prop showcase for the crypt-props fixture query', () => {
    expect(sandboxDocForSearch('?authorFixture=crypt-props').key).toBe(
      'crypt-prop-showcase'
    );
  });

  it('returns the crypt lighting showcase for the crypt-lighting fixture query', () => {
    expect(sandboxDocForSearch('?authorFixture=crypt-lighting').key).toBe(
      'crypt-lighting-showcase'
    );
  });
});
