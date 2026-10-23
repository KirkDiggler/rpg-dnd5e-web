import { readFileSync } from 'node:fs';
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

  /**
   * THE SHIPPED CASTLE OPENS (rpg-project#605 D1, rpg-toolkit#2063). A verbatim
   * copy of rpg-api `content/the-mad-king.yaml` at the QA castle
   * (rpg-project#639): the gate guards walk mirrored loops whose posts stand a
   * round with a facing (`{ q, r, wait, facing }`), the far room's guards walk
   * `toward: { at: { q, r } }` to the yard inside the gate, and the turned
   * garrison marches the same way on the throne room. The engine reads it, so
   * the studio's import must — the web never refuses what the engine accepts
   * (#1119). Reading a waypoint's wait and facing is #1314's (S1).
   *
   * BEFORE rpg-dnd5e-web#1311 the operator's Open from server said: `Could
   * not import: Site table gate-patrol.time[5].toward.path[0]: field wait not
   * found in type dungeonspec.RoomCell`.
   */
  it("imports the mad king's castle, patrols and all, with no refusal", () => {
    const yaml = readFileSync(
      'src/concepts/encounter-studio/fixtures/the-mad-king.yaml',
      'utf8'
    );
    const read = readDraftYaml(yaml);
    if (!read.ok) throw new Error(read.refusal);
    expect(read.key).toBe('the-mad-king');
    const selectors = Object.values(read.scope.tables ?? {}).flatMap((t) =>
      (t.time ?? []).map((row) => row.toward)
    );
    expect(selectors).toContainEqual({ at: { q: 10, r: -19 } });
    expect(selectors).toContainEqual({ at: { q: -2, r: 4 } });
    expect(selectors).toContainEqual({
      path: [
        { q: -5, r: 8, wait: 1, facing: 'ne' },
        { q: -5, r: 10, wait: 1, facing: 'se' },
        { q: -7, r: 10 },
      ],
    });
    expect(selectors).toContainEqual({
      path: [
        { q: -2, r: 8, wait: 1, facing: 'nw' },
        { q: -4, r: 10, wait: 1, facing: 'sw' },
        { q: -2, r: 10 },
      ],
    });
    // Pursuit (rpg-project#668): both gate tables walk to the remembered
    // cell and search six on once it is lost.
    const rows = Object.values(read.scope.tables ?? {}).flatMap(
      (t) => t.time ?? []
    );
    expect(
      rows.filter(
        (row) =>
          row.search?.distance === 6 &&
          JSON.stringify(row.when) === '{"enemy":"lost"}'
      )
    ).toHaveLength(2);
    const importDocument = vi.fn().mockReturnValue(true);
    expect(importDraftYaml(yaml, { importDocument })).toEqual({
      ok: true,
      key: 'the-mad-king',
    });
    // What the studio would save reads back as itself.
    const document = { draft: read.draft, scope: read.scope };
    const once = exportDraftYaml(document, read.key);
    const again = readDraftYaml(once);
    if (!again.ok) throw new Error(again.refusal);
    expect(
      exportDraftYaml({ draft: again.draft, scope: again.scope }, read.key)
    ).toBe(once);
  });

  it('the castle round-trips: open from server, save, open again equal', () => {
    const yaml = readFileSync(
      'src/concepts/encounter-studio/fixtures/the-mad-king.yaml',
      'utf8'
    );
    const opened = readDraftYaml(yaml);
    if (!opened.ok) throw new Error(opened.refusal);
    const saved = exportDraftYaml(
      { draft: opened.draft, scope: opened.scope },
      opened.key
    );
    // The pause survives the save in the file's own spelling.
    expect(saved).toMatch(/- q: -5\n\s+r: 8\n\s+wait: 1\n\s+facing: ne\n/);
    const reopened = readDraftYaml(saved);
    if (!reopened.ok) throw new Error(reopened.refusal);
    expect({ draft: reopened.draft, scope: reopened.scope }).toEqual({
      draft: opened.draft,
      scope: opened.scope,
    });
  });

  /**
   * THE TWO REFERENCE SITES (rpg-dnd5e-web#1311). Verbatim copies of rpg-api
   * `content/creature-facts-walk.yaml` (85d50e9) and
   * `content/reference-discovery-checks.yaml` (105c2fe). The engine reads
   * exactly one number from each presentation block —
   * `coordinateFrame.hexRadius` (must be 1) and `workspace.hexRadius` (the
   * floor bound, positive) — so a frame that states only its scale and a
   * radius workspace off the editor's three presets are files the engine
   * plays, and the studio reads them.
   */
  const reference = (file: string) =>
    readFileSync(`src/concepts/encounter-studio/fixtures/${file}.yaml`, 'utf8');

  it('opens The Watch Post (before: "Could not import: Unsupported room coordinate frame.") and round-trips it', () => {
    const opened = readDraftYaml(reference('creature-facts-walk'));
    if (!opened.ok) throw new Error(opened.refusal);
    expect(opened.key).toBe('creature-facts-walk');
    expect(opened.draft.workspace).toEqual({
      hexRadius: 6,
      horizontalLimit: 12,
    });
    const saved = exportDraftYaml(
      { draft: opened.draft, scope: opened.scope },
      opened.key
    );
    const reopened = readDraftYaml(saved);
    if (!reopened.ok) throw new Error(reopened.refusal);
    expect({ draft: reopened.draft, scope: reopened.scope }).toEqual({
      draft: opened.draft,
      scope: opened.scope,
    });
  });

  it('reads Discovery Check Walk\'s radius-9 workspace (before: "Could not import: Unsupported room workspace extent.") and names the prop the studio cannot draw', () => {
    const yaml = reference('reference-discovery-checks');
    // The workspace is read as written once the uncatalogued props are out
    // of the way: the extent is no longer the refusal.
    const withoutUncatalogued = yaml
      .replace('dnd5e:props:scroll', 'dnd5e:props:books')
      .replace('dnd5e:props:reliquary', 'dnd5e:props:vase');
    const opened = readDraftYaml(withoutUncatalogued);
    if (!opened.ok) throw new Error(opened.refusal);
    expect(opened.draft.workspace).toEqual({
      hexRadius: 9,
      horizontalLimit: 20,
    });
    const saved = exportDraftYaml(
      { draft: opened.draft, scope: opened.scope },
      opened.key
    );
    const reopened = readDraftYaml(saved);
    if (!reopened.ok) throw new Error(reopened.refusal);
    expect(reopened.draft).toEqual(opened.draft);
    // The shipped file: what remains is the prop catalog, named by ref.
    expect(readDraftYaml(yaml)).toEqual({
      ok: false,
      refusal:
        'Could not import: scene.items[1].assetRef "dnd5e:props:scroll" is not in the local prop catalog.',
    });
  });
});
