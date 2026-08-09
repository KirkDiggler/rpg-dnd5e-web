import {
  BOOKCASE_VARIANT_ID,
  TORCH_VARIANT_ID,
  VISUAL_VARIANT_ID_PATTERN,
  type VisualAssetCatalog,
  type VisualAssetProviderLock,
} from './types';

export type VisualContractErrorCode =
  | 'invalid-catalog'
  | 'unsupported-schema'
  | 'invalid-inventory'
  | 'invalid-provider-lock'
  | 'provenance-mismatch';

export class VisualContractError extends Error {
  constructor(
    readonly code: VisualContractErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'VisualContractError';
  }
}

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const EXPECTED_IDS = [BOOKCASE_VARIANT_ID, TORCH_VARIANT_ID].sort();

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new VisualContractError(
      'invalid-catalog',
      `${label} must be an object`
    );
  }
  return value as Record<string, unknown>;
}
function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new VisualContractError('invalid-catalog', `${label} must be finite`);
  }
  return value;
}
function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new VisualContractError(
      'invalid-catalog',
      `${label} must be nonempty`
    );
  }
  return value;
}
function vector(
  value: unknown,
  label: string
): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new VisualContractError(
      'invalid-catalog',
      `${label} must have length 3`
    );
  }
  return [
    finite(value[0], label),
    finite(value[1], label),
    finite(value[2], label),
  ];
}

/** Parse the exact public G v1 projection and enforce W's two-entry enrollment guard. */
export function validateVisualAssetCatalog(input: unknown): VisualAssetCatalog {
  const catalog = object(input, 'catalog');
  if (catalog.schemaVersion !== 1) {
    throw new VisualContractError(
      'unsupported-schema',
      'catalog schemaVersion must be 1'
    );
  }
  if (
    catalog.catalogId !== 'synty-web-assets' ||
    catalog.lengthUnit !== 'game-world'
  ) {
    throw new VisualContractError(
      'unsupported-schema',
      'catalog identity/unit mismatch'
    );
  }
  const axes = object(catalog.axes, 'axes');
  const expectedAxes = {
    handedness: 'right',
    right: '+X',
    up: '+Y',
    forward: '+Z',
    positiveYaw: '+Z-toward-+X',
  } as const;
  for (const [key, expected] of Object.entries(expectedAxes)) {
    if (axes[key] !== expected) {
      throw new VisualContractError(
        'unsupported-schema',
        `axes.${key} mismatch`
      );
    }
  }
  const tool = object(catalog.tool, 'tool');
  if (tool.name !== 'build_web_asset_catalog') {
    throw new VisualContractError(
      'unsupported-schema',
      'catalog tool mismatch'
    );
  }
  string(tool.version, 'tool.version');
  if (!Array.isArray(catalog.families) || !Array.isArray(catalog.entries)) {
    throw new VisualContractError(
      'invalid-inventory',
      'families/entries must be arrays'
    );
  }

  const entriesById = new Map<string, Record<string, unknown>>();
  for (const rawEntry of catalog.entries) {
    const entry = object(rawEntry, 'entry');
    const id = string(entry.id, 'entry.id');
    if (!VISUAL_VARIANT_ID_PATTERN.test(id) || entriesById.has(id)) {
      throw new VisualContractError(
        'invalid-inventory',
        `invalid/duplicate entry id ${id}`
      );
    }
    const path = string(entry.path, `${id}.path`);
    if (path.startsWith('/') || path.includes('..') || !path.endsWith('.glb')) {
      throw new VisualContractError(
        'invalid-inventory',
        `${id}.path is unsafe`
      );
    }
    if (!SHA256.test(string(entry.sha256, `${id}.sha256`))) {
      throw new VisualContractError(
        'invalid-inventory',
        `${id}.sha256 is invalid`
      );
    }
    if (finite(entry.totalScale, `${id}.totalScale`) <= 0) {
      throw new VisualContractError(
        'invalid-catalog',
        `${id}.totalScale must be positive`
      );
    }
    finite(entry.sourceForwardYawRad, `${id}.sourceForwardYawRad`);
    if (entry.modelPoint !== undefined) {
      const point = object(entry.modelPoint, `${id}.modelPoint`);
      if (point.kind !== 'floor-contact' && point.kind !== 'wall-attachment') {
        throw new VisualContractError(
          'invalid-catalog',
          `${id}.modelPoint.kind invalid`
        );
      }
      const position = vector(point.position, `${id}.modelPoint.position`);
      if (point.kind === 'floor-contact' && position[1] !== 0) {
        throw new VisualContractError(
          'invalid-catalog',
          `${id} floor-contact y must be zero`
        );
      }
    }
    if (!Array.isArray(entry.companions)) {
      throw new VisualContractError(
        'invalid-catalog',
        `${id}.companions must be an array`
      );
    }
    for (const axis of ['right', 'up', 'forward'] as const) {
      const hint = object(
        object(entry.authoringHints, `${id}.authoringHints`)[axis],
        `${id}.${axis}`
      );
      const min = finite(hint.min, `${id}.${axis}.min`);
      const max = finite(hint.max, `${id}.${axis}.max`);
      const step = finite(hint.step, `${id}.${axis}.step`);
      if (min > max || step <= 0) {
        throw new VisualContractError(
          'invalid-catalog',
          `${id}.${axis} range/step invalid`
        );
      }
    }
    entriesById.set(id, entry);
  }
  if (
    JSON.stringify([...entriesById.keys()].sort()) !==
    JSON.stringify(EXPECTED_IDS)
  ) {
    throw new VisualContractError(
      'invalid-inventory',
      'v1 enrollment must contain exact two ids'
    );
  }

  const families = new Map<string, string>();
  for (const rawFamily of catalog.families) {
    const family = object(rawFamily, 'family');
    const semanticRef = string(family.semanticRef, 'family.semanticRef');
    const defaultId = string(
      family.defaultVariantId,
      'family.defaultVariantId'
    );
    if (families.has(semanticRef)) {
      throw new VisualContractError(
        'invalid-inventory',
        `duplicate family ${semanticRef}`
      );
    }
    const selected = entriesById.get(defaultId);
    if (!selected || selected.semanticRef !== semanticRef) {
      throw new VisualContractError(
        'invalid-inventory',
        `foreign/missing default ${defaultId}`
      );
    }
    families.set(semanticRef, defaultId);
  }
  if (
    families.get('dnd5e:props:bookcase') !== BOOKCASE_VARIANT_ID ||
    families.get('dnd5e:props:torch-ornate') !== TORCH_VARIANT_ID ||
    families.size !== 2
  ) {
    throw new VisualContractError(
      'invalid-inventory',
      'v1 families/defaults mismatch'
    );
  }
  return input as VisualAssetCatalog;
}

export function validateVisualAssetProviderLock(
  input: unknown
): VisualAssetProviderLock {
  const lock = object(input, 'provider lock');
  const provider = object(lock.provider, 'provider');
  const catalog = object(lock.catalog, 'catalog');
  const tool = object(lock.tool, 'tool');
  if (
    lock.schemaVersion !== 1 ||
    provider.repository !== 'KirkDiggler/rpg-game-assets' ||
    !COMMIT.test(String(provider.commit)) ||
    catalog.path !== 'harness/catalogs/synty-web-assets.json' ||
    !SHA256.test(String(catalog.sha256)) ||
    catalog.schemaVersion !== 1 ||
    catalog.catalogId !== 'synty-web-assets' ||
    tool.name !== 'build_web_asset_catalog' ||
    typeof tool.version !== 'string' ||
    tool.version.length === 0 ||
    'webSha' in lock ||
    'branch' in provider
  ) {
    throw new VisualContractError(
      'invalid-provider-lock',
      'provider lock shape is invalid'
    );
  }
  return input as VisualAssetProviderLock;
}

export function verifyCatalogProvenance(
  lock: VisualAssetProviderLock,
  actual: {
    sha256: string;
    schemaVersion: number;
    catalogId: string;
    toolName: string;
    toolVersion: string;
  }
): void {
  if (
    lock.catalog.sha256 !== actual.sha256 ||
    lock.catalog.schemaVersion !== actual.schemaVersion ||
    lock.catalog.catalogId !== actual.catalogId ||
    lock.tool.name !== actual.toolName ||
    lock.tool.version !== actual.toolVersion
  ) {
    throw new VisualContractError(
      'provenance-mismatch',
      'catalog/lock provenance mismatch'
    );
  }
}
