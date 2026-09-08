import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { create } from '@bufbuild/protobuf';
import {
  CompositionSchema,
  type Composition,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { Suspense } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import decoratedTableJson from './fixtures/decorated-table.scene.json?raw';

const controlledLeaf = vi.hoisted(() => ({
  behavior: 'render' as 'render' | 'suspend' | 'throw',
  rotationY: 0.731,
  suspension: new Promise<void>(() => undefined),
}));
const loadedWorldAssetUrls = vi.hoisted(() => [] as string[]);

vi.mock('@react-three/drei', async () => {
  const THREE = await import('three');
  return {
    useGLTF: (url: string) => {
      loadedWorldAssetUrls.push(url);
      return { scene: new THREE.Group() };
    },
  };
});

vi.mock('@/components/hex-grid/PropModel', () => ({
  PropModel: ({
    variant,
    position,
    rotationY,
    anchor,
  }: {
    variant: { name: string };
    position: [number, number, number];
    rotationY: number;
    anchor: string;
  }) => {
    if (rotationY === controlledLeaf.rotationY) {
      if (controlledLeaf.behavior === 'throw') {
        throw new Error('controlled prop load failure');
      }
      if (controlledLeaf.behavior === 'suspend') {
        throw controlledLeaf.suspension;
      }
    }
    return (
      <group
        name={`prop-model-leaf-${variant.name}`}
        position={position}
        rotation={[0, rotationY, 0]}
        userData={{ anchor }}
      />
    );
  },
}));

import { CompositionModel } from './CompositionModel';

const composition: Composition = create(CompositionSchema, {
  id: 'decorated-table',
  worldId: 'world-a',
  json: decoratedTableJson,
});

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  controlledLeaf.behavior = 'render';
  loadedWorldAssetUrls.length = 0;
  vi.restoreAllMocks();
});

function withSingleLeaf(rotationY: number): Composition {
  const envelope = JSON.parse(decoratedTableJson) as {
    scene: {
      items: Array<{
        id: string;
        transform: { rotationY: number };
      }>;
    };
  };
  envelope.scene.items = [
    {
      ...envelope.scene.items[0],
      id: 'synthetic-leaf',
      transform: { ...envelope.scene.items[0].transform, rotationY },
    },
  ];
  return create(CompositionSchema, {
    ...composition,
    json: JSON.stringify(envelope),
  });
}

function BoundedCompositionModel({
  value,
  instanceId,
}: {
  value: Composition;
  instanceId: string;
}) {
  return (
    <Suspense fallback={<group name={`composition-loading-${instanceId}`} />}>
      <ErrorBoundary
        fallback={<group name={`composition-error-${instanceId}`} />}
      >
        <CompositionModel
          composition={value}
          instanceId={instanceId}
          transform={{ x: 0, y: 0, z: 0, rotationY: 0 }}
        />
      </ErrorBoundary>
    </Suspense>
  );
}

describe('CompositionModel', () => {
  it('keeps authored leaf transforms relative to one placement root', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <CompositionModel
        composition={composition}
        instanceId="placement-main"
        transform={{ x: 4, y: 0.25, z: -2, rotationY: Math.PI / 3 }}
      />
    );

    const root = renderer.scene.findByProps({
      name: 'composition-placement-placement-main',
    });
    expect(root.props.position).toEqual([4, 0.25, -2]);
    expect(root.props.rotation).toEqual([0, Math.PI / 3, 0]);
    expect(root.props.userData).toEqual({
      compositionId: 'decorated-table',
      compositionWorldId: 'world-a',
      compositionInstanceId: 'placement-main',
    });

    const leaves = renderer.scene.findAll(
      (node) =>
        typeof node.props.name === 'string' &&
        node.props.name.startsWith('composition-leaf-')
    );
    expect(leaves).toHaveLength(5);
    const tableLeaf = renderer.scene.findByProps({
      name: 'composition-leaf-17c67f39-6b5d-49ad-a9be-e63722824dc1',
    });
    expect(tableLeaf.children[0]?.props.position).toEqual([
      -0.22944039237606742, 0, -0.7073681324665922,
    ]);
    expect(leaves.every((leaf) => leaf.props.userData === undefined)).toBe(
      true
    );
  });

  it('renders a valid generated exact-ref snapshot instead of the caller error fallback', async () => {
    const envelope = JSON.parse(decoratedTableJson) as {
      scene: {
        items: Array<{
          id: string;
          kind: 'prop';
          assetRef: string;
          label: string;
          transform: {
            x: number;
            y: number;
            z: number;
            rotationY: number;
          };
        }>;
      };
    };
    envelope.scene.items = [
      {
        id: 'generated-alchemy-tools',
        kind: 'prop',
        assetRef: 'dnd5e:props:dark-fortress:alchemy_tools_01',
        label: 'Alchemy Tools 01',
        transform: { x: -1.25, y: 0.2, z: 2.5, rotationY: 0.45 },
      },
    ];
    const generated = create(CompositionSchema, {
      ...composition,
      id: 'generated-snapshot',
      json: JSON.stringify(envelope),
    });

    const renderer = await ReactThreeTestRenderer.create(
      <BoundedCompositionModel
        value={generated}
        instanceId="generated-placement"
      />
    );

    expect(
      renderer.scene.findAllByProps({
        name: 'composition-error-generated-placement',
      })
    ).toHaveLength(0);
    const leaf = renderer.scene.findByProps({
      name: 'composition-leaf-generated-alchemy-tools',
    });
    expect(leaf.children[0]?.props).toMatchObject({
      name: 'world-asset-model',
      position: [-1.25, 0.2 + DUNGEON_SURFACE_Y, 2.5],
      rotation: [0, 0.45, 0],
    });
    expect(loadedWorldAssetUrls).toEqual([
      '/models/synty/world-assets/props/dark-fortress/alchemy_tools_01.glb',
    ]);
  });

  it('renders legacy and generated leaves together with their independent authored transforms', async () => {
    const envelope = JSON.parse(decoratedTableJson) as {
      scene: {
        items: Array<{
          id: string;
          kind: 'prop';
          assetRef: string;
          label: string;
          transform: {
            x: number;
            y: number;
            z: number;
            rotationY: number;
          };
        }>;
      };
    };
    envelope.scene.items = [
      {
        ...envelope.scene.items[0]!,
        id: 'legacy-table',
        transform: { x: 1, y: 0.1, z: -2, rotationY: 0.25 },
      },
      {
        id: 'generated-alchemy-tools',
        kind: 'prop',
        assetRef: 'dnd5e:props:dark-fortress:alchemy_tools_01',
        label: 'Alchemy Tools 01',
        transform: { x: -3, y: 0.35, z: 4, rotationY: 0.8 },
      },
    ];
    const mixed = create(CompositionSchema, {
      ...composition,
      id: 'mixed-snapshot',
      json: JSON.stringify(envelope),
    });

    const renderer = await ReactThreeTestRenderer.create(
      <CompositionModel
        composition={mixed}
        instanceId="mixed-placement"
        transform={{ x: 5, y: 0.4, z: 6, rotationY: 1.1 }}
      />
    );

    const root = renderer.scene.findByProps({
      name: 'composition-placement-mixed-placement',
    });
    expect(root.props.position).toEqual([5, 0.4, 6]);
    expect(root.props.rotation).toEqual([0, 1.1, 0]);
    const legacy = renderer.scene.findByProps({
      name: 'composition-leaf-legacy-table',
    });
    expect(legacy.children[0]?.props).toMatchObject({
      position: [1, 0.1, -2],
      rotation: [0, 0.25, 0],
      userData: { anchor: 'bounds-floor-center' },
    });
    const generated = renderer.scene.findByProps({
      name: 'composition-leaf-generated-alchemy-tools',
    });
    expect(generated.children[0]?.props).toMatchObject({
      name: 'world-asset-model',
      position: [-3, 0.35 + DUNGEON_SURFACE_Y, 4],
      rotation: [0, 0.8, 0],
    });
  });

  it('keeps an unknown snapshot ref inside the caller error fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const envelope = JSON.parse(decoratedTableJson) as {
      scene: { items: Array<{ assetRef: string }> };
    };
    envelope.scene.items[0]!.assetRef = 'dnd5e:props:not-in-any-catalog';
    const unknown = create(CompositionSchema, {
      ...composition,
      id: 'unknown-ref-snapshot',
      json: JSON.stringify(envelope),
    });

    const renderer = await ReactThreeTestRenderer.create(
      <BoundedCompositionModel
        value={unknown}
        instanceId="unknown-ref-placement"
      />
    );

    expect(
      renderer.scene.findByProps({
        name: 'composition-error-unknown-ref-placement',
      })
    ).toBeDefined();
    expect(
      renderer.scene.findAllByProps({ name: 'world-asset-model' })
    ).toHaveLength(0);
  });

  it('renders authored enabled lights through the shared point-light leaf and can defer to a scene owner', async () => {
    const envelope = JSON.parse(decoratedTableJson) as {
      scene: {
        items: Array<{
          id: string;
          pointLight?: {
            enabled: boolean;
            offset: { x: number; y: number; z: number };
            color: string;
            intensity: number;
            range: number;
          };
        }>;
      };
    };
    envelope.scene.items[0]!.pointLight = {
      enabled: true,
      offset: { x: 0.1, y: 0.5, z: -0.2 },
      color: '#ff9d52',
      intensity: 1.7,
      range: 3.4,
    };
    const lit = create(CompositionSchema, {
      ...composition,
      json: JSON.stringify(envelope),
    });
    const renderer = await ReactThreeTestRenderer.create(
      <CompositionModel
        composition={lit}
        instanceId="lit-placement"
        transform={{ x: 2, y: 0, z: 3, rotationY: 0.5 }}
      />
    );
    const light = renderer.scene.find(
      (node) => node.instance?.type === 'PointLight'
    );
    expect(light.props).toMatchObject({
      color: '#ff9d52',
      intensity: 1.7,
      distance: 3.4,
      decay: 2,
    });

    await renderer.update(
      <CompositionModel
        composition={lit}
        instanceId="lit-placement"
        transform={{ x: 2, y: 0, z: 3, rotationY: 0.5 }}
        renderLights={false}
      />
    );
    expect(
      renderer.scene.findAll((node) => node.instance?.type === 'PointLight')
    ).toHaveLength(0);
  });

  it('does not reapply authored group or support transforms to visual leaves', async () => {
    const envelope = JSON.parse(decoratedTableJson) as {
      scene: {
        groups: unknown[];
        items: Array<{
          id: string;
          assetRef: string;
          parentId?: string;
          supportId?: string;
        }>;
      };
    };
    envelope.scene.groups.push({
      id: 'decorated-group',
      kind: 'group',
      label: 'Decorated table',
      transform: { x: 8, y: 0, z: 7, rotationY: 1.2 },
    });
    const tableId = envelope.scene.items.find(
      (item) => item.assetRef === 'dnd5e:props:skeleton-table'
    )!.id;
    envelope.scene.items.forEach((item) => {
      item.parentId = 'decorated-group';
      if (item.id !== tableId) item.supportId = tableId;
    });
    const related = create(CompositionSchema, {
      ...composition,
      json: JSON.stringify(envelope),
    });

    const renderer = await ReactThreeTestRenderer.create(
      <CompositionModel
        composition={related}
        instanceId="placement-related"
        transform={{ x: 0, y: 0, z: 0, rotationY: 0 }}
      />
    );

    const tableLeaf = renderer.scene.findByProps({
      name: `composition-leaf-${tableId}`,
    });
    expect(tableLeaf.children[0]?.props.position).toEqual([
      -0.22944039237606742, 0, -0.7073681324665922,
    ]);
  });

  it('passes a synthetic non-zero authored yaw to its visual leaf', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <CompositionModel
        composition={withSingleLeaf(0.456)}
        instanceId="placement-rotated-leaf"
        transform={{ x: 0, y: 0, z: 0, rotationY: 0 }}
      />
    );

    const leaf = renderer.scene.findByProps({
      name: 'composition-leaf-synthetic-leaf',
    });
    expect(leaf.children[0]?.props.rotation).toEqual([0, 0.456, 0]);
  });

  it('keeps decode and leaf errors inside caller-owned placement boundaries', async () => {
    controlledLeaf.behavior = 'throw';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const malformed = create(CompositionSchema, {
      ...composition,
      json: '{not valid scene json',
    });

    const renderer = await ReactThreeTestRenderer.create(
      <>
        <BoundedCompositionModel
          value={composition}
          instanceId="healthy-placement"
        />
        <BoundedCompositionModel
          value={malformed}
          instanceId="decode-failure"
        />
        <BoundedCompositionModel
          value={withSingleLeaf(controlledLeaf.rotationY)}
          instanceId="leaf-failure"
        />
      </>
    );

    expect(
      renderer.scene.findByProps({
        name: 'composition-placement-healthy-placement',
      })
    ).toBeDefined();
    expect(
      renderer.scene.findByProps({ name: 'composition-error-decode-failure' })
    ).toBeDefined();
    expect(
      renderer.scene.findByProps({ name: 'composition-error-leaf-failure' })
    ).toBeDefined();
  });

  it('uses the caller-owned R3F fallback while a leaf suspends', async () => {
    controlledLeaf.behavior = 'suspend';

    const renderer = await ReactThreeTestRenderer.create(
      <BoundedCompositionModel
        value={withSingleLeaf(controlledLeaf.rotationY)}
        instanceId="pending-placement"
      />
    );

    expect(
      renderer.scene.findByProps({
        name: 'composition-loading-pending-placement',
      })
    ).toBeDefined();
  });

  it('renders two independently transformed roots with unchanged visual parts', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <>
        <CompositionModel
          composition={composition}
          instanceId="placement-a"
          transform={{ x: 1, y: 0, z: 2, rotationY: 0 }}
        />
        <CompositionModel
          composition={composition}
          instanceId="placement-b"
          transform={{ x: -3, y: 0, z: 5, rotationY: Math.PI / 2 }}
        />
      </>
    );

    const first = renderer.scene.findByProps({
      name: 'composition-placement-placement-a',
    });
    const second = renderer.scene.findByProps({
      name: 'composition-placement-placement-b',
    });
    expect(first.props.position).toEqual([1, 0, 2]);
    expect(second.props.position).toEqual([-3, 0, 5]);
    expect(first.props.rotation).toEqual([0, 0, 0]);
    expect(second.props.rotation).toEqual([0, Math.PI / 2, 0]);
    expect(first.children).toHaveLength(5);
    expect(second.children).toHaveLength(5);
    expect(
      first.children.map((leaf) => leaf.children[0]?.props.position)
    ).toEqual(second.children.map((leaf) => leaf.children[0]?.props.position));
  });
});
