import { describe, expect, it } from 'vitest';
import {
  batchCounts,
  batchDefinitionForSlot,
  batchScopeForSlot,
  createBatchDocument,
  deferPiece,
  enqueueSources,
  extractConfiguredOverrides,
  markPieceEditing,
  parseBatchDocument,
  parseBatchExtraction,
  removeSource,
  restoreSavedPiece,
  savePiece,
  serializeBatchDocument,
  serializeBatchExtraction,
  setBatchSlotChannels,
  setWorkingStyle,
  staleQueueEntries,
  validateBatchDocument,
  WORKING_STYLE_DEFAULT,
  type BatchDocument,
} from './materialBatch';
import {
  parseMaterialEditorManifest,
  serializeEditingProfile,
  slotKey,
  type EditingProfileDefinition,
  type MaterialEditorManifest,
} from './materialRecipe';
import {
  FIXTURE_OBJECT_NAME,
  FIXTURE_SOURCE_PATH,
  multiSourceMaterialEditorManifestFixture,
} from './materialRecipe.testFixtures';

const manifestFixture = (): MaterialEditorManifest =>
  parseMaterialEditorManifest(multiSourceMaterialEditorManifestFixture());

const STONE_STYLE: EditingProfileDefinition = {
  label: 'Working style',
  baseColor: 'Texture/Stone_Texture_01.png',
  normal: { image: 'Texture/Clay_Texture_01.tga', strength: 0.8 },
  emissive: { image: null, color: 'FF8800', strength: 1.5 },
  wrap: 'repeat',
};

const SECOND_SOURCE = 'FBX/SM_Bld_Wall_L_Curve_02.fbx';
const THIRD_SOURCE = 'FBX/SM_Bld_Wall_L_Curve_03.fbx';

function shaOf(manifest: MaterialEditorManifest, sourcePath: string): string {
  return manifest.auditedSlots[sourcePath]!.sourceSha256;
}

function queuedDoc(manifest: MaterialEditorManifest): BatchDocument {
  let doc = createBatchDocument(
    'batch-stone-walls',
    'stone walls',
    manifest.profile
  );
  doc = setWorkingStyle(doc, STONE_STYLE);
  doc = enqueueSources(doc, [
    {
      sourcePath: FIXTURE_SOURCE_PATH,
      sourceSha256: shaOf(manifest, FIXTURE_SOURCE_PATH),
    },
    { sourcePath: SECOND_SOURCE, sourceSha256: shaOf(manifest, SECOND_SOURCE) },
    { sourcePath: THIRD_SOURCE, sourceSha256: shaOf(manifest, THIRD_SOURCE) },
  ]);
  return doc;
}

function objectOf(sourcePath: string): string {
  return sourcePath
    .split('/')
    .at(-1)!
    .replace(/\.fbx$/, '');
}

function editSlot(
  doc: BatchDocument,
  manifest: MaterialEditorManifest,
  sourcePath: string,
  slot: number,
  patch: Partial<EditingProfileDefinition>
): BatchDocument {
  const objectName = objectOf(sourcePath);
  const base = batchDefinitionForSlot(doc, sourcePath, objectName, slot);
  return setBatchSlotChannels(doc, manifest, sourcePath, objectName, slot, {
    ...base,
    ...patch,
  });
}

describe('material batch queue', () => {
  it('enqueues sources in order with their audited identity and validates cleanly', () => {
    const manifest = manifestFixture();
    const doc = queuedDoc(manifest);
    expect(doc.queue.map((entry) => entry.sourcePath)).toEqual([
      FIXTURE_SOURCE_PATH,
      SECOND_SOURCE,
      THIRD_SOURCE,
    ]);
    expect(doc.queue.every((entry) => entry.status === 'draft')).toBe(true);
    validateBatchDocument(doc, manifest);
    // Duplicate queueing is refused instead of silently reordering.
    expect(() =>
      enqueueSources(doc, [
        {
          sourcePath: FIXTURE_SOURCE_PATH,
          sourceSha256: shaOf(manifest, FIXTURE_SOURCE_PATH),
        },
      ])
    ).toThrow(/already in the batch/);
  });

  it('carries the working style forward to new pieces until explicitly changed', () => {
    const manifest = manifestFixture();
    let doc = queuedDoc(manifest);
    // The first piece is edited and saved with an explicit slot choice.
    doc = editSlot(doc, manifest, FIXTURE_SOURCE_PATH, 0, {
      baseColor: 'Texture/Clay_Texture_01.tga',
    });
    doc = savePiece(doc, manifest, FIXTURE_SOURCE_PATH);
    // Un-touched slots of the saved piece froze the working style channels.
    expect(
      batchDefinitionForSlot(doc, FIXTURE_SOURCE_PATH, FIXTURE_OBJECT_NAME, 1)
        .baseColor
    ).toBe(STONE_STYLE.baseColor);
    // The next piece starts from the same working style on every slot.
    expect(
      batchDefinitionForSlot(doc, SECOND_SOURCE, FIXTURE_OBJECT_NAME, 0)
        .emissive
    ).toEqual(STONE_STYLE.emissive);
    expect(batchScopeForSlot(doc, SECOND_SOURCE, FIXTURE_OBJECT_NAME, 0)).toBe(
      'working-style'
    );
    // Only an explicit edit changes the style itself.
    doc = setWorkingStyle(doc, {
      ...STONE_STYLE,
      baseColor: 'Texture/Clay_Texture_01.tga',
    });
    expect(
      batchDefinitionForSlot(doc, THIRD_SOURCE, FIXTURE_OBJECT_NAME, 0)
        .baseColor
    ).toBe('Texture/Clay_Texture_01.tga');
  });

  it('keeps saved pieces unchanged while later pieces and the style are edited', () => {
    const manifest = manifestFixture();
    let doc = queuedDoc(manifest);
    doc = editSlot(doc, manifest, FIXTURE_SOURCE_PATH, 0, {
      emissive: { image: null, color: '123456', strength: 2 },
    });
    doc = savePiece(doc, manifest, FIXTURE_SOURCE_PATH);
    const savedAfterA = structuredClone(
      doc.queue.find((entry) => entry.sourcePath === FIXTURE_SOURCE_PATH)!.saved
    );
    // Edit piece B and the working style afterwards.
    doc = editSlot(doc, manifest, SECOND_SOURCE, 0, {
      baseColor: 'Texture/Clay_Texture_01.tga',
      wrap: 'clamp',
    });
    doc = savePiece(doc, manifest, SECOND_SOURCE);
    doc = setWorkingStyle(doc, WORKING_STYLE_DEFAULT);
    // A's independent snapshot still holds the pre-edit channels.
    expect(
      doc.queue.find((entry) => entry.sourcePath === FIXTURE_SOURCE_PATH)!.saved
    ).toEqual(savedAfterA);
    // Restoring A shows its saved configuration, not the changed style.
    const restored = restoreSavedPiece(doc, manifest, FIXTURE_SOURCE_PATH);
    expect(
      batchDefinitionForSlot(
        restored,
        FIXTURE_SOURCE_PATH,
        FIXTURE_OBJECT_NAME,
        0
      ).emissive
    ).toEqual({ image: null, color: '123456', strength: 2 });
    expect(
      batchDefinitionForSlot(
        restored,
        FIXTURE_SOURCE_PATH,
        FIXTURE_OBJECT_NAME,
        1
      ).baseColor
    ).toBe(STONE_STYLE.baseColor);
  });

  it('keeps per-slot edits independent within a piece and across pieces', () => {
    const manifest = manifestFixture();
    let doc = queuedDoc(manifest);
    doc = editSlot(doc, manifest, FIXTURE_SOURCE_PATH, 0, {
      baseColor: 'Texture/Clay_Texture_01.tga',
    });
    doc = editSlot(doc, manifest, FIXTURE_SOURCE_PATH, 1, {
      emissive: { image: null, color: '00FF00', strength: 1 },
    });
    const slot0 = batchDefinitionForSlot(
      doc,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      0
    );
    expect(slot0.emissive).toEqual(STONE_STYLE.emissive);
    const slot1 = batchDefinitionForSlot(
      doc,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      1
    );
    expect(slot1.baseColor).toBe(STONE_STYLE.baseColor);
    // Editing the same slot of another piece never aliases A's definition.
    doc = editSlot(doc, manifest, SECOND_SOURCE, 0, {
      baseColor: null,
    });
    expect(
      batchDefinitionForSlot(doc, FIXTURE_SOURCE_PATH, FIXTURE_OBJECT_NAME, 0)
        .baseColor
    ).toBe('Texture/Clay_Texture_01.tga');
    // Override definitions are piece- and slot-scoped.
    const ids = new Set(
      doc.profile.assignments.slotOverrides.map(
        (override) =>
          slotKey(override.sourcePath, override.objectName, override.slot) +
          '\u0000' +
          override.definition
      )
    );
    expect(ids.size).toBe(doc.profile.assignments.slotOverrides.length);
  });

  it('revisits a saved piece, edits it to a draft, and re-saves', () => {
    const manifest = manifestFixture();
    let doc = queuedDoc(manifest);
    doc = editSlot(doc, manifest, FIXTURE_SOURCE_PATH, 0, {
      baseColor: 'Texture/Clay_Texture_01.tga',
    });
    doc = savePiece(doc, manifest, FIXTURE_SOURCE_PATH);
    doc = editSlot(doc, manifest, SECOND_SOURCE, 0, {
      baseColor: 'Texture/Clay_Texture_01.tga',
    });
    doc = savePiece(doc, manifest, SECOND_SOURCE);
    doc = setWorkingStyle(doc, { ...STONE_STYLE, baseColor: null });
    // Revisit A: saved config restored even though the style moved on.
    doc = restoreSavedPiece(doc, manifest, FIXTURE_SOURCE_PATH);
    expect(
      doc.queue.find((entry) => entry.sourcePath === FIXTURE_SOURCE_PATH)!
        .status
    ).toBe('configured');
    expect(
      batchDefinitionForSlot(doc, FIXTURE_SOURCE_PATH, FIXTURE_OBJECT_NAME, 0)
        .baseColor
    ).toBe('Texture/Clay_Texture_01.tga');
    // Editing a saved piece makes it a draft again until saved.
    doc = editSlot(doc, manifest, FIXTURE_SOURCE_PATH, 0, {
      baseColor: null,
    });
    const entry = doc.queue.find(
      (item) => item.sourcePath === FIXTURE_SOURCE_PATH
    )!;
    expect(entry.status).toBe('draft');
    expect(entry.saved).toBeDefined();
    // Saving refreshes the snapshot; the draft flag clears.
    doc = savePiece(doc, manifest, FIXTURE_SOURCE_PATH);
    expect(
      doc.queue.find((item) => item.sourcePath === FIXTURE_SOURCE_PATH)!.status
    ).toBe('configured');
    expect(
      batchDefinitionForSlot(doc, FIXTURE_SOURCE_PATH, FIXTURE_OBJECT_NAME, 0)
        .baseColor
    ).toBeNull();
    validateBatchDocument(doc, manifest);
  });

  it('excludes deferred and draft pieces from the configured-only extraction', () => {
    const manifest = manifestFixture();
    let doc = queuedDoc(manifest);
    doc = savePiece(doc, manifest, FIXTURE_SOURCE_PATH);
    doc = editSlot(doc, manifest, SECOND_SOURCE, 0, {
      baseColor: 'Texture/Clay_Texture_01.tga',
    });
    doc = deferPiece(doc, SECOND_SOURCE);
    // THIRD_SOURCE stays draft (never saved).
    const extraction = extractConfiguredOverrides(doc);
    expect(extraction.pieces.map((piece) => piece.sourcePath)).toEqual([
      FIXTURE_SOURCE_PATH,
    ]);
    expect(
      extraction.pieces[0]!.slots.map((slot) => [slot.objectName, slot.slot])
    ).toEqual([
      [FIXTURE_OBJECT_NAME, 0],
      [FIXTURE_OBJECT_NAME, 1],
    ]);
  });

  it('round-trips export/import preserving queue order, status and snapshots', () => {
    const manifest = manifestFixture();
    let doc = queuedDoc(manifest);
    doc = savePiece(doc, manifest, FIXTURE_SOURCE_PATH);
    doc = editSlot(doc, manifest, SECOND_SOURCE, 0, {
      baseColor: 'Texture/Clay_Texture_01.tga',
    });
    doc = deferPiece(doc, SECOND_SOURCE);
    const wire = serializeBatchDocument(doc);
    const parsed = parseBatchDocument(JSON.parse(wire));
    expect(parsed).toEqual(doc);
    // Re-serializing the parsed document reproduces the same bytes.
    expect(serializeBatchDocument(parsed)).toBe(wire);
    validateBatchDocument(parsed, manifest);
    // Import restores working state: the deferred piece is still deferred and
    // A's snapshot still resolves to its saved channels.
    expect(batchCounts(parsed)).toEqual({
      configured: 1,
      deferred: 1,
      draft: 1,
    });
    const restored = restoreSavedPiece(parsed, manifest, FIXTURE_SOURCE_PATH);
    expect(
      batchDefinitionForSlot(
        restored,
        FIXTURE_SOURCE_PATH,
        FIXTURE_OBJECT_NAME,
        1
      ).emissive
    ).toEqual(STONE_STYLE.emissive);
  });

  it('refuses stale or mismatched source identities visibly', () => {
    const manifest = manifestFixture();
    const doc = queuedDoc(manifest);
    validateBatchDocument(doc, manifest);
    const stale = parseBatchDocument(
      JSON.parse(
        serializeBatchDocument({
          ...doc,
          queue: doc.queue.map((entry, index) =>
            index === 1
              ? {
                  ...entry,
                  sourceSha256: 'a'.repeat(64),
                }
              : entry
          ),
        })
      )
    );
    expect(staleQueueEntries(stale, manifest)).toEqual([SECOND_SOURCE]);
    expect(() => validateBatchDocument(stale, manifest)).toThrow(
      /Stale queue entry.*SM_Bld_Wall_L_Curve_02\.fbx/
    );
    // Saved bindings never silently apply to different geometry.
    const foreign = parseBatchDocument(
      JSON.parse(
        serializeBatchDocument({
          ...doc,
          queue: [
            {
              ...doc.queue[0]!,
              sourceSha256: shaOf(manifest, SECOND_SOURCE),
            },
          ],
        })
      )
    );
    expect(() => validateBatchDocument(foreign, manifest)).toThrow(
      /Stale queue entry/
    );
  });

  it('never turns inherited family-wide defaults into batch decisions', () => {
    const manifest = manifestFixture();
    // The prepared profile seeds a family default (the demo's Stone_01 seed).
    expect(Object.keys(manifest.profile.assignments.familyDefaults)).toContain(
      'Stone_01'
    );
    let doc = queuedDoc(manifest);
    doc = savePiece(doc, manifest, FIXTURE_SOURCE_PATH);
    const extraction = extractConfiguredOverrides(doc);
    const wire = JSON.parse(serializeBatchExtraction(extraction));
    // No family-wide default anywhere in the handoff document.
    expect(JSON.stringify(wire)).not.toContain('familyDefaults');
    expect(JSON.stringify(wire)).not.toContain('wall-stone');
    // The frozen slots carry the working style, not the family default seed.
    const slot0 = extraction.pieces[0]!.slots.find((slot) => slot.slot === 0)!;
    expect(slot0.channels.baseColor).toBe(STONE_STYLE.baseColor);
    // Round-trip is exact.
    expect(parseBatchExtraction(wire)).toEqual(extraction);
    expect(serializeBatchExtraction(parseBatchExtraction(wire))).toBe(
      serializeBatchExtraction(extraction)
    );
  });

  it('preserves every channel in the extraction, including solid and None emissive', () => {
    const manifest = manifestFixture();
    let doc = queuedDoc(manifest);
    doc = editSlot(doc, manifest, FIXTURE_SOURCE_PATH, 0, {
      baseColor: 'Texture/Clay_Texture_01.tga',
      normal: { image: 'Texture/Clay_Texture_01.tga', strength: 2.5 },
      emissive: { image: null, color: 'AB12CD', strength: 3 },
      wrap: 'clamp',
    });
    doc = editSlot(doc, manifest, FIXTURE_SOURCE_PATH, 1, {
      baseColor: null,
      emissive: null,
    });
    doc = savePiece(doc, manifest, FIXTURE_SOURCE_PATH);
    const extraction = extractConfiguredOverrides(doc);
    const bySlot = new Map(
      extraction.pieces[0]!.slots.map((slot) => [slot.slot, slot])
    );
    expect(bySlot.get(0)!.channels).toEqual({
      baseColor: 'Texture/Clay_Texture_01.tga',
      normal: { image: 'Texture/Clay_Texture_01.tga', strength: 2.5 },
      emissive: { image: null, color: 'AB12CD', strength: 3 },
      wrap: 'clamp',
    });
    expect(bySlot.get(1)!.channels).toEqual({
      baseColor: null,
      // Un-patched channels carry the working style forward (sticky defaults).
      normal: { image: 'Texture/Clay_Texture_01.tga', strength: 0.8 },
      emissive: null,
      wrap: 'repeat',
    });
  });

  it('removes queue entries with their piece overrides and keeps the style', () => {
    const manifest = manifestFixture();
    let doc = queuedDoc(manifest);
    doc = editSlot(doc, manifest, FIXTURE_SOURCE_PATH, 0, {
      baseColor: 'Texture/Clay_Texture_01.tga',
    });
    doc = savePiece(doc, manifest, FIXTURE_SOURCE_PATH);
    doc = removeSource(doc, FIXTURE_SOURCE_PATH);
    expect(
      doc.profile.assignments.slotOverrides.some(
        (override) => override.sourcePath === FIXTURE_SOURCE_PATH
      )
    ).toBe(false);
    expect(doc.queue).toHaveLength(2);
    expect(doc.workingStyle).toEqual(STONE_STYLE);
    expect(() => savePiece(doc, manifest, FIXTURE_SOURCE_PATH)).toThrow(
      /not in the batch/
    );
  });

  it('marks a configured piece draft on any edit and keeps its old snapshot', () => {
    const manifest = manifestFixture();
    let doc = queuedDoc(manifest);
    doc = savePiece(doc, manifest, FIXTURE_SOURCE_PATH);
    const before = structuredClone(
      doc.queue.find((entry) => entry.sourcePath === FIXTURE_SOURCE_PATH)!.saved
    );
    doc = markPieceEditing(doc, FIXTURE_SOURCE_PATH);
    expect(doc.queue[0]!.status).toBe('draft');
    expect(doc.queue[0]!.saved).toEqual(before);
    // markPieceEditing on a draft/deferred piece is a no-op.
    doc = markPieceEditing(doc, SECOND_SOURCE);
    expect(doc.queue[1]!.status).toBe('draft');
  });

  it('rejects malformed documents instead of guessing', () => {
    const manifest = manifestFixture();
    const doc = queuedDoc(manifest);
    const wire = JSON.parse(serializeBatchDocument(doc));
    expect(() => parseBatchDocument({ ...wire, schemaVersion: 2 })).toThrow(
      /schemaVersion 1/
    );
    expect(() => parseBatchDocument({ ...wire, kind: 'other' })).toThrow(
      /Not a material-editor-batch/
    );
    expect(() =>
      parseBatchDocument({
        ...wire,
        queue: [...wire.queue, { ...wire.queue[0] }],
      })
    ).toThrow(/Duplicate queue entry|Invalid queue entry fields/);
    // A configured entry without a snapshot is invalid.
    const broken = {
      ...doc,
      queue: doc.queue.map((entry) => ({
        ...entry,
        status: 'configured' as const,
        saved: undefined,
      })),
    };
    expect(() => validateBatchDocument(broken, manifest)).toThrow(
      /no saved snapshot/
    );
    void manifest;
  });

  it('serializes the working profile through the v2 wire contract unchanged', () => {
    const manifest = manifestFixture();
    const doc = queuedDoc(manifest);
    // The embedded profile must equal the plain v2 serialization.
    const parsed = parseBatchDocument(JSON.parse(serializeBatchDocument(doc)));
    expect(serializeEditingProfile(parsed.profile)).toBe(
      serializeEditingProfile(doc.profile)
    );
  });
});
