export interface PackMaterialProfile {
  schemaVersion: 1;
  profileId: string;
  packSlug: string;
  packVersion: string;
  selections: Record<string, string | null>;
}
export interface MaterialUse {
  sourcePath: string;
  sourceSha256: string;
  group: string;
  objectName: string;
  slot: number;
  declaredMaterial: string;
}
export interface MaterialOption {
  id: string;
  label: string;
  baseColor: string;
  normal: string | null;
  wrap: 'repeat' | 'clamp';
  texturesSha256: Record<string, string>;
  basis: 'reviewed-binding' | 'authored-name-match' | 'compatible-candidate';
  reasons: string[];
}
export interface MaterialFamily {
  id: string;
  label: string;
  kind: 'atlas' | 'tiling' | 'unresolved' | 'unsupported';
  uses: MaterialUse[];
  options: MaterialOption[];
  recommendedOptionId: string | null;
  reasons: string[];
}
export interface MaterialPreview {
  familyId: string;
  optionId: string;
  sourcePath: string;
  objectNames: string[];
  url: string;
  glbSha256: string;
  layoutReportSha256: string;
  context: {
    familyId: string;
    optionId: string | null;
    state: 'selected' | 'recommended' | 'neutral';
  }[];
}
export interface MaterialReviewManifest {
  schemaVersion: 1;
  mode: 'material-preview';
  profile: PackMaterialProfile;
  profileSha256: string;
  catalogSha256: string;
  catalog: {
    schemaVersion: 1;
    packSlug: string;
    packVersion: string;
    inputSha256: string;
    families: MaterialFamily[];
  };
  previews: MaterialPreview[];
}

type Row = Record<string, unknown>;
function object(value: unknown, keys?: string[]): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object');
  const row = value as Row;
  if (
    keys &&
    (Object.keys(row).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(row, key)))
  )
    throw new Error('Unexpected or missing fields');
  return row;
}
function text(value: unknown, id = false): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.trim() !== value ||
    value.length > 256 ||
    [...value].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
    )
  )
    throw new Error('Invalid text/ID');
  if (id && (value === '.' || value === '..' || /[/\\]/.test(value)))
    throw new Error('ID cannot be a path');
  return value;
}
function relative(value: unknown): string {
  const path = text(value);
  if (
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Invalid relative path');
  return path;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new Error('Invalid SHA-256');
  return value;
}
function list<T>(value: unknown, parse: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error('Expected an array');
  return value.map(parse);
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) throw new Error('Unsupported value');
  return value as T;
}
function version(row: Row): void {
  if (row.schemaVersion !== 1) throw new Error('Unsupported schemaVersion');
}
function unique(values: string[]): void {
  if (new Set(values).size !== values.length)
    throw new Error('Duplicate identity');
}

export function parseMaterialProfile(value: unknown): PackMaterialProfile {
  const row = object(value, [
    'schemaVersion',
    'profileId',
    'packSlug',
    'packVersion',
    'selections',
  ]);
  version(row);
  return {
    schemaVersion: 1,
    profileId: text(row.profileId, true),
    packSlug: text(row.packSlug, true),
    packVersion: text(row.packVersion, true),
    selections: Object.fromEntries(
      Object.entries(object(row.selections)).map(([key, selected]) => [
        text(key, true),
        selected === null ? null : text(selected, true),
      ])
    ),
  };
}
function parseUse(value: unknown): MaterialUse {
  const row = object(value, [
    'sourcePath',
    'sourceSha256',
    'group',
    'objectName',
    'slot',
    'declaredMaterial',
  ]);
  if (
    typeof row.slot !== 'number' ||
    !Number.isSafeInteger(row.slot) ||
    row.slot < 0
  )
    throw new Error('Invalid slot');
  const sourcePath = relative(row.sourcePath);
  if (!sourcePath.toLowerCase().endsWith('.fbx'))
    throw new Error('Source must be FBX');
  return {
    sourcePath,
    sourceSha256: hash(row.sourceSha256),
    group: text(row.group),
    objectName: text(row.objectName),
    slot: row.slot,
    declaredMaterial: text(row.declaredMaterial),
  };
}
function parseOption(value: unknown): MaterialOption {
  const row = object(value, [
    'id',
    'label',
    'baseColor',
    'normal',
    'wrap',
    'texturesSha256',
    'basis',
    'reasons',
  ]);
  const baseColor = relative(row.baseColor),
    normal = row.normal === null ? null : relative(row.normal);
  const texturesSha256 = Object.fromEntries(
    Object.entries(object(row.texturesSha256)).map(([path, sha]) => [
      relative(path),
      hash(sha),
    ])
  );
  const paths = new Set([baseColor, ...(normal ? [normal] : [])]);
  if (
    Object.keys(texturesSha256).length !== paths.size ||
    [...paths].some((path) => !Object.hasOwn(texturesSha256, path))
  )
    throw new Error('Texture fingerprints do not match maps');
  return {
    id: text(row.id, true),
    label: text(row.label),
    baseColor,
    normal,
    texturesSha256,
    wrap: choice(row.wrap, ['repeat', 'clamp']),
    basis: choice(row.basis, [
      'reviewed-binding',
      'authored-name-match',
      'compatible-candidate',
    ]),
    reasons: list(row.reasons, (value) => text(value)),
  };
}
function parseFamily(value: unknown): MaterialFamily {
  const row = object(value, [
    'id',
    'label',
    'kind',
    'uses',
    'options',
    'recommendedOptionId',
    'reasons',
  ]);
  const options = list(row.options, parseOption);
  unique(options.map((option) => option.id));
  const kind = choice(row.kind, [
    'atlas',
    'tiling',
    'unresolved',
    'unsupported',
  ]);
  if ((kind === 'unsupported' || kind === 'unresolved') && options.length)
    throw new Error('Unresolved family has selectable options');
  const recommendedOptionId =
    row.recommendedOptionId === null
      ? null
      : text(row.recommendedOptionId, true);
  if (
    recommendedOptionId !== null &&
    !options.some((option) => option.id === recommendedOptionId)
  )
    throw new Error('Unknown recommendation');
  return {
    id: text(row.id, true),
    label: text(row.label),
    kind,
    uses: list(row.uses, parseUse),
    options,
    recommendedOptionId,
    reasons: list(row.reasons, (value) => text(value)),
  };
}
function parsePreview(value: unknown): MaterialPreview {
  const row = object(value, [
    'familyId',
    'optionId',
    'sourcePath',
    'objectNames',
    'url',
    'glbSha256',
    'layoutReportSha256',
    'context',
  ]);
  const glbSha256 = hash(row.glbSha256);
  const url = `/models/synty/asset-review-materials/models/${glbSha256}.glb`;
  if (row.url !== url)
    throw new Error('Unsafe or unbound material preview URL');
  return {
    familyId: text(row.familyId, true),
    optionId: text(row.optionId, true),
    sourcePath: relative(row.sourcePath),
    objectNames: list(row.objectNames, (value) => text(value)),
    url,
    glbSha256,
    layoutReportSha256: hash(row.layoutReportSha256),
    context: list(row.context, (value) => {
      const item = object(value, ['familyId', 'optionId', 'state']);
      return {
        familyId: text(item.familyId, true),
        optionId: item.optionId === null ? null : text(item.optionId, true),
        state: choice(item.state, ['selected', 'recommended', 'neutral']),
      };
    }),
  };
}
export function validateProfileChoices(
  profile: PackMaterialProfile,
  manifest: MaterialReviewManifest
): void {
  if (
    profile.packSlug !== manifest.catalog.packSlug ||
    profile.packVersion !== manifest.catalog.packVersion
  )
    throw new Error('Profile pack differs from the prepared catalogue');
  for (const [id, selected] of Object.entries(profile.selections)) {
    const family = manifest.catalog.families.find((family) => family.id === id);
    if (!family) throw new Error(`Unknown material family: ${id}`);
    if (
      selected !== null &&
      !family.options.some((option) => option.id === selected)
    )
      throw new Error(`Unknown/incompatible option for ${id}`);
  }
}
export function parseMaterialReviewManifest(
  value: unknown
): MaterialReviewManifest {
  const row = object(value, [
    'schemaVersion',
    'mode',
    'profile',
    'profileSha256',
    'catalogSha256',
    'catalog',
    'previews',
  ]);
  version(row);
  if (row.mode !== 'material-preview')
    throw new Error('Not a material-preview manifest');
  const catalog = object(row.catalog, [
    'schemaVersion',
    'packSlug',
    'packVersion',
    'inputSha256',
    'families',
  ]);
  version(catalog);
  const families = list(catalog.families, parseFamily);
  unique(families.map((family) => family.id));
  unique(
    families.flatMap((family) =>
      family.uses.map((use) =>
        JSON.stringify([use.sourcePath, use.objectName, use.slot])
      )
    )
  );
  const result: MaterialReviewManifest = {
    schemaVersion: 1,
    mode: 'material-preview',
    profile: parseMaterialProfile(row.profile),
    profileSha256: hash(row.profileSha256),
    catalogSha256: hash(row.catalogSha256),
    catalog: {
      schemaVersion: 1,
      packSlug: text(catalog.packSlug, true),
      packVersion: text(catalog.packVersion, true),
      inputSha256: hash(catalog.inputSha256),
      families,
    },
    previews: list(row.previews, parsePreview),
  };
  validateProfileChoices(result.profile, result);
  unique(
    result.previews.map((preview) =>
      JSON.stringify([preview.familyId, preview.optionId, preview.sourcePath])
    )
  );
  for (const preview of result.previews) {
    const family = families.find((family) => family.id === preview.familyId);
    if (
      !family ||
      !family.options.some((option) => option.id === preview.optionId) ||
      !family.uses.some((use) => use.sourcePath === preview.sourcePath)
    )
      throw new Error('Preview is not bound to a family option/source');
    unique(preview.objectNames);
    const sourceFamilies = families.filter((item) =>
      item.uses.some((use) => use.sourcePath === preview.sourcePath)
    );
    const objects = new Set(
      sourceFamilies.flatMap((item) =>
        item.uses
          .filter((use) => use.sourcePath === preview.sourcePath)
          .map((use) => use.objectName)
      )
    );
    if (
      objects.size !== preview.objectNames.length ||
      preview.objectNames.some((name) => !objects.has(name))
    )
      throw new Error('Preview object coverage differs from the source');
    unique(preview.context.map((item) => item.familyId));
    const otherFamilies = sourceFamilies.filter(
      (item) => item.id !== preview.familyId
    );
    if (otherFamilies.length !== preview.context.length)
      throw new Error('Missing material context');
    for (const item of preview.context) {
      const other = otherFamilies.find((other) => other.id === item.familyId);
      if (
        !other ||
        (item.state === 'neutral'
          ? item.optionId !== null
          : !other.options.some((option) => option.id === item.optionId))
      )
        throw new Error('Invalid material context');
    }
  }
  for (const family of families)
    for (const option of family.options) {
      if (
        !result.previews.some(
          (preview) =>
            preview.familyId === family.id && preview.optionId === option.id
        )
      )
        throw new Error('Prepared option has no preview');
    }
  return result;
}
export function selectFamilyOption(
  profile: PackMaterialProfile,
  manifest: MaterialReviewManifest,
  familyId: string,
  optionId: string | null
): PackMaterialProfile {
  const result = parseMaterialProfile({
    ...profile,
    selections: { ...profile.selections, [familyId]: optionId },
  });
  validateProfileChoices(result, manifest);
  return result;
}
export function serializeMaterialProfile(profile: PackMaterialProfile): string {
  const value = parseMaterialProfile(profile);
  return (
    JSON.stringify(
      {
        ...value,
        selections: Object.fromEntries(
          Object.entries(value.selections).sort(([a], [b]) =>
            a.localeCompare(b)
          )
        ),
      },
      null,
      2
    ) + '\n'
  );
}
