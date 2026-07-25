import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  cloneCryptMaterials,
  entityClickHandler,
  isRemembered,
  rememberedFitting,
  rememberedSegment,
} from './sceneKnowledge';

describe('scene knowledge decisions', () => {
  it('defaults omitted state to visible and recognizes remembered only', () => {
    expect(isRemembered(undefined)).toBe(false);
    expect(isRemembered('visible')).toBe(false);
    expect(isRemembered('remembered')).toBe(true);
  });

  it('withholds direct entity callbacks only for remembered entities', () => {
    const onClick = () => {};
    expect(entityClickHandler(undefined, onClick)).toBe(onClick);
    expect(entityClickHandler('visible', onClick)).toBe(onClick);
    expect(entityClickHandler('remembered', onClick)).toBeUndefined();
  });

  it('recognizes remembered segment and fitting keys', () => {
    const remembered = new Set(['1,-1,0']);
    expect(rememberedSegment('1,-1,0->2,-2,0', remembered)).toBe(true);
    expect(rememberedFitting('0,0,0|1,-1,0|1,0,-1', remembered)).toBe(true);
  });

  it('clones scalar and array materials without mutating originals', () => {
    const scalar = new THREE.MeshStandardMaterial({ color: '#ffffff' });
    const array = [
      new THREE.MeshStandardMaterial({ color: '#ffffff' }),
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    ];
    const scalarClone = cloneCryptMaterials(
      scalar
    ) as THREE.MeshStandardMaterial;
    const arrayClone = cloneCryptMaterials(array) as THREE.Material[];
    expect(scalarClone).not.toBe(scalar);
    expect(Array.isArray(arrayClone)).toBe(true);
    expect(arrayClone[0]).not.toBe(array[0]);
    expect(scalar.color.getHexString()).toBe('ffffff');
    expect(scalarClone.color.getHexString()).toBe('465366');
    expect(scalarClone.transparent).toBe(false);
    expect(scalarClone.depthWrite).toBe(true);
    expect(scalarClone.opacity).toBe(1);
    expect(arrayClone[0]!.transparent).toBe(false);
    expect(arrayClone[0]!.depthWrite).toBe(true);
    expect(arrayClone[0]!.opacity).toBe(1);
  });
});
