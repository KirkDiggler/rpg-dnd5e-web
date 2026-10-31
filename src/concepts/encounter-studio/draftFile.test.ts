import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { parse, stringify } from 'yaml';
import referenceTombYaml from '../../author/fixtures/reference-tomb.yaml?raw';
import { wordRowsOf } from '../world-building/bundles';
import { WORLD_BUILDING_CATALOG_BY_REF } from '../world-building/catalog';
import {
  floorCellCount,
  loadRoomDraft,
  MAX_FLOOR_HEXES,
  saveRoomDraft,
  stringifyRoomDraft,
  validateRoomDocument,
} from '../world-building/roomDraft';
import {
  MAX_GROUPS,
  MAX_ITEMS,
  MAX_JSON_LENGTH,
  MAX_MAP_LABELS,
} from '../world-building/serialization';
import { encodeSingleRoomDungeon } from '../world-building/singleRoomDungeon';
import { renderScope } from '../world-building/siteScope';
import type { KeyValueStorage } from '../world-building/types';
import {
  defaultDraftKey,
  exportDraftYaml,
  importDraftYaml,
  readDraftYaml,
} from './draftFile';
import { createCastleS4Document } from './fixtures/castleS4';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';

/** The castle's stored envelope measured 78,830 characters with its scope
 * (63,708 for the draft alone; its regions are 13,087) after rpg-project#725,
 * against about 274,000 before. The bound keeps that fact with headroom. */
const MAX_CASTLE_ENVELOPE = 100_000;

type SingleRoomFile = {
  templates?: Record<string, unknown>;
  room: {
    room: {
      monsterBindings?: Record<string, unknown>;
    };
  };
};

function actionAugmentWalkYaml(): string {
  const file = parse(
    exportDraftYaml(createPopulatedStudioDocument(), 'action-augment-walk')
  ) as SingleRoomFile;
  file.room.room.monsterBindings = {
    ...file.room.room.monsterBindings,
    'goblin-1': {
      addActions: ['dnd5e:weapons:light_crossbow', 'dnd5e:weapons:scimitar'],
      dropActions: ['dnd5e:weapons:dagger', 'dnd5e:weapons:club'],
    },
  };
  return stringify(file);
}

describe('the draft as a file (rpg-project#578)', () => {
  it('import accepts a binding with addActions/dropActions (action-augment-walk shape)', () => {
    const read = readDraftYaml(actionAugmentWalkYaml());
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(
      read.draft.room.monsterBindings?.['goblin-1'] as Record<string, unknown>
    ).toMatchObject({
      addActions: ['dnd5e:weapons:light_crossbow', 'dnd5e:weapons:scimitar'],
      dropActions: ['dnd5e:weapons:dagger', 'dnd5e:weapons:club'],
    });
  });

  it('import accepts a template with addActions/dropActions', () => {
    const file = parse(
      exportDraftYaml(
        createPopulatedStudioDocument(),
        'action-augment-template'
      )
    ) as SingleRoomFile;
    file.templates = {
      'guard-augment': {
        base: 'dnd5e:monsters:guard',
        addActions: ['dnd5e:weapons:light_crossbow', 'dnd5e:weapons:scimitar'],
        dropActions: ['dnd5e:weapons:club', 'dnd5e:weapons:dagger'],
      },
    };

    const read = readDraftYaml(stringify(file));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.scope.templates?.['guard-augment']).toMatchObject({
      addActions: ['dnd5e:weapons:light_crossbow', 'dnd5e:weapons:scimitar'],
      dropActions: ['dnd5e:weapons:club', 'dnd5e:weapons:dagger'],
    });
  });

  it('round trip preserves addActions/dropActions verbatim in authored order', () => {
    const file = parse(actionAugmentWalkYaml()) as SingleRoomFile;
    file.templates = {
      'guard-augment': {
        base: 'dnd5e:monsters:guard',
        addActions: ['dnd5e:weapons:light_crossbow', 'dnd5e:weapons:scimitar'],
        dropActions: ['dnd5e:weapons:club', 'dnd5e:weapons:dagger'],
      },
    };
    const opened = readDraftYaml(stringify(file));
    if (!opened.ok) throw new Error(opened.refusal);
    const saved = parse(
      exportDraftYaml({ draft: opened.draft, scope: opened.scope }, opened.key)
    ) as SingleRoomFile;
    expect(saved.room.room.monsterBindings?.['goblin-1']).toMatchObject({
      addActions: ['dnd5e:weapons:light_crossbow', 'dnd5e:weapons:scimitar'],
      dropActions: ['dnd5e:weapons:dagger', 'dnd5e:weapons:club'],
    });
    expect(saved.templates?.['guard-augment']).toMatchObject({
      addActions: ['dnd5e:weapons:light_crossbow', 'dnd5e:weapons:scimitar'],
      dropActions: ['dnd5e:weapons:club', 'dnd5e:weapons:dagger'],
    });
  });

  it.each([
    [
      'binding',
      (file: SingleRoomFile) => {
        file.room.room.monsterBindings = {
          ...file.room.room.monsterBindings,
          'goblin-1': {
            addActions: ['dnd5e:weapons:light:crossbow:extra'],
          },
        };
      },
      'Monster binding for goblin-1 addActions 0 must be a weapon reference',
    ],
    [
      'template',
      (file: SingleRoomFile) => {
        delete file.room.room.monsterBindings;
        file.templates = {
          'guard-augment': {
            base: 'dnd5e:monsters:guard',
            addActions: ['dnd5e:weapons:light:crossbow:extra'],
          },
        };
      },
      'templates.guard-augment.addActions[0]: must be a dnd5e:weapons reference',
    ],
  ])(
    'refuses the toolkit-invalid over-segmented action augment ref on a %s',
    (_site, apply, refusal) => {
      const file = parse(actionAugmentWalkYaml()) as SingleRoomFile;
      apply(file);
      const read = readDraftYaml(stringify(file));
      expect(read.ok).toBe(false);
      if (read.ok) return;
      expect(read.refusal).toContain(refusal);
    }
  );

  it('an actually-unknown addAction field still refuses with its field path', () => {
    const file = parse(actionAugmentWalkYaml()) as SingleRoomFile;
    file.room.room.monsterBindings = {
      ...file.room.room.monsterBindings,
      'goblin-1': { addAction: ['dnd5e:weapons:shortbow'] },
    };
    expect(readDraftYaml(stringify(file))).toEqual({
      ok: false,
      refusal:
        'Could not import: Monster binding for goblin-1 has an unsupported field: addAction.',
    });
  });

  it('nothing-stated files without action augmentation import and export byte-identically to today', () => {
    const document = createPopulatedStudioDocument();
    const today = exportDraftYaml(document, 'nothing-stated');
    const opened = readDraftYaml(today);
    if (!opened.ok) throw new Error(opened.refusal);
    expect(
      exportDraftYaml({ draft: opened.draft, scope: opened.scope }, opened.key)
    ).toBe(today);
  });

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
    // THE GATE GUARDS ARE ONE `use:` LINE (rpg-project#670), `guard-base`,
    // a bundle of bundles: their dash, their pursuit, their alarm and their
    // loop, resolved here into the rows the engine rolls.
    const gate = read.scope.tables?.['gate-patrol']?.time ?? [];
    expect(
      gate.filter((row) => row.use !== undefined).map((row) => row.use)
    ).toEqual(['guard-base']);
    expect(
      (read.scope.bundles?.['guard-base']?.rows ?? []).map(
        (row) => (row as { use?: string }).use
      )
    ).toEqual(['dasher', 'pursuer', 'alarm-reactor', 'patrol']);
    const rows = Object.values(read.scope.tables ?? {}).flatMap((t) =>
      wordRowsOf(read.scope.bundles, t.time ?? [], 'time')
    );
    const selectors = rows.map((row) => row.toward);
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
    // Pursuit (rpg-project#668), through the pursuer bundle: both gate
    // tables (by way of guard-base) and the answer-the-gate table walk to the
    // remembered cell and search six on the way the hero went
    // (rpg-project#679), the bundle's defaults filled.
    expect(
      rows.filter(
        (row) =>
          row.search?.distance === 6 &&
          row.search?.heading === 'went' &&
          JSON.stringify(row.when) === '{"enemy":"lost"}'
      )
    ).toHaveLength(3);
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

  // REGIONS ARE THE FLOOR (rpg-project#725). The castle's nine explicit
  // authoring regions became nine named regions and its leftover walkable
  // cells the implicit region; the union is the 1,586 cells it always had.
  it('opens the castle as nine named regions plus the implicit one, the floor unchanged', () => {
    const opened = readDraftYaml(
      readFileSync(
        'src/concepts/encounter-studio/fixtures/the-mad-king.yaml',
        'utf8'
      )
    );
    if (!opened.ok) throw new Error(opened.refusal);
    const regions = opened.draft.room.regions;
    expect(regions[0]!.id).toBe(opened.draft.room.implicitRegionId);
    expect(regions.slice(1).map((r) => r.name)).toHaveLength(9);
    expect(regions.every((r) => r.name.trim() !== '')).toBe(true);
    expect(regions.every((r) => r.lighting.intensity === 1)).toBe(true);
    expect(floorCellCount(opened.draft)).toBe(1586);
    expect(opened.draft).not.toHaveProperty('workspace');
    expect(opened.draft.scene).not.toHaveProperty('authoringRegions');
    // rpg-dnd5e-web#1284: the castle's stored envelope, regions as row runs,
    // is a fraction of the then 500,000-character cap that refused a full floor.
    const envelope = stringifyRoomDraft(opened.draft, opened.scope);
    expect(envelope.length).toBeLessThan(MAX_CASTLE_ENVELOPE);
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
    // The `use:` lines survive the save — `guard-base` on both gate guards,
    // and the bundles inside it — and the bundles keep their `$name`
    // placeholders (rpg-project#670).
    expect(saved.match(/use: guard-base/g)).toHaveLength(2);
    expect(saved.match(/use: dasher/g)).toHaveLength(2);
    expect(saved.match(/use: pursuer/g)).toHaveLength(2);
    expect(saved.match(/use: alarm-reactor/g)).toHaveLength(1);
    expect(saved.match(/use: patrol/g)).toHaveLength(1);
    expect(saved).toContain('path: $path');
    expect(saved).toMatch(/params:\n\s+path: null/);
    const reopened = readDraftYaml(saved);
    if (!reopened.ok) throw new Error(reopened.refusal);
    expect({ draft: reopened.draft, scope: reopened.scope }).toEqual({
      draft: opened.draft,
      scope: opened.scope,
    });
  });

  /**
   * THE TWO REFERENCE SITES (rpg-dnd5e-web#1311). Copies of rpg-api
   * `content/creature-facts-walk.yaml` (85d50e9) and
   * `content/reference-discovery-checks.yaml` (105c2fe), converted to version
   * 5 by the toolkit's `ConvertV4` (rpg-project#725): their walkable lists
   * became one region each and their workspaces were dropped. The engine
   * reads one number from the presentation block — `coordinateFrame.hexRadius`
   * (must be 1) — so a frame that states only its scale is a file the engine
   * plays, and the studio reads it.
   */
  const reference = (file: string) =>
    readFileSync(`src/concepts/encounter-studio/fixtures/${file}.yaml`, 'utf8');

  it('opens The Watch Post (before: "Could not import: Unsupported room coordinate frame.") and round-trips it', () => {
    const opened = readDraftYaml(reference('creature-facts-walk'));
    if (!opened.ok) throw new Error(opened.refusal);
    expect(opened.key).toBe('creature-facts-walk');
    // The twelve walkable cells the file listed are the one region's cells.
    expect(opened.draft).not.toHaveProperty('workspace');
    expect(opened.draft.room.regions.map((r) => r.name)).toEqual([
      'The Watch Post',
    ]);
    expect(floorCellCount(opened.draft)).toBe(12);
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

  it('reads Discovery Check Walk (before: "Could not import: Unsupported room workspace extent.") and names the prop the studio cannot draw', () => {
    const yaml = reference('reference-discovery-checks');
    // The room is read as written once the uncatalogued props are out of the
    // way: no extent is stored any more, so none can be the refusal.
    const withoutUncatalogued = yaml
      .replace('dnd5e:props:scroll', 'dnd5e:props:books')
      .replace('dnd5e:props:reliquary', 'dnd5e:props:vase');
    const opened = readDraftYaml(withoutUncatalogued);
    if (!opened.ok) throw new Error(opened.refusal);
    expect(opened.draft).not.toHaveProperty('workspace');
    expect(opened.draft.room.regions.map((r) => r.id)).toEqual([
      'discovery-room',
    ]);
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

/**
 * THE SUPPORTED ENVELOPE (rpg-project ideas/benchmark-keep/design.md, R4;
 * rpg-project#749). `fixtures/bench-keep-30k.yaml` is a TEST FIXTURE ONLY: a
 * byte-for-byte COPY of rpg-api `content/bench/bench-keep-30k.yaml`, the
 * shelf file the server serves (rpg-toolkit `keepgen -hexes 30000 -seed 1
 * -key bench-keep-30k` at default density; its header names the command).
 * When the generator changes, COPY the api file here and update the hash
 * below; do not regenerate, or the header's `-out` diverges. The bench
 * harness's live Open is the real currency check. Every refusal the studio
 * applies on Open and Import must admit it, and it sits under half of each
 * bound. Measured when the bounds were set: 1,618 items, 1,108,811 envelope
 * characters, 584,707 YAML bytes.
 */
const CEILING_SHA256 =
  '624d937f9577bd1d459e4d7e6716d98aecda859153ec11af744f172636d9834b';

describe('the ceiling fixture (rpg-project#749)', () => {
  let yaml: string;
  let read: Extract<ReturnType<typeof readDraftYaml>, { ok: true }>;
  beforeAll(() => {
    yaml = readFileSync(
      'src/concepts/encounter-studio/fixtures/bench-keep-30k.yaml',
      'utf8'
    );
    const opened = readDraftYaml(yaml);
    if (!opened.ok) throw new Error(opened.refusal);
    read = opened;
  });

  /** Every `assetRef` anywhere in the draft: props, walls, doors. */
  function assetRefsOf(value: unknown, into = new Set<string>()): Set<string> {
    if (Array.isArray(value)) for (const v of value) assetRefsOf(v, into);
    else if (value && typeof value === 'object')
      for (const [key, v] of Object.entries(value)) {
        if (key === 'assetRef' && typeof v === 'string') into.add(v);
        else assetRefsOf(v, into);
      }
    return into;
  }

  it('is the api shelf copy, byte for byte', () => {
    expect(createHash('sha256').update(yaml).digest('hex')).toBe(
      CEILING_SHA256
    );
  });

  it('imports the ceiling fixture with no refusal', () => {
    expect(read.key).toBe('bench-keep-30k');
    const items = read.draft.scene.items.length;
    expect(items).toBe(1618);
    expect(items).toBeLessThan(MAX_ITEMS / 2);
    const envelope = stringifyRoomDraft(read.draft, read.scope);
    expect(envelope.length).toBeLessThan(MAX_JSON_LENGTH / 2);

    // The other open refusals the ceiling meets.
    expect(floorCellCount(read.draft)).toBe(30000);
    expect(floorCellCount(read.draft)).toBeLessThanOrEqual(MAX_FLOOR_HEXES);
    expect(read.draft.scene.groups.length).toBeLessThanOrEqual(MAX_GROUPS);
    expect(read.draft.scene.mapLabels?.length ?? 0).toBeLessThanOrEqual(
      MAX_MAP_LABELS
    );
    expect(read.draft.room.regions).toHaveLength(32);
    expect(read.draft.room.walls).toHaveLength(74);
    const refs = assetRefsOf(read.draft);
    expect(refs.size).toBe(32);
    expect(
      [...refs].filter((ref) => !WORLD_BUILDING_CATALOG_BY_REF.has(ref))
    ).toEqual([]);

    // What the session's import does: the full document gate, the autosave,
    // and the reload the next visit performs.
    const valid = validateRoomDocument({
      draft: read.draft,
      scope: read.scope,
    });
    const values = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
    };
    expect(saveRoomDraft(storage, valid.draft, valid.scope)).toBeNull();
    const reloaded = loadRoomDraft(storage, valid.draft);
    expect(reloaded.error).toBeUndefined();
    expect(reloaded.value.scene.items).toHaveLength(items);

    const importDocument = vi.fn().mockReturnValue(true);
    expect(importDraftYaml(yaml, { importDocument })).toEqual({
      ok: true,
      key: 'bench-keep-30k',
    });
  });
});
