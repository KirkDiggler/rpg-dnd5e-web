import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, expect, it, vi } from 'vitest';
import {
  buildDungeonLightingFacts,
  type DungeonLightingFacts,
} from '../../rendering/dungeonLighting';
import type { DungeonFloorLighting } from '../hex-grid/syntyHexFloorHelpers';
import type { Scene3D, SceneProp3D } from './atlasToScene3D';

vi.mock('./DungeonShell', () => ({
  DungeonShell: ({
    floorLighting,
  }: {
    floorLighting: DungeonFloorLighting;
  }) => <group name="environment-shell" userData={{ floorLighting }} />,
}));
vi.mock('./AtlasPropModel', () => ({
  AtlasPropModel: ({ prop }: { prop: SceneProp3D }) => (
    <group name="environment-prop" userData={{ prop }} />
  ),
}));

import { DungeonEnvironment } from './DungeonEnvironment';

function factsWithSources(sourceCount: number): DungeonLightingFacts {
  return buildDungeonLightingFacts(
    ['0,0,0'],
    [
      {
        id: 'crypt-room',
        archetype: 'crypt',
        intensity: 0.35,
        cellKeys: ['0,0,0'],
      },
    ],
    Array.from({ length: sourceCount }, (_, index) => ({
      key: `source-${index}`,
      ref: 'dnd5e:props:brazier',
      cellKey: '0,0,0',
      groundedPosition: [0, 0, 0] as [number, number, number],
    }))
  );
}

function sceneWith(
  lighting: DungeonLightingFacts,
  props: SceneProp3D[] = []
): Scene3D {
  return {
    floorTiles: new Map([['0,0,0', { x: 0, y: 0, z: 0, roomId: '' }]]),
    props,
    archetypes: ['crypt'],
    lighting,
    wallRuns: [],
    doorGaps: [],
  };
}

function pointLights(
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
) {
  return renderer.scene.findAll(
    (node) =>
      (node as { instance?: { type?: string } }).instance?.type === 'PointLight'
  );
}

function light(
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>,
  type: string
) {
  return renderer.scene.find(
    (node) => (node as { instance?: { type?: string } }).instance?.type === type
  ) as unknown as { instance: { intensity: number } };
}

describe('DungeonEnvironment', () => {
  it('resolves one crypt environment and passes floor lighting to its shell', async () => {
    const onLightingDiagnostics = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <DungeonEnvironment
        scene={sceneWith(factsWithSources(1), [
          {
            ref: 'dnd5e:props:brazier',
            position: { x: 0, y: 0, z: 0 },
            facing: '',
            offset: { x: 0, y: 0, z: 0 },
          },
        ])}
        focus={{ x: 0, z: 0 }}
        hexSize={1}
        onLightingDiagnostics={onLightingDiagnostics}
      />
    );

    expect(
      renderer.scene.findAll(
        (node) => node.instance?.name === 'environment-shell'
      )
    ).toHaveLength(1);
    expect(
      renderer.scene.findAll(
        (node) => node.instance?.name === 'environment-prop'
      )
    ).toHaveLength(1);
    expect(light(renderer, 'AmbientLight').instance.intensity).toBe(0.2);
    expect(light(renderer, 'DirectionalLight').instance.intensity).toBe(0.1);
    expect(pointLights(renderer)).toHaveLength(1);

    const shell = renderer.scene.find(
      (node) => node.instance?.name === 'environment-shell'
    );
    const floorLighting = (
      shell.instance as unknown as {
        userData: { floorLighting: DungeonFloorLighting };
      }
    ).userData.floorLighting;
    expect(floorLighting.exposureByCell).toEqual(new Map([['0,0,0', 0.35]]));
    expect(floorLighting.poolsByCell.get('0,0,0')).toHaveLength(1);
    expect(onLightingDiagnostics).toHaveBeenLastCalledWith([]);
  });

  it('keeps legacy lighting and props unchanged when the scene falls back', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <DungeonEnvironment
        scene={sceneWith(buildDungeonLightingFacts([], [], []), [
          {
            ref: 'homebrew:props:unknown',
            position: { x: 0, y: 0, z: 0 },
            facing: 'ne',
            offset: { x: 0.2, y: -0.1, z: 0.4 },
          },
        ])}
        focus={{ x: 10, z: -10 }}
        hexSize={1}
      />
    );

    expect(light(renderer, 'AmbientLight').instance.intensity).toBe(0.6);
    expect(light(renderer, 'DirectionalLight').instance.intensity).toBe(0.8);
    expect(pointLights(renderer)).toHaveLength(0);
    const prop = renderer.scene.find(
      (node) => node.instance?.name === 'environment-prop'
    );
    expect(
      (prop.instance as unknown as { userData: { prop: SceneProp3D } }).userData
        .prop
    ).toEqual(expect.objectContaining({ ref: 'homebrew:props:unknown' }));
  });

  it('reports unchanged diagnostics to a newly supplied callback', async () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    const scene = sceneWith(factsWithSources(13));
    const renderer = await ReactThreeTestRenderer.create(
      <DungeonEnvironment
        scene={scene}
        focus={{ x: 0, z: 0 }}
        hexSize={1}
        onLightingDiagnostics={firstCallback}
      />
    );

    expect(firstCallback).toHaveBeenCalledTimes(1);

    await renderer.update(
      <DungeonEnvironment
        scene={scene}
        focus={{ x: 0, z: 0 }}
        hexSize={1}
        onLightingDiagnostics={secondCallback}
      />
    );

    expect(secondCallback).toHaveBeenCalledWith([
      '12 of 13 placed light sources active near this view',
    ]);
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });

  it('reports the point-light budget diagnostic once for an over-budget scene', async () => {
    const onLightingDiagnostics = vi.fn();
    const scene = sceneWith(factsWithSources(13));
    const renderer = await ReactThreeTestRenderer.create(
      <DungeonEnvironment
        scene={scene}
        focus={{ x: 0, z: 0 }}
        hexSize={1}
        onLightingDiagnostics={onLightingDiagnostics}
      />
    );

    expect(pointLights(renderer)).toHaveLength(12);
    expect(onLightingDiagnostics).toHaveBeenCalledWith([
      '12 of 13 placed light sources active near this view',
    ]);
    expect(onLightingDiagnostics).toHaveBeenCalledTimes(1);

    await renderer.update(
      <DungeonEnvironment
        scene={scene}
        focus={{ x: 0, z: 0 }}
        hexSize={1}
        onLightingDiagnostics={onLightingDiagnostics}
      />
    );
    expect(onLightingDiagnostics).toHaveBeenCalledTimes(1);
  });
});
