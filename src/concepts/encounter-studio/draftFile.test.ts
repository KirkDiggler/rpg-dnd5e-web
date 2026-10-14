import { describe, expect, it, vi } from 'vitest';
import referenceTombYaml from '../../author/fixtures/reference-tomb.yaml?raw';
import { encodeSingleRoomDungeon } from '../world-building/singleRoomDungeon';
import { renderScope } from '../world-building/siteScope';
import {
  defaultDraftKey,
  exportDraftYaml,
  importDraftYaml,
  readDraftYaml,
} from './draftFile';
import { createCastleS4Document } from './fixtures/castleS4';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';

describe('the draft as a file (rpg-project#578)', () => {
  it("export writes exactly encodeSingleRoomDungeon's bytes", () => {
    const document = createCastleS4Document();
    expect(exportDraftYaml(document, 'mad-king')).toBe(
      encodeSingleRoomDungeon({
        key: 'mad-king',
        draft: document.draft,
        ...renderScope(document.scope),
      })
    );
    expect(() => exportDraftYaml(document, '')).toThrow(
      'Dungeon key must be non-empty.'
    );
  });

  it('an exported file imports back to an equal document', () => {
    for (const document of [
      createCastleS4Document(),
      createPopulatedStudioDocument(),
    ]) {
      const read = readDraftYaml(exportDraftYaml(document, 'round-trip'));
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(read.key).toBe('round-trip');
      expect({ draft: read.draft, scope: read.scope }).toEqual(document);
    }
  });

  it('a v2 file is refused with the dialect sentence and changes nothing', () => {
    const session = { importDocument: vi.fn(() => true) };
    expect(importDraftYaml(referenceTombYaml, session)).toEqual({
      ok: false,
      refusal:
        'This file is a version 2 dungeon, the multi-room dialect. The studio opens single-room files, version 3 or 4.',
    });
    expect(session.importDocument).not.toHaveBeenCalled();
  });

  it('a file with an unknown root key is refused naming the key', () => {
    const session = { importDocument: vi.fn(() => true) };
    const yaml = exportDraftYaml(createCastleS4Document(), 'castle').replace(
      /^endings:/m,
      'endngs:'
    );
    expect(importDraftYaml(yaml, session)).toEqual({
      ok: false,
      refusal: 'Could not import: Unsupported single-room field: endngs.',
    });
    expect(session.importDocument).not.toHaveBeenCalled();
  });

  it('a field the decoder refuses is named with its path', () => {
    const yaml = exportDraftYaml(createCastleS4Document(), 'castle');
    const withLifetime = yaml.replace(
      /^ {2}stash:\n/m,
      '  stash:\n    attempts:\n      lifetime: run\n'
    );
    expect(withLifetime).not.toBe(yaml);
    const read = readDraftYaml(withLifetime);
    expect(read).toEqual({
      ok: false,
      refusal:
        'Could not import: Site concealment stash attempts.lifetime: "lifetime" is not a key this build reads: they are max, reset_hexes',
    });
  });

  it('an accepted import hands the decoded document to the session once', () => {
    const document = createCastleS4Document();
    const session = { importDocument: vi.fn(() => true) };
    expect(
      importDraftYaml(exportDraftYaml(document, 'mad-king'), session)
    ).toEqual({
      ok: true,
      key: 'mad-king',
    });
    expect(session.importDocument).toHaveBeenCalledExactlyOnceWith(
      document.draft,
      document.scope
    );
  });

  it("the default key is a slug of the draft's name", () => {
    const document = createCastleS4Document();
    document.draft.name = 'The Mad King’s Castle!';
    expect(defaultDraftKey(document)).toBe('the-mad-king-s-castle');
    document.draft.name = '…';
    expect(defaultDraftKey(document)).toMatch(/^(room-.+|encounter)$/);
  });
});
