import {
  characterCustomizationRaceLabel,
  resolveCharacterCustomizationModel,
} from '@/character/customization/characterCustomization';
import { resolveHairPresentation } from '@/character/customization/hairCustomization';
import { resolveOutfitPresentation } from '@/character/customization/outfitCustomization';
import { ClassCharacterModel } from '@/components/hex-grid/ClassCharacterModel';
import type { SkinnedAccessoryStatus } from '@/components/hex-grid/SkinnedAccessoryAttachment';
import type { Appearance } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';

interface CharacterCustomizationPreviewProps {
  raceRefId?: string;
  classRefId?: string;
  appearance: Appearance;
  onAccessoryStatus?: (status: SkinnedAccessoryStatus) => void;
}

export function CharacterCustomizationPreview({
  raceRefId,
  classRefId,
  appearance,
  onAccessoryStatus,
}: CharacterCustomizationPreviewProps) {
  const model = resolveCharacterCustomizationModel(raceRefId, classRefId);
  const raceLabel = characterCustomizationRaceLabel(raceRefId);
  const accessories = useMemo(
    () =>
      resolveHairPresentation({
        raceRefId,
        classRefId,
        customization: appearance,
      }).accessories,
    [appearance, classRefId, raceRefId]
  );
  const outfit = useMemo(() => {
    const resolution = resolveOutfitPresentation({
      classRefId,
      customization: appearance,
    });
    return 'presentation' in resolution ? undefined : resolution;
  }, [appearance, classRefId]);

  if (!model) return null;

  return (
    <Canvas
      frameloop="demand"
      camera={{ position: [0, 1.15, 2.6], fov: 38 }}
      style={{ background: 'transparent' }}
      aria-label={`${raceLabel ?? 'Character'} appearance preview`}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} />
      <Suspense fallback={null}>
        <ClassCharacterModel
          url={model.url}
          facingRotation={Math.PI}
          accessories={accessories}
          outfit={outfit}
          onAccessoryStatus={onAccessoryStatus}
        />
      </Suspense>
      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={1.5}
        maxDistance={4.5}
        target={[0, 0.85, 0]}
      />
    </Canvas>
  );
}
