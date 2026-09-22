import ReactThreeTestRenderer from '@react-three/test-renderer';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * RoomSceneEnvironment render tests. The canonical room presentation
 * must reach the SHARED World Building leaves exactly once, at the exact
 * already-world-posed source poses (negative/fractional x/z, continuous
 * yaw, visual-only height), over the whole workspace Crypt floor at the
 * authoring radius — with named load/error states instead of silent
 * losses or substituted assets, and no group/support re-transform.
 */
const hoisted = vi.hoisted(() => ({
  catalogStatus: 'ready' as 'idle' | 'loading' | 'ready' | 'failed',
  leafMode: 'ready' as 'ready' | 'pending' | 'error',
  legacyLeafCalls: [] as Array<{
    name: string;
    variant: unknown;
    position: [number, number, number];
    rotationY: number;
    heightScale: number;
  }>,
  generatedLeafCalls: [] as Array<{
    assetRef: string;
    position: [number, number, number];
    rotationY: number;
    heightScale: number;
  }>,
  floorSurfaceCalls: [] as Array<{
    radius: number;
    profile: unknown;
  }>,
}));

vi.mock('@/components/session/useDungeonShellCatalog', () => ({
  useDungeonShellCatalog: () => {
    if (hoisted.catalogStatus === 'ready') {
      return {
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
      };
    }
    return { status: hoisted.catalogStatus };
  },
}));

vi.mock('@/concepts/world-building/WorkspaceFloorUnderlay', () => ({
  WorkspaceFloorSurface: ({
    radius,
    profile,
  }: {
    radius: number;
    profile: unknown;
  }) => {
    hoisted.floorSurfaceCalls.push({ radius, profile });
    return <group name="stub-workspace-floor-surface" />;
  },
}));

vi.mock('@/components/hex-grid/PropModel', () => ({
  PropModel: ({
    variant,
    position,
    rotationY,
    heightScale,
  }: {
    variant: unknown;
    position: [number, number, number];
    rotationY: number;
    heightScale: number;
  }) => {
    hoisted.legacyLeafCalls.push({
      name: 'stub-legacy-prop',
      variant,
      position,
      rotationY,
      heightScale,
    });
    if (hoisted.leafMode === 'error') throw new Error('legacy asset failed');
    if (hoisted.leafMode === 'pending') throw new Promise<never>(() => {});
    return <group name="stub-legacy-prop" />;
  },
}));

vi.mock('@/components/hex-grid/WorldAssetModel', () => ({
  WorldAssetModel: ({
    assetRef,
    position,
    rotationY,
    heightScale,
  }: {
    assetRef: string;
    position: [number, number, number];
    rotationY: number;
    heightScale: number;
  }) => {
    hoisted.generatedLeafCalls.push({
      assetRef,
      position,
      rotationY,
      heightScale,
    });
    if (hoisted.leafMode === 'error') throw new Error('asset failed');
    if (hoisted.leafMode === 'pending') throw new Promise<never>(() => {});
    return <group name="stub-world-asset" />;
  },
}));

import { WORLD_BUILDING_CATALOG_BY_REF } from '@/concepts/world-building/catalog';
import type { RoomScenePresentation } from '@/concepts/world-building/roomDraft';
import { RoomSceneEnvironment } from './RoomSceneEnvironment';

const presentation: RoomScenePresentation = {
  coordinateFrame: {
    horizontalPlane: 'world-xz' as const,
    verticalAxis: 'world-y-up' as const,
    distanceUnit: 'world-scene-unit' as const,
    hexRadius: 1 as const,
    footprintFrame: 'owner-local-xz' as const,
  },
  workspace: { hexRadius: 6, horizontalLimit: 12 },
  scene: {
    version: 1 as const,
    id: 'scene-1',
    name: 'Workshop',
    items: [
      {
        id: 'table',
        kind: 'prop' as const,
        assetRef: 'dnd5e:props:torture-table',
        label: 'Table',
        transform: { x: -2.25, y: 0, z: 1.3, rotationY: 0.37 },
        heightScale: 1.5,
        parentId: 'furniture',
      },
      {
        id: 'candles',
        kind: 'prop' as const,
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
        kind: 'prop' as const,
        assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
        label: 'Fort wall',
        transform: { x: 1.5, y: 0, z: -0.75, rotationY: -0.4 },
      },
    ],
    groups: [
      {
        id: 'furniture',
        kind: 'group' as const,
        label: 'Furniture',
        transform: { x: -2.175, y: 0.6, z: 1.275, rotationY: 0.37 },
      },
    ],
  },
};

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  hoisted.catalogStatus = 'ready';
  hoisted.leafMode = 'ready';
  hoisted.legacyLeafCalls = [];
  hoisted.generatedLeafCalls = [];
  hoisted.floorSurfaceCalls = [];
});

function nodes(
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>,
  name: string
) {
  return renderer.scene.findAll((node) => node.instance?.name === name);
}

describe('RoomSceneEnvironment', () => {
  it('renders each canonical item exactly once through the shared leaves at the exact source poses', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <RoomSceneEnvironment presentation={presentation} />
    );

    expect(hoisted.legacyLeafCalls).toHaveLength(2);
    const [table, candles] = hoisted.legacyLeafCalls;
    // The exact catalog entry's variant reaches the legacy leaf — no
    // substitute, no re-derived variant.
    const tableEntry = WORLD_BUILDING_CATALOG_BY_REF.get(
      'dnd5e:props:torture-table'
    );
    expect(tableEntry?.source).toBe('legacy');
    if (tableEntry?.source === 'legacy') {
      expect(table!.variant).toBe(tableEntry.variant);
    }
    // Negative/fractional source position, continuous yaw, visual-only
    // height — verbatim, with the shared leaf adding the one surface lift
    // and nothing else.
    expect(table!.position).toEqual([-2.25, 0, 1.3]);
    expect(table!.rotationY).toBe(0.37);
    expect(table!.heightScale).toBe(1.5);
    expect(candles!.position).toEqual([-2.1, 1.2, 1.25]);
    expect(candles!.rotationY).toBe(0.37);
    // Missing heightScale means normal height — passed as 1, not invented.
    expect(candles!.heightScale).toBe(1);

    expect(hoisted.generatedLeafCalls).toHaveLength(1);
    expect(hoisted.generatedLeafCalls[0]).toEqual({
      assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
      position: [1.5, 0, -0.75],
      rotationY: -0.4,
      heightScale: 1,
    });

    // The furniture group record stays intact in the data but is NOT a
    // render node: three items, three leaf calls, and no leaf ever saw
    // the group's own pose applied a second time.
    expect(
      hoisted.legacyLeafCalls.length + hoisted.generatedLeafCalls.length
    ).toBe(3);
    expect(
      hoisted.legacyLeafCalls.every(
        (call) =>
          call.position[0] !== -2.175 &&
          call.position[1] !== 0.6 &&
          call.position[2] !== 1.275
      )
    ).toBe(true);
    expect(
      renderer.scene.findAll(
        (node) => node.instance?.name === 'room-scene-item-furniture'
      )
    ).toHaveLength(0);
  });

  it('presents the whole workspace Crypt floor at the authoring radius through the shared surface', async () => {
    await ReactThreeTestRenderer.create(
      <RoomSceneEnvironment presentation={presentation} />
    );

    expect(hoisted.floorSurfaceCalls).toHaveLength(1);
    expect(hoisted.floorSurfaceCalls[0]!.radius).toBe(13);
    expect(hoisted.floorSurfaceCalls[0]!.profile).toEqual({
      diffuse: 'textures/Dungeons_Texture_FloorTile_09_01.png',
      sha256:
        'ec84f155a32297c64e86b8c678955e25d8f8180023327e42c840dd086916b841',
      worldUnitsPerRepeat: 6,
    });
  });

  it.each([
    ['loading', 'room-scene-floor-loading'],
    ['failed', 'room-scene-floor-error'],
  ] as const)(
    'names the workspace floor %s state instead of silently losing it',
    async (catalogStatus, markerName) => {
      hoisted.catalogStatus = catalogStatus;
      const renderer = await ReactThreeTestRenderer.create(
        <RoomSceneEnvironment presentation={presentation} />
      );
      expect(nodes(renderer, markerName)).toHaveLength(1);
      // The canonical items still render while the floor reports.
      expect(nodes(renderer, 'stub-legacy-prop')).toHaveLength(2);
    }
  );

  it('names per-item loading and error states without substituting assets', async () => {
    hoisted.leafMode = 'pending';
    let renderer = await ReactThreeTestRenderer.create(
      <RoomSceneEnvironment presentation={presentation} />
    );
    expect(nodes(renderer, 'room-scene-item-loading-candles')).toHaveLength(1);
    expect(nodes(renderer, 'room-scene-item-error-candles')).toHaveLength(0);

    hoisted.leafMode = 'error';
    renderer = await ReactThreeTestRenderer.create(
      <RoomSceneEnvironment presentation={presentation} />
    );
    expect(nodes(renderer, 'room-scene-item-error-candles')).toHaveLength(1);
    // The failure is a named marker mesh carrying the item identity —
    // never a different model standing in.
    const marker = renderer.scene.find(
      (node) => node.instance?.name === 'room-scene-item-error-candles'
    );
    expect(
      (marker.instance as unknown as { userData: Record<string, unknown> })
        .userData
    ).toMatchObject({
      itemId: 'candles',
      assetRef: 'dnd5e:props:candles',
      status: 'error',
    });
  });
});
