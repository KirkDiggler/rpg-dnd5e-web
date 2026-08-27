import {
  coordToKey,
  cubeToWorld,
  HEX_SIZE,
} from '@/components/hex-grid/hexMath';
import {
  computeFloorPoolColor,
  cryptFloorBaseColor,
} from '@/components/hex-grid/syntyHexFloorHelpers';
import {
  buildScene3D,
  positionToCube,
  resolveSceneLayout,
} from '@/components/session/atlasToScene3D';
import { describe, expect, it } from 'vitest';
import { resolveDungeonLighting } from '../../rendering/dungeonLighting';
import { isDungeonLightSourceRef } from '../../rendering/dungeonLightSources';
import { sandboxDocForSearch } from '../DungeonBuilderSandbox';
import { fromOffset } from '../hexOffset';
import { cryptLightingShowcaseDoc } from './cryptLightingShowcase';
import { fixtureAtlasOf } from './fixtureAtlas';
import { referenceTombDoc } from './referenceTomb';

describe('cryptLightingShowcaseDoc', () => {
  it('clones the tomb geometry and retains the three approved region intensities', () => {
    const doc = cryptLightingShowcaseDoc();
    const reference = referenceTombDoc();

    expect(doc.key).toBe('crypt-lighting-showcase');
    expect(doc.name).toBe('Crypt Lighting Showcase');
    expect(doc.regions.map((region) => region.lighting.intensity)).toEqual([
      0.6, 0.4, 0.15,
    ]);
    expect(doc.walls).toEqual(reference.walls);
    expect(doc.doors).toEqual(reference.doors);
  });

  it('places exactly the four approved light sources at useful cells and facings', () => {
    const doc = cryptLightingShowcaseDoc();
    const sources = doc.place.filter((placement) =>
      isDungeonLightSourceRef(placement.ref)
    );
    const p = (col: number, row: number) => fromOffset('pointy', [col, row]);

    expect(sources.map((placement) => placement.ref)).toEqual([
      'dnd5e:props:lantern',
      'dnd5e:props:torch-ornate',
      'dnd5e:props:glowing-orb',
      'dnd5e:props:rune-marker',
    ]);
    expect(
      sources.map((placement) => [placement.at, placement.facing])
    ).toEqual([
      [p(2, 4), 'se'],
      [p(10, 4), 'e'],
      [p(18, 1), 's'],
      [p(26, 6), 'n'],
    ]);
    expect(
      sources.every((placement) => placement.blocksMovement === true)
    ).toBe(true);
    expect(sources.every((placement) => placement.blocksLos === false)).toBe(
      true
    );
  });

  it('keeps part of the authored tomb outside every selected source pool', () => {
    const doc = cryptLightingShowcaseDoc();
    const atlas = fixtureAtlasOf(doc);
    const layout = resolveSceneLayout(atlas);
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;

    const scene = buildScene3D(atlas, HEX_SIZE, layout.layout);
    const plan = resolveDungeonLighting(scene.lighting, { x: 0, z: 0 });
    expect(plan.pointLights).toHaveLength(4);
    expect(
      scene.lighting.sources.every((source) =>
        plan.pointLights.some((light) => light.key === source.key)
      )
    ).toBe(true);

    const tomb = doc.regions.find((region) => region.id === 'tomb');
    expect(tomb).toBeDefined();
    if (!tomb) return;
    const tombCellKeys = tomb.cells.map((cell) =>
      coordToKey(positionToCube({ x: cell.q, y: cell.r } as never))
    );
    const tombCellsWithPools = tombCellKeys.flatMap((cellKey) => {
      const tile = scene.floorTiles.get(cellKey);
      const pools = plan.floorPoolsByCell.get(cellKey) ?? [];
      if (!tile || pools.length === 0) return [];
      return [{ cellKey, tile, pools }];
    });
    expect(tombCellsWithPools.length).toBeGreaterThan(0);

    const darkTombCell = tombCellsWithPools.find(({ tile, pools }) => {
      const world = cubeToWorld(tile, HEX_SIZE);
      return pools.every(
        (pool) =>
          Math.hypot(world.x - pool.position[0], world.z - pool.position[2]) >=
          pool.distance
      );
    });
    expect(darkTombCell).toBeDefined();
    if (!darkTombCell) return;

    const { cellKey, tile, pools } = darkTombCell;
    const world = cubeToWorld(tile, HEX_SIZE);
    for (const pool of pools) {
      expect(
        Math.hypot(world.x - pool.position[0], world.z - pool.position[2])
      ).toBeGreaterThanOrEqual(pool.distance);
    }
    const base = cryptFloorBaseColor(
      plan.floorExposureByCell.get(cellKey) ?? 0
    );
    expect(
      computeFloorPoolColor(base, world.x, world.z, pools).equals(base)
    ).toBe(true);
  });

  it('leaves the original non-light monster placements intact while removing old light and prop dressing', () => {
    const doc = cryptLightingShowcaseDoc();

    expect(
      doc.place.filter((placement) => placement.ref.includes(':monsters:'))
    ).toEqual(
      referenceTombDoc().place.filter((placement) =>
        placement.ref.includes(':monsters:')
      )
    );
    expect(doc.place.map((placement) => placement.ref)).not.toContain(
      'dnd5e:props:brazier'
    );
    expect(doc.place.map((placement) => placement.ref)).not.toContain(
      'dnd5e:props:pillar'
    );
  });

  it('selects the showcase without changing the default or crypt-props sandbox fixtures', () => {
    expect(sandboxDocForSearch('').key).toBe('reference-tomb');
    expect(sandboxDocForSearch('?authorFixture=crypt-props').key).toBe(
      'crypt-prop-showcase'
    );
    expect(sandboxDocForSearch('?authorFixture=crypt-lighting').key).toBe(
      'crypt-lighting-showcase'
    );
  });
});
