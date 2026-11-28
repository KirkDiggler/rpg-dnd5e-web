import { expect, it } from 'vitest';
import { channelAppearanceFixture } from './appearanceChannelTestFixtures';
import { appearanceEditPatch } from './appearanceEdits';
import { buildAppearanceSheet } from './appearanceSheet';
import type { AppearanceEdit, AppearanceSheetInput } from './appearanceTypes';

const edit = (input: AppearanceSheetInput, value: AppearanceEdit) =>
  appearanceEditPatch({
    ...input,
    sheet: buildAppearanceSheet(input),
    edit: value,
  });
const scale: AppearanceEdit = {
  kind: 'channel-adjustment',
  targetId: 'body',
  channel: 'normal',
  mode: 'scale',
  multiplier: 1,
};

it.each(['wall', 'prop', 'npc'] as const)(
  'derives verified %s controls and stages explicit1 without mutating the owner',
  (kind) => {
    const { document, input } = channelAppearanceFixture(kind);
    const before = structuredClone(document);
    const fields = buildAppearanceSheet(input).fields.filter(
      (field) => field.kind === 'channel-adjustment'
    );
    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({
      targetId: 'body',
      channel: 'normal',
      capability: { kind: 'adjustable', minMultiplier: 0.5, maxMultiplier: 2 },
    });
    expect(fields[1]).toMatchObject({
      channel: 'emissive',
      capability: { kind: 'fixed' },
    });
    expect(edit(input, scale)).toEqual({
      materialChannels: [
        { targetId: 'body', normal: { mode: 'scale', multiplier: 1 } },
      ],
    });
    expect(document).toEqual(before);
  }
);

it('refuses fixed and out-of-range edits without producing a patch', () => {
  const { input } = channelAppearanceFixture();
  expect(() =>
    edit(input, {
      kind: 'channel-adjustment',
      targetId: 'body',
      channel: 'emissive',
      mode: 'off',
    })
  ).toThrow(/fixed|adjustable/);
  for (const multiplier of [0, 0.49, 2.01, NaN, Infinity])
    expect(() =>
      edit(input, {
        ...scale,
        kind: 'channel-adjustment',
        targetId: 'body',
        channel: 'normal',
        mode: 'scale',
        multiplier,
      })
    ).toThrow(/range|finite|positive/);
});

it('keeps unavailable intent visible and permits reset of only the chosen channel', () => {
  const { input } = channelAppearanceFixture();
  const current: AppearanceSheetInput = {
    ...input,
    catalog: null,
    draft: {
      materialChannels: [
        {
          targetId: 'lost',
          normal: { mode: 'scale', multiplier: 1 },
          emissive: { mode: 'off' },
        },
      ],
    },
  };
  expect(buildAppearanceSheet(current).fields).toContainEqual(
    expect.objectContaining({
      kind: 'channel-adjustment',
      targetId: 'lost',
      channel: 'normal',
      unavailable: expect.any(String),
    })
  );
  const reset = edit(current, {
    kind: 'channel-adjustment',
    targetId: 'lost',
    channel: 'normal',
    mode: 'default',
  });
  expect(reset.materialChannels).toEqual([
    { targetId: 'lost', emissive: { mode: 'off' } },
  ]);
  const cleared = edit(
    { ...current, draft: reset },
    {
      kind: 'channel-adjustment',
      targetId: 'lost',
      channel: 'emissive',
      mode: 'default',
    }
  );
  expect(cleared.materialChannels).toEqual([]);
});

it('allows explicit repair of a structurally valid strength outside a changed provider range', () => {
  const { input } = channelAppearanceFixture();
  const current = {
    ...input,
    draft: {
      materialChannels: [
        { targetId: 'body', normal: { mode: 'scale' as const, multiplier: 3 } },
      ],
    },
  };
  expect(buildAppearanceSheet(current).diagnostics).toContain(
    'Saved channel strength is outside the supported range.'
  );
  expect(edit(current, scale).materialChannels).toEqual([
    { targetId: 'body', normal: { mode: 'scale', multiplier: 1 } },
  ]);
});

it('retains unknown native row/channel metadata while replacing only mode and multiplier', () => {
  const { input } = channelAppearanceFixture();
  const row = {
    targetId: 'body',
    normal: { mode: 'scale' as const, multiplier: 1, future: { keep: true } },
    futureRow: { keep: true },
  };
  const patch = edit(
    { ...input, draft: { materialChannels: [row] } },
    {
      kind: 'channel-adjustment',
      targetId: 'body',
      channel: 'normal',
      mode: 'off',
    }
  );
  expect(patch.materialChannels).toEqual([
    {
      targetId: 'body',
      normal: { mode: 'off', future: { keep: true } },
      futureRow: { keep: true },
    },
  ]);
  row.normal.future.keep = false;
  expect(patch.materialChannels![0].normal).toMatchObject({
    future: { keep: true },
  });
});

it('refuses stale geometry and incomplete NPC representation enrollment', () => {
  const { input } = channelAppearanceFixture();
  const stale = {
    ...input,
    catalog: {
      ...input.catalog!,
      channelBindings: [
        { ...input.catalog!.channelBindings![0], glbSha256: '0'.repeat(64) },
      ],
    },
  };
  expect(() => edit(stale, scale)).toThrow(/stale|hash|geometry/);
  const npc = channelAppearanceFixture('npc').input;
  expect(() =>
    edit(
      {
        ...npc,
        catalog: {
          ...npc.catalog!,
          channelBindings: npc.catalog!.channelBindings!.slice(0, 1),
        },
      },
      scale
    )
  ).toThrow(/representation|downed|binding/);
});

it('refuses strength incompatible with an enrolled inserted masonry scope before staging it', () => {
  const { input } = channelAppearanceFixture();
  if (input.selection.kind !== 'wall') throw Error('Expected wall');
  const sourceBinding = input.catalog!.channelBindings![0];
  const sourceAsset = input.assets[sourceBinding.assetRef];
  const selector = sourceBinding.targets[0].selectors[0];
  const family = input.catalog!.materials[0].family;
  const destinationRef = 'dnd5e:env:test:channel_part';
  const source = {
    ...sourceAsset,
    surfaces: [
      { id: 'body', ...selector, side: 'positive-z' as const, family },
    ],
  };
  const destination = {
    ...sourceAsset,
    ref: destinationRef,
    glbSha256: 'b'.repeat(64),
    surfaces: [
      {
        id: 'part',
        node: 'Part',
        material: selector.material,
        side: 'positive-z' as const,
        family,
      },
    ],
  };
  const appearance = {
    ...input.selection.appearance,
    sections: [{ id: 'part', assetRef: destinationRef, position: 4, width: 1 }],
  };
  const current: AppearanceSheetInput = {
    ...input,
    selection: {
      ...input.selection,
      appearance,
      wall: { ...input.selection.wall, appearance },
    },
    assets: {
      ...input.assets,
      [source.ref]: source,
      [destinationRef]: destination,
    },
    catalog: {
      ...input.catalog!,
      channelBindings: [
        sourceBinding,
        {
          ...sourceBinding,
          assetRef: destinationRef,
          glbSha256: destination.glbSha256,
          targets: [
            {
              ...sourceBinding.targets[0],
              selectors: [{ node: 'Part', material: selector.material }],
              normal: {
                kind: 'adjustable',
                minMultiplier: 1,
                maxMultiplier: 2,
              },
            },
          ],
        },
      ],
    },
  };
  expect(() =>
    edit(current, {
      kind: 'channel-adjustment',
      targetId: 'body',
      channel: 'normal',
      mode: 'scale',
      multiplier: 0.5,
    })
  ).toThrow(/range/);
});

it('refuses an incompatible complete look until the retained adjustment is explicitly reset', () => {
  const { input } = channelAppearanceFixture();
  const sheet = buildAppearanceSheet(input);
  const pack = sheet.fields.find((field) => field.kind === 'atlas-pack');
  if (!pack || pack.kind !== 'atlas-pack')
    throw Error('Fixture has no atlas choice');
  const choice = pack.choices.find((choice) => choice.value)!;
  const staged = { ...input, draft: edit(input, scale) };
  expect(() =>
    edit(staged, {
      kind: 'atlas-pack',
      surfaceId: pack.surfaceId,
      value: choice.value,
    })
  ).toThrow(/channel|map|reset/i);
  const reset = edit(staged, {
    kind: 'channel-adjustment',
    targetId: 'body',
    channel: 'normal',
    mode: 'default',
  });
  expect(
    edit(
      { ...staged, draft: reset },
      { kind: 'atlas-pack', surfaceId: pack.surfaceId, value: choice.value }
    ).materialOverrides
  ).toContainEqual({ surfaceId: pack.surfaceId, materialRef: choice.value });
});
