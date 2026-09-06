import type { CompositionReader } from '@/compositions/compositionJsonAdapter';
import type { CompositionResolution } from '@/compositions/CompositionPlacementModel';
import type { CompositionSource } from '@/compositions/compositionSource';
import { stringifyScene } from '@/concepts/world-building/serialization';
import type { WorldScene } from '@/concepts/world-building/types';
import { create } from '@bufbuild/protobuf';
import {
  CompositionSchema,
  type Composition,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
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
  AtlasPropModel: ({
    prop,
    compositionSource,
    compositionResolution,
  }: {
    prop: SceneProp3D;
    compositionSource?: CompositionSource;
    compositionResolution?: CompositionResolution;
  }) => (
    <group
      name="environment-prop"
      userData={{ prop, compositionSource, compositionResolution }}
    />
  ),
}));

import { DungeonEnvironment } from './DungeonEnvironment';

function factsWithSources(sourceCount: number): DungeonLightingFacts {
  const cellKeys = Array.from(
    { length: sourceCount },
    (_, index) => `source-cell-${index}`
  );
  return buildDungeonLightingFacts(
    cellKeys,
    [
      {
        id: 'crypt-room',
        archetype: 'crypt',
        intensity: 0.35,
        cellKeys,
      },
    ],
    cellKeys.map((cellKey, index) => ({
      key: `source-${index}`,
      ref: 'dnd5e:props:brazier',
      cellKey,
      groundedPosition: [0, 0, 0] as [number, number, number],
    }))
  );
}

function sceneWith(
  lighting: DungeonLightingFacts,
  props: SceneProp3D[] = []
): Scene3D {
  return {
    exits: [],
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
    const compositionSource: CompositionSource = {
      worldId: 'world-current',
      reader: {} as CompositionReader,
    };
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
        compositionSource={compositionSource}
      />
    );

    expect(
      renderer.scene.findAll(
        (node) => node.instance?.name === 'environment-shell'
      )
    ).toHaveLength(1);
    const environmentProps = renderer.scene.findAll(
      (node) => node.instance?.name === 'environment-prop'
    );
    expect(environmentProps).toHaveLength(1);
    expect(
      (
        environmentProps[0]!.instance as unknown as {
          userData: { compositionSource: CompositionSource };
        }
      ).userData.compositionSource
    ).toBe(compositionSource);
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
    expect([...floorLighting.exposureByCell.entries()]).toEqual([
      ['source-cell-0', 0.35],
    ]);
    expect(floorLighting.poolsByCell.get('source-cell-0')).toHaveLength(1);
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

  it('resolves each composition once, projects independent placements, and shares the scene budget', async () => {
    const litScene: WorldScene = {
      version: 1,
      id: 'lit-scene',
      name: 'Lit scene',
      groups: [],
      items: [
        {
          id: 'part',
          kind: 'prop',
          assetRef: 'dnd5e:props:candles',
          label: 'Candles',
          transform: { x: 0, y: 0, z: 0, rotationY: 0 },
          pointLight: {
            enabled: true,
            offset: { x: 1, y: 0.5, z: 0 },
            color: '#ff9d52',
            intensity: 1.1,
            range: 2.6,
          },
        },
      ],
    };
    const getComposition = vi.fn(async (worldId: string, id: string) =>
      create(CompositionSchema, {
        worldId,
        id,
        json: stringifyScene(litScene),
      })
    );
    const compositionSource: CompositionSource = {
      worldId: 'world-current',
      reader: {
        getComposition,
        listCompositions: vi.fn(),
      } as unknown as CompositionReader,
    };
    const props: SceneProp3D[] = [
      {
        ref: 'composition:props:lit',
        id: 'placement-a',
        position: { x: 0, y: 0, z: 0 },
        facing: '',
        offset: { x: 0, y: 0, z: 0 },
      },
      {
        ref: 'composition:props:lit',
        id: 'placement-b',
        position: { x: 0, y: 0, z: 0 },
        facing: 'e',
        offset: { x: 0.5, y: 0, z: 0 },
      },
    ];
    const renderer = await ReactThreeTestRenderer.create(
      <DungeonEnvironment
        scene={sceneWith(factsWithSources(10), props)}
        focus={{ x: 0, z: 0 }}
        hexSize={1}
        compositionSource={compositionSource}
      />
    );

    await vi.waitFor(() => expect(pointLights(renderer)).toHaveLength(12));
    expect(getComposition).toHaveBeenCalledTimes(1);
    expect(getComposition).toHaveBeenCalledWith('world-current', 'lit');
    const positions = pointLights(renderer).map((node) =>
      (
        node.instance as unknown as { position: { toArray: () => number[] } }
      ).position.toArray()
    );
    expect(positions.some(([x, y, z]) => x === 1 && y === 0.5 && z === 0)).toBe(
      true
    );
    expect(positions.some(([x, y, z]) => x !== 1 && y === 0.5 && z !== 0)).toBe(
      true
    );
  });

  it('keeps healthy resolved lights beside failed/pending data and ignores stale removals', async () => {
    let resolvePending!: (value: Composition) => void;
    const pending = new Promise<Composition>((resolve) => {
      resolvePending = resolve;
    });
    const litJson = stringifyScene({
      version: 1,
      id: 'lit',
      name: 'Lit',
      groups: [],
      items: [
        {
          id: 'part',
          kind: 'prop',
          assetRef: 'dnd5e:props:candles',
          label: 'Candles',
          transform: { x: 0, y: 0, z: 0, rotationY: 0 },
          pointLight: {
            enabled: true,
            offset: { x: 0, y: 1, z: 0 },
            color: '#ffffff',
            intensity: 1,
            range: 3,
          },
        },
      ],
    });
    const getComposition = vi.fn((worldId: string, id: string) => {
      if (id === 'broken') return Promise.reject(new Error('offline'));
      if (id === 'pending') return pending;
      return Promise.resolve(
        create(CompositionSchema, { worldId, id, json: litJson })
      );
    });
    const source: CompositionSource = {
      worldId: 'world-current',
      reader: {
        getComposition,
        listCompositions: vi.fn(),
      } as unknown as CompositionReader,
    };
    const prop = (id: string): SceneProp3D => ({
      ref: `composition:props:${id}`,
      id: `placement-${id}`,
      position: { x: 0, y: 0, z: 0 },
      facing: '',
      offset: { x: 0, y: 0, z: 0 },
    });
    const initial = sceneWith(buildDungeonLightingFacts([], [], []), [
      prop('healthy'),
      prop('broken'),
      prop('pending'),
    ]);
    const renderer = await ReactThreeTestRenderer.create(
      <DungeonEnvironment
        scene={initial}
        focus={{ x: 0, z: 0 }}
        hexSize={1}
        compositionSource={source}
      />
    );
    await vi.waitFor(() => expect(pointLights(renderer)).toHaveLength(1));

    const withoutPending = sceneWith(initial.lighting, [prop('healthy')]);
    await renderer.update(
      <DungeonEnvironment
        scene={withoutPending}
        focus={{ x: 0, z: 0 }}
        hexSize={1}
        compositionSource={source}
      />
    );
    resolvePending(
      create(CompositionSchema, {
        worldId: 'world-current',
        id: 'pending',
        json: litJson,
      })
    );
    await Promise.resolve();
    await vi.waitFor(() => expect(pointLights(renderer)).toHaveLength(1));
    expect(getComposition).toHaveBeenCalledTimes(3);
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
