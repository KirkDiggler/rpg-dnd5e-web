import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, expect, it } from 'vitest';
import {
  DUNGEON_SCENE_LIGHTING,
  DungeonSceneLights,
} from './DungeonSceneLights';

describe('DungeonSceneLights', () => {
  it('exports the shared dungeon scene lighting values exactly', () => {
    expect(DUNGEON_SCENE_LIGHTING).toEqual({
      ambientIntensity: 0.6,
      directionalIntensity: 0.8,
      directionalPosition: [10, 20, 10],
    });
  });

  it('renders one ambient and one directional light from the shared values', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <DungeonSceneLights />
    );

    expect(
      renderer.scene.findAll(
        (node) =>
          (node as { instance?: { type?: string } }).instance?.type ===
          'AmbientLight'
      )
    ).toHaveLength(1);
    expect(
      renderer.scene.findAll(
        (node) =>
          (node as { instance?: { type?: string } }).instance?.type ===
          'DirectionalLight'
      )
    ).toHaveLength(1);
  });
});
