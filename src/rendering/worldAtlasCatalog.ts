import { parseWorldAtlasMetadata } from './worldAtlasCatalogSchema.mjs';
import type {
  WorldAtlasCatalog,
  WorldAtlasMaterial,
  WorldSurfaceImage,
} from './worldMaterialTypes';

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
  });
  for (const binding of metadata.bindings)
    if (assets[binding.assetRef]?.glbSha256 !== binding.glbSha256)
      refuse(`binding geometry differs for ${binding.assetRef}`);
  return { materials, ...metadata };
}
