import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useRef } from 'react';
import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cubeToWorld, type CubeCoord } from './hexMath';
import { advanceDisplacementFrame, useHexMovePath } from './useHexMovePath';

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
const origin = { x: 0, y: 0, z: 0 };
const a = { x: 1, y: -1, z: 0 };
const b = { x: 1, y: -2, z: 1 };
describe('displaced movement in the one positional writer', () => {
  it('follows corners over180ms and carries large-frame overshoot', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
    ];
    const half = advanceDisplacementFrame(
      { points, index: 0, elapsed: 0 },
      0.09
    )!;
    expect(half.position).toEqual(points[1]);
    const finish = advanceDisplacementFrame(
      { points, index: half.index, elapsed: half.elapsed },
      0.09
    )!;
    expect(finish.position).toEqual(points[2]);
    expect(finish.index).toBe(2);
    expect(
      advanceDisplacementFrame({ points, index: 0, elapsed: 0 }, 1)?.position
    ).toEqual(points[2]);
    expect(
      advanceDisplacementFrame({ points: [], index: 0, elapsed: 0 }, 1)
    ).toBeUndefined();
    expect(
      advanceDisplacementFrame({ points: [points[0]], index: 0, elapsed: 0 }, 1)
    ).toBeUndefined();
  });
  it('bypasses a closed idle gate only for displaced movement, holds facing, and fences superseded completion', async () => {
    const heading = vi.fn();
    const complete = vi.fn();
    const gate = vi.fn(() => false);
    function Token({
      seq,
      displaced = false,
      path = [a],
    }: {
      seq?: number;
      displaced?: boolean;
      path?: CubeCoord[];
    }) {
      const ref = useRef<THREE.Group>(null);
      useHexMovePath(origin, path, seq, 1, 0, ref, heading, complete, false, {
        canAdvance: gate,
        speed: 1,
        displaced,
      });
      return <group ref={ref} />;
    }
    const renderer = await ReactThreeTestRenderer.create(<Token />);
    const group = renderer.scene.children[0].instance as THREE.Group;
    await renderer.update(<Token seq={1} />);
    await renderer.advanceFrames(1, 1);
    expect(group.position.x).toBe(0);
    expect(gate).toHaveBeenCalledWith(1);
    heading.mockClear();
    gate.mockClear();
    await renderer.update(<Token seq={2} displaced path={[a, b]} />);
    await renderer.advanceFrames(1, 0.03);
    expect(group.position.x).toBeGreaterThan(0);
    expect(heading).not.toHaveBeenCalled();
    expect(gate).not.toHaveBeenCalled();
    await renderer.update(<Token seq={3} displaced path={[origin]} />);
    await renderer.advanceFrames(1, 0.18);
    expect(complete.mock.calls).toEqual([[3]]);
    expect(group.position.x).toBe(0);
    await renderer.advanceFrames(5, 1);
    expect(complete).toHaveBeenCalledOnce();
    await renderer.update(<Token seq={4} displaced path={[a, b]} />);
    await renderer.advanceFrames(1, 0.18);
    expect(group.position.x).toBe(cubeToWorld(b, 1).x);
    expect(group.position.z).toBe(cubeToWorld(b, 1).z);
    await renderer.unmount();
  });
});
