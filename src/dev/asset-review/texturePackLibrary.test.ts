import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseMaterialEditorManifest } from './materialRecipe';
import { materialEditorManifestFixture } from './materialRecipe.testFixtures';
import {
  addPack,
  allowedPacks,
  assignPack,
  createLibrary,
  parseLibrary,
  putSet,
  removePack,
  reviewDeclaration,
  serializeLibrary,
  validateLibrary,
  type TexturePackLibrary,
} from './texturePackLibrary';

const manifest = () =>
  parseMaterialEditorManifest(materialEditorManifestFixture());
const set = () => ({
  label: '01_A',
  baseColor: 'Texture/Stone_Texture_01.png',
  normal: null,
  emissive: null,
  wrap: 'clamp' as const,
});
function target() {
  const m = manifest(),
    s = m.editor.sources[0]!,
    t = s.targets.find((t) => t.rendered)!;
  return { sourcePath: s.sourcePath, objectName: t.objectName, slot: t.slot };
}
function library(): TexturePackLibrary {
  return addPack(
    createLibrary('my-library', manifest()),
    'kingdom',
    'Kingdom atlas',
    { '01_A': set() }
  );
}

describe('shared texture packs', () => {
  it('stores twelve complete choices once and references them from multiple slots', () => {
    const sets = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `choice-${i}`,
        { ...set(), label: `Choice ${i}` },
      ])
    );
    let l = addPack(
      createLibrary('my-library', manifest()),
      'kingdom',
      'Kingdom atlas',
      sets
    );
    const t = target();
    l = assignPack(l, 'kingdom', [t, { ...t, slot: 1 }], manifest());
    expect(Object.keys(l.packs.kingdom!.sets)).toHaveLength(12);
    expect(l.assignments.map((a) => a.packs)).toEqual([
      ['kingdom'],
      ['kingdom'],
    ]);
    expect(l.assignments[0]).not.toHaveProperty('sets');
  });
  it('round-trips optional normal/emissive fields and explicit off without source hashes', () => {
    let l = library();
    l = putSet(
      l,
      'kingdom',
      'brick',
      {
        ...set(),
        label: 'Brick',
        normal: { image: set().baseColor!, strength: 0.5 },
        emissive: { image: set().baseColor!, color: 'FFFFFF', strength: 2 },
      },
      manifest()
    );
    const wire = serializeLibrary(l);
    expect(parseLibrary(JSON.parse(wire))).toEqual(l);
    expect(wire).not.toContain('sha256');
    expect(l.packs.kingdom!.sets['01_A']!.normal).toBeNull();
  });
  it('does not mutate the input library or assign a preview/default by assigning a pack', () => {
    const original = library(),
      t = target();
    const changed = assignPack(original, 'kingdom', [t], manifest());
    expect(original.assignments).toEqual([]);
    expect(changed.assignments[0]).not.toHaveProperty('selection');
    expect(manifest().profile.assignments.slotOverrides).toEqual([]);
  });
  it('merges explicit allowed packs and cleans references on pack removal', () => {
    const t = target();
    let l = addPack(library(), 'wall', 'Wall finishes', { brick: set() });
    l = assignPack(
      assignPack(l, 'kingdom', [t], manifest()),
      'wall',
      [t],
      manifest()
    );
    expect(allowedPacks(l, t)).toEqual(['kingdom', 'wall']);
    l = removePack(l, 'kingdom');
    expect(allowedPacks(l, t)).toEqual(['wall']);
    l = removePack(l, 'wall');
    expect(l.assignments).toEqual([]);
  });
  it('rejects neutral sets, unknown images, malformed strengths, unknown packs and unrendered slots', () => {
    expect(() =>
      addPack(createLibrary('x', manifest()), 'neutral', 'Neutral', {
        a: { ...set(), baseColor: null },
      })
    ).toThrow(/color/i);
    const l = library();
    expect(() =>
      putSet(
        l,
        'kingdom',
        'bad',
        { ...set(), baseColor: 'Missing.png' },
        manifest()
      )
    ).toThrow(/image/i);
    expect(() =>
      putSet(
        l,
        'kingdom',
        'bad',
        { ...set(), normal: { image: set().baseColor!, strength: -1 } },
        manifest()
      )
    ).toThrow();
    expect(() => assignPack(l, 'missing', [target()], manifest())).toThrow();
    expect(() =>
      assignPack(l, 'kingdom', [{ ...target(), slot: 99 }], manifest())
    ).toThrow(/target/i);
    expect(() =>
      parseLibrary({ ...JSON.parse(serializeLibrary(l)), trusted: true })
    ).toThrow();
  });
  it('refuses membership drift and wrong source without altering the existing library', () => {
    const l = assignPack(library(), 'kingdom', [target()], manifest());
    const old = serializeLibrary(l);
    const changed = manifest();
    changed.editor.sources[0]!.targets = [];
    expect(() => validateLibrary(l, changed)).toThrow(/target/i);
    expect(() =>
      validateLibrary({ ...l, packVersion: 'foreign' }, manifest())
    ).toThrow(/pack/i);
    expect(serializeLibrary(l)).toBe(old);
  });
  it('exports exact source/editor identities and deduplicated image resources as review-only', async () => {
    vi.stubGlobal('crypto', webcrypto);
    try {
      const l = assignPack(
        library(),
        'kingdom',
        [target(), { ...target(), slot: 1 }],
        manifest()
      );
      const declaration = await reviewDeclaration(l, manifest());
      expect(declaration.status).toBe('review-only');
      expect(declaration.images).toHaveLength(1);
      expect(declaration.assignments).toHaveLength(2);
      expect(declaration.assignments[0]!.editorGlbSha256).toBe(
        manifest().editor.sources[0]!.glb.sha256
      );
      expect(declaration.librarySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(declaration.assignments[0]).not.toHaveProperty('assetRef');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
