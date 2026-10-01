import ReactThreeTestRenderer from '@react-three/test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ObservationMarkers } from './ObservationMarkers';

// Only the DOM portal is doubled; real R3F marker geometry and state render.
vi.mock('@react-three/drei', () => ({
  Html: ({ children }: { children: React.ReactNode }) => (
    <group userData={{ label: children }} />
  ),
}));
beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('shared observation markers', () => {
  it('renders supplied position and current/remembered treatment, then removes replaced markers', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <ObservationMarkers
        markers={[
          {
            id: 'vase',
            label: 'Vase',
            knowledge: 'visible',
            position: { x: 3, z: 5 },
          },
          {
            id: 'door',
            label: 'Door open',
            knowledge: 'remembered',
            position: { x: 9, z: 1 },
          },
        ]}
      />
    );
    const root = renderer.scene.findByProps({ name: 'observation-markers' });
    expect(root.children[0].instance.position.toArray()).toEqual([3, 0, 5]);
    expect(root.children[1].instance.position.toArray()).toEqual([9, 0, 1]);
    const materials = renderer.scene.findAllByType('MeshBasicMaterial');
    expect(materials.map((material) => material.props.color)).toEqual([
      '#6ee7b7',
      '#fbbf24',
    ]);
    const labels = renderer.scene.findAll(
      (node) => !!node.props.userData?.label
    );
    expect(labels[0].props.userData.label.props.children).toEqual([
      'Current',
      ' · ',
      'Vase',
    ]);
    expect(labels[1].props.userData.label.props.children).toEqual([
      'Remembered',
      ' · ',
      'Door open',
    ]);
    await renderer.update(<ObservationMarkers markers={[]} />);
    expect(
      renderer.scene.findByProps({ name: 'observation-markers' }).children
    ).toHaveLength(0);
    await renderer.unmount();
  });
});
