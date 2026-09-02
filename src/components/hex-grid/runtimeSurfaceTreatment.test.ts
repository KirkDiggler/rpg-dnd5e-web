import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  applyRuntimeEntityMaterialOverlay,
  applyRuntimeSurfaceTreatment,
  updateRuntimeAccessorySurfaceTreatment,
  updateRuntimeSurfaceTreatment,
  type RuntimeSurfaceTreatment,
} from './runtimeSurfaceTreatment';
import {
  CRYPT_MEMORY_COLOR,
  CRYPT_MEMORY_EMISSIVE,
  CRYPT_MEMORY_EMISSIVE_INTENSITY,
  CRYPT_MEMORY_OPACITY,
} from './sceneKnowledge';

const RED_LEATHER = {
  baseColorSrgb: '#6B3F26',
  roughness: 0.8,
  metalness: 0.05,
} as const satisfies RuntimeSurfaceTreatment;

const BLOND_HAIR = {
  baseColorSrgb: '#D8B36A',
  roughness: 0.55,
  metalness: 0,
} as const satisfies RuntimeSurfaceTreatment;

function makeMesh(
  material: THREE.Material | THREE.Material[]
): THREE.SkinnedMesh {
  return new THREE.SkinnedMesh(new THREE.BufferGeometry(), material);
}

describe('updateRuntimeSurfaceTreatment', () => {
  it('updates actual values in place while preserving every material identity', () => {
    const materials = [
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.1,
        metalness: 0.9,
      }),
      new THREE.MeshStandardMaterial({
        color: '#112233',
        roughness: 0.2,
        metalness: 0.8,
      }),
    ];
    const identities = materials.map((material) => ({
      material,
      uuid: material.uuid,
    }));

    const updated = updateRuntimeSurfaceTreatment(materials, BLOND_HAIR);

    expect(updated).toBe(materials);
    updated.forEach((material, index) => {
      expect(material).toBe(identities[index]!.material);
      expect(material.uuid).toBe(identities[index]!.uuid);
      expect(material.color.getHexString()).toBe('d8b36a');
      expect(material.roughness).toBe(BLOND_HAIR.roughness);
      expect(material.metalness).toBe(BLOND_HAIR.metalness);
      expect(material.version).toBeGreaterThan(0);
    });
  });

  it('validates the complete treatment before changing any actual value', () => {
    const material = new THREE.MeshStandardMaterial({
      color: '#abcdef',
      roughness: 0.25,
      metalness: 0.75,
    });

    expect(() =>
      updateRuntimeSurfaceTreatment([material], {
        ...RED_LEATHER,
        metalness: Number.NaN,
      })
    ).toThrow(RangeError);
    expect(material.color.getHexString()).toBe('abcdef');
    expect(material.roughness).toBe(0.25);
    expect(material.metalness).toBe(0.75);
  });
});

describe('runtime entity material overlays', () => {
  it('composes selected emissive and ghost opacity on the same material identities', () => {
    const material = new THREE.MeshStandardMaterial({ color: '#5A3825' });
    const uuid = material.uuid;

    const result = applyRuntimeEntityMaterialOverlay([material], {
      isSelected: true,
      isGhost: true,
      remembered: false,
    });

    expect(result[0]).toBe(material);
    expect(material.uuid).toBe(uuid);
    expect(material.emissive.getHexString()).toBe('ffffff');
    expect(material.emissiveIntensity).toBe(0.25);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.35);
  });

  it('gives remembered treatment precedence with the exact shared crypt semantics', () => {
    const material = new THREE.MeshStandardMaterial({ color: '#5A3825' });
    const expectedColor = new THREE.Color('#5A3825').multiply(
      CRYPT_MEMORY_COLOR
    );

    applyRuntimeEntityMaterialOverlay([material], {
      isSelected: true,
      isGhost: true,
      remembered: true,
    });

    expect(material.color.getHex()).toBe(expectedColor.getHex());
    expect(material.emissive.getHex()).toBe(CRYPT_MEMORY_EMISSIVE.getHex());
    expect(material.emissiveIntensity).toBe(CRYPT_MEMORY_EMISSIVE_INTENSITY);
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(CRYPT_MEMORY_OPACITY);
    expect(material.depthWrite).toBe(true);
  });

  it('restores persisted hair surface values after remembered without replacing materials', () => {
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
    const uuid = material.uuid;

    updateRuntimeAccessorySurfaceTreatment([material], RED_LEATHER, {
      isSelected: false,
      isGhost: false,
      remembered: true,
    });
    expect(material.color.getHexString()).not.toBe('6b3f26');

    updateRuntimeAccessorySurfaceTreatment([material], RED_LEATHER, {
      isSelected: false,
      isGhost: false,
      remembered: false,
    });

    expect(material.uuid).toBe(uuid);
    expect(material.color.getHexString()).toBe('6b3f26');
    expect(material.roughness).toBe(RED_LEATHER.roughness);
    expect(material.metalness).toBe(RED_LEATHER.metalness);
    expect(material.emissive.getHexString()).toBe('000000');
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.depthWrite).toBe(true);
  });
});

describe('applyRuntimeSurfaceTreatment', () => {
  it('clones and treats every standard material while preserving array shape', () => {
    const sources = [
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.1,
        metalness: 0.9,
      }),
      new THREE.MeshStandardMaterial({
        color: '#112233',
        roughness: 0.2,
        metalness: 0.8,
      }),
    ];
    const mesh = makeMesh(sources);

    const created = applyRuntimeSurfaceTreatment(mesh, RED_LEATHER);

    expect(created).toHaveLength(2);
    expect(Array.isArray(mesh.material)).toBe(true);
    expect(mesh.material).toEqual(created);
    created.forEach((material, index) => {
      expect(material).not.toBe(sources[index]);
      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
      const standard = material as THREE.MeshStandardMaterial;
      expect(standard.color.getHexString()).toBe('6b3f26');
      expect(standard.roughness).toBe(RED_LEATHER.roughness);
      expect(standard.metalness).toBe(RED_LEATHER.metalness);
      expect(standard.version).toBeGreaterThan(sources[index]!.version);
    });
    expect(sources[0]!.color.getHexString()).toBe('ffffff');
    expect(sources[0]!.roughness).toBe(0.1);
    expect(sources[0]!.metalness).toBe(0.9);
    expect(sources[1]!.color.getHexString()).toBe('112233');
    expect(sources[1]!.roughness).toBe(0.2);
    expect(sources[1]!.metalness).toBe(0.8);
  });

  it('isolates two instances sharing one source and leaves cleanup to each owner', () => {
    const sourceMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.25,
      metalness: 0.75,
    });
    const sourceDisposeSpy = vi.spyOn(sourceMaterial, 'dispose');
    const firstMesh = makeMesh(sourceMaterial);
    const secondMesh = makeMesh(sourceMaterial);

    const firstCreated = applyRuntimeSurfaceTreatment(firstMesh, RED_LEATHER);
    const secondCreated = applyRuntimeSurfaceTreatment(secondMesh, BLOND_HAIR);

    const firstMaterial = firstMesh.material as THREE.MeshStandardMaterial;
    const secondMaterial = secondMesh.material as THREE.MeshStandardMaterial;
    expect(firstMaterial).not.toBe(sourceMaterial);
    expect(secondMaterial).not.toBe(sourceMaterial);
    expect(firstMaterial).not.toBe(secondMaterial);
    expect(firstMaterial.color.getHexString()).toBe('6b3f26');
    expect(secondMaterial.color.getHexString()).toBe('d8b36a');
    expect(sourceMaterial.color.getHexString()).toBe('ffffff');
    expect(sourceMaterial.roughness).toBe(0.25);
    expect(sourceMaterial.metalness).toBe(0.75);
    expect(sourceDisposeSpy).not.toHaveBeenCalled();

    const firstDisposeSpies = firstCreated.map((material) =>
      vi.spyOn(material, 'dispose')
    );
    const secondDisposeSpies = secondCreated.map((material) =>
      vi.spyOn(material, 'dispose')
    );
    firstCreated.forEach((material) => material.dispose());

    firstDisposeSpies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    secondDisposeSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(sourceDisposeSpy).not.toHaveBeenCalled();
  });

  it.each(['#FFF', '#1234567', '#GG0000', ' #123456', '#123456 '])(
    'rejects non-exact runtime color %s',
    (baseColorSrgb) => {
      const source = new THREE.MeshStandardMaterial({ color: '#abcdef' });
      const mesh = makeMesh(source);
      const treatment = {
        ...RED_LEATHER,
        baseColorSrgb: baseColorSrgb as `#${string}`,
      };

      expect(() => applyRuntimeSurfaceTreatment(mesh, treatment)).toThrow(
        TypeError
      );
      expect(mesh.material).toBe(source);
      expect(source.color.getHexString()).toBe('abcdef');
    }
  );

  it.each([
    ['roughness', Number.NaN],
    ['roughness', Number.POSITIVE_INFINITY],
    ['roughness', -0.001],
    ['roughness', 1.001],
    ['metalness', Number.NaN],
    ['metalness', Number.NEGATIVE_INFINITY],
    ['metalness', -0.001],
    ['metalness', 1.001],
  ] as const)('rejects invalid %s value %s', (property, value) => {
    const source = new THREE.MeshStandardMaterial({ color: '#abcdef' });
    const mesh = makeMesh(source);
    const treatment: RuntimeSurfaceTreatment = {
      ...RED_LEATHER,
      [property]: value,
    };

    expect(() => applyRuntimeSurfaceTreatment(mesh, treatment)).toThrow(
      RangeError
    );
    expect(mesh.material).toBe(source);
    expect(source.color.getHexString()).toBe('abcdef');
  });

  it('rejects non-standard sources before cloning or changing the mesh', () => {
    const standard = new THREE.MeshStandardMaterial({ color: '#ffffff' });
    const unsupported = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const standardCloneSpy = vi.spyOn(standard, 'clone');
    const sources = [standard, unsupported];
    const mesh = makeMesh(sources);

    expect(() => applyRuntimeSurfaceTreatment(mesh, RED_LEATHER)).toThrow(
      TypeError
    );
    expect(standardCloneSpy).not.toHaveBeenCalled();
    expect(mesh.material).toBe(sources);
    expect(standard.color.getHexString()).toBe('ffffff');
    expect(unsupported.color.getHexString()).toBe('ffffff');
  });
});
