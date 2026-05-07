/**
 * AdvancedCharacterShader instancing-support regression tests
 *
 * Why this test exists:
 *
 * `ShadedHexFloor` (Drop-in replacement for `InstancedHexTiles`) uses this
 * shader on a `THREE.InstancedMesh` to render every revealed-room floor tile
 * in one draw call. Three.js auto-defines `USE_INSTANCING` and provides the
 * `instanceMatrix` attribute when a material is on an InstancedMesh, BUT it
 * does NOT auto-rewrite a custom ShaderMaterial's `vertexShader` source —
 * the shader has to multiply by `instanceMatrix` itself.
 *
 * If the multiply is missing, every instance renders at the geometry's local
 * origin → all 18*16 = 288 hex tiles stack on top of each other at world
 * (0,0,0) and the player only ever sees a single floor hex at the corner.
 * That was the Wave 2 "only the (0,0,0) hex shows" bug.
 *
 * These tests inspect the GLSL source string. They are intentionally lo-fi:
 * we want a hard regression guard, not a full GPU pipeline test (the latter
 * needs a real WebGL context which vitest's jsdom env can't provide).
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createAdvancedCharacterShader } from './AdvancedCharacterShader';

function newShader(): THREE.ShaderMaterial {
  // Minimal 1x1 texture so createSolidColorTexture-style code paths don't
  // crash inside jsdom.
  const data = new Uint8Array([255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return createAdvancedCharacterShader(texture);
}

describe('AdvancedCharacterShader instancing support', () => {
  it('vertex shader applies instanceMatrix when USE_INSTANCING is defined', () => {
    const material = newShader();
    const src = material.vertexShader;

    // Must reference instanceMatrix gated by USE_INSTANCING. Without this,
    // every InstancedMesh instance renders at the geometry's local origin.
    expect(src).toContain('USE_INSTANCING');
    expect(src).toContain('instanceMatrix');
    // The actual multiply that puts each instance at its own world position.
    expect(src).toMatch(/instanceMatrix\s*\*\s*vec4\(\s*position/);
  });

  it('vertex shader passes per-instance color through a varying', () => {
    const material = newShader();
    const src = material.vertexShader;

    // Per-tile shading variation + hover/selected/door/wall highlights flow
    // through `instanceColor` -> `vInstanceColor` for the fragment shader.
    expect(src).toContain('USE_INSTANCING_COLOR');
    expect(src).toContain('varying vec3 vInstanceColor');
    expect(src).toContain('vInstanceColor = instanceColor');
    // Non-instanced meshes (characters, hair) must still get a sane default
    // so the fragment shader doesn't read undefined and clobber the texture
    // marker pipeline.
    expect(src).toMatch(/vInstanceColor\s*=\s*vec3\(\s*1\.0\s*\)/);
  });

  it('fragment shader replaces final color with vInstanceColor when instancing color is enabled', () => {
    const material = newShader();
    const src = material.fragmentShader;

    expect(src).toContain('varying vec3 vInstanceColor');
    // Override is gated so character (non-instanced) rendering keeps using
    // the texture-marker color pipeline.
    expect(src).toMatch(
      /#ifdef\s+USE_INSTANCING_COLOR[\s\S]+finalColor\s*=\s*vInstanceColor/
    );
  });

  it('keeps the non-instanced (character) path intact', () => {
    const material = newShader();
    const vsrc = material.vertexShader;

    // The non-instanced branch must still compute mvPosition and vNormal
    // without instanceMatrix, so MediumHumanoid / CharacterHair render
    // correctly at the mesh's own transform.
    expect(vsrc).toMatch(
      /#else[\s\S]+modelViewMatrix\s*\*\s*vec4\(\s*position/
    );
    expect(vsrc).toMatch(/#else[\s\S]+normalMatrix\s*\*\s*normal/);
  });
});
