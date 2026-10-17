import '@testing-library/jest-dom/vitest';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  definitionForSlot,
  inventoryUrl,
  NEUTRAL_BASE_SRGB,
  overrideDefinitionId,
  parseEditingProfile,
  parseMaterialEditorManifest,
  resetSlotOverride,
  resolvedSlotChannels,
  serializeEditingProfile,
  setSlotChannels,
  slotKey,
  validateEditingProfile,
  type EditingProfile,
  type MaterialEditorManifest,
} from './materialRecipe';
import {
  FIXTURE_OBJECT_NAME,
  FIXTURE_SOURCE_PATH,
  materialEditorManifestFixture,
} from './materialRecipe.testFixtures';
import {
  applyChannels,
  applySlotBindings,
  applyTextureError,
  ImageTextureFactory,
} from './slotMaterials';

const manifestFixture = (): MaterialEditorManifest =>
  parseMaterialEditorManifest(materialEditorManifestFixture());

describe('live editing of an audited but unassigned source slot', () => {
  it('renders an explicit draft override even without a prepared recipe binding', () => {
    const manifest = manifestFixture();
    manifest.recipes.recipeBindings = [];
    const profile = manifest.profile;
    const definition = {
      label: 'Direct trial',
      baseColor: 'Texture/Clay_Texture_01.tga',
      normal: null,
      emissive: null,
      wrap: 'repeat' as const,
    };
    const changed = setSlotChannels(
      profile,
      manifest,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      1,
      definition
    );
    const resolved = resolvedSlotChannels(
      changed,
      manifest,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      1
    );
    expect(resolved.channels.baseColor?.path).toBe(
      'Texture/Clay_Texture_01.tga'
    );
    expect(resolved.scope).toBe('slot-override');
    expect(manifest.recipes.recipeBindings).toHaveLength(0);
  });
  it('does not display an unestablished family suggestion as applied channels', () => {
    const manifest = manifestFixture();
    manifest.recipes.recipeBindings = [];
    const definition = definitionForSlot(
      manifest.profile,
      manifest,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      0
    );
    expect(definition.baseColor).toBeNull();
    expect(definition.normal).toBeNull();
    expect(
      resolvedSlotChannels(
        manifest.profile,
        manifest,
        FIXTURE_SOURCE_PATH,
        FIXTURE_OBJECT_NAME,
        0
      ).definitionId
    ).toBeNull();
  });
});

describe('material-editor manifest parsing', () => {
  it('parses the prepared v3 document with slot targets and inventory', () => {
    const manifest = manifestFixture();
    expect(manifest.mode).toBe('material-editor');
    expect(manifest.profile.schemaVersion).toBe(2);
    expect(manifest.editor.sources).toHaveLength(1);
    const source = manifest.editor.sources[0]!;
    expect(source.targets[0]!.target).toEqual({
      mesh: 0,
      primitive: 0,
      material: 0,
      materialName: `MaterialReviewSlot_${FIXTURE_OBJECT_NAME}_0`,
    });
    expect(manifest.recipes.recipeBindings[0]!.scope).toBe('family-default');
    expect(manifest.inventory.images[1]!.preview?.format).toBe('png');
    expect(
      manifest.auditedSlots[FIXTURE_SOURCE_PATH]!.objects[FIXTURE_OBJECT_NAME]!
        .materialNames
    ).toEqual(['Stone_01', 'Brick_Medium_01']);
  });

  it('rejects non-editor modes and unsafe URLs', () => {
    const raw = materialEditorManifestFixture();
    expect(() =>
      parseMaterialEditorManifest({ ...raw, mode: 'material-preview' })
    ).toThrow(/Not a material-editor manifest/);
    expect(() =>
      parseMaterialEditorManifest({ ...raw, schemaVersion: 2 })
    ).toThrow(/schemaVersion 3/);
    const unsafe = structuredClone(raw);
    unsafe.editor.sources[0]!.glb.url = 'https://elsewhere/model.glb';
    expect(() => parseMaterialEditorManifest(unsafe)).toThrow(
      /Unsafe or unbound editor GLB URL/
    );
  });

  it('rejects rendered targets without a mapping and duplicate targets', () => {
    const missingMapping = structuredClone(materialEditorManifestFixture());
    missingMapping.editor.sources[0]!.targets[0]!.target = null;
    expect(() => parseMaterialEditorManifest(missingMapping)).toThrow(
      /Rendered editor targets must carry their glTF mapping/
    );
    const duplicated = structuredClone(materialEditorManifestFixture());
    duplicated.editor.sources[0]!.targets = [
      duplicated.editor.sources[0]!.targets[0]!,
      duplicated.editor.sources[0]!.targets[0]!,
    ];
    expect(() => parseMaterialEditorManifest(duplicated)).toThrow(
      /Duplicate editor target/
    );
  });

  it('rejects inventory images with neither a loadable URL nor a derivative', () => {
    const raw = materialEditorManifestFixture();
    delete raw.inventory.images[1]!.preview;
    expect(() => parseMaterialEditorManifest(raw)).toThrow(
      /loadable URL or derivative/
    );
  });
});

describe('editing profile (schemaVersion 2)', () => {
  it('round-trips through serialize/parse including explicit channels', () => {
    const manifest = manifestFixture();
    const profile = manifest.profile;
    const edited = setSlotChannels(
      profile,
      manifest,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      1,
      {
        label: 'Brick slot',
        baseColor: 'Texture/Clay_Texture_01.tga',
        normal: { image: 'Texture/Stone_Normals_01.png', strength: 0.5 },
        emissive: { image: null, color: '334455', strength: 2 },
        wrap: 'clamp',
      }
    );
    const roundTrip = parseEditingProfile(
      JSON.parse(serializeEditingProfile(edited))
    );
    expect(roundTrip).toEqual(edited);
    // Emissive color is stored uppercase six-hex; image null stays null.
    expect(
      roundTrip.definitions[roundTrip.assignments.slotOverrides[0]!.definition]!
        .emissive
    ).toEqual({ image: null, color: '334455', strength: 2 });
    expect(
      roundTrip.definitions[roundTrip.assignments.slotOverrides[0]!.definition]!
        .wrap
    ).toBe('clamp');
  });

  it('rejects structural violations loudly', () => {
    const manifest = manifestFixture();
    const raw = JSON.parse(serializeEditingProfile(manifest.profile));
    expect(() => parseEditingProfile({ ...raw, schemaVersion: 1 })).toThrow(
      /schemaVersion 2/
    );
    const badNormal = structuredClone(raw);
    badNormal.definitions['wall-stone'].normal = { image: null, strength: 1 };
    expect(() => parseEditingProfile(badNormal)).toThrow(
      /normal channel must name an image/
    );
    const duplicate = structuredClone(raw);
    const override = {
      sourcePath: FIXTURE_SOURCE_PATH,
      objectName: FIXTURE_OBJECT_NAME,
      slot: 1,
      definition: 'wall-stone',
    };
    duplicate.assignments.slotOverrides.push(override, { ...override });
    expect(() => parseEditingProfile(duplicate)).toThrow(
      /Duplicate slot override target/
    );
    const both = structuredClone(raw);
    both.selections = { Stone_01: 'some-option' };
    expect(() => parseEditingProfile(both)).toThrow(
      /both a legacy selection and a definition default/
    );
    const unknown = structuredClone(raw);
    unknown.definitions['wall-stone'].emissive = {
      image: '../escape.png',
      color: '#FF0000',
      strength: 1,
    };
    expect(() => parseEditingProfile(unknown)).toThrow(
      /normalized relative POSIX path/
    );
  });
});

describe('slot resolution and per-slot scope', () => {
  it('resolves family-default, override and unassigned scopes', () => {
    const manifest = manifestFixture();
    const slot0 = resolvedSlotChannels(
      manifest.profile,
      manifest,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      0
    );
    expect(slot0.scope).toBe('family-default');
    expect(slot0.channels.baseColor?.path).toBe('Texture/Stone_Texture_01.png');
    const slot1 = resolvedSlotChannels(
      manifest.profile,
      manifest,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      1
    );
    expect(slot1.scope).toBe('unassigned');
    expect(slot1.channels).toEqual({
      baseColor: null,
      normal: null,
      emissive: null,
      wrap: 'repeat',
    });
  });

  it('edits stay scoped to the chosen slot; the other slot is untouched', () => {
    const manifest = manifestFixture();
    const edited = setSlotChannels(
      manifest.profile,
      manifest,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      1,
      {
        label: 'Brick slot',
        baseColor: 'Texture/Clay_Texture_01.tga',
        normal: null,
        emissive: null,
        wrap: 'repeat',
      }
    );
    expect(edited.assignments.slotOverrides).toHaveLength(1);
    expect(edited.assignments.slotOverrides[0]!.slot).toBe(1);
    // Slot 0 still resolves through its family default with the same image.
    expect(
      resolvedSlotChannels(
        edited,
        manifest,
        FIXTURE_SOURCE_PATH,
        FIXTURE_OBJECT_NAME,
        0
      ).channels.baseColor?.path
    ).toBe('Texture/Stone_Texture_01.png');
    // The family default definition object itself is untouched.
    expect(edited.definitions['wall-stone']).toEqual(
      manifest.profile.definitions['wall-stone']
    );
  });

  it('reuses the slot override definition on later edits of the same slot', () => {
    const manifest = manifestFixture();
    const first = overrideDefinitionId(
      manifest.profile,
      manifest,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      0
    );
    expect(first.profile.assignments.slotOverrides).toHaveLength(1);
    const second = overrideDefinitionId(
      first.profile,
      manifest,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      0
    );
    expect(second.definitionId).toBe(first.definitionId);
    expect(second.profile.assignments.slotOverrides).toHaveLength(1);
  });

  it('reset restores the prepared state and drops an unused definition', () => {
    const manifest = manifestFixture();
    const edited = setSlotChannels(
      manifest.profile,
      manifest,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      1,
      {
        label: 'Brick slot',
        baseColor: 'Texture/Clay_Texture_01.tga',
        normal: null,
        emissive: null,
        wrap: 'repeat',
      }
    );
    const reset = resetSlotOverride(
      edited,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      1
    );
    expect(reset.assignments.slotOverrides).toHaveLength(0);
    expect(Object.keys(reset.definitions)).toEqual(['wall-stone']);
    expect(reset).toEqual(manifest.profile);
  });

  it('definitionForSlot builds from the resolved recipe for unowned slots', () => {
    const manifest = manifestFixture();
    const family = definitionForSlot(
      manifest.profile,
      manifest,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      0
    );
    expect(family.baseColor).toBe('Texture/Stone_Texture_01.png');
    expect(family.label).toBe('Wall stone');
    const unassigned = definitionForSlot(
      manifest.profile,
      manifest,
      FIXTURE_SOURCE_PATH,
      FIXTURE_OBJECT_NAME,
      1
    );
    expect(unassigned.baseColor).toBeNull();
    expect(unassigned.emissive).toBeNull();
    expect(unassigned.label).toBe('Brick_Medium_01');
  });

  it('validates profile identity and audited slot targets on import', () => {
    const manifest = manifestFixture();
    const wrongPack = {
      ...manifest.profile,
      packSlug: 'different-pack',
    } as EditingProfile;
    expect(() => validateEditingProfile(wrongPack, manifest)).toThrow(
      /pack differs/
    );
    const raw = JSON.parse(serializeEditingProfile(manifest.profile));
    raw.assignments.slotOverrides.push({
      sourcePath: FIXTURE_SOURCE_PATH,
      objectName: FIXTURE_OBJECT_NAME,
      slot: 9,
      definition: 'wall-stone',
    });
    expect(() =>
      validateEditingProfile(parseEditingProfile(raw), manifest)
    ).toThrow(/out of range/);
    raw.assignments.slotOverrides[0].slot = 0;
    raw.assignments.slotOverrides[0].sourcePath = 'FBX/Unknown.fbx';
    expect(() =>
      validateEditingProfile(parseEditingProfile(raw), manifest)
    ).toThrow(/no audited source/);
  });

  it('resolves inventory paths to loadable URLs including TGA derivatives', () => {
    const manifest = manifestFixture();
    expect(inventoryUrl(manifest, 'Texture/Stone_Texture_01.png')).toBe(
      `/models/synty/asset-review-editor/images/${'7'.repeat(64)}.png`
    );
    expect(inventoryUrl(manifest, 'Texture/Clay_Texture_01.tga')).toBe(
      `/models/synty/asset-review-editor/images/${'9'.repeat(64)}.png`
    );
    expect(inventoryUrl(manifest, 'Texture/Missing.png')).toBeNull();
  });
});

describe('real three.js channel application', () => {
  const texture = () => new THREE.Texture();

  it('applies an sRGB base image with an untinted white factor and wrap', () => {
    const material = new THREE.MeshStandardMaterial();
    const map = texture();
    applyChannels(
      material,
      {
        baseColor: { path: 'Texture/Stone_Texture_01.png', sha256: 'x' },
        normal: null,
        emissive: null,
        wrap: 'clamp',
      },
      { baseColor: map, normal: null, emissive: null }
    );
    expect(material.map).toBe(map);
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(map.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(map.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(material.color.getHexString(THREE.SRGBColorSpace)).toBe('ffffff');
  });

  it('renders the neutral solid base when no image is selected', () => {
    const material = new THREE.MeshStandardMaterial({ color: '#ff0000' });
    applyChannels(
      material,
      { baseColor: null, normal: null, emissive: null, wrap: 'repeat' },
      { baseColor: null, normal: null, emissive: null }
    );
    expect(material.map).toBeNull();
    expect(material.color.getHexString(THREE.SRGBColorSpace)).toBe(
      NEUTRAL_BASE_SRGB.replace('#', '').toLowerCase()
    );
  });

  it('maps normal strength to normalScale and keeps normal data linear', () => {
    const material = new THREE.MeshStandardMaterial();
    const normalMap = texture();
    applyChannels(
      material,
      {
        baseColor: null,
        normal: {
          path: 'Texture/Stone_Normals_01.png',
          sha256: 'x',
          strength: 0.75,
        },
        emissive: null,
        wrap: 'repeat',
      },
      { baseColor: null, normal: normalMap, emissive: null }
    );
    expect(material.normalMap).toBe(normalMap);
    expect(normalMap.colorSpace).not.toBe(THREE.SRGBColorSpace);
    expect(material.normalScale.x).toBeCloseTo(0.75);
    expect(material.normalScale.y).toBeCloseTo(0.75);
  });

  it('keeps emissive off, solid and image states independently expressible', () => {
    const material = new THREE.MeshStandardMaterial();
    applyChannels(
      material,
      { baseColor: null, normal: null, emissive: null, wrap: 'repeat' },
      { baseColor: null, normal: null, emissive: null }
    );
    expect(material.emissive.getHexString()).toBe('000000');
    expect(material.emissiveMap).toBeNull();

    applyChannels(
      material,
      {
        baseColor: null,
        normal: null,
        // Bare six-hex exactly as the editing profile stores colors.
        emissive: { image: null, color: '00FF00', strength: 2.5 },
        wrap: 'repeat',
      },
      { baseColor: null, normal: null, emissive: null }
    );
    expect(material.emissiveMap).toBeNull();
    expect(material.emissive.getHexString(THREE.SRGBColorSpace)).toBe('00ff00');
    expect(material.emissiveIntensity).toBeCloseTo(2.5);

    const emissiveMap = texture();
    applyChannels(
      material,
      {
        baseColor: null,
        normal: null,
        emissive: {
          image: { path: 'Texture/Glow_01.png', sha256: 'x' },
          color: 'FFFFFF',
          strength: 1.5,
        },
        wrap: 'repeat',
      },
      { baseColor: null, normal: null, emissive: emissiveMap }
    );
    expect(material.emissiveMap).toBe(emissiveMap);
    expect(emissiveMap.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(material.emissiveIntensity).toBeCloseTo(1.5);
  });

  it('marks a failed image as an explicit error instead of a white material', () => {
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
    applyTextureError(material);
    expect(material.map).toBeNull();
    expect(material.color.getHexString()).toBe('ff4ca8');
  });

  it('gives independent Texture instances per use of one cached image', async () => {
    const factory = new ImageTextureFactory(async (url) => {
      if (url.startsWith('bad://'))
        throw new Error(`Image failed to load: ${url}`);
      return { src: url } as unknown as HTMLImageElement;
    });
    const first = await factory.texture('Texture/Stone_Texture_01.png');
    const second = await factory.texture('Texture/Stone_Texture_01.png');
    expect(first.texture).not.toBe(second.texture);
    expect(first.texture.flipY).toBe(false);
    expect(second.texture.flipY).toBe(false);
    // Default THREE.Texture wrap is clamp; one copy is re-wrapped without
    // leaking into the other instance decoded from the same image.
    first.texture.wrapS = THREE.RepeatWrapping;
    expect(second.texture.wrapS).not.toBe(THREE.RepeatWrapping);
    first.release();
    second.release();
    await expect(factory.image('bad://url')).rejects.toThrow();
  });
});

describe('slot target mapping against the rendered clone', () => {
  function glbFixture() {
    const names = [
      `MaterialReviewSlot_${FIXTURE_OBJECT_NAME}_0`,
      `MaterialReviewSlot_${FIXTURE_OBJECT_NAME}_1`,
    ];
    const geometry = new THREE.BoxGeometry();
    const mesh = new THREE.Mesh(
      geometry,
      names.map((name) => new THREE.MeshStandardMaterial({ name }))
    );
    const scene = new THREE.Scene();
    scene.add(mesh);
    const gltf = {
      scene,
      parser: {
        json: {
          meshes: [{ primitives: [{ material: 0 }, { material: 1 }] }],
          materials: [{ name: names[0] }, { name: names[1] }],
        },
      },
    };
    const source = materialEditorManifestFixture().editor.sources[0]!;
    return { gltf, source };
  }

  it('assigns cloned slot materials into the rendered clone, not the loaded scene', () => {
    const { gltf, source } = glbFixture();
    const clone = gltf.scene.clone(true);
    const { bindings, problems } = applySlotBindings(clone, gltf, source);
    expect(problems).toEqual([]);
    expect(bindings.size).toBe(2);
    for (const slot of [0, 1]) {
      const binding = bindings.get(
        slotKey(FIXTURE_SOURCE_PATH, FIXTURE_OBJECT_NAME, slot)
      )!;
      const rendered = (clone.children[0] as THREE.Mesh)
        .material as THREE.Material[];
      // The rendered clone carries the assigned clone at the slot's index...
      expect(rendered[slot]).toBe(binding.material);
      // ...while the loaded GLB scene keeps its original materials untouched.
      const loaded = (gltf.scene.children[0] as THREE.Mesh)
        .material as THREE.Material[];
      expect(loaded[slot]).not.toBe(binding.material);
      expect(loaded[slot]!.name).toBe(
        `MaterialReviewSlot_${FIXTURE_OBJECT_NAME}_${slot}`
      );
      // And the binding material is a distinct clone per slot.
      expect(binding.material.name).toBe(
        `MaterialReviewSlot_${FIXTURE_OBJECT_NAME}_${slot}`
      );
    }
  });

  it('reports problems when the manifest mapping disagrees with the GLB', () => {
    const { gltf } = glbFixture();
    const wrong = structuredClone(materialEditorManifestFixture());
    wrong.editor.sources[0]!.targets[0]!.target!.primitive = 7;
    const clone = gltf.scene.clone(true);
    const { problems } = applySlotBindings(
      clone,
      gltf,
      wrong.editor.sources[0]!
    );
    expect(
      problems.some((p: string) => p.includes('does not match the loaded GLB'))
    ).toBe(true);
  });
});

describe('slotKey', () => {
  it('distinguishes slots of the same object', () => {
    expect(slotKey(FIXTURE_SOURCE_PATH, FIXTURE_OBJECT_NAME, 0)).not.toBe(
      slotKey(FIXTURE_SOURCE_PATH, FIXTURE_OBJECT_NAME, 1)
    );
  });
});
