import type { Vec3, VisualAssetCatalog, VisualCalibrationEntry } from './types';
import { BOOKCASE_VARIANT_ID, TORCH_VARIANT_ID } from './types';

/**
 * PUBLIC TEST DATA ONLY — values below are deliberately synthetic arithmetic
 * discriminators, not claims about either licensed GLB or the future G catalog.
 * Real calibration/digest/hint data must arrive from merged rpg-game-assets #44.
 */
export const CONTRACT_FIXTURE_CATALOG: VisualAssetCatalog = {
  schemaVersion: 1,
  catalogId: 'synty-web-assets',
  lengthUnit: 'game-world',
  axes: {
    handedness: 'right',
    right: '+X',
    up: '+Y',
    forward: '+Z',
    positiveYaw: '+Z-toward-+X',
  },
  tool: { name: 'build_web_asset_catalog', version: 'fixture-only' },
  families: [
    {
      semanticRef: 'dnd5e:props:bookcase',
      defaultVariantId: BOOKCASE_VARIANT_ID,
    },
    {
      semanticRef: 'dnd5e:props:torch-ornate',
      defaultVariantId: TORCH_VARIANT_ID,
    },
  ],
  entries: [
    {
      id: BOOKCASE_VARIANT_ID,
      semanticRef: 'dnd5e:props:bookcase',
      path: 'fixture-only/bookcase.glb',
      sha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      totalScale: 2,
      sourceForwardYawRad: Math.PI / 6,
      modelPoint: { kind: 'floor-contact', position: [0.25, 0, -0.5] },
      companions: [],
      authoringHints: {
        right: { min: -1, max: 1, step: 0.25 },
        up: { min: 0, max: 1, step: 0.25 },
        forward: { min: -1, max: 1, step: 0.25 },
      },
    },
    {
      id: TORCH_VARIANT_ID,
      semanticRef: 'dnd5e:props:torch-ornate',
      path: 'fixture-only/torch.glb',
      sha256:
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      totalScale: 0.5,
      sourceForwardYawRad: -Math.PI / 3,
      modelPoint: { kind: 'wall-attachment', position: [-0.5, 1.25, 0.75] },
      companions: [
        {
          id: 'synty:props:fixture-companion',
          path: 'fixture-only/companion.glb',
          sha256:
            'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        },
      ],
      authoringHints: {
        right: { min: -0.5, max: 0.5, step: 0.125 },
        up: { min: -0.5, max: 1.5, step: 0.125 },
        forward: { min: -0.5, max: 0.5, step: 0.125 },
      },
    },
  ],
};

export const SIX_EXISTING_FACINGS = [0, 1, 2, 3, 4, 5] as const;

export type PlacementFixtureKind =
  | 'room-prop'
  | 'canvas-prop'
  | 'room-monster'
  | 'canvas-monster'
  | 'room-boss';

export interface PlacementContractFixture {
  id: string;
  kind: PlacementFixtureKind;
  semanticRef: string;
  canonicalOrigin: Vec3;
  facing: (typeof SIX_EXISTING_FACINGS)[number];
  offset?: Vec3;
  enrolledVariantId?: string;
}

/** Every valid placement kind exercises the same generic P exactly once. */
export const GENERIC_PLACEMENT_FIXTURES: readonly PlacementContractFixture[] = [
  {
    id: 'room-prop',
    kind: 'room-prop',
    semanticRef: 'dnd5e:props:crate',
    canonicalOrigin: [3, 0, 5],
    facing: 0,
  },
  {
    id: 'canvas-prop',
    kind: 'canvas-prop',
    semanticRef: 'dnd5e:props:vase',
    canonicalOrigin: [-2, 1, 7],
    facing: 1,
    offset: [0, 0, 0],
  },
  {
    id: 'room-monster',
    kind: 'room-monster',
    semanticRef: 'dnd5e:monsters:skeleton',
    canonicalOrigin: [4, 0, -6],
    facing: 3,
    offset: [0.125, -0.25, 0.5],
  },
  {
    id: 'canvas-monster',
    kind: 'canvas-monster',
    semanticRef: 'dnd5e:monsters:zombie',
    canonicalOrigin: [-7, 0.25, 9],
    facing: 4,
    offset: [0.375, 0, -0.625],
  },
  {
    id: 'room-boss',
    kind: 'room-boss',
    semanticRef: 'dnd5e:monsters:skeleton-captain',
    canonicalOrigin: [8, 0, 2],
    facing: 5,
    offset: [-0.25, 0.75, -0.125],
  },
];

export function fixtureEntry(id: string): VisualCalibrationEntry {
  const entry = CONTRACT_FIXTURE_CATALOG.entries.find((item) => item.id === id);
  if (!entry) throw new Error(`missing fixture entry ${id}`);
  return entry;
}
