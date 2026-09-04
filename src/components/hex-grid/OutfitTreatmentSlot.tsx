import type { OutfitPresentation } from '@/character/customization/outfitCustomization';
import { useTexture } from '@react-three/drei';
import { useEffect } from 'react';
import * as THREE from 'three';

export interface OutfitTreatmentSlotProps {
  readonly presentation: OutfitPresentation;
  /** ClassCharacterModel owns all material lifecycle; this slot only publishes a shared mask. */
  readonly onMaskReady: (mask: THREE.Texture) => void;
  readonly onMaskDetached?: (mask: THREE.Texture) => void;
}

/**
 * Isolated suspense boundary child for the provider mask. It never owns or
 * disposes atlas/mask textures because drei caches both by URL.
 */
export function OutfitTreatmentSlot({
  presentation,
  onMaskReady,
  onMaskDetached,
}: OutfitTreatmentSlotProps) {
  const mask = useTexture(presentation.maskUrl);
  useEffect(() => {
    mask.minFilter = THREE.NearestFilter;
    mask.magFilter = THREE.NearestFilter;
    mask.colorSpace = THREE.NoColorSpace;
    mask.needsUpdate = true;
    onMaskReady(mask);
    return () => onMaskDetached?.(mask);
  }, [mask, onMaskDetached, onMaskReady]);
  return null;
}
