import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  cloneRegionLightingMaterial,
  createRegionLightingFieldTextures,
  patchRegionLightingShader,
  sampleRegionFloorPoints,
  updateRegionLightingPoints,
} from './regionLightingMaterials';
import { createTestLightingBinding } from './regionLightingTestFixtures';
import { buildSpatialBackgroundField } from './spatialBackgroundField';

describe('owned region lighting adapters / Three chunk contract', () => {
  it.each([
    new THREE.MeshStandardMaterial(),
    new THREE.MeshPhysicalMaterial({ clearcoat: 1, sheen: 1 }),
  ])(
    'patches directional and indirect only on $type; keeps point and emissive paths byte-identical',
    (source) => {
      const binding = createTestLightingBinding();
      const map = new THREE.Texture();
      source.map = map;
      source.normalMap = map;
      source.roughness = 0.7;
      source.emissive.set('#ffa500');
      source.side = THREE.DoubleSide;
      const original = source.toJSON();
      const result = cloneRegionLightingMaterial(
        source,
        binding,
        'lit',
        'test'
      );
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      const material = result.material as THREE.MeshStandardMaterial;
      expect(material).not.toBe(source);
      expect(material.map).toBe(map);
      expect(material.normalMap).toBe(map);
      expect(material.side).toBe(source.side);
      expect(material.roughness).toBe(0.7);
      expect(material.emissive.equals(source.emissive)).toBe(true);
      expect(source.toJSON()).toEqual(original);
      const patched = patchRegionLightingShader(
        THREE.ShaderLib.physical.vertexShader,
        THREE.ShaderLib.physical.fragmentShader,
        'lit'
      );
      const pointPart = (text: string): string =>
        text.slice(
          text.indexOf('#if ( NUM_POINT_LIGHTS'),
          text.indexOf('#if ( NUM_SPOT_LIGHTS')
        );
      expect(pointPart(patched.fragmentShader)).toBe(
        pointPart(THREE.ShaderChunk.lights_fragment_begin)
      );
      expect(patched.fragmentShader).toContain('directLight.color *= rlSample');
      for (const name of [
        'irradiance',
        'iblIrradiance',
        'radiance',
        'clearcoatRadiance',
      ])
        expect(patched.fragmentShader).toContain(`${name} *= rlBackground`);
      const outgoing =
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';
      expect(patched.fragmentShader).toContain(outgoing);
      expect(patched.vertexShader).toContain(
        'rlPosition = batchingMatrix * rlPosition'
      );
      expect(patched.vertexShader).toContain(
        'rlPosition = instanceMatrix * rlPosition'
      );
      expect(
        patched.vertexShader.indexOf('#include <skinning_vertex>')
      ).toBeLessThan(patched.vertexShader.indexOf('vec4 rlPosition'));
      const key = material.customProgramCacheKey();
      binding.uniforms.rlBounds.value.set(-10, 10, -10, 10);
      binding.uniforms.rlPointCount.value = 5;
      expect(material.customProgramCacheKey()).toBe(key);
      expect(source.toJSON()).toEqual(original);
      material.dispose();
      binding.dispose();
    }
  );
  it('Basic is opt-in configured-only, textured legacy output with independent additive linear local response', () => {
    const binding = createTestLightingBinding(),
      source = new THREE.MeshBasicMaterial({
        map: new THREE.Texture(),
        color: '#8f8b82',
        toneMapped: false,
      });
    const result = cloneRegionLightingMaterial(
      source,
      binding,
      'workspace-basic'
    );
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect((result.material as THREE.MeshBasicMaterial).map).toBe(source.map);
      expect(result.material.toneMapped).toBe(false);
      result.material.dispose();
    }
    const patched = patchRegionLightingShader(
      THREE.ShaderLib.basic.vertexShader,
      THREE.ShaderLib.basic.fragmentShader,
      'workspace-basic'
    );
    expect(patched.fragmentShader).toContain(
      'if(rlRegion.y>0.0) outgoingLight = outgoingLight * rlRegion.x + diffuseColor.rgb * rlFloorPoints();'
    );
    expect(patched.fragmentShader).toContain('#include <map_fragment>');
    expect(
      sampleRegionFloorPoints(binding.uniforms, new THREE.Vector3()).length()
    ).toBe(0);
    updateRegionLightingPoints(binding.uniforms, [
      {
        key: 'declared',
        position: [0, 2, 0],
        color: '#ff8040',
        intensity: 8,
        distance: 6,
      },
    ]);
    const term = sampleRegionFloorPoints(binding.uniforms, new THREE.Vector3()),
      color = new THREE.Color('#ff8040').multiplyScalar(8);
    const scalar = (1 - (2 / 6) ** 4) ** 2 / 4 / Math.PI;
    expect(term.x).toBeCloseTo(color.r * scalar);
    expect(term.y).toBeCloseTo(color.g * scalar);
    binding.uniforms.rlBounds.value.set(-2, 2, -2, 2);
    expect(
      sampleRegionFloorPoints(binding.uniforms, new THREE.Vector3())
    ).toEqual(term);
    expect(
      sampleRegionFloorPoints(
        binding.uniforms,
        new THREE.Vector3(7, 0, 0)
      ).length()
    ).toBe(0);
    updateRegionLightingPoints(binding.uniforms, []);
    expect(binding.uniforms.rlPointCount.value).toBe(0);
    expect(
      binding.uniforms.rlPointColors.value.every((c) => c.length() === 0)
    ).toBe(true);
    binding.dispose();
  });
  it('refuses unknown hook, Basic GLB, shader material and missing/duplicate sentinels with diagnostics', () => {
    const binding = createTestLightingBinding();
    expect(
      cloneRegionLightingMaterial(new THREE.MeshBasicMaterial(), binding, 'lit')
        .status
    ).toBe('unsupported');
    expect(
      cloneRegionLightingMaterial(new THREE.ShaderMaterial(), binding, 'lit')
        .status
    ).toBe('unsupported');
    const hooked = new THREE.MeshStandardMaterial();
    hooked.onBeforeCompile = vi.fn();
    expect(cloneRegionLightingMaterial(hooked, binding, 'lit')).toMatchObject({
      status: 'unsupported',
      diagnostic: { reason: 'unsupported-hook' },
    });
    const keyed = new THREE.MeshStandardMaterial();
    keyed.customProgramCacheKey = () => 'custom';
    expect(cloneRegionLightingMaterial(keyed, binding, 'lit').status).toBe(
      'unsupported'
    );
    expect(() =>
      patchRegionLightingShader(
        '',
        THREE.ShaderLib.standard.fragmentShader,
        'lit'
      )
    ).toThrow('project_vertex');
    expect(() =>
      patchRegionLightingShader(
        THREE.ShaderLib.standard.vertexShader,
        '#include <lights_fragment_begin>\n#include <lights_fragment_begin>',
        'lit'
      )
    ).toThrow();
    binding.dispose();
  });
  it('packs nearest no-color-space textures and refuses GPU capacity rather than truncating', () => {
    const field = buildSpatialBackgroundField([
      {
        id: 'one',
        background: 1,
        ring: [
          { x: 0, z: 0 },
          { x: 1, z: 0 },
          { x: 0, z: 1 },
        ],
      },
    ]);
    expect(() => createRegionLightingFieldTextures(field, 1)).toThrow(
      'capacity'
    );
    const textures = createRegionLightingFieldTextures(field, 4096);
    for (const t of [textures.triangles, textures.heads, textures.candidates]) {
      expect(t.minFilter).toBe(THREE.NearestFilter);
      expect(t.colorSpace).toBe(THREE.NoColorSpace);
      expect(t.type).toBe(THREE.FloatType);
    }
    const data = textures.triangles.image.data!;
    expect(Array.from(data.slice(0, 8))).toEqual(Array.from(field.triangles));
    const dispose = vi.spyOn(textures.triangles, 'dispose');
    textures.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
