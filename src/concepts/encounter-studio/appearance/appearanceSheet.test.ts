import { GENERATED_WORLD_MATERIALS } from '@/generated/worldMaterialCatalog';
import { describe, expect, it } from 'vitest';
import { buildAppearanceSheet } from './appearanceSheet';
import {
  appearanceFixture as fixture,
  groupFixtureAppearances,
} from './appearanceTestFixtures';
const FIT = 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01';
const BRICK = 'dnd5e:material:fantasy-kingdom:wall_brick_01';
const PACK = 'dnd5e:material:fantasy-kingdom:atlas_04_c';
describe('shared appearance sheet from provider facts', () => {
  it('collapses equivalent looks while retaining the exact saved or staged ref', () => {
    const { input } = fixture();
    const grouped = groupFixtureAppearances(input);
    const draft = {
      materialOverrides: [{ surfaceId: 'atlas', materialRef: PACK }],
    };
    const before = structuredClone(draft);
    const field = buildAppearanceSheet({ ...grouped, draft }).fields.find(
      (f) => f.kind === 'atlas-pack'
    );
    expect(field).toMatchObject({
      value: PACK,
      displayValue: '',
      choices: [{ value: '', label: 'Original' }],
    });
    expect(draft).toEqual(before);
    const missing = buildAppearanceSheet({
      ...grouped,
      draft: {
        materialOverrides: [{ surfaceId: 'atlas', materialRef: 'missing' }],
      },
    }).fields.find((f) => f.kind === 'atlas-pack');
    expect(missing).toMatchObject({
      value: 'missing',
      unavailable: expect.any(String),
    });
    expect(missing).not.toHaveProperty('displayValue');
  });

  it('keeps different groups selectable and maps aliases only for display', () => {
    const { input } = fixture();
    const grouped = groupFixtureAppearances(input);
    const refs = grouped.catalog.atlas!.materials.map((m) => m.ref);
    grouped.catalog.atlas!.bindings = grouped.catalog.atlas!.bindings.map(
      (binding) => ({
        ...binding,
        surfaces: binding.surfaces.map((surface) => ({
          ...surface,
          appearanceGroups: [
            { original: true, materialRefs: [refs[0]!] },
            { original: false, materialRefs: refs.slice(1) },
          ],
        })),
      })
    );
    const field = buildAppearanceSheet({
      ...grouped,
      draft: {
        materialOverrides: [{ surfaceId: 'atlas', materialRef: refs[2]! }],
      },
    }).fields.find((f) => f.kind === 'atlas-pack');
    expect(field).toMatchObject({ value: refs[2], displayValue: refs[1] });
    expect(
      field && 'choices' in field && field.choices.map((c) => c.value)
    ).toEqual(['', refs[1]]);
  });

  it.each([false, true])(
    'filters by compatible family, not recommendations (grouped=%s)',
    (grouped) => {
      const { input } = fixture();
      const atlas = input.catalog.atlas!;
      input.catalog = {
        ...input.catalog,
        atlas: {
          ...atlas,
          // Adding a compatible ref must also update its declared partition.
          // Exercise both legacy absence and complete grouping metadata.
          bindings: atlas.bindings.map((binding) => ({
            ...binding,
            surfaces: binding.surfaces.map(
              ({ appearanceGroups, ...surface }) => ({
                ...surface,
                ...(grouped && appearanceGroups
                  ? {
                      appearanceGroups: [
                        ...appearanceGroups,
                        {
                          original: false,
                          materialRefs: ['dnd5e:material:test:uncurated'],
                        },
                      ],
                    }
                  : {}),
              })
            ),
          })),
          materials: [
            ...atlas.materials,
            {
              ...atlas.materials[0],
              ref: 'dnd5e:material:test:uncurated',
              displayName: 'Uncurated',
            },
            {
              ...atlas.materials[0],
              ref: 'dnd5e:material:test:foreign',
              family: 'foreign-layout',
            },
          ],
        },
      };
      const sheet = buildAppearanceSheet(input);
      const field = sheet.fields.find((row) => row.kind === 'atlas-pack');
      if (field?.kind !== 'atlas-pack') throw Error('Missing pack field');
      expect(field.choices.map((choice) => choice.value)).toContain(PACK);
      expect(field.choices.map((choice) => choice.value)).toContain(
        'dnd5e:material:test:uncurated'
      );
      expect(field.choices.map((choice) => choice.value)).not.toContain(
        'dnd5e:material:test:foreign'
      );
    }
  );

  it('shows paired masonry maps while color-only atlas channels remain absent', () => {
    const { input } = fixture();
    const masonry = buildAppearanceSheet({
      ...input,
      draft: { assetRef: FIT, finishA: BRICK },
    });
    expect(masonry.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'wall-finish',
          side: 'positive-z',
          value: BRICK,
        }),
        expect.objectContaining({
          kind: 'channel',
          target: 'positive-z',
          channel: 'normal',
          state: {
            kind: 'pack-map',
            image: GENERATED_WORLD_MATERIALS.find((row) => row.ref === BRICK)!
              .normal,
          },
        }),
      ])
    );
    const atlas = buildAppearanceSheet({
      ...input,
      draft: { materialOverrides: [{ surfaceId: 'atlas', materialRef: PACK }] },
    });
    expect(atlas.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'channel',
          channel: 'normal',
          state: { kind: 'no-map' },
        }),
        expect.objectContaining({
          kind: 'channel',
          channel: 'emissive',
          state: { kind: 'no-map' },
        }),
      ])
    );
  });

  it('keeps unavailable saved choices explicit instead of replacing them with Original', () => {
    const { input } = fixture();
    const sheet = buildAppearanceSheet({
      ...input,
      draft: {
        materialOverrides: [
          { surfaceId: 'atlas', materialRef: 'missing:material' },
        ],
      },
    });
    expect(sheet.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'atlas-pack',
          value: 'missing:material',
          unavailable: expect.any(String),
        }),
      ])
    );
    expect(sheet.diagnostics.length).toBeGreaterThan(0);
  });

  it('does not offer old scope choices after a staged asset change', () => {
    const { input } = fixture();
    const sheet = buildAppearanceSheet({
      ...input,
      draft: {
        assetRef: FIT,
        materialOverrides: [{ surfaceId: 'atlas', materialRef: PACK }],
      },
    });
    const old = sheet.fields.find((row) => row.kind === 'atlas-pack');
    if (old?.kind !== 'atlas-pack') throw Error('Lost unresolved intent');
    expect(old.value).toBe(PACK);
    expect(old.choices.map((choice) => choice.value)).toEqual(['']);
    expect(old.unavailable).toMatch(/scope|binding/i);
  });

  it('derives NPC choices from actual tuples, never an assumed cross-product', () => {
    const { input } = fixture({ kind: 'actor', id: 'goblin-1' });
    const family = input.npcFamilies.find(
      (row) => row.ref === 'dnd5e:npcs:kingdom:merchant-01'
    )!;
    const subset = {
      ...family,
      looks: family.looks.filter(
        (row) =>
          row.look?.style === '01' ||
          (row.look?.style === '04' && row.look.skinPalette === 'A')
      ),
    };
    const selected = family.looks.find(
      (row) => row.look?.style === '01' && row.look.skinPalette === 'B'
    )!;
    const sheet = buildAppearanceSheet({
      ...input,
      npcFamilies: [subset],
      draft: { appearanceRef: selected.assetRef },
    });
    const styles = sheet.fields.find((row) => row.kind === 'npc-style');
    if (styles?.kind !== 'npc-style') throw Error('Missing style field');
    expect(styles.choices.map((choice) => choice.label)).toEqual(['01']);
    expect(styles.choices.map((choice) => choice.value)).toEqual([
      selected.assetRef,
    ]);
    expect(
      sheet.fields
        .filter((row) => row.kind === 'channel')
        .every(
          (row) => row.kind === 'channel' && row.state.kind === 'complete-look'
        )
    ).toBe(true);
  });

  it('uses the same atlas field for a single selected prop without editing its scene', () => {
    const { document, input } = fixture({
      kind: 'scene',
      ids: ['studio-decoration'],
    });
    document.draft.scene.items.find(
      (row) => row.id === 'studio-decoration'
    )!.assetRef = 'dnd5e:props:fantasy-kingdom:chair_fancy_01';
    const before = structuredClone(document);
    expect(
      buildAppearanceSheet(input).fields.some(
        (row) => row.kind === 'atlas-pack'
      )
    ).toBe(true);
    expect(document).toEqual(before);
  });

  it('does not collapse a multiple-root selection to one prop', () => {
    const { input } = fixture({
      kind: 'scene',
      ids: ['table', 'studio-decoration'],
    });
    expect(buildAppearanceSheet(input).fields).toEqual([]);
  });
});
