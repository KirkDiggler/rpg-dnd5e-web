import { describe, expect, it } from 'vitest';
import {
  entryFromCandidate,
  isProviderReady,
  loadCalibrationDraft,
  mergeCatalogIntoBatch,
  normalizeYaw,
  parseCalibrationBatch,
  parseCalibrationCatalog,
  propCalibrationReducer,
  saveCalibrationDraft,
  serializeCalibrationBatch,
  validateCalibrationEntry,
  type CalibrationBatch,
  type CalibrationCandidate,
} from './model';

const candidate: CalibrationCandidate = {
  source: {
    packSlug: 'polygon-dark-fortress',
    packVersion: 'v3',
    sourcePath: 'SourceFiles/DarkFortress/FBX/SM_Prop_Alchemy_Tool_04.fbx',
    glbSha256:
      'a5e6e9fe78f4a42226362a434e62b53625d5d779b5309d95de441f70a91054ba',
  },
  url: '/models/synty/prop-calibration/a5e6e9fe78f4-tool.glb',
};

function portableEntries(batch: CalibrationBatch) {
  return batch.entries.map((entry) => {
    const portable = { ...entry };
    delete portable.url;
    return portable;
  });
}

function completeBatch(): CalibrationBatch {
  return {
    schemaVersion: 1,
    batchId: 'first-floor-props-v1',
    entries: [
      {
        ...entryFromCandidate(candidate),
        displayName: 'Alchemy Tool',
        familyRef: 'dnd5e:props:alchemy-tool',
        ref: 'dnd5e:props:alchemy-tool:04',
        defaultForFamily: true,
        calibration: {
          scale: 1.25,
          yawDegrees: -45,
          fineOffsetMeters: [0.1, -0.01, -0.2],
        },
        role: 'decor',
        themes: ['crypt'],
        blocksMovement: false,
        blocksLoS: false,
        notes: 'Reviewed beside the standard fighter.',
      },
    ],
  };
}

describe('calibration catalog', () => {
  it('strictly parses prepared candidates', () => {
    expect(
      parseCalibrationCatalog({ schemaVersion: 1, candidates: [candidate] })
    ).toEqual({ schemaVersion: 1, candidates: [candidate] });
  });

  it('rejects unknown catalog fields and unsafe candidate URLs', () => {
    expect(() =>
      parseCalibrationCatalog({
        schemaVersion: 1,
        candidates: [candidate],
        unexpected: true,
      })
    ).toThrow(/unknown field.*unexpected/i);
    expect(() =>
      parseCalibrationCatalog({
        schemaVersion: 1,
        candidates: [{ ...candidate, url: 'file:///tmp/private.glb' }],
      })
    ).toThrow(/candidate url/i);
  });

  it('adds newly prepared candidates without resetting completed rows', () => {
    const original = completeBatch();
    const second: CalibrationCandidate = {
      source: {
        ...candidate.source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/SM_Prop_Barrel_01.fbx',
        glbSha256: 'b'.repeat(64),
      },
      url: '/models/synty/prop-calibration/bbbbbbbbbbbb-barrel.glb',
    };

    const merged = mergeCatalogIntoBatch(
      { schemaVersion: 1, candidates: [candidate, second] },
      original
    );

    expect(merged.entries).toHaveLength(2);
    expect(merged.entries[0]).toEqual(original.entries[0]);
    expect(merged.entries[1]?.source.sourcePath).toContain('Barrel');
    expect(merged.entries[1]?.displayName).toBe('');
  });
});

describe('entry validation', () => {
  it('requires exact refs, family refs, metadata, and bounded calibration', () => {
    expect(validateCalibrationEntry(completeBatch().entries[0]!)).toEqual({});

    const invalid = {
      ...completeBatch().entries[0]!,
      displayName: '',
      familyRef: 'dnd5e:props:alchemy-tool:extra',
      ref: 'dnd5e:props:alchemy-tool',
      themes: [],
      calibration: {
        scale: 0,
        yawDegrees: Number.NaN,
        fineOffsetMeters: [0.6, 0.11, -0.6] as [number, number, number],
      },
    };
    expect(validateCalibrationEntry(invalid)).toMatchObject({
      displayName: expect.any(String),
      familyRef: expect.any(String),
      ref: expect.any(String),
      themes: expect.any(String),
      scale: expect.any(String),
      yawDegrees: expect.any(String),
      fineOffsetX: expect.any(String),
      fineOffsetY: expect.any(String),
      fineOffsetZ: expect.any(String),
    });
  });

  it('normalizes yaw into the provider interval', () => {
    expect(normalizeYaw(315)).toBe(-45);
    expect(normalizeYaw(180)).toBe(-180);
    expect(normalizeYaw(-0)).toBe(0);
  });
});

describe('batch state and portable JSON', () => {
  it('updates a row and selection through the reducer', () => {
    const batch = completeBatch();
    const initial = { batch, selectedIndex: 0 };
    const replacement = {
      ...batch.entries[0]!,
      displayName: 'Updated Alchemy Tool',
    };
    const updated = propCalibrationReducer(initial, {
      type: 'replace-entry',
      index: 0,
      entry: replacement,
    });
    expect(updated.batch.entries[0]?.displayName).toBe('Updated Alchemy Tool');
    expect(
      propCalibrationReducer(updated, { type: 'select', index: 0 })
        .selectedIndex
    ).toBe(0);
  });

  it('exports provider JSON without local URL or machine paths and reimports it', () => {
    const batch = completeBatch();
    expect(isProviderReady(batch)).toBe(true);

    const text = serializeCalibrationBatch(batch);
    expect(text).not.toContain('prop-calibration/');
    expect(text).not.toContain('localhost');
    expect(text).not.toContain('/home/');
    expect(text).toContain('"$schemaVersion": 1');

    const imported = parseCalibrationBatch(text);
    expect(imported).toEqual({
      ...batch,
      entries: portableEntries(batch),
    });
  });

  it('stores portable drafts and ignores malformed stored JSON', () => {
    const storage = window.localStorage;
    storage.clear();
    saveCalibrationDraft(storage, completeBatch());
    expect(loadCalibrationDraft(storage)).toEqual({
      ...completeBatch(),
      entries: portableEntries(completeBatch()),
    });

    storage.setItem('rpg.prop-calibration.batch.v1', '{not-json');
    expect(loadCalibrationDraft(storage)).toBeUndefined();
  });

  it('refuses provider readiness for incomplete rows or ambiguous defaults', () => {
    const incomplete = {
      ...completeBatch(),
      entries: [entryFromCandidate(candidate)],
    };
    expect(isProviderReady(incomplete)).toBe(false);

    const duplicateDefault = completeBatch();
    duplicateDefault.entries.push({
      ...duplicateDefault.entries[0]!,
      source: {
        ...duplicateDefault.entries[0]!.source,
        sourcePath: 'SourceFiles/DarkFortress/FBX/SM_Prop_Alchemy_Tool_05.fbx',
        glbSha256: 'c'.repeat(64),
      },
      url: '/models/synty/prop-calibration/cccccccccccc-tool.glb',
      ref: 'dnd5e:props:alchemy-tool:05',
    });
    expect(isProviderReady(duplicateDefault)).toBe(false);
  });
});
