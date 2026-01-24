/**
 * CharacterShield - Renders shield attachments.
 *
 * Uses MeshStandardMaterial with texture. Position estimated relative
 * to the left forearm (no Blender coordinate data available for shields).
 * Rendered inside the character's coordinate-converted group.
 */

import {
  EQUIPMENT_MODELS_PATH,
  EQUIPMENT_TEXTURES_PATH,
  SHIELD_CONFIGS,
  type ShieldType,
} from '@/config/attachmentModels';
import { createOutlineMaterial } from '@/shaders/OutlineShader';
import { useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export interface CharacterShieldProps {
  shieldType: ShieldType;
  showOutline: boolean;
}

export function CharacterShield({
  shieldType,
  showOutline,
}: CharacterShieldProps) {
  const partRef = useRef<THREE.Group>(null);
  const outlineRef = useRef<THREE.Group>(null);
  const config = SHIELD_CONFIGS[shieldType];
  const obj = useLoader(OBJLoader, `${EQUIPMENT_MODELS_PATH}${config.file}`);
  const texture = useLoader(
    THREE.TextureLoader,
    `${EQUIPMENT_TEXTURES_PATH}${config.texture}`
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
        roughness: 0.5,
        metalness: 0.2,
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
      ref.rotation.set(config.rotation.x, config.rotation.y, config.rotation.z);
      ref.position.set(config.position.x, config.position.y, config.position.z);
    };
    setTransform(partRef.current);
    setTransform(outlineRef.current);
  }, [config]);

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
    };
  }, [material, outlineMaterial]);

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
