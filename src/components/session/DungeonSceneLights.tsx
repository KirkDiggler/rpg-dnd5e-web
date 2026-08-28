import type { DungeonLightingPlan } from '../../rendering/dungeonLighting';

export const DUNGEON_SCENE_LIGHTING = {
  ambientIntensity: 0.6,
  directionalIntensity: 0.8,
  directionalPosition: [10, 20, 10] as [number, number, number],
} as const;

export interface DungeonSceneLightsProps {
  readonly plan?: DungeonLightingPlan;
}

export function DungeonSceneLights({ plan }: DungeonSceneLightsProps) {
  const lighting = plan ?? DUNGEON_SCENE_LIGHTING;
  return (
    <>
      <ambientLight intensity={lighting.ambientIntensity} />
      <directionalLight
        intensity={lighting.directionalIntensity}
        position={lighting.directionalPosition}
      />
      {plan?.pointLights.map((light) => (
        <pointLight
          key={light.key}
          position={light.position}
          color={light.color}
          intensity={light.intensity}
          distance={light.distance}
          decay={2}
        />
      ))}
    </>
  );
}
