import { parseWorldAtlasMetadata } from './worldAtlasCatalogSchema.mjs';
import type {
  MaterialOverride,
  WorldAtlasBinding,
  WorldAtlasCatalog,
  WorldAtlasMaterial,
  WorldSurfaceImage,
} from './worldMaterialTypes';

export interface ResolvedWorldAtlasMaterials {
  binding: WorldAtlasBinding;
  plans: readonly { surfaceId: string; material: WorldAtlasMaterial }[];
}

/** Resolve captured/authored intent only against the supplied resource catalog.
 * Absence is Original; explicit missing targets/materials never silently reset. */
export function resolveWorldAtlasMaterials(input: {
  assetRef: string;
  glbSha256: string;
  overrides?: readonly MaterialOverride[];
  atlas?: WorldAtlasCatalog;
}): ResolvedWorldAtlasMaterials | undefined {
  if (!input.overrides?.length) return undefined;
  if (!input.atlas) refuse('atlas material catalog is unavailable');
  const binding = input.atlas.bindings.find(
    (row) => row.assetRef === input.assetRef
  );
  if (!binding || binding.glbSha256 !== input.glbSha256)
    refuse('binding geometry is unavailable or stale');
  const seen = new Set<string>();
  const plans = input.overrides.map((value) => {
    if (seen.has(value.surfaceId)) refuse('duplicate selected scope');
    seen.add(value.surfaceId);
    const surface = binding.surfaces.find((row) => row.id === value.surfaceId);
    if (!surface) refuse(`selected scope is unavailable: ${value.surfaceId}`);
    const material = input.atlas!.materials.find(
      (row) => row.ref === value.materialRef
    );
    if (!material)
      refuse(`selected material is unavailable: ${value.materialRef}`);
    if (!surface.compatibleFamilies?.includes(material.family))
      refuse(`selected material is incompatible with scope ${value.surfaceId}`);
    return { surfaceId: value.surfaceId, material };
  });
  return { binding, plans };
}

function refuse(reason: string): never {
  throw Error(`World atlas catalog: ${reason}`);
}
function exact(
  value: unknown,
  names: readonly string[],
  where: string
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    refuse(`${where} must be an object`);
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== names.length ||
    names.some((key) => !Object.hasOwn(row, key))
  )
    refuse(`${where} has invalid fields`);
  return row;
}
function previewImage(value: unknown): WorldSurfaceImage {
  const row = exact(
    value,
    ['url', 'sha256', 'width', 'height', 'sizeBytes'],
    'image'
  );
  if (
    typeof row.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(row.sha256) ||
    row.url !==
      `/world-material-preview/images/${row.sha256}.png?v=${row.sha256}`
  )
    refuse('invalid image identity/URL');
  const number = (key: string): number => {
    const n = row[key];
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0)
      refuse(`invalid image ${key}`);
    return n;
  };
  return {
    url: row.url as string,
    sha256: row.sha256,
    width: number('width'),
    height: number('height'),
    sizeBytes: number('sizeBytes'),
  };
}

/** Validate the explicit private preview against immutable catalog identities.
 * This does not certify resource bytes or grant arbitrary material targeting. */
export function parseWorldAtlasPreview(
  value: unknown,
  assets: Readonly<Record<string, { readonly glbSha256: string }>>
): WorldAtlasCatalog {
  const raw = exact(value, ['materials', 'collections', 'bindings'], 'atlas');
  if (!Array.isArray(raw.materials) || !raw.materials.length)
    refuse('materials must be nonempty');
  const refs = new Set<string>();
  const materials: WorldAtlasMaterial[] = raw.materials.map((input) => {
    const row = exact(
      input,
      [
        'ref',
        'displayName',
        'family',
        'mapping',
        'baseColor',
        'normal',
        'emissive',
      ],
      'material'
    );
    if (
      typeof row.ref !== 'string' ||
      !/^dnd5e:material:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:_[a-z0-9]+)*$/.test(
        row.ref
      ) ||
      refs.has(row.ref)
    )
      refuse('invalid or duplicate material ref');
    refs.add(row.ref);
    if (
      typeof row.displayName !== 'string' ||
      !row.displayName.trim() ||
      row.displayName !== row.displayName.trim() ||
      /[\p{C}\p{Zl}\p{Zp}]/u.test(row.displayName)
    )
      refuse('invalid display name');
    if (
      typeof row.family !== 'string' ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(row.family)
    )
      refuse('invalid material family');
    if (
      row.mapping !== 'authored-uv' ||
      row.normal !== null ||
      row.emissive !== null
    )
      refuse('expected color-only authored-UV material');
    return {
      ref: row.ref,
      displayName: row.displayName,
      family: row.family,
      mapping: 'authored-uv',
      normal: null,
      emissive: null,
      baseColor: previewImage(row.baseColor),
    };
  });
  const metadata = parseWorldAtlasMetadata({
    collections: raw.collections,
    bindings: raw.bindings,
    atlasRefs: refs,
    atlasFamilies: new Set(materials.map((material) => material.family)),
  });
  for (const binding of metadata.bindings)
    if (assets[binding.assetRef]?.glbSha256 !== binding.glbSha256)
      refuse(`binding geometry differs for ${binding.assetRef}`);
  return { materials, ...metadata };
}
