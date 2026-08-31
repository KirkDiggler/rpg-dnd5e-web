import { Vector3 } from 'three';
import { expect, it } from 'vitest';
import { lookAtQuaternion } from './offHandCamera';

it('aims a camera negative-Z axis at the requested target', () => {
  const position = [-1.5, 1.3, 1.1] as const;
  const target = [-0.55, 1.0, 0] as const;
  const quaternion = lookAtQuaternion(position, target);
  const actual = new Vector3(0, 0, -1).applyQuaternion(quaternion).normalize();
  const expected = new Vector3(...target)
    .sub(new Vector3(...position))
    .normalize();
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
});
