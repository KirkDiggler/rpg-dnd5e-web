import { Matrix4, Quaternion, Vector3 } from 'three';

type Tuple3 = readonly [number, number, number];

export function lookAtQuaternion(position: Tuple3, target: Tuple3): Quaternion {
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().lookAt(
      new Vector3(...position),
      new Vector3(...target),
      new Vector3(0, 1, 0)
    )
  );
}
