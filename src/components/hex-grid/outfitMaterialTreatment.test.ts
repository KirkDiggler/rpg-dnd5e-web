import { resolveOutfitPresentation } from '@/character/customization/outfitCustomization';
import { create } from '@bufbuild/protobuf';
import { OutfitCustomizationSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  prepareOutfitMaterial,
  updateOutfitMaterial,
} from './outfitMaterialTreatment';

function fighterPresentation(overrides = {}) {
  const presentation = resolveOutfitPresentation({
    classRefId: 'fighter',
    customization: {
      outfit: create(OutfitCustomizationSchema, {
        primaryColorSrgb: 0x123456,
        secondaryColorSrgb: 0xabcdef,
      }),
    },
  });
  if ('presentation' in presentation)
    throw new Error('Expected fighter profile');
  return { ...presentation, ...overrides };
}

describe('outfit material treatment', () => {
  it('clones a standard source, dyes at map_fragment, and leaves source/map/mask ownership intact', () => {
    const map = new THREE.Texture();
    const mask = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({ map, color: 0xeeeeee });
    const prepared = prepareOutfitMaterial(source, mask, fighterPresentation());
    const shader = { fragmentShader: '#include <map_fragment>', uniforms: {} };

    prepared.material.onBeforeCompile(
      shader as never,
      {} as THREE.WebGLRenderer
    );

    expect(prepared.material).not.toBe(source);
    expect(source.map).toBe(map);
    expect(prepared.material.map).toBe(map);
    expect(prepared.uniforms.outfitMask.value).toBe(mask);
    expect(prepared.uniforms.usePrimary.value).toBe(1);
    expect(prepared.uniforms.useSecondary.value).toBe(1);
    expect(shader.fragmentShader).toContain('texture2D(outfitMask, vMapUv)');
    expect(shader.fragmentShader).toContain('outfitMaskSample.r');
    expect(shader.fragmentShader).toContain('outfitMaskSample.g');
    expect(prepared.material.customProgramCacheKey()).toBe(
      'class-outfit-colors-v1'
    );
  });

  it('updates uniform values in place without replacing material, source map, or mask texture', () => {
    const map = new THREE.Texture();
    const mask = new THREE.Texture();
    const prepared = prepareOutfitMaterial(
      new THREE.MeshStandardMaterial({ map }),
      mask,
      fighterPresentation()
    );
    const before = {
      material: prepared.material.uuid,
      map: prepared.material.map?.uuid,
      mask: prepared.uniforms.outfitMask.value.uuid,
      uniforms: prepared.uniforms,
    };

    updateOutfitMaterial(
      prepared,
      fighterPresentation({
        primaryColor: '#000000',
        secondaryColor: undefined,
        usePrimary: true,
        useSecondary: false,
      })
    );

    expect(prepared.material.uuid).toBe(before.material);
    expect(prepared.material.map?.uuid).toBe(before.map);
    expect(prepared.uniforms.outfitMask.value.uuid).toBe(before.mask);
    expect(prepared.uniforms).toBe(before.uniforms);
    expect(prepared.uniforms.primaryColor.value.getHex()).toBe(0);
    expect(prepared.uniforms.usePrimary.value).toBe(1);
    expect(prepared.uniforms.useSecondary.value).toBe(0);
  });
});
