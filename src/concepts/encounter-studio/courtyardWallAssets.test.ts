import { GENERATED_WORLD_MATERIALS } from '@/generated/worldMaterialCatalog';
import { describe, expect, it } from 'vitest';
import { WORLD_BUILDING_CATALOG_BY_REF } from '../world-building/catalog';
import {
  createWall,
  isRepeatableWallAsset,
  layoutWallPieces,
  repeatableWallAssetRefs,
} from '../world-building/structuralWallEditing';
import { wallFitAsset } from '../world-building/wallCornerFits';

const KINGDOM = 'dnd5e:env:fantasy-kingdom:';

// Catches a stale consumer pin or eligibility regression which makes a
// published solid house-wall choice disappear from the actual wall tool.
describe('published courtyard wall choices', () => {
  it.each(['01', '02', '03', '04', '05', '06', '07', '08', '09'])(
    'selects and lays out House Wall %s through the existing wall tool',
    (suffix) => {
      const ref = `${KINGDOM}house_wall_${suffix}`;
      expect(repeatableWallAssetRefs()).toContain(ref);
      const entry = WORLD_BUILDING_CATALOG_BY_REF.get(ref);
      if (entry?.source !== 'generated') throw Error(`Missing wall: ${ref}`);
      expect(entry.thumbnail).toMatch(/^\/models\/synty\//);
      const [width, height, depth] = entry.asset.boundsMeters;
      const wall = createWall({
        id: 'courtyard-edge',
        start: { x: 0, z: 0 },
        end: { x: 8, z: 0 },
        assetRef: ref,
        height: 3,
        thickness: 0.3,
        elevation: 0,
      });
      const spans = layoutWallPieces({
        wall,
        sourceWidthMeters: width,
        sourceHeightMeters: height,
        sourceDepthMeters: depth,
      });
      expect(spans).not.toHaveLength(0);
      expect(spans.flatMap((span) => span.pieces)).not.toHaveLength(0);
      for (const piece of spans.flatMap((span) => span.pieces)) {
        for (const scale of [
          piece.widthScale,
          piece.heightScale,
          piece.depthScale,
        ]) {
          expect(Number.isFinite(scale)).toBe(true);
          expect(scale).toBeGreaterThan(0);
        }
      }
    }
  );

  it('keeps the newly published moving house leaf out of repeated wall choices', () => {
    const ref = `${KINGDOM}house_wall_leaf_01`;
    const entry = WORLD_BUILDING_CATALOG_BY_REF.get(ref);
    expect(entry).toBeDefined();
    expect(isRepeatableWallAsset(entry!)).toBe(false);
    expect(repeatableWallAssetRefs()).not.toContain(ref);
  });

  it('does not confer plain-wall miter capability on detailed timber models', () => {
    expect(wallFitAsset(`${KINGDOM}castle_wall_fit_01`)).toBeDefined();
    expect(wallFitAsset(`${KINGDOM}house_wall_05`)).toBeUndefined();
  });

  it.each(['brick', 'dungeon', 'evil', 'large_brick', 'stucco'])(
    'provides the published %s finish with its explicit color/normal resources',
    (name) => {
      const ref = `dnd5e:material:fantasy-kingdom:wall_${name}_01`;
      const material = GENERATED_WORLD_MATERIALS.find((row) => row.ref === ref);
      expect(material, ref).toBeDefined();
      expect(material!.family).toBe('masonry');
      for (const image of [material!.baseColor, material!.normal]) {
        expect(image.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(image.url).toContain(`${image.sha256}.png?v=${image.sha256}`);
      }
      expect(material!.baseColor.sha256).not.toBe(material!.normal.sha256);
      expect(
        material!.repeatMeters.every(
          (value) => Number.isFinite(value) && value > 0
        )
      ).toBe(true);
    }
  );
});
