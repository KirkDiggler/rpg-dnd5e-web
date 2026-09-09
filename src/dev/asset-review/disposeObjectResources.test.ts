// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeObjectResources } from './disposeObjectResources';

describe('disposeObjectResources', () => {
  it('disposes shared candidate geometry, material, and textures exactly once', () => {
    const geometry = new THREE.BoxGeometry();
    const texture = new THREE.Texture();
    const nestedTexture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    material.userData.uniforms = { nested: { value: nestedTexture } };
    const root = new THREE.Group();
    root.add(
      new THREE.Mesh(geometry, material),
      new THREE.Mesh(geometry, [material, material])
    );

    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    const nestedTextureDispose = vi.spyOn(nestedTexture, 'dispose');

    disposeObjectResources(root);

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(nestedTextureDispose).toHaveBeenCalledTimes(1);
  });

  it('does not dispose floor or fighter resources outside the candidate root', () => {
    const candidateGeometry = new THREE.BoxGeometry();
    const candidateMaterial = new THREE.MeshBasicMaterial();
    const candidateRoot = new THREE.Group();
    candidateRoot.add(new THREE.Mesh(candidateGeometry, candidateMaterial));

    const sharedFloorGeometry = new THREE.PlaneGeometry();
    const sharedFloorMaterial = new THREE.MeshBasicMaterial();
    const sharedFighterGeometry = new THREE.CapsuleGeometry();
    const sharedFighterMaterial = new THREE.MeshStandardMaterial();
    const world = new THREE.Group();
    world.add(
      candidateRoot,
      new THREE.Mesh(sharedFloorGeometry, sharedFloorMaterial),
      new THREE.Mesh(sharedFighterGeometry, sharedFighterMaterial)
    );

    const floorGeometryDispose = vi.spyOn(sharedFloorGeometry, 'dispose');
    const floorMaterialDispose = vi.spyOn(sharedFloorMaterial, 'dispose');
    const fighterGeometryDispose = vi.spyOn(sharedFighterGeometry, 'dispose');
    const fighterMaterialDispose = vi.spyOn(sharedFighterMaterial, 'dispose');

    disposeObjectResources(candidateRoot);

    expect(floorGeometryDispose).not.toHaveBeenCalled();
    expect(floorMaterialDispose).not.toHaveBeenCalled();
    expect(fighterGeometryDispose).not.toHaveBeenCalled();
    expect(fighterMaterialDispose).not.toHaveBeenCalled();
  });
});
