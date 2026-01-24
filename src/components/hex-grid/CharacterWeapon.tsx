/**
 * CharacterWeapon - Renders weapon attachments.
 *
 * Uses MeshStandardMaterial with texture (no shader color swapping).
 * Supports bilateral placement (left/right hand) and two-handed weapons.
 * Rendered inside the character's coordinate-converted group.
 */

import {
  WEAPON_CONFIGS,
  WEAPON_MODELS_PATH,
  WEAPON_TEXTURES_PATH,
  isTwoHandedWeapon,
  type HandSlot,
  type WeaponType,
} from '@/config/attachmentModels';
import type { Vector3Config } from '@/config/characterModels';
import { createOutlineMaterial } from '@/shaders/OutlineShader';
import { useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

interface WeaponMeshProps {
  weaponType: WeaponType;
  position: Vector3Config;
  rotation: Vector3Config;
  showOutline: boolean;
}

function WeaponMesh({
  weaponType,
  position,
  rotation,
  showOutline,
}: WeaponMeshProps) {
  const partRef = useRef<THREE.Group>(null);
  const outlineRef = useRef<THREE.Group>(null);
  const config = WEAPON_CONFIGS[weaponType];
  const obj = useLoader(OBJLoader, `${WEAPON_MODELS_PATH}${config.file}`);
  const texture = useLoader(
    THREE.TextureLoader,
    `${WEAPON_TEXTURES_PATH}${config.texture}`
  );

  const clonedObj = useMemo(() => obj.clone(), [obj]);
  const outlineObj = useMemo(
    () => (showOutline ? obj.clone() : null),
    [obj, showOutline]
  );

  useMemo(() => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
  }, [texture]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.6,
        metalness: 0.3,
      }),
    [texture]
  );

  const outlineMaterial = useMemo(
    () =>
      showOutline ? createOutlineMaterial({ outlineThickness: 1.5 }) : null,
    [showOutline]
  );

  useEffect(() => {
    const setTransform = (ref: THREE.Group | null) => {
      if (!ref) return;
      ref.rotation.order = 'ZYX';
      ref.rotation.set(rotation.x, rotation.y, rotation.z);
      ref.position.set(position.x, position.y, position.z);
    };
    setTransform(partRef.current);
    setTransform(outlineRef.current);
  }, [position, rotation]);

  useEffect(() => {
    clonedObj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
      }
    });
  }, [clonedObj, material]);

  useEffect(() => {
    if (outlineObj && outlineMaterial) {
      outlineObj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = outlineMaterial;
        }
      });
    }
  }, [outlineObj, outlineMaterial]);

  useEffect(() => {
    return () => {
      material.dispose();
      outlineMaterial?.dispose();
      const disposeGeometries = (root: THREE.Object3D) => {
        root.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
          }
        });
      };
      disposeGeometries(clonedObj);
      if (outlineObj) disposeGeometries(outlineObj);
    };
  }, [material, outlineMaterial, clonedObj, outlineObj]);

  return (
    <>
      {showOutline && outlineObj && (
        <group ref={outlineRef}>
          <primitive object={outlineObj} />
        </group>
      )}
      <group ref={partRef}>
        <primitive object={clonedObj} />
      </group>
    </>
  );
}

export interface CharacterWeaponProps {
  weaponType: WeaponType;
  hand: HandSlot;
  showOutline: boolean;
}

export function CharacterWeapon({
  weaponType,
  hand,
  showOutline,
}: CharacterWeaponProps) {
  const config = WEAPON_CONFIGS[weaponType];

  if (isTwoHandedWeapon(config)) {
    return (
      <WeaponMesh
        weaponType={weaponType}
        position={config.position}
        rotation={config.rotation}
        showOutline={showOutline}
      />
    );
  }

  const handConfig = hand === 'left' ? config.left : config.right;
  return (
    <WeaponMesh
      weaponType={weaponType}
      position={handConfig.position}
      rotation={handConfig.rotation}
      showOutline={showOutline}
    />
  );
}
