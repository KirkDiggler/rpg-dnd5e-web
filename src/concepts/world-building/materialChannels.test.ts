// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateMaterialChannels } from './materialChannels';

describe('native material channels', () => {
  it('retains future native row and channel metadata without aliasing', () => {
    const input = [
      {
        targetId: 'body',
        normal: {
          mode: 'scale',
          multiplier: 1,
          note: { labels: ['authored'] },
        },
        emissive: { mode: 'off', future: { visible: true } },
        future: { choice: [1, 2] },
      },
    ];
    const result = validateMaterialChannels(
      input,
      'scene.items[0].materialChannels'
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual([
      {
        targetId: 'body',
        normal: {
          mode: 'scale',
          multiplier: 1,
          note: { labels: ['authored'] },
        },
        emissive: { mode: 'off', future: { visible: true } },
        future: { choice: [1, 2] },
      },
    ]);
    input[0].normal.note.labels.push('changed');
    input[0].emissive.future.visible = false;
    input[0].future.choice.push(3);
    expect(JSON.parse(JSON.stringify(result))).toEqual([
      {
        targetId: 'body',
        normal: {
          mode: 'scale',
          multiplier: 1,
          note: { labels: ['authored'] },
        },
        emissive: { mode: 'off', future: { visible: true } },
        future: { choice: [1, 2] },
      },
    ]);
  });

  it('retains proto-named metadata as own data, not as a prototype', () => {
    const input = JSON.parse(
      '[{"targetId":"body","normal":{"mode":"off","__proto__":{"channelNote":true}},"__proto__":{"rowNote":true}}]'
    );
    const result = validateMaterialChannels(input, 'materialChannels');
    expect(Object.getPrototypeOf(result[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result[0].normal)).toBe(Object.prototype);
    expect(Object.hasOwn(result[0], '__proto__')).toBe(true);
    expect(Object.hasOwn(result[0].normal!, '__proto__')).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(input);
  });

  it('does not let retained metadata bypass known value validation', () => {
    expect(() =>
      validateMaterialChannels(
        [
          {
            targetId: 'body',
            normal: { mode: 'scale', multiplier: -1, future: true },
          },
        ],
        'scene.materialChannels'
      )
    ).toThrow(/scene\.materialChannels.*multiplier/);
  });
});
