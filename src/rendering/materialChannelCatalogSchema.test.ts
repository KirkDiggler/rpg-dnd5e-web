// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseMaterialChannelBindings } from './worldAtlasCatalogSchema.mjs';

const binding = {
  assetRef: 'dnd5e:npcs:test:body',
  representation: 'standing',
  glbSha256: 'a'.repeat(64),
  targets: [
    {
      id: 'body',
      label: 'Body',
      selectors: [{ node: 'Body', material: 'Paint' }],
      normal: { kind: 'fixed' },
      emissive: { kind: 'adjustable', minMultiplier: 0.5, maxMultiplier: 2 },
    },
  ],
};

describe('material channel binding schema', () => {
  it('detaches exact metadata and keeps representation-specific selectors', () => {
    const standing = structuredClone(binding);
    const downed = {
      ...structuredClone(binding),
      representation: 'downed',
      glbSha256: 'b'.repeat(64),
    };
    downed.targets[0].selectors[0].node = 'DownedBody';
    const parsed = parseMaterialChannelBindings([standing, downed]);
    standing.targets[0].selectors[0].node = 'changed';
    expect(parsed[0].targets[0].selectors[0].node).toBe('Body');
    expect(parsed[1].targets[0].selectors[0].node).toBe('DownedBody');
    expect(parsed[1].targets[0].emissive).toEqual({
      kind: 'adjustable',
      minMultiplier: 0.5,
      maxMultiplier: 2,
    });
    expect(parseMaterialChannelBindings([])).toEqual([]);
  });

  it.each([0, -1, 2, NaN, Infinity])(
    'refuses invalid interval lower bound %s',
    (minMultiplier) => {
      const row = structuredClone(binding);
      row.targets[0].emissive.minMultiplier = minMultiplier;
      expect(() => parseMaterialChannelBindings([row])).toThrow(/interval/);
    }
  );

  it('rejects duplicate scopes and inconsistent logical targets across representations', () => {
    expect(() => parseMaterialChannelBindings([binding, binding])).toThrow(
      /duplicate/
    );
    const row = structuredClone(binding);
    row.targets[0].selectors.push({ ...row.targets[0].selectors[0] });
    expect(() => parseMaterialChannelBindings([row])).toThrow(/duplicate/);
    const downed = { ...structuredClone(binding), representation: 'downed' };
    downed.targets[0].emissive.maxMultiplier = 3;
    expect(() => parseMaterialChannelBindings([binding, downed])).toThrow(
      /representation/
    );
  });

  it('requires whole-string identities rather than accepting a trailing newline', () => {
    expect(() =>
      parseMaterialChannelBindings([
        { ...binding, assetRef: binding.assetRef + '\n' },
      ])
    ).toThrow();
    expect(() =>
      parseMaterialChannelBindings([
        { ...binding, glbSha256: binding.glbSha256 + '\n' },
      ])
    ).toThrow();
    const row = structuredClone(binding);
    row.targets[0].selectors[0].node += '\n';
    expect(() => parseMaterialChannelBindings([row])).toThrow();
  });

  it('does not accept paths, unknown facts or sparse target lists', () => {
    expect(() =>
      parseMaterialChannelBindings([
        { ...binding, file: '/private/source.glb' },
      ])
    ).toThrow();
    expect(() =>
      parseMaterialChannelBindings([
        { ...binding, assetRef: '/private/source.glb' },
      ])
    ).toThrow();
    expect(() =>
      parseMaterialChannelBindings([{ ...binding, targets: new Array(1) }])
    ).toThrow();
    expect(() => parseMaterialChannelBindings(new Array(1))).toThrow();
  });
});
