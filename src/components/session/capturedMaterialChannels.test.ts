import { create, fromJson, toJson } from '@bufbuild/protobuf';
import { MaterialChannelAdjustmentSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/presentation/material/v1alpha1/types_pb';
import { GetAtlasResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AtlasStructuralDoorSchema,
  AtlasStructuralWallSchema,
  PropPresentationSchema,
  StructuralWallOpeningsReplacementSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  PropPresentationSchema as PropV2Schema,
  AtlasStructuralWallSchema as WallV2Schema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_geometry_pb';
import { CellsLearnedSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { expect, it } from 'vitest';
import { cellsPatchOf } from './actGeometry';
import { applyStructuralRecords } from './applyReveal';
import {
  applyPropPresentations,
  propPresentationItem,
} from './propPresentations';
import {
  structuralLayoutRender,
  structuralWallSurfaceFromAtlas,
} from './structuralLayout';

const channels = () => [
  create(MaterialChannelAdjustmentSchema, {
    targetId: 'body',
    normal: { value: { case: 'multiplier', value: 1 } },
    emissive: { value: { case: 'off', value: {} } },
  }),
];
const expected = [
  {
    targetId: 'body',
    normal: { mode: 'scale', multiplier: 1 },
    emissive: { mode: 'off' },
  },
];
const wall = () =>
  create(AtlasStructuralWallSchema, {
    id: 'wall',
    ref: 'wall-model',
    from: { x: 0, y: 0 },
    to: { x: 10, y: 0 },
    height: 3,
    thickness: 0.3,
    materialChannels: channels(),
  });
const prop = () =>
  create(PropPresentationSchema, {
    id: 'prop',
    ref: 'prop-model',
    origin: { x: 0, y: 0 },
    heightScale: 1,
    materialChannels: channels(),
  });

it('decodes detached wire intent for walls and props without scaling strength or enriching defaults', () => {
  const w = wall(),
    p = prop();
  const surface = structuralWallSurfaceFromAtlas(w, 2);
  const item = propPresentationItem(p, 2);
  expect(surface.appearance.materialChannels).toEqual(expected);
  expect(item.materialChannels).toEqual(expected);
  w.materialChannels[0].targetId = 'changed';
  p.materialChannels[0].targetId = 'changed';
  expect(surface.appearance.materialChannels).toEqual(expected);
  expect(item.materialChannels).toEqual(expected);
  expect(
    propPresentationItem(
      create(PropPresentationSchema, { ...p, materialChannels: [] }),
      1
    )
  ).not.toHaveProperty('materialChannels');
});

it('retains the independent frame when its parent wall is withheld', () => {
  const door = create(AtlasStructuralDoorSchema, {
    id: 'door',
    ref: 'frame-model',
    from: { x: 0, y: 0 },
    to: { x: 2, y: 0 },
    height: 3,
    thickness: 0.3,
    framePresentation: {
      span: { before: 2, after: 2 },
      materialChannels: channels(),
    },
  });
  const result = structuralLayoutRender([], [door], 2);
  expect(result.diagnostics).toEqual([]);
  expect(result.walls).toEqual([]);
  expect(result.doors[0].framePresentation?.materialChannels).toEqual(expected);
  expect(result.doors[0]).not.toHaveProperty('wallId');
});

it('carries v2 live rows and opening-only updates through the existing snapshot cache bridge', () => {
  const patch = cellsPatchOf(
    create(CellsLearnedSchema, {
      structuralWalls: [
        fromJson(WallV2Schema, toJson(AtlasStructuralWallSchema, wall())),
      ],
      propPresentations: [
        fromJson(PropV2Schema, toJson(PropPresentationSchema, prop())),
      ],
    })
  );
  const atlas = applyStructuralRecords(
    create(GetAtlasResponseSchema),
    patch.structuralWalls,
    [],
    []
  );
  const opened = applyStructuralRecords(
    atlas,
    [],
    [],
    [
      create(StructuralWallOpeningsReplacementSchema, {
        wallId: 'wall',
        openings: [{ id: 'gap', position: 2, width: 1 }],
      }),
    ]
  );
  const restored = fromJson(
    GetAtlasResponseSchema,
    toJson(GetAtlasResponseSchema, opened)
  );
  expect(
    structuralWallSurfaceFromAtlas(restored.structuralWalls[0], 1).appearance
      .materialChannels
  ).toEqual(expected);
  expect(
    propPresentationItem(patch.propPresentations[0], 1).materialChannels
  ).toEqual(expected);
});

it('refuses malformed present oneofs and duplicates before a partial cache update', () => {
  for (const rows of [
    [create(MaterialChannelAdjustmentSchema, { targetId: 'body', normal: {} })],
    [
      create(MaterialChannelAdjustmentSchema, {
        targetId: 'body',
        normal: { value: { case: 'multiplier', value: 0 } },
      }),
    ],
    [...channels(), ...channels()],
  ]) {
    const w = wall();
    w.materialChannels = rows;
    const p = prop();
    p.materialChannels = rows;
    const before = create(GetAtlasResponseSchema);
    expect(() => applyStructuralRecords(before, [w], [], [])).toThrow(
      /materialChannels|channel/i
    );
    expect(() => applyPropPresentations([prop()], [p])).toThrow(
      /materialChannels|channel/i
    );
    expect(before.structuralWalls).toEqual([]);
  }
});
