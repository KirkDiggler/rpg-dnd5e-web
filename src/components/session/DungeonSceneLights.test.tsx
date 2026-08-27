import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, expect, it } from 'vitest';
import type { DungeonLightingPlan } from '../../rendering/dungeonLighting';
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

  it('renders every plan point light with exact values and decay two without shadows', async () => {
    const plan: DungeonLightingPlan = {
      mode: 'crypt',
      ambientIntensity: 0.08,
      directionalIntensity: 0.05,
      directionalPosition: [10, 20, 10],
      pointLights: [
        {
          key: 'brazier-a',
          position: [1, 2, 3],
          color: '#ff9d52',
          intensity: 2.8,
          distance: 5.5,
        },
        {
          key: 'orb-b',
          position: [-4, 0.5, 6],
          color: '#3d84dc',
          intensity: 2,
          distance: 4.5,
        },
      ],
      floorExposureByCell: new Map(),
      floorPoolsByCell: new Map(),
      diagnostics: [],
    };
    const renderer = await ReactThreeTestRenderer.create(
      <DungeonSceneLights plan={plan} />
    );

    const pointLights = renderer.scene.findAll(
      (node) =>
        (node as { instance?: { type?: string } }).instance?.type ===
        'PointLight'
    );
    expect(pointLights).toHaveLength(2);
    const props = pointLights.map(
      (node) =>
        (node as { fiber: { props: Record<string, unknown> } }).fiber.props
    );
    expect(props).toEqual([
      {
        position: [1, 2, 3],
        color: '#ff9d52',
        intensity: 2.8,
        distance: 5.5,
        decay: 2,
      },
      {
        position: [-4, 0.5, 6],
        color: '#3d84dc',
        intensity: 2,
        distance: 4.5,
        decay: 2,
      },
    ]);
    expect(props.every((light) => light.castShadow !== true)).toBe(true);
  });
});
