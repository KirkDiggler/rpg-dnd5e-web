import ReactThreeTestRenderer from '@react-three/test-renderer';
import { isValidElement, type ReactNode } from 'react';
import { beforeAll, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => ({
  Html: ({
    style,
    children,
  }: {
    style?: { pointerEvents?: string };
    children?: ReactNode;
  }) => (
    <group
      name="region-html-label"
      userData={{
        pointerEvents: style?.pointerEvents,
        label: isValidElement<{ 'aria-label'?: string }>(children)
          ? children.props['aria-label']
          : undefined,
      }}
    />
  ),
}));

import { RegionLabels3D } from './RegionLabels3D';

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

it('each resolved region renders one 3D label', async () => {
  const renderer = await ReactThreeTestRenderer.create(
    <RegionLabels3D
      labels={[
        {
          id: 'hall',
          text: 'Great hall',
          location: { x: 2, z: -3 },
          colour: '#7d8cf0',
        },
        {
          id: 'yard',
          text: 'Courtyard',
          location: { x: 0, z: 4 },
          colour: '#8fb0a8',
        },
      ]}
    />
  );
  const labels = renderer.scene.findAllByProps({ name: 'region-html-label' });
  expect(labels.map((label) => label.instance.userData.label)).toEqual([
    'Region Great hall',
    'Region Courtyard',
  ]);
  expect(
    labels.every((label) => label.instance.userData.pointerEvents === 'none')
  ).toBe(true);
  const hall = renderer.scene.findByProps({ name: 'region-label-hall' });
  expect(hall.instance.position.x).toBe(2);
  expect(hall.instance.position.z).toBe(-3);
  await renderer.unmount();
});
