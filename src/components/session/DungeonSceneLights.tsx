export const DUNGEON_SCENE_LIGHTING = {
  ambientIntensity: 0.6,
  directionalIntensity: 0.8,
  directionalPosition: [10, 20, 10] as [number, number, number],
} as const;

export function DungeonSceneLights() {
  return (
    <>
      <ambientLight intensity={DUNGEON_SCENE_LIGHTING.ambientIntensity} />
      <directionalLight
        intensity={DUNGEON_SCENE_LIGHTING.directionalIntensity}
        position={DUNGEON_SCENE_LIGHTING.directionalPosition}
      />
    </>
  );
}
