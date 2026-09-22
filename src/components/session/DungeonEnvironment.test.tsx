import type { CompositionReader } from '@/compositions/compositionJsonAdapter';
import type { CompositionResolution } from '@/compositions/CompositionPlacementModel';
import type { CompositionSource } from '@/compositions/compositionSource';
import type { RoomScenePresentation } from '@/concepts/world-building/roomDraft';
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
// The canonical branch reaches the REAL shared World Building leaves;
// these stubs keep the render tests WebGL-free while proving exact
// poses through `WorldPropModel`'s own dispatch. userData carries the
// props so assertions read the mounted nodes, not volatile call logs.
vi.mock('@/components/hex-grid/PropModel', () => ({
  PropModel: (props: Record<string, unknown>) => (
    <group name="stub-legacy-prop" userData={props} />
  ),
}));
vi.mock('@/components/hex-grid/WorldAssetModel', () => ({
  WorldAssetModel: (props: Record<string, unknown>) => (
    <group name="stub-world-asset" userData={props} />
  ),
}));
vi.mock('@/components/session/useDungeonShellCatalog', () => ({
  useDungeonShellCatalog: () => ({
    status: 'ready',
    catalog: {
      profiles: {
        crypt: {
          floor: {
            diffuse: 'textures/Dungeons_Texture_FloorTile_09_01.png',
            sha256:
              'ec84f155a32297c64e86b8c678955e25d8f8180023327e42c840dd086916b841',
            worldUnitsPerRepeat: 6,
          },
        },
      },
    },
  }),
}));
vi.mock('@/concepts/world-building/WorkspaceFloorUnderlay', () => ({
  WorkspaceFloorSurface: (props: Record<string, unknown>) => (
    <group name="stub-workspace-floor" userData={props} />
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
  props: SceneProp3D[] = [],
  roomScene?: RoomScenePresentation
): Scene3D {
  return {
    exits: [],
    floorTiles: new Map([['0,0,0', { x: 0, y: 0, z: 0, roomId: '' }]]),
    props,
    archetypes: ['crypt'],
    lighting,
    wallRuns: [],
    doorGaps: [],
    ...(roomScene ? { roomScene } : {}),
  };
}

/** The one canonical room presentation the canonical-branch tests share:
 * a raised grouped item, a supported lit decor, and a generated visual —
 * the exact graph the plan's rich-source scenario names. */
const roomPresentation: RoomScenePresentation = {
  coordinateFrame: {
    horizontalPlane: 'world-xz',
    verticalAxis: 'world-y-up',
    distanceUnit: 'world-scene-unit',
    hexRadius: 1,
    footprintFrame: 'owner-local-xz',
  },
  workspace: { hexRadius: 6, horizontalLimit: 12 },
  scene: {
    version: 1,
    id: 'scene-1',
    name: 'Workshop',
    items: [
      {
        id: 'table',
        kind: 'prop',
        assetRef: 'dnd5e:props:torture-table',
        label: 'Table',
        transform: { x: -2.25, y: 0, z: 1.3, rotationY: 0.37 },
        heightScale: 1.5,
        parentId: 'furniture',
      },
      {
        id: 'candles',
        kind: 'prop',
        assetRef: 'dnd5e:props:candles',
        label: 'Candles',
        transform: { x: -2.1, y: 1.2, z: 1.25, rotationY: 0.37 },
        parentId: 'furniture',
        supportId: 'table',
        pointLight: {
          enabled: true,
          offset: { x: 0, y: 0.5, z: 0 },
          color: '#ff9d52',
          intensity: 1.1,
          range: 2.6,
        },
      },
      {
        id: 'fort-wall',
        kind: 'prop',
        assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
        label: 'Fort wall',
        transform: { x: 1.5, y: 0, z: -0.75, rotationY: -0.4 },
      },
    ],
    groups: [
      {
        id: 'furniture',
        kind: 'group',
        label: 'Furniture',
        transform: { x: -2.175, y: 0.6, z: 1.275, rotationY: 0.37 },
      },
    ],
  },
};

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
    expect(light(renderer, 'AmbientLight').instance.intensity).toBe(0.8);
    expect(light(renderer, 'DirectionalLight').instance.intensity).toBe(0.4);
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
    expect(positions.some(([x, y, z]) => x === 1 && y === 0.7 && z === 0)).toBe(
      true
    );
    expect(positions.some(([x, y, z]) => x !== 1 && y === 0.7 && z !== 0)).toBe(
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

  it('renders the canonical presentation once through the shared leaves and suppresses duplicated legacy sources', async () => {
    const getComposition = vi.fn(async (worldId: string, id: string) =>
      create(CompositionSchema, {
        worldId,
        id,
        json: stringifyScene({
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
        }),
      })
    );
    // The SAME room also arrives through the legacy atlas channel (the
    // duplicated cell props). If the canonical branch resolved those
    // sources too, the light count and this call record would both grow.
    const duplicatedLegacyProp: SceneProp3D = {
      ref: 'composition:props:lit',
      id: 'placement-a',
      position: { x: 0, y: 0, z: 0 },
      facing: '',
      offset: { x: 0, y: 0, z: 0 },
    };
    const renderer = await ReactThreeTestRenderer.create(
      <DungeonEnvironment
        scene={sceneWith(
          factsWithSources(1),
          [duplicatedLegacyProp],
          roomPresentation
        )}
        focus={{ x: 0, z: 0 }}
        hexSize={1}
        compositionSource={{
          worldId: 'world-current',
          reader: {
            getComposition,
            listCompositions: vi.fn(),
          } as unknown as CompositionReader,
        }}
      />
    );

    // NO legacy proxy leaves at all in the canonical branch: no shell
    // floor/walls/perimeter, no duplicated atlas prop placements — even
    // though the atlas itself still carries them.
    expect(
      renderer.scene.findAll(
        (node) => node.instance?.name === 'environment-shell'
      )
    ).toHaveLength(0);
    expect(
      renderer.scene.findAll(
        (node) => node.instance?.name === 'environment-prop'
      )
    ).toHaveLength(0);
    expect(getComposition).not.toHaveBeenCalled();

    // Every canonical item reaches its shared leaf exactly once, at the
    // exact already-world-posed source pose — the supported lit decor
    // rides its OWN transform, not the group's or support's pose again.
    const legacyLeaves = renderer.scene
      .findAll((node) => node.instance?.name === 'stub-legacy-prop')
      .map(
        (node) =>
          (node.instance as unknown as { userData: Record<string, unknown> })
            .userData
      );
    expect(legacyLeaves).toHaveLength(2);
    expect(legacyLeaves[0]).toMatchObject({
      position: [-2.25, 0, 1.3],
      rotationY: 0.37,
      heightScale: 1.5,
    });
    expect(legacyLeaves[1]).toMatchObject({
      position: [-2.1, 1.2, 1.25],
      rotationY: 0.37,
      heightScale: 1,
    });
    const generatedLeaves = renderer.scene.findAll(
      (node) => node.instance?.name === 'stub-world-asset'
    );
    expect(generatedLeaves).toHaveLength(1);
    expect(
      (
        generatedLeaves[0]!.instance as unknown as {
          userData: Record<string, unknown>;
        }
      ).userData
    ).toMatchObject({
      assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
      position: [1.5, 0, -0.75],
      rotationY: -0.4,
    });

    // The full workspace Crypt floor, at the authoring radius
    // (horizontalLimit + 1) and the exact profile the editor presents.
    const floor = renderer.scene.find(
      (node) => node.instance?.name === 'stub-workspace-floor'
    );
    expect(
      (floor.instance as unknown as { userData: Record<string, unknown> })
        .userData
    ).toEqual({
      radius: 13,
      profile: {
        diffuse: 'textures/Dungeons_Texture_FloorTile_09_01.png',
        sha256:
          'ec84f155a32297c64e86b8c678955e25d8f8180023327e42c840dd086916b841',
        worldUnitsPerRepeat: 6,
      },
    });

    // Canonical lights project exactly ONCE: item-local offset rotated by
    // the item's own yaw, surface lift once, identity outer placement —
    // [-2.1, 1.2 + 0.2 + 0.5, 1.25]. Same crypt ambient/directional and
    // budget behavior as always.
    const lights = pointLights(renderer);
    expect(lights).toHaveLength(1);
    const position = (
      lights[0]!.instance as unknown as {
        position: { toArray: () => number[] };
      }
    ).position.toArray();
    expect(position[0]).toBeCloseTo(-2.1, 9);
    expect(position[1]).toBeCloseTo(1.9, 9);
    expect(position[2]).toBeCloseTo(1.25, 9);
    expect(light(renderer, 'AmbientLight').instance.intensity).toBe(0.8);
    expect(light(renderer, 'DirectionalLight').instance.intensity).toBe(0.4);
  });
});
