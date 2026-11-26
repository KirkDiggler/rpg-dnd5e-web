/** Authoring authority for complete texture sets and explicit allowed-pack membership.
 * The v2 slot profile remains an experimental workbench. These are review choices,
 * not runtime material bindings, approvals, or inferred filename compatibility.
 */
import {
  editingDefinitionWireDocument,
  parseEditingProfileDefinition,
  type EditingProfileDefinition,
  type MaterialEditorManifest,
} from './materialRecipe';

/** Display-only suggestion; never infers compatibility or a channel role. */
export function imageLabel(path: string): string {
  const name = path
    .split('/')
    .at(-1)!
    .replace(/\.[^.]+$/, '');
  return name.match(/(?:^|_)(\d+_[A-Za-z]+)$/)?.[1] ?? name;
}

export interface PackTarget {
  sourcePath: string;
  objectName: string;
  slot: number;
}
export interface TexturePack {
  label: string;
  sets: Record<string, EditingProfileDefinition>;
}
export interface TexturePackLibrary {
  schemaVersion: 1;
  kind: 'texture-pack-library';
  libraryId: string;
  packSlug: string;
  packVersion: string;
  packs: Record<string, TexturePack>;
  assignments: (PackTarget & { packs: string[] })[];
}
type Row = Record<string, unknown>;
function record(value: unknown): value is Row {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function fields(value: unknown, keys: string[], label: string): Row {
  if (
    !record(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(value, k))
  )
    throw new Error(`Invalid ${label} fields`);
  return value;
}
function text(value: unknown, label: string): string {
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
  return value;
}
function id(value: unknown): string {
  const result = text(value, 'identifier');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(result))
    throw new Error(
      'Identifier must be 1–128 letters, numbers, hyphens or underscores'
    );
  return result;
}
export function targetKey(target: PackTarget): string {
  return JSON.stringify([target.sourcePath, target.objectName, target.slot]);
}
function target(row: Row): PackTarget {
  const sourcePath = text(row.sourcePath, 'sourcePath');
  if (
    sourcePath.includes('\\') ||
    sourcePath.split('/').some((p) => !p || p === '.' || p === '..') ||
    !sourcePath.toLowerCase().endsWith('.fbx')
  )
    throw new Error('Invalid relative FBX sourcePath');
  if (
    typeof row.slot !== 'number' ||
    !Number.isSafeInteger(row.slot) ||
    row.slot < 0
  )
    throw new Error('Invalid target slot');
  return {
    sourcePath,
    objectName: text(row.objectName, 'objectName'),
    slot: row.slot,
  };
}
function completeSet(value: unknown): EditingProfileDefinition {
  const result = parseEditingProfileDefinition(value);
  if (!result.baseColor)
    throw new Error('A texture set requires a color image');
  return result;
}
export function parseLibrary(value: unknown): TexturePackLibrary {
  const root = fields(
    value,
    [
      'schemaVersion',
      'kind',
      'libraryId',
      'packSlug',
      'packVersion',
      'packs',
      'assignments',
    ],
    'texture-pack library'
  );
  if (root.schemaVersion !== 1 || root.kind !== 'texture-pack-library')
    throw new Error('Unsupported texture-pack library');
  if (!record(root.packs) || !Array.isArray(root.assignments))
    throw new Error('Invalid packs/assignments');
  const packs = Object.fromEntries(
    Object.entries(root.packs).map(([key, value]) => {
      id(key);
      const pack = fields(value, ['label', 'sets'], 'pack');
      if (!record(pack.sets) || !Object.keys(pack.sets).length)
        throw new Error('A pack requires at least one set');
      return [
        key,
        {
          label: text(pack.label, 'pack label'),
          sets: Object.fromEntries(
            Object.entries(pack.sets).map(([setId, set]) => [
              id(setId),
              completeSet(set),
            ])
          ),
        },
      ];
    })
  );
  const seen = new Set<string>();
  const assignments = root.assignments.map((value) => {
    const row = fields(
        value,
        ['sourcePath', 'objectName', 'slot', 'packs'],
        'pack assignment'
      ),
      scope = target(row);
    if (seen.has(targetKey(scope)))
      throw new Error('Duplicate assignment target');
    seen.add(targetKey(scope));
    if (!Array.isArray(row.packs) || !row.packs.length)
      throw new Error('Assignment requires allowed packs');
    const ids = row.packs.map(id);
    if (
      new Set(ids).size !== ids.length ||
      ids.some((key) => !Object.hasOwn(packs, key))
    )
      throw new Error('Duplicate or unknown assignment pack');
    return { ...scope, packs: ids };
  });
  return {
    schemaVersion: 1,
    kind: 'texture-pack-library',
    libraryId: id(root.libraryId),
    packSlug: id(root.packSlug),
    packVersion: id(root.packVersion),
    packs,
    assignments,
  };
}
export function libraryDocument(library: TexturePackLibrary): Row {
  return {
    ...library,
    packs: Object.fromEntries(
      Object.entries(library.packs).map(([key, pack]) => [
        key,
        {
          label: pack.label,
          sets: Object.fromEntries(
            Object.entries(pack.sets).map(([key, set]) => [
              key,
              editingDefinitionWireDocument(set),
            ])
          ),
        },
      ])
    ),
  };
}
export function serializeLibrary(library: TexturePackLibrary): string {
  const document = libraryDocument(library);
  parseLibrary(document);
  return JSON.stringify(document, null, 2) + '\n';
}
export function libraryDraftKey(manifest: MaterialEditorManifest): string {
  return `texture-pack-library-v1:${manifest.profile.packSlug}:${manifest.profile.packVersion}`;
}
export function createLibrary(
  libraryId: string,
  manifest: MaterialEditorManifest
): TexturePackLibrary {
  return {
    schemaVersion: 1,
    kind: 'texture-pack-library',
    libraryId: id(libraryId),
    packSlug: manifest.profile.packSlug,
    packVersion: manifest.profile.packVersion,
    packs: {},
    assignments: [],
  };
}
export function validateLibrary(
  library: TexturePackLibrary,
  manifest: MaterialEditorManifest
): void {
  parseLibrary(libraryDocument(library));
  if (
    library.packSlug !== manifest.profile.packSlug ||
    library.packVersion !== manifest.profile.packVersion
  )
    throw new Error('Library source pack/version differs from this review');
  const images = new Set(manifest.inventory.images.map((i) => i.path));
  for (const pack of Object.values(library.packs))
    for (const set of Object.values(pack.sets)) {
      for (const path of [
        set.baseColor,
        set.normal?.image,
        set.emissive?.image,
      ])
        if (path && !images.has(path))
          throw new Error(`Unknown library image: ${path}`);
    }
  const targets = new Set(renderedTargets(manifest).map(targetKey));
  for (const assignment of library.assignments)
    if (!targets.has(targetKey(assignment)))
      throw new Error(
        `Unknown or nonrendered target: ${assignment.sourcePath} / ${assignment.objectName} / slot ${assignment.slot}`
      );
}
export function renderedTargets(
  manifest: MaterialEditorManifest
): PackTarget[] {
  return manifest.editor.sources.flatMap((s) =>
    s.targets
      .filter((t) => t.rendered && t.target)
      .map((t) => ({
        sourcePath: s.sourcePath,
        objectName: t.objectName,
        slot: t.slot,
      }))
  );
}
function pack(library: TexturePackLibrary, key: string): TexturePack {
  if (!Object.hasOwn(library.packs, key))
    throw new Error(`Unknown pack: ${key}`);
  return library.packs[key]!;
}
export function addPack(
  library: TexturePackLibrary,
  key: string,
  label: string,
  sets: Record<string, EditingProfileDefinition>
): TexturePackLibrary {
  id(key);
  if (Object.hasOwn(library.packs, key))
    throw new Error(`Pack already exists: ${key}`);
  const document = libraryDocument({
    ...library,
    packs: { ...library.packs, [key]: { label, sets } },
  });
  return parseLibrary(document);
}
export function putSet(
  library: TexturePackLibrary,
  packId: string,
  setId: string,
  definition: EditingProfileDefinition,
  manifest: MaterialEditorManifest
): TexturePackLibrary {
  const original = pack(library, packId),
    set = completeSet(editingDefinitionWireDocument(definition));
  const result = {
    ...library,
    packs: {
      ...library.packs,
      [packId]: { ...original, sets: { ...original.sets, [id(setId)]: set } },
    },
  };
  validateLibrary(result, manifest);
  return result;
}
export function renamePack(
  library: TexturePackLibrary,
  packId: string,
  label: string
): TexturePackLibrary {
  return {
    ...library,
    packs: {
      ...library.packs,
      [packId]: { ...pack(library, packId), label: text(label, 'pack label') },
    },
  };
}
export function removeSet(
  library: TexturePackLibrary,
  packId: string,
  setId: string
): TexturePackLibrary {
  const original = pack(library, packId),
    sets = Object.fromEntries(
      Object.entries(original.sets).filter(([key]) => key !== setId)
    );
  if (!Object.keys(sets).length)
    throw new Error('Remove the pack to remove its last set');
  return {
    ...library,
    packs: { ...library.packs, [packId]: { ...original, sets } },
  };
}
export function removePack(
  library: TexturePackLibrary,
  packId: string
): TexturePackLibrary {
  pack(library, packId);
  return {
    ...library,
    packs: Object.fromEntries(
      Object.entries(library.packs).filter(([key]) => key !== packId)
    ),
    assignments: library.assignments
      .map((a) => ({ ...a, packs: a.packs.filter((key) => key !== packId) }))
      .filter((a) => a.packs.length),
  };
}
export function allowedPacks(
  library: TexturePackLibrary,
  scope: PackTarget
): string[] {
  return (
    library.assignments.find((a) => targetKey(a) === targetKey(scope))?.packs ??
    []
  );
}
export function assignPack(
  library: TexturePackLibrary,
  packId: string,
  targets: PackTarget[],
  manifest: MaterialEditorManifest
): TexturePackLibrary {
  pack(library, packId);
  const assignments = new Map(
    library.assignments.map((a) => [targetKey(a), a])
  );
  for (const scope of targets) {
    const previous = assignments.get(targetKey(scope));
    assignments.set(targetKey(scope), {
      ...scope,
      packs: previous?.packs.includes(packId)
        ? [...previous.packs]
        : [...(previous?.packs ?? []), packId],
    });
  }
  const result = { ...library, assignments: [...assignments.values()] };
  validateLibrary(result, manifest);
  return result;
}
export function unassignPack(
  library: TexturePackLibrary,
  packId: string,
  targets: PackTarget[]
): TexturePackLibrary {
  const selected = new Set(targets.map(targetKey));
  return {
    ...library,
    assignments: library.assignments
      .map((a) =>
        selected.has(targetKey(a))
          ? { ...a, packs: a.packs.filter((key) => key !== packId) }
          : a
      )
      .filter((a) => a.packs.length),
  };
}
/** Development custody declaration only. Never publish editor selectors as runtime selectors. */
export async function reviewDeclaration(
  library: TexturePackLibrary,
  manifest: MaterialEditorManifest
) {
  validateLibrary(library, manifest);
  const libraryJson = serializeLibrary(library);
  // Bind the exact UTF-8 export, not a second cross-language JSON canonicalizer.
  const bytes = new TextEncoder().encode(libraryJson);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const paths = new Set(
    Object.values(library.packs).flatMap((p) =>
      Object.values(p.sets).flatMap((s) =>
        [s.baseColor, s.normal?.image, s.emissive?.image].filter(
          (v): v is string => !!v
        )
      )
    )
  );
  return {
    schemaVersion: 1,
    kind: 'texture-pack-review-declaration',
    status: 'review-only',
    libraryJson,
    librarySha256: Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, '0')
    ).join(''),
    catalogSha256: manifest.catalogSha256,
    images: manifest.inventory.images
      .filter((i) => paths.has(i.path))
      .map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    assignments: library.assignments.map((a) => {
      const source = manifest.editor.sources.find(
        (s) => s.sourcePath === a.sourcePath
      )!;
      const target = source.targets.find(
        (t) => t.objectName === a.objectName && t.slot === a.slot
      )!;
      return {
        ...a,
        sourceSha256: source.sourceSha256,
        editorGlbSha256: source.glb.sha256,
        editorTarget: { ...target.target! },
      };
    }),
  };
}
