import { describe, expect, it } from 'vitest';
import { appearanceEditPatch } from './appearanceEdits';
import { buildAppearanceSheet } from './appearanceSheet';
import { appearanceFixture } from './appearanceTestFixtures';
import type { AppearanceField, AppearanceSheet } from './appearanceTypes';

const PACK = 'dnd5e:material:fantasy-kingdom:atlas_04_c';
function choice(
  sheet: AppearanceSheet,
  kind: AppearanceField['kind'],
  label: string
): string {
  const field = sheet.fields.find((row) => row.kind === kind);
  if (!field || field.kind === 'channel') throw Error('Missing choice field');
  const selected = field.choices.find((row) => row.label === label);
  if (!selected) throw Error(`Missing ${label} choice`);
  return selected.value;
}

describe('typed appearance edits through the existing owner draft', () => {
  it('uses the staged complete NPC look for the next palette edit', () => {
    const { input, document } = appearanceFixture({
      kind: 'actor',
      id: 'goblin-1',
    });
    const before = structuredClone(document);
    const sheet = buildAppearanceSheet(input);
    const styled = appearanceEditPatch({
      ...input,
      sheet,
      edit: { kind: 'npc-style', value: choice(sheet, 'npc-style', '04') },
    });
    expect(styled).toEqual({
      appearanceRef: 'dnd5e:npcs:kingdom:merchant-01-style-04-a',
    });
    const next = { ...input, draft: styled };
    const nextSheet = buildAppearanceSheet(next);
    const skinned = appearanceEditPatch({
      ...next,
      sheet: nextSheet,
      edit: { kind: 'npc-skin', value: choice(nextSheet, 'npc-skin', 'C') },
    });
    expect(skinned).toEqual({
      appearanceRef: 'dnd5e:npcs:kingdom:merchant-01-style-04-c',
    });
    expect(document).toEqual(before);
  });

  it('rejects a stale owner revision without producing an edit', () => {
    const { input } = appearanceFixture();
    const sheet = buildAppearanceSheet(input);
    expect(() =>
      appearanceEditPatch({
        ...input,
        sheet,
        selection: { ...input.selection, selectionRevision: 2 },
        edit: { kind: 'atlas-pack', surfaceId: 'atlas', value: PACK },
      })
    ).toThrow(/stale|selection/i);
  });

  it('rechecks valid choices against a newly staged model instead of trusting the old sheet', () => {
    const { input } = appearanceFixture();
    const sheet = buildAppearanceSheet(input);
    expect(() =>
      appearanceEditPatch({
        ...input,
        sheet,
        draft: { assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01' },
        edit: { kind: 'atlas-pack', surfaceId: 'atlas', value: PACK },
      })
    ).toThrow(/available|scope|field/i);
  });

  it('resets one scope while preserving detached opaque fields on untouched scopes', () => {
    const { input } = appearanceFixture();
    const future = {
      surfaceId: 'future-scope',
      materialRef: 'future:look',
      extension: { keep: 'yes' },
    };
    const current = {
      ...input,
      draft: {
        materialOverrides: [future, { surfaceId: 'atlas', materialRef: PACK }],
      },
    };
    const patch = appearanceEditPatch({
      ...current,
      sheet: buildAppearanceSheet(current),
      edit: { kind: 'atlas-pack', surfaceId: 'atlas', value: '' },
    });
    expect(patch.materialOverrides).toEqual([future]);
    expect(patch.materialOverrides![0]).not.toBe(future);
    expect(Reflect.get(patch.materialOverrides![0], 'extension')).not.toBe(
      future.extension
    );
    expect(current.draft.materialOverrides).toHaveLength(2);
  });

  it('edits exactly one selected prop using its existing material intent', () => {
    const { document, input } = appearanceFixture({
      kind: 'scene',
      ids: ['studio-decoration'],
    });
    const prop = document.draft.scene.items.find(
      (row) => row.id === 'studio-decoration'
    )!;
    prop.assetRef = 'dnd5e:props:fantasy-kingdom:chair_fancy_01';
    const before = structuredClone(document);
    const patch = appearanceEditPatch({
      ...input,
      sheet: buildAppearanceSheet(input),
      edit: { kind: 'atlas-pack', surfaceId: 'atlas', value: PACK },
    });
    expect(patch).toEqual({
      materialOverrides: [{ surfaceId: 'atlas', materialRef: PACK }],
    });
    expect(document).toEqual(before);
  });

  it('expresses a wall face choice only through its existing Arrange field', () => {
    const { input } = appearanceFixture();
    const current = {
      ...input,
      draft: { assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01' },
    };
    const patch = appearanceEditPatch({
      ...current,
      sheet: buildAppearanceSheet(current),
      edit: {
        kind: 'wall-finish',
        side: 'positive-z',
        value: 'dnd5e:material:fantasy-kingdom:wall_brick_01',
      },
    });
    expect(patch).toEqual({
      finishA: 'dnd5e:material:fantasy-kingdom:wall_brick_01',
    });
  });

  it('sets both eligible faces in one patch without treating different saved values as invalid', () => {
    const { input } = appearanceFixture();
    const current = {
      ...input,
      draft: {
        assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01',
        finishA: 'dnd5e:material:fantasy-kingdom:wall_brick_01',
        finishB: 'dnd5e:material:fantasy-kingdom:wall_stucco_01',
      },
    };
    const sheet = buildAppearanceSheet(current);
    expect(sheet.diagnostics).toEqual([]);
    expect(
      sheet.fields.find(
        (row) => row.kind === 'wall-finish' && row.side === 'both'
      )
    ).toMatchObject({ mixed: true });
    expect(
      appearanceEditPatch({
        ...current,
        sheet,
        edit: { kind: 'wall-finish', side: 'both', value: '' },
      })
    ).toEqual({ finishA: '', finishB: '' });
  });

  it('does not accept a value merely because it is a nonempty string', () => {
    const { input } = appearanceFixture({ kind: 'actor', id: 'goblin-1' });
    expect(() =>
      appearanceEditPatch({
        ...input,
        sheet: buildAppearanceSheet(input),
        edit: { kind: 'npc-style', value: 'unsupported-look' },
      })
    ).toThrow(/available|choice/i);
  });
});
