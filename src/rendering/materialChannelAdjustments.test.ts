// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { copyMaterialChannelAdjustments } from './materialChannelAdjustments';

describe('copyMaterialChannelAdjustments', () => {
  it('copies mixed modes without normalizing identity or explicit one', () => {
    expect(
      copyMaterialChannelAdjustments([
        {
          targetId: ' masonry ',
          normal: { mode: 'scale', multiplier: 1, editorNote: 'not captured' },
          emissive: { mode: 'off' },
          privateMetadata: { source: 'not captured' },
        },
        { targetId: 'body', normal: { mode: 'scale', multiplier: 0.5 } },
      ])
    ).toEqual([
      {
        targetId: ' masonry ',
        normal: { mode: 'scale', multiplier: 1 },
        emissive: { mode: 'off' },
      },
      { targetId: 'body', normal: { mode: 'scale', multiplier: 0.5 } },
    ]);
  });

  it('keeps default channels absent and an empty owner list empty', () => {
    expect(copyMaterialChannelAdjustments([])).toEqual([]);
    const copied = copyMaterialChannelAdjustments([
      { targetId: 'body', emissive: { mode: 'scale', multiplier: 2 } },
    ]);
    expect(Object.hasOwn(copied[0], 'normal')).toBe(false);
    expect(copied[0].emissive).toEqual({ mode: 'scale', multiplier: 2 });
  });

  it('detaches nested channel values', () => {
    const input = [
      {
        targetId: 'body',
        normal: { mode: 'scale', multiplier: 0.5 },
        emissive: { mode: 'off' },
      },
    ];
    const copied = copyMaterialChannelAdjustments(input);
    input[0].normal.multiplier = 4;
    input[0].emissive.mode = 'changed';
    expect(copied[0].normal).toEqual({ mode: 'scale', multiplier: 0.5 });
    expect(copied[0].emissive).toEqual({ mode: 'off' });
    copied[0].targetId = 'other';
    expect(input[0].targetId).toBe('body');
  });

  it.each([
    undefined,
    null,
    {},
    [null],
    new Array<unknown>(1),
    [[]],
    [{ targetId: '', normal: { mode: 'off' } }],
    [{ targetId: '   ', normal: { mode: 'off' } }],
    [{ targetId: 1, normal: { mode: 'off' } }],
    [{ targetId: 'body' }],
    [{ targetId: 'body', normal: undefined }],
    [{ targetId: 'body', normal: null }],
    [{ targetId: 'body', normal: [] }],
    [{ targetId: 'body', normal: {} }],
    [{ targetId: 'body', normal: { mode: 'default' } }],
    [{ targetId: 'body', normal: { mode: 'scale' } }],
    [{ targetId: 'body', normal: { mode: 'off', multiplier: 0 } }],
    [{ targetId: 'body', normal: { mode: 'off', multiplier: undefined } }],
    [
      { targetId: 'body', normal: { mode: 'off' } },
      { targetId: 'body', emissive: { mode: 'off' } },
    ],
  ])('refuses invalid adjustment shapes %#', (value) => {
    expect(() =>
      copyMaterialChannelAdjustments(value, 'appearance.materialChannels')
    ).toThrow(/appearance\.materialChannels/);
  });

  it.each([0, -0, -1, NaN, Infinity, -Infinity, '1', true, null])(
    'refuses invalid multipliers %# on either channel',
    (multiplier) => {
      for (const channel of ['normal', 'emissive']) {
        expect(() =>
          copyMaterialChannelAdjustments([
            { targetId: 'body', [channel]: { mode: 'scale', multiplier } },
          ])
        ).toThrow(/multiplier/);
      }
    }
  );
});
