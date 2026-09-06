import { create } from '@bufbuild/protobuf';
import {
  CompositionSchema,
  type Composition,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import decoratedTableJson from './fixtures/decorated-table.scene.json?raw';

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
  }) => (
    <group
      name={`prop-model-leaf-${variant.name}`}
      position={position}
      rotation={[0, rotationY, 0]}
      userData={{ anchor }}
    />
  ),
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

describe('CompositionModel', () => {
  it('keeps authored leaf transforms relative to one placement root', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <CompositionModel
        composition={composition}
        transform={{ x: 4, y: 0.25, z: -2, rotationY: Math.PI / 3 }}
      />
    );

    const root = renderer.scene.findByProps({
      name: 'composition-placement-decorated-table',
    });
    expect(root.props.position).toEqual([4, 0.25, -2]);
    expect(root.props.rotation).toEqual([0, Math.PI / 3, 0]);

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
