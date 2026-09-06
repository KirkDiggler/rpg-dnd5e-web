import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
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
