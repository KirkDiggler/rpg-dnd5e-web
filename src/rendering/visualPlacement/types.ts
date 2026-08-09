/**
 * Public, license-safe visual-placement consumer contract (Wave B / #737).
 *
 * Values in this module describe canonical game-world placement only. They
 * deliberately carry no wall/support/gameplay semantics and no raw GLB data.
 */
export type Vec3 = readonly [number, number, number];
export type Matrix4Elements = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const VISUAL_VARIANT_ID_PATTERN =
  /^synty:props:[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const BOOKCASE_VARIANT_ID =
  'synty:props:sm-prop-bookcase-small-01' as const;
export const TORCH_VARIANT_ID = 'synty:props:sm-prop-torch-ornate-01' as const;

export type VisualAnchorKind = 'floor-contact' | 'wall-attachment';

export interface VisualModelPoint {
  kind: VisualAnchorKind;
  /** Post-scale/source-yaw point in canonical game-world units. */
  position: Vec3;
}

export interface AuthoringAxisHint {
  min: number;
  max: number;
  step: number;
}

export interface VisualCalibrationEntry {
  id: string;
  semanticRef: string;
  /** Licensed file remains external; this is a safe relative promoted path. */
  path: string;
  sha256: string;
  /** GLB-local length -> canonical game-world length, applied exactly once. */
  totalScale: number;
  sourceForwardYawRad: number;
  modelPoint?: VisualModelPoint;
  companions: ReadonlyArray<{
    id: string;
    path: string;
    sha256: string;
  }>;
  authoringHints: {
    right: AuthoringAxisHint;
    up: AuthoringAxisHint;
    forward: AuthoringAxisHint;
  };
}

export interface VisualCatalogFamily {
  semanticRef: string;
  defaultVariantId: string;
}

export interface VisualAssetCatalog {
  schemaVersion: 1;
  catalogId: 'synty-web-assets';
  lengthUnit: 'game-world';
  axes: {
    handedness: 'right';
    right: '+X';
    up: '+Y';
    forward: '+Z';
    positiveYaw: '+Z-toward-+X';
  };
  tool: { name: 'build_web_asset_catalog'; version: string };
  families: ReadonlyArray<VisualCatalogFamily>;
  entries: ReadonlyArray<VisualCalibrationEntry>;
}

export type SelectionFailureReason =
  | 'family-not-enrolled'
  | 'explicit-variant-unsupported'
  | 'unknown-explicit-variant'
  | 'foreign-explicit-variant'
  | 'missing-default'
  | 'foreign-default';

export type VisualVariantSelection =
  | { selected: true; entry: VisualCalibrationEntry }
  | { selected: false; reason: SelectionFailureReason };

export type OffsetPresence = 'omitted' | 'explicit';
export type PlacementCalibration = 'generic' | 'enrolled' | 'no-anchor';

export interface ResolvedVisualPlacement {
  /** Column-major, Three.js-compatible matrix. */
  matrix: Matrix4Elements;
  diagnostics: {
    offsetPresence: OffsetPresence;
    calibration: PlacementCalibration;
    selectedVariantId?: string;
  };
}

export interface VisualAssetProviderLock {
  schemaVersion: 1;
  provider: {
    repository: 'KirkDiggler/rpg-game-assets';
    commit: string;
  };
  catalog: {
    path: 'harness/catalogs/synty-web-assets.json';
    sha256: string;
    schemaVersion: 1;
    catalogId: 'synty-web-assets';
  };
  inventory: {
    path: 'harness/catalogs/synty-complete-inventory.json';
    sha256: string;
    schemaVersion: 1;
    inventoryId: 'synty-complete-tree';
    tool: { name: 'build_synty_complete_inventory'; version: string };
    fileCount: number;
    treeSha256: string;
  };
  tool: {
    name: 'build_web_asset_catalog';
    version: string;
  };
  verifier: { name: 'verify_web_asset_stage'; version: string };
}
