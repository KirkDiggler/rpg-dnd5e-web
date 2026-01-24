/**
 * CharacterHair - Renders hair and facial hair attachments.
 *
 * Uses AdvancedCharacterShader with white marker (#FFFFFF) mapped to hair color.
 * Rendered inside the character's coordinate-converted group.
 */

import {
  FHAIR_CONFIGS,
  FHAIR_MODELS_PATH,
  FHAIR_TEXTURES_PATH,
  HAIR_CONFIGS,
  HAIR_MODELS_PATH,
  HAIR_TEXTURES_PATH,
  type AttachmentConfig,
  type FacialHairStyle,
  type HairStyle,
} from '@/config/attachmentModels';
import { createAdvancedCharacterShader } from '@/shaders/AdvancedCharacterShader';
import { createOutlineMaterial } from '@/shaders/OutlineShader';
import { useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

interface HairMeshProps {
  config: AttachmentConfig;
  modelsPath: string;
  texturesPath: string;
  hairColor: number;
  showOutline: boolean;
}

function HairMesh({
  config,
  modelsPath,
  texturesPath,
  hairColor,
  showOutline,
}: HairMeshProps) {
  const partRef = useRef<THREE.Group>(null);
  const outlineRef = useRef<THREE.Group>(null);
  const obj = useLoader(OBJLoader, `${modelsPath}${config.file}`);
  const texture = useLoader(
    THREE.TextureLoader,
    `${texturesPath}${config.texture}`
  );

  const clonedObj = useMemo(() => obj.clone(), [obj]);
  const outlineObj = useMemo(
    () => (showOutline ? obj.clone() : null),
    [obj, showOutline]
  );

  useMemo(() => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.NoColorSpace;
  }, [texture]);

  const material = useMemo(
    () =>
      createAdvancedCharacterShader(texture, {
        skinColor: hairColor,
        primaryColor: hairColor,
        secondaryColor: hairColor,
        glowIntensity: 0.0,
      }),
    [texture, hairColor]
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

export interface CharacterHairProps {
  hairStyle?: HairStyle;
  facialHairStyle?: FacialHairStyle;
  hairColor: number;
  showOutline: boolean;
}

export function CharacterHair({
  hairStyle,
  facialHairStyle,
  hairColor,
  showOutline,
}: CharacterHairProps) {
  return (
    <>
      {hairStyle && (
        <HairMesh
          config={HAIR_CONFIGS[hairStyle]}
          modelsPath={HAIR_MODELS_PATH}
          texturesPath={HAIR_TEXTURES_PATH}
          hairColor={hairColor}
          showOutline={showOutline}
        />
      )}
      {facialHairStyle && (
        <HairMesh
          config={FHAIR_CONFIGS[facialHairStyle]}
          modelsPath={FHAIR_MODELS_PATH}
          texturesPath={FHAIR_TEXTURES_PATH}
          hairColor={hairColor}
          showOutline={showOutline}
        />
      )}
    </>
  );
}
