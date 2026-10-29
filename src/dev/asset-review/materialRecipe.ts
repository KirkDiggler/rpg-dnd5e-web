/**
 * Material-editor contract (manifest schemaVersion 3, editing profile v2).
 *
 * Mirrors the producer contract in rpg-game-assets scripts
 * (`synty_material_recipe.py` + `prepare_material_review._prepare_editing`):
 * the editing profile (schemaVersion 2) is the one editable choice document —
 * reusable definitions own channel images/settings; assignments record a
 * family-group default plus explicit per-slot overrides; legacy family-option
 * selections are carried through unchanged. The prepared manifest resolves the
 * profile to verified per-slot channel facts (`recipes.recipeBindings`) and
 * neutral editor geometry whose slots map to glTF targets
 * (`editor.sources[].targets`). This module only parses/serializes/resolves;
 * it never approves a material or touches a release.
 */
import {
  parseMaterialCatalog,
  type MaterialReviewManifest,
} from './materialProfile';

export interface EditingProfileDefinition {
  label: string;
  /** Pack-relative image path; null renders the neutral solid base (sRGB #666666). */
  baseColor: string | null;
  /** Present normal channel must name an image; strength mirrors the Normal Map node. */
  normal: { image: string; strength: number } | null;
  /** null = channel off; a present object with image null is solid-color emission. */
  emissive: { image: string | null; color: string; strength: number } | null;
  wrap: 'repeat' | 'clamp';
}

export interface EditingSlotOverride {
  sourcePath: string;
  objectName: string;
  slot: number;
  definition: string;
}

export interface EditingProfile {
  schemaVersion: 2;
  profileId: string;
  packSlug: string;
  packVersion: string;
  definitions: Record<string, EditingProfileDefinition>;
  assignments: {
    familyDefaults: Record<string, string>;
    slotOverrides: EditingSlotOverride[];
  };
  selections: Record<string, string | null>;
}

export interface RecipeTexture {
  path: string;
  sha256: string;
}
export interface RecipeEmissive {
  image: RecipeTexture | null;
  color: string;
  strength: number;
}
export interface RecipeChannels {
  baseColor: RecipeTexture | null;
  normal: (RecipeTexture & { strength: number }) | null;
  emissive: RecipeEmissive | null;
  wrap: 'repeat' | 'clamp';
}
export interface RecipeBinding {
  sourcePath: string;
  objectName: string;
  slot: number;
  materialName: string | null;
  definition: string;
  scope: 'family-default' | 'slot-override';
  overriddenDefault: string | null;
  channels: RecipeChannels;
}
export interface EditorTarget {
  objectName: string;
  slot: number;
  materialName: string;
  faceCount: number;
  rendered: boolean;
  /** Explicit generated glTF mapping for rendered slots; null when not rendered. */
  target: {
    mesh: number;
    primitive: number;
    material: number;
    materialName: string;
  } | null;
}
export interface EditorSource {
  sourcePath: string;
  sourceSha256: string;
  glb: { url: string; sha256: string };
  layoutReportSha256: string;
  editorReportSha256: string;
  targets: EditorTarget[];
}
export interface InventoryImage {
  path: string;
  sha256: string;
  bytes: number;
  format: string;
  /** Browser-loadable original URL (png/jpg/webp). */
  url?: string;
  /** Lossless browser derivative for non-loadable formats (TGA). */
  preview?: { url: string; sha256: string; format: string };
}
export interface MaterialEditorManifest {
  schemaVersion: 3;
  mode: 'material-editor';
  profile: EditingProfile;
  profileSha256: string;
  catalogSha256: string;
  catalog: MaterialReviewManifest['catalog'];
  sourceAudit?: {
    sourceCount: number;
    verifiedCount: number;
    exceptions: {
      sourcePath: string;
      sourceSha256: string;
      reason: string;
      inspectionBlendPath: string;
    }[];
  };
  auditedSlots: Record<
    string,
    {
      sourceSha256: string;
      objects: Record<
        string,
        {
          materialIndices: number[];
          materialNames: (string | null)[];
          meshDataName: string;
          slotCount: number;
          topologySha256: string;
          uvSha256: string;
          usedSlots: number[];
        }
      >;
    }
  >;
  inventory: { schemaVersion: 1; images: InventoryImage[] };
  recipes: {
    recipeBindings: RecipeBinding[];
    optionBindings: unknown[];
    unassignedActualSlots: [string, string, number][];
    unusedDefinitions: string[];
  };
  editor: { schemaVersion: 1; sources: EditorSource[] };
}

/** Neutral solid base the producer applies when baseColor has no image. */
export const NEUTRAL_BASE_SRGB = '#666666';

type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function object(value: unknown, keys: string[], label: string): Row {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error(`Invalid ${label} fields`);
  return value;
}
function text(value: unknown, label: string, id = false): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.trim() !== value ||
    value.length > 256 ||
    [...value].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
    )
  )
    throw new Error(`Invalid ${label}`);
  if (id && (value === '.' || value === '..' || /[/\\]/.test(value)))
    throw new Error(`${label} cannot be a path`);
  return value;
}
function relative(value: unknown, label: string): string {
  const path = text(value, label);
  if (
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error(`${label} must be a normalized relative POSIX path`);
  return path;
}
function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new Error(`Invalid ${label} SHA-256`);
  return value;
}
function strength(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be a finite non-negative number`);
  return value;
}
function emissiveColor(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9A-Fa-f]{6}$/.test(value))
    throw new Error(`${label} must be six hex digits`);
  return value.toUpperCase();
}
function slot(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`Invalid ${label} slot`);
  return value;
}

/** Strict parse of one editable material definition (v2 shape). */
export function parseEditingProfileDefinition(
  value: unknown
): EditingProfileDefinition {
  const def = object(
    value,
    ['label', 'baseColor', 'normal', 'emissive', 'wrap'],
    'definition'
  );
  const baseColor = object(def.baseColor, ['image'], 'definition baseColor');
  let normal: EditingProfileDefinition['normal'] = null;
  if (def.normal !== null) {
    const row2 = object(
      def.normal,
      ['image', 'strength'],
      'definition normal channel'
    );
    if (row2.image === null)
      throw new Error('A present normal channel must name an image');
    normal = {
      image: relative(row2.image, 'definition normal image'),
      strength: strength(row2.strength, 'definition normal strength'),
    };
  }
  let emissive: EditingProfileDefinition['emissive'] = null;
  if (def.emissive !== null) {
    const row3 = object(
      def.emissive,
      ['image', 'color', 'strength'],
      'definition emissive channel'
    );
    emissive = {
      image:
        row3.image === null
          ? null
          : relative(row3.image, 'definition emissive image'),
      color: emissiveColor(row3.color, 'definition emissive color'),
      strength: strength(row3.strength, 'definition emissive strength'),
    };
  }
  if (def.wrap !== 'repeat' && def.wrap !== 'clamp')
    throw new Error('definition wrap must be repeat or clamp');
  return {
    label: text(def.label, 'definition label'),
    baseColor:
      baseColor.image === null
        ? null
        : relative(baseColor.image, 'definition baseColor image'),
    normal,
    emissive,
    wrap: def.wrap,
  };
}

export function parseEditingProfile(value: unknown): EditingProfile {
  if (!isRecord(value)) throw new Error('Invalid editing profile fields');
  const row = object(
    value,
    [
      'schemaVersion',
      'profileId',
      'packSlug',
      'packVersion',
      'definitions',
      'assignments',
      ...('selections' in value ? (['selections'] as string[]) : []),
    ],
    'editing profile'
  );
  if (row.schemaVersion !== 2)
    throw new Error('Editing profile requires schemaVersion 2');
  if (!isRecord(row.definitions))
    throw new Error('definitions must be an object');
  const definitions: Record<string, EditingProfileDefinition> = {};
  for (const [id, raw] of Object.entries(row.definitions)) {
    text(id, 'definition ID', true);
    definitions[id] = parseEditingProfileDefinition(raw);
  }
  const assignments = object(
    row.assignments,
    ['familyDefaults', 'slotOverrides'],
    'editing assignments'
  );
  if (!isRecord(assignments.familyDefaults))
    throw new Error('familyDefaults must be an object');
  if (!Array.isArray(assignments.slotOverrides))
    throw new Error('slotOverrides must be an array');
  const familyDefaults: Record<string, string> = {};
  for (const [familyId, definitionId] of Object.entries(
    assignments.familyDefaults
  )) {
    text(familyId, 'family ID', true);
    if (
      typeof definitionId !== 'string' ||
      !Object.hasOwn(definitions, definitionId)
    )
      throw new Error(`Unknown definition for family default: ${familyId}`);
    familyDefaults[familyId] = definitionId;
  }
  const seen = new Set<string>();
  const slotOverrides: EditingSlotOverride[] = assignments.slotOverrides.map(
    (item) => {
      const override = object(
        item,
        ['sourcePath', 'objectName', 'slot', 'definition'],
        'slot override'
      );
      const sourcePath = relative(
        override.sourcePath,
        'slot override sourcePath'
      );
      if (!sourcePath.toLowerCase().endsWith('.fbx'))
        throw new Error('slot override sourcePath must name an FBX');
      const objectName = text(override.objectName, 'slot override objectName');
      const index = slot(override.slot, 'slot override');
      if (
        typeof override.definition !== 'string' ||
        !Object.hasOwn(definitions, override.definition)
      )
        throw new Error('Unknown slot override definition');
      const target = `${sourcePath}\u0000${objectName}\u0000${index}`;
      if (seen.has(target))
        throw new Error(
          `Duplicate slot override target: ${sourcePath}:${objectName}:${index}`
        );
      seen.add(target);
      return {
        sourcePath,
        objectName,
        slot: index,
        definition: override.definition,
      };
    }
  );
  const selections: Record<string, string | null> = {};
  if ('selections' in row) {
    if (!isRecord(row.selections))
      throw new Error('selections must be an object');
    for (const [familyId, selected] of Object.entries(row.selections)) {
      text(familyId, 'family ID', true);
      selections[familyId] =
        selected === null ? null : text(selected, 'option ID', true);
      if (familyId in familyDefaults && selections[familyId] !== null)
        throw new Error(
          `Family ${familyId} has both a legacy selection and a definition default`
        );
    }
  }
  return {
    schemaVersion: 2,
    profileId: text(row.profileId, 'profile ID', true),
    packSlug: text(row.packSlug, 'pack slug', true),
    packVersion: text(row.packVersion, 'pack version', true),
    definitions,
    assignments: { familyDefaults, slotOverrides },
    selections,
  };
}

export function serializeEditingProfile(profile: EditingProfile): string {
  const document = editingWireDocument(profile);
  // Validate by re-parsing the exact wire bytes this export produces.
  parseEditingProfile(JSON.parse(JSON.stringify(document)));
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** The wire (producer-identical, sorted-key) document for one profile. */
export function editingProfileWireDocument(profile: EditingProfile): object {
  return editingWireDocument(profile);
}

/** The wire (producer-identical, sorted-key) object for one definition. */
export function editingDefinitionWireDocument(
  definition: EditingProfileDefinition
): object {
  // Wire format (keys alphabetical, matching the producer's sort_keys):
  // baseColor is an object owning its image, normal/emissive keep their
  // channel objects with explicit nulls.
  return {
    baseColor: { image: definition.baseColor },
    emissive:
      definition.emissive === null
        ? null
        : {
            image: definition.emissive.image,
            color: definition.emissive.color,
            strength: definition.emissive.strength,
          },
    label: definition.label,
    normal:
      definition.normal === null
        ? null
        : {
            image: definition.normal.image,
            strength: definition.normal.strength,
          },
    wrap: definition.wrap,
  };
}

function editingWireDocument(profile: EditingProfile): object {
  const sortedDefinitions = Object.keys(profile.definitions)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => {
      const definition = profile.definitions[id]!;
      return [id, editingDefinitionWireDocument(definition)] as const;
    });
  const document = {
    assignments: {
      familyDefaults: Object.fromEntries(
        Object.entries(profile.assignments.familyDefaults).sort(([a], [b]) =>
          a.localeCompare(b)
        )
      ),
      slotOverrides: [...profile.assignments.slotOverrides]
        .sort(
          (a, b) =>
            a.sourcePath.localeCompare(b.sourcePath) ||
            a.objectName.localeCompare(b.objectName) ||
            a.slot - b.slot
        )
        .map((override) => ({
          definition: override.definition,
          objectName: override.objectName,
          slot: override.slot,
          sourcePath: override.sourcePath,
        })),
    },
    definitions: Object.fromEntries(sortedDefinitions),
    packSlug: profile.packSlug,
    packVersion: profile.packVersion,
    profileId: profile.profileId,
    schemaVersion: 2,
    selections: Object.fromEntries(
      Object.entries(profile.selections).sort(([a], [b]) => a.localeCompare(b))
    ),
  };
  return document;
}

function parseRecipeTexture(value: unknown, label: string): RecipeTexture {
  const row = object(value, ['path', 'sha256'], label);
  return {
    path: relative(row.path, `${label} path`),
    sha256: hash(row.sha256, `${label} sha256`),
  };
}

function parseRecipeChannels(value: unknown, label: string): RecipeChannels {
  const row = object(value, ['baseColor', 'normal', 'emissive', 'wrap'], label);
  const baseColor =
    row.baseColor === null
      ? null
      : parseRecipeTexture(row.baseColor, `${label} baseColor`);
  let normal: RecipeChannels['normal'] = null;
  if (row.normal !== null) {
    const textureRow = object(
      row.normal,
      ['path', 'sha256', 'strength'],
      `${label} normal`
    );
    normal = {
      path: relative(textureRow.path, `${label} normal path`),
      sha256: hash(textureRow.sha256, `${label} normal sha256`),
      strength: strength(textureRow.strength, `${label} normal strength`),
    };
  }
  let emissive: RecipeChannels['emissive'] = null;
  if (row.emissive !== null) {
    const row2 = object(
      row.emissive,
      ['image', 'color', 'strength'],
      `${label} emissive`
    );
    emissive = {
      image:
        row2.image === null
          ? null
          : parseRecipeTexture(row2.image, `${label} emissive image`),
      color: emissiveColor(row2.color, `${label} emissive color`),
      strength: strength(row2.strength, `${label} emissive strength`),
    };
  }
  if (row.wrap !== 'repeat' && row.wrap !== 'clamp')
    throw new Error('Recipe wrap must be repeat or clamp');
  return {
    baseColor,
    normal,
    emissive,
    wrap: row.wrap as RecipeChannels['wrap'],
  };
}

function parseRecipeBinding(value: unknown): RecipeBinding {
  const row = object(
    value,
    [
      'sourcePath',
      'objectName',
      'slot',
      'materialName',
      'definition',
      'scope',
      'overriddenDefault',
      'channels',
    ],
    'recipe binding'
  );
  if (row.scope !== 'family-default' && row.scope !== 'slot-override')
    throw new Error('Invalid recipe scope');
  return {
    sourcePath: relative(row.sourcePath, 'recipe sourcePath'),
    objectName: text(row.objectName, 'recipe objectName'),
    slot: slot(row.slot, 'recipe slot'),
    materialName:
      row.materialName === null
        ? null
        : text(row.materialName, 'recipe materialName'),
    definition: text(row.definition, 'recipe definition ID', true),
    scope: row.scope,
    overriddenDefault:
      row.overriddenDefault === null
        ? null
        : text(row.overriddenDefault, 'recipe overriddenDefault', true),
    channels: parseRecipeChannels(row.channels, 'recipe channels'),
  };
}

function parseEditorTarget(value: unknown): EditorTarget {
  const row = object(
    value,
    ['objectName', 'slot', 'materialName', 'faceCount', 'rendered', 'target'],
    'editor target'
  );
  let target: EditorTarget['target'] = null;
  if (row.target !== null) {
    const row2 = object(
      row.target,
      ['mesh', 'primitive', 'material', 'materialName'],
      'editor target mapping'
    );
    target = {
      mesh: slot(row2.mesh, 'editor target mesh index'),
      primitive: slot(row2.primitive, 'editor target primitive index'),
      material: slot(row2.material, 'editor target material index'),
      materialName: text(row2.materialName, 'editor target materialName'),
    };
  }
  return {
    objectName: text(row.objectName, 'editor target objectName'),
    slot: slot(row.slot, 'editor target slot'),
    materialName: text(row.materialName, 'editor target materialName'),
    faceCount: slot(row.faceCount, 'editor target faceCount'),
    rendered: row.rendered === true,
    target,
  };
}

function parseEditorSource(value: unknown): EditorSource {
  const row = object(
    value,
    [
      'sourcePath',
      'sourceSha256',
      'glb',
      'layoutReportSha256',
      'editorReportSha256',
      'targets',
    ],
    'editor source'
  );
  const glb = object(row.glb, ['url', 'sha256'], 'editor GLB');
  const glbSha = hash(glb.sha256, 'editor GLB sha256');
  const expectedUrl = `/models/synty/asset-review-editor/models/${glbSha}.glb`;
  if (glb.url !== expectedUrl)
    throw new Error('Unsafe or unbound editor GLB URL');
  if (!Array.isArray(row.targets)) throw new Error('targets must be an array');
  const seen = new Set<string>();
  for (const target of row.targets) {
    const parsed = parseEditorTarget(target);
    const key = `${parsed.objectName}\u0000${parsed.slot}`;
    if (seen.has(key))
      throw new Error(
        `Duplicate editor target: ${parsed.objectName}:${parsed.slot}`
      );
    seen.add(key);
    if (parsed.rendered !== (parsed.target !== null))
      throw new Error('Rendered editor targets must carry their glTF mapping');
  }
  return {
    sourcePath: relative(row.sourcePath, 'editor sourcePath'),
    sourceSha256: hash(row.sourceSha256, 'editor sourceSha256'),
    glb: { url: expectedUrl, sha256: glbSha },
    layoutReportSha256: hash(row.layoutReportSha256, 'layout report'),
    editorReportSha256: hash(row.editorReportSha256, 'editor report'),
    targets: row.targets.map(parseEditorTarget),
  };
}

function parseInventoryImage(value: unknown): InventoryImage {
  if (!isRecord(value)) throw new Error('Invalid inventory image fields');
  const allowed = ['path', 'sha256', 'bytes', 'format', 'url', 'preview'];
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      throw new Error('Invalid inventory image fields');
  for (const key of ['path', 'sha256', 'bytes', 'format'])
    if (!Object.hasOwn(value, key))
      throw new Error('Invalid inventory image fields');
  const row = value as Row;
  const entry: InventoryImage = {
    path: relative(row.path, 'inventory path'),
    sha256: hash(row.sha256, 'inventory sha256'),
    bytes: slot(row.bytes, 'inventory bytes'),
    format: text(row.format, 'inventory format'),
  };
  if ('url' in row) entry.url = text(row.url, 'inventory url');
  if ('preview' in row) {
    const preview = object(
      row.preview,
      ['url', 'sha256', 'format'],
      'inventory preview'
    );
    entry.preview = {
      url: text(preview.url, 'inventory preview url'),
      sha256: hash(preview.sha256, 'inventory preview sha256'),
      format: text(preview.format, 'inventory preview format'),
    };
  }
  if (!entry.url && !entry.preview)
    throw new Error('Inventory image needs a loadable URL or derivative');
  return entry;
}

function parseAuditedSlots(
  value: unknown
): MaterialEditorManifest['auditedSlots'] {
  if (!isRecord(value)) throw new Error('auditedSlots must be an object');
  const result: MaterialEditorManifest['auditedSlots'] = {};
  for (const [sourcePath, raw] of Object.entries(value)) {
    const parsedPath = relative(sourcePath, 'auditedSlots key');
    const row = object(raw, ['sourceSha256', 'objects'], 'audited source');
    if (!isRecord(row.objects))
      throw new Error('audited objects must be an object');
    const objects: MaterialEditorManifest['auditedSlots'][string]['objects'] =
      {};
    for (const [objectName, rawObject] of Object.entries(row.objects)) {
      const obj = object(
        rawObject,
        [
          'materialIndices',
          'materialNames',
          'meshDataName',
          'slotCount',
          'topologySha256',
          'uvSha256',
          'usedSlots',
        ],
        'audited object'
      );
      const slotCount = slot(obj.slotCount, 'audited slotCount');
      const materialNames = (obj.materialNames as unknown[]).map((name) =>
        name === null ? null : text(name, 'audited material name')
      );
      if (materialNames.length !== slotCount)
        throw new Error('Audited materialNames must match slotCount');
      const materialIndices = (obj.materialIndices as unknown[]).map((index) =>
        slot(index, 'audited materialIndices entry')
      );
      const usedSlots = (obj.usedSlots as unknown[]).map((index) =>
        slot(index, 'audited usedSlots entry')
      );
      for (const index of [...materialIndices, ...usedSlots])
        if (index >= Math.max(slotCount, 1))
          throw new Error('Audited slot index out of range');
      objects[objectName] = {
        materialIndices,
        materialNames,
        meshDataName: text(obj.meshDataName, 'audited meshDataName'),
        slotCount,
        topologySha256: hash(obj.topologySha256, 'audited topology'),
        uvSha256: hash(obj.uvSha256, 'audited uv'),
        usedSlots,
      };
    }
    result[parsedPath] = {
      sourceSha256: hash(row.sourceSha256, 'audited sourceSha256'),
      objects,
    };
  }
  return result;
}

/**
 * v3 source-audit shape: editor exceptions carry only the pointer facts
 * (path/hash/reason/inspection blend), not the v2 declared-slot rows.
 */
function parseEditorSourceAudit(value: unknown): {
  sourceCount: number;
  verifiedCount: number;
  exceptions: {
    sourcePath: string;
    sourceSha256: string;
    reason: string;
    inspectionBlendPath: string;
  }[];
} {
  const row = object(
    value,
    ['sourceCount', 'verifiedCount', 'exceptions'],
    'source audit'
  );
  if (!Array.isArray(row.exceptions))
    throw new Error('Source audit exceptions must be an array');
  const exceptions = row.exceptions.map((item) => {
    const issue = object(
      item,
      ['sourcePath', 'sourceSha256', 'reason', 'inspectionBlendPath'],
      'source audit exception'
    );
    return {
      sourcePath: relative(issue.sourcePath, 'exception sourcePath'),
      sourceSha256: hash(issue.sourceSha256, 'exception sourceSha256'),
      reason: text(issue.reason, 'exception reason'),
      inspectionBlendPath: text(
        issue.inspectionBlendPath,
        'exception inspectionBlendPath'
      ),
    };
  });
  uniqueBy(exceptions, (issue) => issue.sourcePath, 'source exception');
  const sourceCount = slot(row.sourceCount, 'sourceCount');
  const verifiedCount = slot(row.verifiedCount, 'verifiedCount');
  if (verifiedCount + exceptions.length !== sourceCount)
    throw new Error('Source audit count mismatch');
  return { sourceCount, verifiedCount, exceptions };
}

/** Strict parse of a prepared material-editor manifest (schemaVersion 3). */
export function parseMaterialEditorManifest(
  value: unknown
): MaterialEditorManifest {
  const top = object(
    value,
    [
      'schemaVersion',
      'mode',
      'profile',
      'profileSha256',
      'catalogSha256',
      'catalog',
      'sourceAudit',
      'auditedSlots',
      'inventory',
      'recipes',
      'editor',
    ],
    'material-editor manifest'
  );
  if (top.schemaVersion !== 3)
    throw new Error('Material editor requires manifest schemaVersion 3');
  if (top.mode !== 'material-editor')
    throw new Error('Not a material-editor manifest');
  const profile = parseEditingProfile(top.profile);
  const catalog = parseMaterialCatalog(top.catalog);
  const sourceAudit = parseEditorSourceAudit(top.sourceAudit);
  const auditedSlots = parseAuditedSlots(top.auditedSlots);
  const inventoryRow = object(
    top.inventory,
    ['schemaVersion', 'images'],
    'inventory'
  );
  if (inventoryRow.schemaVersion !== 1)
    throw new Error('Unsupported inventory schemaVersion');
  if (!Array.isArray(inventoryRow.images))
    throw new Error('inventory images must be an array');
  const images = inventoryRow.images.map(parseInventoryImage);
  uniqueBy(images, (image) => image.path, 'inventory image');
  // Note: the same image content may legitimately appear under several pack
  // paths; it shares one content-addressed URL, so hashes are not unique.

  const recipesRow = object(
    top.recipes,
    [
      'recipeBindings',
      'optionBindings',
      'unassignedActualSlots',
      'unusedDefinitions',
    ],
    'recipes'
  );
  if (!Array.isArray(recipesRow.recipeBindings))
    throw new Error('recipeBindings must be an array');
  const recipeBindings = recipesRow.recipeBindings.map(parseRecipeBinding);
  uniqueBy(
    recipeBindings,
    (binding) =>
      `${binding.sourcePath}\u0000${binding.objectName}\u0000${binding.slot}`,
    'recipe binding'
  );
  if (!Array.isArray(recipesRow.optionBindings))
    throw new Error('optionBindings must be an array');
  if (!Array.isArray(recipesRow.unassignedActualSlots))
    throw new Error('unassignedActualSlots must be an array');
  const unassignedActualSlots = recipesRow.unassignedActualSlots.map(
    (entry) => {
      if (
        !Array.isArray(entry) ||
        entry.length !== 3 ||
        typeof entry[0] !== 'string' ||
        typeof entry[1] !== 'string' ||
        typeof entry[2] !== 'number'
      )
        throw new Error('Invalid unassigned slot entry');
      return [
        relative(entry[0], 'unassigned sourcePath'),
        entry[1],
        entry[2],
      ] as [string, string, number];
    }
  );
  if (!Array.isArray(recipesRow.unusedDefinitions))
    throw new Error('unusedDefinitions must be an array');

  const editorRow = object(top.editor, ['schemaVersion', 'sources'], 'editor');
  if (editorRow.schemaVersion !== 1)
    throw new Error('Unsupported editor schemaVersion');
  if (!Array.isArray(editorRow.sources))
    throw new Error('editor sources must be an array');
  const sources = editorRow.sources.map(parseEditorSource);
  uniqueBy(sources, (source) => source.sourcePath, 'editor source');

  const manifest: MaterialEditorManifest = {
    schemaVersion: 3,
    mode: 'material-editor',
    profile,
    profileSha256: hash(top.profileSha256, 'profileSha256'),
    catalogSha256: hash(top.catalogSha256, 'catalogSha256'),
    catalog,
    sourceAudit,
    auditedSlots,
    inventory: { schemaVersion: 1, images },
    recipes: {
      recipeBindings,
      optionBindings: recipesRow.optionBindings,
      unassignedActualSlots,
      unusedDefinitions: recipesRow.unusedDefinitions.map((id) =>
        text(id, 'unused definition ID', true)
      ),
    },
    editor: { schemaVersion: 1, sources },
  };
  // Cross-checks against the audited inventory: exceptions and editor sources
  // must reference real audited sources with matching fingerprints.
  for (const exception of sourceAudit.exceptions) {
    const audited = auditedSlots[exception.sourcePath];
    if (!audited)
      throw new Error(`Unknown source exception: ${exception.sourcePath}`);
    if (audited.sourceSha256 !== exception.sourceSha256)
      throw new Error(
        `Source exception fingerprint mismatch: ${exception.sourcePath}`
      );
  }
  for (const source of sources) {
    const audited = auditedSlots[source.sourcePath];
    if (!audited)
      throw new Error(
        `Editor source has no audited inventory: ${source.sourcePath}`
      );
    if (audited.sourceSha256 !== source.sourceSha256)
      throw new Error(
        `Editor source fingerprint differs from the audit: ${source.sourcePath}`
      );
    for (const target of source.targets) {
      const objectRow = audited.objects[target.objectName];
      if (!objectRow || target.slot >= objectRow.materialNames.length)
        throw new Error(
          `Editor target is not an audited slot: ${target.objectName}:${target.slot}`
        );
    }
  }
  for (const binding of recipeBindings) {
    const audited = auditedSlots[binding.sourcePath];
    const objectRow = audited?.objects[binding.objectName];
    if (!objectRow || binding.slot >= objectRow.materialNames.length)
      throw new Error(
        `Recipe binding is not an audited slot: ${binding.sourcePath}:${binding.objectName}:${binding.slot}`
      );
    if (
      binding.materialName !== null &&
      binding.materialName !== objectRow.materialNames[binding.slot]
    )
      throw new Error(
        `Recipe binding material differs from the audited slot: ${binding.sourcePath}:${binding.objectName}:${binding.slot}`
      );
  }
  validateEditingProfile(manifest.profile, manifest);
  return manifest;
}

function uniqueBy<T>(
  items: T[],
  key: (item: T) => string,
  label: string
): void {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

/** Profile identity must match the prepared workspace and reference real slots. */
export function validateEditingProfile(
  profile: EditingProfile,
  manifest: MaterialEditorManifest
): void {
  // Typed drafts still need numeric/channel validation before reaching a
  // material or state update; TypeScript does not make NaN/negative finite.
  parseEditingProfile(editingWireDocument(profile));
  if (
    profile.packSlug !== manifest.catalog.packSlug ||
    profile.packVersion !== manifest.catalog.packVersion
  )
    throw new Error('Editing profile pack differs from the prepared catalogue');
  const familyIds = new Set(manifest.catalog.families.map((f) => f.id));
  for (const familyId of Object.keys(profile.assignments.familyDefaults))
    if (!familyIds.has(familyId))
      throw new Error(`Unknown family for editing default: ${familyId}`);
  for (const familyId of Object.keys(profile.selections))
    if (!familyIds.has(familyId))
      throw new Error(`Unknown family for legacy selection: ${familyId}`);
  for (const override of profile.assignments.slotOverrides) {
    const source = manifest.auditedSlots[override.sourcePath];
    if (!source)
      throw new Error(
        `Slot override target has no audited source: ${override.sourcePath}`
      );
    const audited = source.objects[override.objectName];
    if (!audited)
      throw new Error(
        `Slot override object is not an actual imported object: ${override.sourcePath}:${override.objectName}`
      );
    if (override.slot >= audited.materialNames.length)
      throw new Error(
        `Slot override slot is out of range: ${override.sourcePath}:${override.objectName}:${override.slot}`
      );
  }
}

export function slotKey(
  sourcePath: string,
  objectName: string,
  slot: number
): string {
  return `${sourcePath}\u0000${objectName}\u0000${slot}`;
}

/** The resolved per-slot recipe prepared by the producer, if any. */
export function slotRecipe(
  manifest: MaterialEditorManifest,
  sourcePath: string,
  objectName: string,
  slot: number
): RecipeBinding | null {
  const key = slotKey(sourcePath, objectName, slot);
  return (
    manifest.recipes.recipeBindings.find(
      (binding) =>
        slotKey(binding.sourcePath, binding.objectName, binding.slot) === key
    ) ?? null
  );
}

/** Actual audited material label for a slot, when known. */
export function auditedMaterialName(
  manifest: MaterialEditorManifest,
  sourcePath: string,
  objectName: string,
  slot: number
): string | null {
  return (
    manifest.auditedSlots[sourcePath]?.objects[objectName]?.materialNames[
      slot
    ] ?? null
  );
}

/**
 * The definition currently owning a slot: an explicit override wins, then the
 * family-group default; unassigned slots have no definition yet.
 */
export function definitionIdForSlot(
  profile: EditingProfile,
  manifest: MaterialEditorManifest,
  sourcePath: string,
  objectName: string,
  slot: number
): string | null {
  const key = slotKey(sourcePath, objectName, slot);
  const override = profile.assignments.slotOverrides.find(
    (item) => slotKey(item.sourcePath, item.objectName, item.slot) === key
  );
  if (override) return override.definition;
  // A vendor-labelled group is not proof that this actual source slot was
  // established. Only producer-resolved membership grants a group default.
  if (!slotRecipe(manifest, sourcePath, objectName, slot)) return null;
  const family = manifest.catalog.families.find((item) =>
    item.uses.some(
      (use) =>
        use.sourcePath === sourcePath &&
        use.objectName === objectName &&
        use.slot === slot
    )
  );
  if (family) {
    const defaultId = profile.assignments.familyDefaults[family.id];
    if (defaultId) return defaultId;
  }
  return null;
}

/** Channels a slot resolves to under the current profile. */
export function resolvedSlotChannels(
  profile: EditingProfile,
  manifest: MaterialEditorManifest,
  sourcePath: string,
  objectName: string,
  slot: number
): {
  channels: RecipeChannels;
  definitionId: string | null;
  scope: 'slot-override' | 'family-default' | 'unassigned';
} {
  const recipe = slotRecipe(manifest, sourcePath, objectName, slot);
  const definitionId = definitionIdForSlot(
    profile,
    manifest,
    sourcePath,
    objectName,
    slot
  );
  if (definitionId && profile.definitions[definitionId]) {
    const key = slotKey(sourcePath, objectName, slot);
    const overridden = profile.assignments.slotOverrides.some(
      (item) => slotKey(item.sourcePath, item.objectName, item.slot) === key
    );
    return {
      channels: channelsOfDefinition(profile.definitions[definitionId]),
      definitionId,
      scope: overridden ? 'slot-override' : 'family-default',
    };
  }
  if (recipe)
    return {
      channels: recipe.channels,
      definitionId: null,
      scope: recipe.scope,
    };
  return {
    channels: {
      baseColor: null,
      normal: null,
      emissive: null,
      wrap: 'repeat',
    },
    definitionId,
    scope: 'unassigned',
  };
}

export function channelsOfDefinition(
  definition: EditingProfileDefinition
): RecipeChannels {
  return {
    baseColor:
      definition.baseColor === null
        ? null
        : { path: definition.baseColor, sha256: '' },
    normal:
      definition.normal === null
        ? null
        : {
            path: definition.normal.image,
            sha256: '',
            strength: definition.normal.strength,
          },
    emissive:
      definition.emissive === null
        ? null
        : {
            image:
              definition.emissive.image === null
                ? null
                : { path: definition.emissive.image, sha256: '' },
            color: definition.emissive.color,
            strength: definition.emissive.strength,
          },
    wrap: definition.wrap,
  };
}

/**
 * The editable definition a slot resolves to: the profile-owned definition
 * when the slot has one, otherwise a definition built from the producer's
 * resolved recipe (family defaults) or neutral channels (unassigned slots).
 */
export function definitionForSlot(
  profile: EditingProfile,
  manifest: MaterialEditorManifest,
  sourcePath: string,
  objectName: string,
  slot: number
): EditingProfileDefinition {
  const definitionId = definitionIdForSlot(
    profile,
    manifest,
    sourcePath,
    objectName,
    slot
  );
  const owned = definitionId ? profile.definitions[definitionId] : undefined;
  if (owned)
    return {
      ...owned,
      normal: owned.normal ? { ...owned.normal } : null,
      emissive: owned.emissive ? { ...owned.emissive } : null,
    };
  const recipe = slotRecipe(manifest, sourcePath, objectName, slot);
  const channels = recipe?.channels ?? {
    baseColor: null,
    normal: null,
    emissive: null,
    wrap: 'repeat' as const,
  };
  return {
    label:
      recipe?.materialName ??
      auditedMaterialName(manifest, sourcePath, objectName, slot) ??
      `${objectName} slot ${slot}`,
    baseColor: channels.baseColor?.path ?? null,
    normal:
      channels.normal === null
        ? null
        : { image: channels.normal.path, strength: channels.normal.strength },
    emissive:
      channels.emissive === null
        ? null
        : {
            image: channels.emissive.image?.path ?? null,
            color: channels.emissive.color,
            strength: channels.emissive.strength,
          },
    wrap: channels.wrap,
  };
}

function sanitizeIdentifier(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'slot';
}

/**
 * Give one slot its own editable definition: per-slot scope is the demo
 * contract, so editing never leaks into other slots through a shared
 * definition. Reuses the slot's existing override definition on later edits.
 */
export function overrideDefinitionId(
  profile: EditingProfile,
  manifest: MaterialEditorManifest,
  sourcePath: string,
  objectName: string,
  slot: number
): { profile: EditingProfile; definitionId: string } {
  const key = slotKey(sourcePath, objectName, slot);
  const existing = profile.assignments.slotOverrides.find(
    (item) => slotKey(item.sourcePath, item.objectName, item.slot) === key
  );
  if (existing) return { profile, definitionId: existing.definition };
  const base = sanitizeIdentifier(
    `slot-${
      sourcePath
        .split('/')
        .at(-1)
        ?.replace(/\.fbx$/i, '') ?? 'source'
    }-${objectName}-${slot}`
  );
  let definitionId = base;
  let counter = 2;
  while (Object.hasOwn(profile.definitions, definitionId)) {
    definitionId = `${base}-${counter}`;
    counter += 1;
  }
  const current = resolvedSlotChannels(
    profile,
    manifest,
    sourcePath,
    objectName,
    slot
  );
  const definition: EditingProfileDefinition = {
    label:
      auditedMaterialName(manifest, sourcePath, objectName, slot) ??
      `${objectName} slot ${slot}`,
    baseColor: current.channels.baseColor?.path ?? null,
    normal:
      current.channels.normal === null
        ? null
        : {
            image: current.channels.normal.path,
            strength: current.channels.normal.strength,
          },
    emissive:
      current.channels.emissive === null
        ? null
        : {
            image: current.channels.emissive.image?.path ?? null,
            color: current.channels.emissive.color,
            strength: current.channels.emissive.strength,
          },
    wrap: current.channels.wrap,
  };
  // Slot overrides are only valid for actual audited slots; the family-default
  // slots always are, and validateEditingProfile guards the rest on export.
  return {
    profile: {
      ...profile,
      definitions: { ...profile.definitions, [definitionId]: definition },
      assignments: {
        ...profile.assignments,
        slotOverrides: [
          ...profile.assignments.slotOverrides,
          { sourcePath, objectName, slot, definition: definitionId },
        ],
      },
    },
    definitionId,
  };
}

/** Set the channels of one slot through its own override definition. */
export function setSlotChannels(
  profile: EditingProfile,
  manifest: MaterialEditorManifest,
  sourcePath: string,
  objectName: string,
  slot: number,
  definition: EditingProfileDefinition
): EditingProfile {
  const owned = overrideDefinitionId(
    profile,
    manifest,
    sourcePath,
    objectName,
    slot
  );
  const withDefinition: EditingProfile = {
    ...owned.profile,
    definitions: {
      ...owned.profile.definitions,
      [owned.definitionId]: definition,
    },
  };
  validateEditingProfile(withDefinition, manifest);
  return withDefinition;
}

/** Drop a slot's override (and its definition when nothing else uses it). */
export function resetSlotOverride(
  profile: EditingProfile,
  sourcePath: string,
  objectName: string,
  slot: number
): EditingProfile {
  const key = slotKey(sourcePath, objectName, slot);
  const override = profile.assignments.slotOverrides.find(
    (item) => slotKey(item.sourcePath, item.objectName, item.slot) === key
  );
  if (!override) return profile;
  const stillUsed =
    Object.values(profile.assignments.familyDefaults).includes(
      override.definition
    ) ||
    profile.assignments.slotOverrides.some(
      (item) => item !== override && item.definition === override.definition
    );
  const definitions = { ...profile.definitions };
  if (!stillUsed) delete definitions[override.definition];
  return {
    ...profile,
    definitions,
    assignments: {
      ...profile.assignments,
      slotOverrides: profile.assignments.slotOverrides.filter(
        (item) => slotKey(item.sourcePath, item.objectName, item.slot) !== key
      ),
    },
  };
}

/**
 * Resolve an inventory path to the URL a browser can actually render: the
 * original for loadable formats, the lossless derivative otherwise.
 */
export function inventoryUrl(
  manifest: MaterialEditorManifest,
  path: string
): string | null {
  const entry = manifest.inventory.images.find((image) => image.path === path);
  if (!entry) return null;
  return entry.url ?? entry.preview?.url ?? null;
}
