import type { WorldScene } from '@/concepts/world-building/types';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { describe, expect, it } from 'vitest';
import { projectCompositionPointLights } from './compositionLightSources';

const scene: WorldScene = {
  version: 1,
  id: 'scene',
  name: 'Lit parts',
  groups: [],
  items: [
    {
      id: 'part-a',
      kind: 'prop',
      assetRef: 'dnd5e:props:candles',
      label: 'Candles',
      transform: { x: 2, y: 0.5, z: 1, rotationY: Math.PI / 2 },
      pointLight: {
        enabled: true,
        offset: { x: 1, y: 0.25, z: 0 },
        color: '#ff9d52',
        intensity: 1.1,
        range: 2.6,
      },
    },
    {
      id: 'part-disabled',
      kind: 'prop',
      assetRef: 'dnd5e:props:books',
      label: 'Books',
      transform: { x: 0, y: 0, z: 0, rotationY: 0 },
      pointLight: {
        enabled: false,
        offset: { x: 0, y: 1, z: 0 },
        color: '#ffffff',
        intensity: 2,
        range: 4,
      },
    },
  ],
};

describe('composition authored point-light projection', () => {
  it('applies part-local yaw then placement yaw exactly once and retains source facts', () => {
    const [light] = projectCompositionPointLights(scene, {
      compositionId: 'composition-a',
      placementId: 'placement-a',
      transform: { x: 10, y: 2, z: -3, rotationY: Math.PI / 2 },
    });

    expect(light).toMatchObject({
      key: 'composition:placement-a:part-a',
      compositionId: 'composition-a',
      placementId: 'placement-a',
      partId: 'part-a',
      color: '#ff9d52',
      intensity: 1.1,
      distance: 2.6,
    });
    // Part yaw moves local +X to -Z: item-space XZ position (2, 0).
    // Placement yaw then moves (2, 0) to (0, -2), before root translation.
    // Y includes the one shared rendered-prop surface lift.
    expect(light!.position[0]).toBeCloseTo(10);
    expect(light!.position[1]).toBeCloseTo(2.75 + DUNGEON_SURFACE_Y);
    expect(light!.position[2]).toBeCloseTo(-5);
  });

  it('does not project disabled declarations', () => {
    expect(
      projectCompositionPointLights(
        { ...scene, items: [scene.items[1]!] },
        {
          compositionId: 'composition-a',
          placementId: 'placement-a',
          transform: { x: 0, y: 0, z: 0, rotationY: 0 },
        }
      )
    ).toEqual([]);
  });
});
