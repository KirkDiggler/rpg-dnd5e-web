/**
 * WallBuilder.createSolidHex regression test
 *
 * Why this test exists:
 *
 * ShadedHexWall's single-cell wall branch (`Wall` proto with from === to)
 * used to call `createPillar`, which sizes its BoxGeometry off
 * `defaultThickness` (~10% of hex width). Against a full hex floor tile
 * that reads as a near-invisible sliver, not a wall — rpg-dnd5e-web#453.
 *
 * `createSolidHex` fixes this by extruding the same hex silhouette the
 * floor tiles use (`createHexPillarGeometry`), sized off the actual hex
 * radius. This test is a lo-fi geometry-bounds check (no WebGL context
 * needed, matches the AdvancedCharacterShader.test.ts style): it asserts
 * the footprint scales with hex width, not with the thin wall thickness.
 */

import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WallBuilder } from './WallBuilder';

// jsdom has no native canvas 2D context. WallBuilder.getMaterial() bakes a
// 1x1 solid-color texture via canvas (createSolidColorTexture) on every
// create* call, including createSolidHex. AdvancedCharacterShader.test.ts
// sidesteps this by building its own THREE.DataTexture directly, but
// createSolidHex is a full WallBuilder method with no seam to inject a
// texture — so stub just enough of the 2D context for that call to run.
// vi.spyOn (not a raw prototype overwrite) so afterAll can restore the
// original — otherwise the stub leaks across every other test file sharing
// this vitest worker.
let getContextSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(
      () =>
        ({
          fillStyle: '',
          fillRect: vi.fn(),
        }) as unknown as ReturnType<
          typeof HTMLCanvasElement.prototype.getContext
        >
    );
});

afterAll(() => {
  getContextSpy.mockRestore();
});

describe('WallBuilder.createSolidHex', () => {
  it('footprint scales with hex width, not the thin wall thickness', () => {
    const hexWidth = 48;
    const wallThicknessRatio = 0.1;
    const builder = new WallBuilder({ hexWidth, wallThicknessRatio });
    const thinPillarThickness = builder.getThickness(); // 4.8

    const height = 0.8;
    const mesh = builder.createSolidHex(new THREE.Vector3(0, 0, 0), height);
    mesh.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Contract: the footprint's radius is hexWidth / 2 (fills the hex
    // completely, matching the floor tiles — no gap), an order of magnitude
    // wider than the old thin pillar. This is the "solid, unmistakable" bar
    // from the issue, not a sliver.
    expect(size.x).toBeGreaterThan(thinPillarThickness * 3);
    expect(size.z).toBeGreaterThan(thinPillarThickness * 3);

    // Sanity bound: the footprint shouldn't exceed the un-scaled hex
    // diameter (hexWidth) in either horizontal axis (pointy-top hex extents
    // are hexRadius*sqrt(3) flat-to-flat and 2*hexRadius point-to-point,
    // both < hexWidth = 2*hexRadius).
    expect(size.x).toBeLessThanOrEqual(hexWidth);
    expect(size.z).toBeLessThanOrEqual(hexWidth);
  });

  it('fills the hex with no gap, matching the floor tiles exactly (no scale reduction)', () => {
    // Regression guard: createHexPillarGeometry defaults to scale=0.95 (for
    // HexWall.tsx's intentional "slight gaps between hexes"), but the floor
    // tiles (ShadedHexFloor.tsx / InstancedHexTiles.tsx) use the hex radius
    // unscaled. createSolidHex must pass scale=1.0 explicitly, or the wall
    // leaves a visible floor rim around its base instead of sitting flush.
    const hexWidth = 48;
    const hexRadius = hexWidth / 2;
    const builder = new WallBuilder({ hexWidth });

    const mesh = builder.createSolidHex(new THREE.Vector3(0, 0, 0), 0.8);
    mesh.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Point-to-point extent (world z after the flat-lay rotation) is
    // exactly 2 * hexRadius at scale=1.0 — any reduction factor would make
    // this strictly less than hexWidth.
    expect(size.z).toBeCloseTo(2 * hexRadius, 5);
  });

  it('extrudes to the requested height after the flat-lay rotation', () => {
    const builder = new WallBuilder({ hexWidth: 48 });
    const height = 0.8;

    const mesh = builder.createSolidHex(new THREE.Vector3(0, 0, 0), height);
    mesh.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);

    expect(size.y).toBeCloseTo(height, 5);
  });

  it('is positioned at the given world position, not offset like createPillar', () => {
    const builder = new WallBuilder({ hexWidth: 48 });
    const position = new THREE.Vector3(12, 0, -7);

    const mesh = builder.createSolidHex(position, 0.8);

    expect(mesh.position.x).toBe(12);
    expect(mesh.position.y).toBe(0);
    expect(mesh.position.z).toBe(-7);
  });

  it('respects a color override, matching the WallKind styling contract', () => {
    const builder = new WallBuilder({ hexWidth: 48, color: 0x111111 });
    const doorColor = 0x8b6914; // WallColors.woodMedium

    const mesh = builder.createSolidHex(new THREE.Vector3(0, 0, 0), 0.8, {
      color: doorColor,
    });

    const material = mesh.material as THREE.ShaderMaterial;
    expect(material.uniforms.primaryColor.value.getHex()).toBe(doorColor);
  });
});
