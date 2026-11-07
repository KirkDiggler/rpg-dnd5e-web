import { create } from '@bufbuild/protobuf';
import { GetAtlasResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  CellsLearnedSchema,
  SecretRevealedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { cellsPatchOf, secretPatchOf } from './actGeometry';
import { applyCellsRevealed } from './applyReveal';
import { buildScene3D } from './atlasToScene3D';

const GRASS = 'dnd5e:ground:fantasy-kingdom:grass_01';
const DIRT = 'dnd5e:ground:fantasy-kingdom:dirt_01';
const point = (x: number) => ({ x, y: 0 });
const metadata = {
  id: 'court',
  archetype: 'crypt',
  lighting: { intensity: 1 },
};

describe('ground through snapshot and discovery', () => {
  it('keeps older explicit paint when a new cell has only the base, and retains same-as-base paint', () => {
    const initial = create(GetAtlasResponseSchema, {
      cells: [point(0)],
      regions: [
        {
          ...metadata,
          cells: [point(0)],
          ground: { baseRef: GRASS, paint: [{ ref: DIRT, cells: [point(0)] }] },
        },
      ],
    });
    const first = cellsPatchOf(
      create(CellsLearnedSchema, {
        regions: [
          { ...metadata, cells: [point(1)], ground: { baseRef: GRASS } },
        ],
      })
    );
    const next = applyCellsRevealed(initial, first);
    expect(
      next.regions[0].ground?.paint.map((p) => [p.ref, p.cells.map((c) => c.x)])
    ).toEqual([[DIRT, [0]]]);
    const second = cellsPatchOf(
      create(CellsLearnedSchema, {
        regions: [
          {
            ...metadata,
            cells: [point(2)],
            ground: {
              baseRef: GRASS,
              paint: [{ ref: GRASS, cells: [point(2)] }],
            },
          },
        ],
      })
    );
    const complete = applyCellsRevealed(next, second);
    expect(
      complete.regions[0].ground?.paint.map((p) => [
        p.ref,
        p.cells.map((c) => c.x),
      ])
    ).toEqual([
      [DIRT, [0]],
      [GRASS, [2]],
    ]);
    expect(applyCellsRevealed(complete, second)).toEqual(complete);
    const scene = buildScene3D(complete, 1, 'pointy');
    expect([...scene.groundRefs!]).toEqual([
      ['0,0,0', DIRT],
      ['1,-1,0', GRASS],
      ['2,-2,0', GRASS],
    ]);
    expect(scene.floorTiles.size).toBe(3);
    first.regions[0].ground!.baseRef = 'changed';
    expect(next.regions[0].ground?.baseRef).toBe(GRASS);
  });

  it('carries a revealed secret through the existing v2-to-atlas bridge', () => {
    const patch = secretPatchOf(
      create(SecretRevealedSchema, {
        concealment: 'garden',
        regions: [
          {
            ...metadata,
            cells: [point(4)],
            ground: {
              baseRef: GRASS,
              paint: [{ ref: DIRT, cells: [point(4)] }],
            },
          },
        ],
      })
    );
    expect(patch.regions[0].ground?.baseRef).toBe(GRASS);
    expect(
      patch.regions[0].ground?.paint[0].cells.map((p) => [p.x, p.y])
    ).toEqual([[4, 0]]);
  });

  it('never turns paint outside a delivered region into a rendered appearance', () => {
    const bad = create(GetAtlasResponseSchema, {
      cells: [point(0)],
      regions: [
        {
          ...metadata,
          cells: [point(0)],
          ground: { baseRef: GRASS, paint: [{ ref: DIRT, cells: [point(9)] }] },
        },
      ],
    });
    expect(() => buildScene3D(bad, 1, 'pointy')).toThrow(/ground.*outside/i);
    const patch = cellsPatchOf(
      create(CellsLearnedSchema, {
        regions: [
          {
            ...metadata,
            cells: [point(1)],
            ground: { paint: [{ ref: DIRT, cells: [point(9)] }] },
          },
        ],
      })
    );
    expect(() =>
      applyCellsRevealed(create(GetAtlasResponseSchema), patch)
    ).toThrow(/ground.*outside/i);
  });

  it('retains the old renderer path when no ground was authored', () => {
    const scene = buildScene3D(
      create(GetAtlasResponseSchema, {
        cells: [point(0)],
        regions: [{ ...metadata, cells: [point(0)] }],
      }),
      1,
      'pointy'
    );
    expect(scene.groundRefs?.size ?? 0).toBe(0);
    expect(scene.floorTiles.size).toBe(1);
  });
});
