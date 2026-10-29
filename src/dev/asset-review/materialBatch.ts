/**
 * Related-piece batch configuration for the preview-only material editor.
 *
 * One explicit versioned envelope around the existing schemaVersion 2 editing
 * profile: schemaVersion 1 + kind `material-editor-batch` owns the user-labeled
 * queue (source identity + status), a working material style that carries
 * forward until it is explicitly changed again, and independent per-piece
 * saved snapshots. Saving a piece freezes its rendered slots into per-slot
 * definitions, so later style or default edits can never mutate an earlier
 * saved piece retroactively. This module is pure state: it parses, validates,
 * transitions and extracts — it never approves a material, marks a source
 * Ready, or touches a release. The configured-only extraction is the future
 * script input seam; final GLB compilation/ingestion integration is separate.
 */
import {
  auditedMaterialName,
  channelsOfDefinition,
  editingDefinitionWireDocument,
  editingProfileWireDocument,
  parseEditingProfile,
  parseEditingProfileDefinition,
  resetSlotOverride,
  setSlotChannels,
  slotKey,
  validateEditingProfile,
  type EditingProfile,
  type EditingProfileDefinition,
  type EditingSlotOverride,
  type MaterialEditorManifest,
} from './materialRecipe';

export type BatchPieceStatus = 'draft' | 'configured' | 'deferred';

/** Independent record of one piece's channels at the moment it was saved. */
export interface BatchPieceSnapshot {
  overrides: EditingSlotOverride[];
  definitions: Record<string, EditingProfileDefinition>;
}

export interface BatchQueueEntry {
  sourcePath: string;
  sourceSha256: string;
  status: BatchPieceStatus;
  /** Present once the piece has been saved at least once. */
  saved?: BatchPieceSnapshot;
}

export interface BatchDocument {
  schemaVersion: 1;
  kind: 'material-editor-batch';
  batchId: string;
  batchName: string;
  /** Carries forward to new/unconfigured pieces until explicitly changed. */
  workingStyle: EditingProfileDefinition;
  queue: BatchQueueEntry[];
  /** The live v2 editing profile (current piece edits + saved overrides). */
  profile: EditingProfile;
}

export interface BatchExtractionSlot {
  objectName: string;
  slot: number;
  definition: string;
  channels: {
    baseColor: string | null;
    normal: { image: string; strength: number } | null;
    emissive: { image: string | null; color: string; strength: number } | null;
    wrap: 'repeat' | 'clamp';
  };
}

export interface BatchExtractionPiece {
  sourcePath: string;
  sourceSha256: string;
  slots: BatchExtractionSlot[];
}

/**
 * The pure machine-readable handoff: ONLY configured pieces, ONLY their own
 * saved per-slot overrides. Deferred and draft rows and inherited family-wide
 * defaults are excluded by construction.
 */
export interface BatchExtraction {
  schemaVersion: 1;
  kind: 'material-editor-batch-extraction';
  batchId: string;
  packSlug: string;
  packVersion: string;
  pieces: BatchExtractionPiece[];
}

type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactObject(value: unknown, keys: string[], label: string): Row {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error(`Invalid ${label} fields`);
  return value;
}

function objectWithOptional(
  value: unknown,
  required: string[],
  optional: string[],
  label: string
): Row {
  if (!isRecord(value)) throw new Error(`Invalid ${label} fields`);
  const keys = Object.keys(value);
  if (
    keys.length > required.length + optional.length ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new Error(`Invalid ${label} fields`);
  return value;
}

function isBatchStatus(value: unknown): value is BatchPieceStatus {
  return value === 'draft' || value === 'configured' || value === 'deferred';
}

function batchText(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim() !== value ||
    value.length > 200
  )
    throw new Error(`Invalid ${label}`);
  return value;
}

function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new Error(`Invalid ${label} SHA-256`);
  return value;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export const WORKING_STYLE_DEFAULT: EditingProfileDefinition = {
  label: 'Working style',
  baseColor: null,
  normal: null,
  emissive: null,
  wrap: 'repeat',
};

export function createBatchDocument(
  batchId: string,
  batchName: string,
  profile: EditingProfile
): BatchDocument {
  return {
    schemaVersion: 1,
    kind: 'material-editor-batch',
    batchId: batchText(batchId, 'batch ID'),
    batchName: batchText(batchName, 'batch name'),
    workingStyle: clone(WORKING_STYLE_DEFAULT),
    queue: [],
    profile: clone(profile),
  };
}

export function setBatchName(doc: BatchDocument, name: string): BatchDocument {
  return { ...doc, batchName: batchText(name, 'batch name') };
}

export function setWorkingStyle(
  doc: BatchDocument,
  definition: EditingProfileDefinition
): BatchDocument {
  return { ...doc, workingStyle: clone(definition) };
}

export function findQueueEntry(
  doc: BatchDocument,
  sourcePath: string
): BatchQueueEntry | undefined {
  return doc.queue.find((entry) => entry.sourcePath === sourcePath);
}

/** Add sources to the end of the queue; order is user-meaningful. */
export function enqueueSources(
  doc: BatchDocument,
  sources: { sourcePath: string; sourceSha256: string }[]
): BatchDocument {
  const queue = [...doc.queue];
  for (const source of sources) {
    if (queue.some((entry) => entry.sourcePath === source.sourcePath))
      throw new Error(`Source is already in the batch: ${source.sourcePath}`);
    queue.push({
      sourcePath: source.sourcePath,
      sourceSha256: source.sourceSha256,
      status: 'draft',
    });
  }
  return { ...doc, queue };
}

/** Drop a queue entry and its piece-scoped overrides/definitions. */
export function removeSource(
  doc: BatchDocument,
  sourcePath: string
): BatchDocument {
  let profile = doc.profile;
  for (const override of profile.assignments.slotOverrides) {
    if (override.sourcePath === sourcePath)
      profile = resetSlotOverride(
        profile,
        sourcePath,
        override.objectName,
        override.slot
      );
  }
  return {
    ...doc,
    profile,
    queue: doc.queue.filter((entry) => entry.sourcePath !== sourcePath),
  };
}

function definitionToFreeze(
  doc: BatchDocument,
  profile: EditingProfile,
  manifest: MaterialEditorManifest,
  sourcePath: string,
  objectName: string,
  slot: number
): EditingProfileDefinition {
  const override = profile.assignments.slotOverrides.find(
    (item) =>
      item.sourcePath === sourcePath &&
      item.objectName === objectName &&
      item.slot === slot
  );
  const channels = override
    ? channelsOfDefinition(profile.definitions[override.definition]!)
    : channelsOfDefinition(doc.workingStyle);
  return {
    label:
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

/**
 * Save & Next's record step: freeze every rendered slot of this piece into an
 * explicit per-slot override (seeded from its override or the working style),
 * then keep an independent snapshot. Later edits to the working style or other
 * pieces cannot mutate this snapshot.
 */
export function savePiece(
  doc: BatchDocument,
  manifest: MaterialEditorManifest,
  sourcePath: string
): BatchDocument {
  const entry = findQueueEntry(doc, sourcePath);
  if (!entry) throw new Error(`Source is not in the batch: ${sourcePath}`);
  const source = manifest.editor.sources.find(
    (item) => item.sourcePath === sourcePath
  );
  if (!source)
    throw new Error(`Source is not part of the prepared editor: ${sourcePath}`);
  let profile = doc.profile;
  for (const target of source.targets) {
    if (!target.rendered) continue;
    profile = setSlotChannels(
      profile,
      manifest,
      sourcePath,
      target.objectName,
      target.slot,
      definitionToFreeze(
        doc,
        profile,
        manifest,
        sourcePath,
        target.objectName,
        target.slot
      )
    );
  }
  const overrides = clone(
    profile.assignments.slotOverrides.filter(
      (item) => item.sourcePath === sourcePath
    )
  ).sort((a, b) => a.objectName.localeCompare(b.objectName) || a.slot - b.slot);
  const definitions: Record<string, EditingProfileDefinition> = {};
  for (const override of overrides) {
    const definition = profile.definitions[override.definition];
    if (!definition)
      throw new Error(`Missing override definition: ${override.definition}`);
    definitions[override.definition] = clone(definition);
  }
  const queue = doc.queue.map((item) =>
    item.sourcePath === sourcePath
      ? {
          ...item,
          status: 'configured' as const,
          saved: { overrides, definitions },
        }
      : item
  );
  return { ...doc, profile, queue };
}

/** Defer & Next: an explicit deferred decision; never a configured state. */
export function deferPiece(
  doc: BatchDocument,
  sourcePath: string
): BatchDocument {
  const entry = findQueueEntry(doc, sourcePath);
  if (!entry) throw new Error(`Source is not in the batch: ${sourcePath}`);
  const queue = doc.queue.map((item) =>
    item.sourcePath === sourcePath
      ? { ...item, status: 'deferred' as const }
      : item
  );
  return { ...doc, queue };
}

/** Editing a saved piece (or any piece) makes it a draft until saved again. */
export function markPieceEditing(
  doc: BatchDocument,
  sourcePath: string
): BatchDocument {
  const entry = findQueueEntry(doc, sourcePath);
  if (!entry || entry.status !== 'configured') return doc;
  const queue = doc.queue.map((item) =>
    item.sourcePath === sourcePath
      ? { ...item, status: 'draft' as const }
      : item
  );
  return { ...doc, queue };
}

/** Apply one slot's channels through its own override definition. */
export function setBatchSlotChannels(
  doc: BatchDocument,
  manifest: MaterialEditorManifest,
  sourcePath: string,
  objectName: string,
  slot: number,
  definition: EditingProfileDefinition
): BatchDocument {
  const profile = setSlotChannels(
    doc.profile,
    manifest,
    sourcePath,
    objectName,
    slot,
    definition
  );
  return {
    ...markPieceEditing(doc, sourcePath),
    profile,
  };
}

/**
 * Returning to a saved piece restores its saved configuration: the piece's
 * current overrides are replaced by the snapshot's, deep-copied so editing
 * afterwards can never alias the snapshot.
 */
export function restoreSavedPiece(
  doc: BatchDocument,
  manifest: MaterialEditorManifest,
  sourcePath: string
): BatchDocument {
  const entry = findQueueEntry(doc, sourcePath);
  if (!entry?.saved) return doc;
  let profile = doc.profile;
  const savedKeys = new Set(
    entry.saved.overrides.map((override) =>
      slotKey(sourcePath, override.objectName, override.slot)
    )
  );
  for (const override of profile.assignments.slotOverrides) {
    if (
      override.sourcePath === sourcePath &&
      !savedKeys.has(slotKey(sourcePath, override.objectName, override.slot))
    )
      profile = resetSlotOverride(
        profile,
        sourcePath,
        override.objectName,
        override.slot
      );
  }
  for (const override of entry.saved.overrides) {
    const definition = entry.saved.definitions[override.definition];
    if (!definition)
      throw new Error(
        `Saved snapshot is missing definition: ${override.definition}`
      );
    profile = setSlotChannels(
      profile,
      manifest,
      sourcePath,
      override.objectName,
      override.slot,
      clone(definition)
    );
  }
  return { ...doc, profile };
}

/**
 * The definition owning a queued piece's slot in batch mode: its explicit
 * override, otherwise the working style (never the producer's family default —
 * inherited defaults never become batch decisions through this editor).
 */
export function batchDefinitionForSlot(
  doc: BatchDocument,
  sourcePath: string,
  objectName: string,
  slot: number
): EditingProfileDefinition {
  const override = doc.profile.assignments.slotOverrides.find(
    (item) =>
      item.sourcePath === sourcePath &&
      item.objectName === objectName &&
      item.slot === slot
  );
  const owned = override
    ? doc.profile.definitions[override.definition]
    : undefined;
  return clone(owned ?? doc.workingStyle);
}

export function batchScopeForSlot(
  doc: BatchDocument,
  sourcePath: string,
  objectName: string,
  slot: number
): 'slot-override' | 'working-style' {
  return doc.profile.assignments.slotOverrides.some(
    (item) =>
      item.sourcePath === sourcePath &&
      item.objectName === objectName &&
      item.slot === slot
  )
    ? 'slot-override'
    : 'working-style';
}

/** A queued piece whose recorded source identity no longer matches. */
export function staleQueueEntries(
  doc: BatchDocument,
  manifest: MaterialEditorManifest
): string[] {
  return doc.queue
    .filter((entry) => {
      const audited = manifest.auditedSlots[entry.sourcePath];
      return !audited || audited.sourceSha256 !== entry.sourceSha256;
    })
    .map((entry) => entry.sourcePath);
}

/** Full check against the prepared workspace; throws with a visible reason. */
export function validateBatchDocument(
  doc: BatchDocument,
  manifest: MaterialEditorManifest
): void {
  validateEditingProfile(doc.profile, manifest);
  const seen = new Set<string>();
  for (const entry of doc.queue) {
    if (seen.has(entry.sourcePath))
      throw new Error(`Duplicate queue entry: ${entry.sourcePath}`);
    seen.add(entry.sourcePath);
    const audited = manifest.auditedSlots[entry.sourcePath];
    if (!audited)
      throw new Error(`Queue entry has no audited source: ${entry.sourcePath}`);
    if (audited.sourceSha256 !== entry.sourceSha256)
      throw new Error(
        `Stale queue entry — source changed since it was queued: ${entry.sourcePath}`
      );
    if (entry.saved) {
      for (const override of entry.saved.overrides) {
        if (override.sourcePath !== entry.sourcePath)
          throw new Error(
            `Saved override names a different source: ${override.sourcePath}`
          );
        const objectRow = audited.objects[override.objectName];
        if (!objectRow || override.slot >= objectRow.materialNames.length)
          throw new Error(
            `Saved override is not an audited slot: ${override.objectName}:${override.slot}`
          );
        if (!entry.saved.definitions[override.definition])
          throw new Error(
            `Saved snapshot is missing definition: ${override.definition}`
          );
      }
    }
    if (entry.status === 'configured' && !entry.saved)
      throw new Error(
        `Configured piece has no saved snapshot: ${entry.sourcePath}`
      );
  }
}

export function serializeBatchDocument(doc: BatchDocument): string {
  const document = batchWireDocument(doc);
  // Validate by re-parsing the exact wire bytes this export produces.
  parseBatchDocument(JSON.parse(JSON.stringify(document)));
  return `${JSON.stringify(document, null, 2)}\n`;
}

function batchWireDocument(doc: BatchDocument): object {
  return {
    batchId: doc.batchId,
    batchName: doc.batchName,
    kind: 'material-editor-batch',
    profile: editingProfileWireDocument(doc.profile),
    queue: doc.queue.map((entry) => ({
      ...(entry.saved
        ? {
            saved: {
              definitions: Object.fromEntries(
                Object.entries(entry.saved.definitions)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([id, definition]) => [
                    id,
                    editingDefinitionWireDocument(definition),
                  ])
              ),
              overrides: [...entry.saved.overrides]
                .sort(
                  (a, b) =>
                    a.objectName.localeCompare(b.objectName) || a.slot - b.slot
                )
                .map((override) => ({
                  definition: override.definition,
                  objectName: override.objectName,
                  slot: override.slot,
                  sourcePath: override.sourcePath,
                })),
            },
          }
        : {}),
      sourcePath: entry.sourcePath,
      sourceSha256: entry.sourceSha256,
      status: entry.status,
    })),
    schemaVersion: 1,
    workingStyle: editingDefinitionWireDocument(doc.workingStyle),
  };
}

export function parseBatchDocument(value: unknown): BatchDocument {
  const row = exactObject(
    value,
    [
      'schemaVersion',
      'kind',
      'batchId',
      'batchName',
      'workingStyle',
      'queue',
      'profile',
    ],
    'batch document'
  );
  if (row.schemaVersion !== 1)
    throw new Error('Batch document requires schemaVersion 1');
  if (row.kind !== 'material-editor-batch')
    throw new Error('Not a material-editor-batch document');
  if (!Array.isArray(row.queue))
    throw new Error('batch queue must be an array');
  const queuePaths = new Set<string>();
  const queue = row.queue.map((item) => {
    const entryRow = objectWithOptional(
      item,
      ['sourcePath', 'sourceSha256', 'status'],
      ['saved'],
      'queue entry'
    );
    const sourcePath = batchText(entryRow.sourcePath, 'queue sourcePath');
    if (queuePaths.has(sourcePath))
      throw new Error(`Duplicate queue entry: ${sourcePath}`);
    queuePaths.add(sourcePath);
    const statusValue = entryRow.status;
    if (!isBatchStatus(statusValue))
      throw new Error(`Invalid queue status: ${String(statusValue)}`);
    const status: BatchPieceStatus = statusValue;
    let saved: BatchPieceSnapshot | undefined;
    if ('saved' in entryRow) {
      const savedRow = exactObject(
        entryRow.saved,
        ['overrides', 'definitions'],
        'saved snapshot'
      );
      if (!Array.isArray(savedRow.overrides))
        throw new Error('saved overrides must be an array');
      if (!isRecord(savedRow.definitions))
        throw new Error('saved definitions must be an object');
      const definitions: Record<string, EditingProfileDefinition> = {};
      for (const [id, raw] of Object.entries(savedRow.definitions)) {
        batchText(id, 'saved definition ID');
        definitions[id] = parseEditingProfileDefinition(raw);
      }
      const seen = new Set<string>();
      const overrides: EditingSlotOverride[] = savedRow.overrides.map(
        (item) => {
          const override = exactObject(
            item,
            ['sourcePath', 'objectName', 'slot', 'definition'],
            'saved slot override'
          );
          if (
            typeof override.definition !== 'string' ||
            !Object.hasOwn(definitions, override.definition)
          )
            throw new Error('Unknown saved slot override definition');
          const objectName = batchText(
            override.objectName,
            'override objectName'
          );
          const index = override.slot;
          if (
            typeof index !== 'number' ||
            !Number.isSafeInteger(index) ||
            index < 0
          )
            throw new Error('Invalid saved override slot');
          const key = `${objectName}\u0000${index}`;
          if (seen.has(key))
            throw new Error(`Duplicate saved override: ${objectName}:${index}`);
          seen.add(key);
          return {
            sourcePath: batchText(override.sourcePath, 'override sourcePath'),
            objectName,
            slot: index,
            definition: override.definition,
          };
        }
      );
      saved = { overrides, definitions };
    }
    return {
      sourcePath,
      sourceSha256: hash(entryRow.sourceSha256, 'queue sourceSha256'),
      status,
      ...(saved ? { saved } : {}),
    };
  });
  return {
    schemaVersion: 1,
    kind: 'material-editor-batch',
    batchId: batchText(row.batchId, 'batch ID'),
    batchName: batchText(row.batchName, 'batch name'),
    workingStyle: parseEditingProfileDefinition(row.workingStyle),
    queue,
    profile: parseEditingProfile(row.profile),
  };
}

/** Serialize the configured-only extraction and re-parse it for safety. */
export function serializeBatchExtraction(extraction: BatchExtraction): string {
  const document = extractionWireDocument(extraction);
  parseBatchExtraction(JSON.parse(JSON.stringify(document)));
  return `${JSON.stringify(document, null, 2)}\n`;
}

function extractionWireDocument(extraction: BatchExtraction): object {
  return {
    batchId: extraction.batchId,
    kind: 'material-editor-batch-extraction',
    packSlug: extraction.packSlug,
    packVersion: extraction.packVersion,
    pieces: extraction.pieces.map((piece) => ({
      slots: piece.slots.map((slot) => ({
        channels: {
          baseColor: slot.channels.baseColor,
          emissive:
            slot.channels.emissive === null
              ? null
              : {
                  color: slot.channels.emissive.color,
                  image: slot.channels.emissive.image,
                  strength: slot.channels.emissive.strength,
                },
          normal:
            slot.channels.normal === null
              ? null
              : {
                  image: slot.channels.normal.image,
                  strength: slot.channels.normal.strength,
                },
          wrap: slot.channels.wrap,
        },
        definition: slot.definition,
        objectName: slot.objectName,
        slot: slot.slot,
      })),
      sourcePath: piece.sourcePath,
      sourceSha256: piece.sourceSha256,
    })),
    schemaVersion: 1,
  };
}

export function parseBatchExtraction(value: unknown): BatchExtraction {
  const row = exactObject(
    value,
    ['schemaVersion', 'kind', 'batchId', 'packSlug', 'packVersion', 'pieces'],
    'batch extraction'
  );
  if (row.schemaVersion !== 1)
    throw new Error('Batch extraction requires schemaVersion 1');
  if (row.kind !== 'material-editor-batch-extraction')
    throw new Error('Not a material-editor-batch-extraction document');
  if (!Array.isArray(row.pieces))
    throw new Error('extraction pieces must be an array');
  const pieces = row.pieces.map((item) => {
    const pieceRow = exactObject(
      item,
      ['sourcePath', 'sourceSha256', 'slots'],
      'extraction piece'
    );
    if (!Array.isArray(pieceRow.slots))
      throw new Error('piece slots must be an array');
    const seen = new Set<string>();
    const slots: BatchExtractionSlot[] = pieceRow.slots.map((raw) => {
      const slotRow = exactObject(
        raw,
        ['objectName', 'slot', 'definition', 'channels'],
        'extraction slot'
      );
      const channelsRow = exactObject(
        slotRow.channels,
        ['baseColor', 'normal', 'emissive', 'wrap'],
        'extraction channels'
      );
      const index = slotRow.slot;
      if (
        typeof index !== 'number' ||
        !Number.isSafeInteger(index) ||
        index < 0
      )
        throw new Error('Invalid extraction slot');
      const objectName = batchText(slotRow.objectName, 'extraction objectName');
      const key = `${objectName}\u0000${index}`;
      if (seen.has(key))
        throw new Error(`Duplicate extraction slot: ${objectName}:${index}`);
      seen.add(key);
      if (channelsRow.wrap !== 'repeat' && channelsRow.wrap !== 'clamp')
        throw new Error('extraction wrap must be repeat or clamp');
      let normal: BatchExtractionSlot['channels']['normal'] = null;
      if (channelsRow.normal !== null) {
        const normalRow = exactObject(
          channelsRow.normal,
          ['image', 'strength'],
          'extraction normal'
        );
        normal = {
          image: batchText(normalRow.image, 'extraction normal image'),
          strength:
            typeof normalRow.strength === 'number' &&
            Number.isFinite(normalRow.strength) &&
            normalRow.strength >= 0
              ? normalRow.strength
              : ((): never => {
                  throw new Error('Invalid extraction normal strength');
                })(),
        };
      }
      let emissive: BatchExtractionSlot['channels']['emissive'] = null;
      if (channelsRow.emissive !== null) {
        const emissiveRow = exactObject(
          channelsRow.emissive,
          ['image', 'color', 'strength'],
          'extraction emissive'
        );
        if (!/^[0-9A-Fa-f]{6}$/.test(String(emissiveRow.color)))
          throw new Error('Invalid extraction emissive color');
        emissive = {
          image:
            emissiveRow.image === null
              ? null
              : batchText(emissiveRow.image, 'extraction emissive image'),
          color: String(emissiveRow.color).toUpperCase(),
          strength:
            typeof emissiveRow.strength === 'number' &&
            Number.isFinite(emissiveRow.strength) &&
            emissiveRow.strength >= 0
              ? emissiveRow.strength
              : ((): never => {
                  throw new Error('Invalid extraction emissive strength');
                })(),
        };
      }
      return {
        channels: {
          baseColor:
            channelsRow.baseColor === null
              ? null
              : batchText(channelsRow.baseColor, 'extraction baseColor image'),
          emissive,
          normal,
          wrap: channelsRow.wrap,
        },
        definition: batchText(slotRow.definition, 'extraction definition ID'),
        objectName,
        slot: index,
      };
    });
    return {
      slots,
      sourcePath: batchText(pieceRow.sourcePath, 'piece sourcePath'),
      sourceSha256: hash(pieceRow.sourceSha256, 'piece sourceSha256'),
    };
  });
  return {
    schemaVersion: 1,
    kind: 'material-editor-batch-extraction',
    batchId: batchText(row.batchId, 'batch ID'),
    packSlug: batchText(row.packSlug, 'extraction packSlug'),
    packVersion: batchText(row.packVersion, 'extraction packVersion'),
    pieces,
  };
}

/**
 * Pure export/extraction seam for the Assets implementer: configured pieces
 * only, in queue order; each piece's own saved per-slot channel choices with
 * every channel preserved (including solid emissive and explicit None).
 * Deferred/draft rows and inherited family-wide defaults never appear here.
 */
export function extractConfiguredOverrides(
  doc: BatchDocument
): BatchExtraction {
  const pieces: BatchExtractionPiece[] = [];
  for (const entry of doc.queue) {
    if (entry.status !== 'configured' || !entry.saved) continue;
    const slots: BatchExtractionSlot[] = entry.saved.overrides.map(
      (override) => {
        const definition = entry.saved!.definitions[override.definition]!;
        return {
          channels: {
            baseColor: definition.baseColor,
            emissive:
              definition.emissive === null
                ? null
                : {
                    image: definition.emissive.image,
                    color: definition.emissive.color,
                    strength: definition.emissive.strength,
                  },
            normal: definition.normal ? { ...definition.normal } : null,
            wrap: definition.wrap,
          },
          definition: override.definition,
          objectName: override.objectName,
          slot: override.slot,
        };
      }
    );
    pieces.push({
      slots,
      sourcePath: entry.sourcePath,
      sourceSha256: entry.sourceSha256,
    });
  }
  return {
    batchId: doc.batchId,
    kind: 'material-editor-batch-extraction',
    packSlug: doc.profile.packSlug,
    packVersion: doc.profile.packVersion,
    pieces,
    schemaVersion: 1,
  };
}

/** Convenience counters for queue status lines. */
export function batchCounts(doc: BatchDocument): {
  configured: number;
  deferred: number;
  draft: number;
} {
  const counts = { configured: 0, deferred: 0, draft: 0 };
  for (const entry of doc.queue) counts[entry.status] += 1;
  return counts;
}
