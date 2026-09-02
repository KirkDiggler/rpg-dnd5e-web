import { describe, expect, it } from 'vitest';
import { hexEdgeBetween } from '../../components/hex-grid/hexMath';
import { boundariesToWallRuns } from '../../components/session/atlasWallRuns';
import { vertexKey } from '../../hooks/authoredWallRuns';
import { sandboxDocForSearch } from '../DungeonBuilderSandbox';
import { compiledWalls, emitDungeon, parseDungeon } from '../dungeonYaml';
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

  it('forces a long run, distinct corners, a genuine T-junction, and both wall heights', () => {
    const doc = cryptPropShowcaseDoc();
    const atlas = fixtureAtlasOf(doc);
    const scene = boundariesToWallRuns(atlas, 1);
    const endpointDegree = new Map<string, number>();
    for (const wall of compiledWalls(doc)) {
      const { a, b } = hexEdgeBetween(
        {
          x: wall.edge[0].q,
          y: -wall.edge[0].q - wall.edge[0].r,
          z: wall.edge[0].r,
        },
        {
          x: wall.edge[1].q,
          y: -wall.edge[1].q - wall.edge[1].r,
          z: wall.edge[1].r,
        },
        1
      );
      for (const endpoint of [a, b]) {
        const key = vertexKey(endpoint);
        endpointDegree.set(key, (endpointDegree.get(key) ?? 0) + 1);
      }
    }

    expect(Math.max(...endpointDegree.values())).toBeGreaterThanOrEqual(3);
    expect(
      [...endpointDegree.values()].filter((degree) => degree === 2).length
    ).toBeGreaterThanOrEqual(2);
    expect(scene.wallRuns.some((run) => run.key.split(';').length >= 6)).toBe(
      true
    );
    expect(doc.walls.some((wall) => wall.height === undefined)).toBe(true);
    expect(doc.walls.some((wall) => wall.height === 2)).toBe(true);
    expect(scene.doorGaps).toHaveLength(1);
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
