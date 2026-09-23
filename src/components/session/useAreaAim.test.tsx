// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { cubeToWorld } from '../hex-grid/hexMath';
import { useAreaAim } from './useAreaAim';
const state = vi.hoisted(() => ({ value: {} as unknown }));
vi.mock('@react-three/fiber', () => ({ useThree: () => state.value }));

it.each([false, true])(
  'aims over models, rejects drags and cleans up (snap=%s)',
  (snap) => {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 200 }) as DOMRect;
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 10, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    state.value = { gl: { domElement: canvas }, camera };
    const cast = vi.fn();
    const meshClick = vi.fn();
    canvas.addEventListener('click', meshClick);
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useAreaAim(enabled, 1, cast, snap),
      { initialProps: { enabled: true } }
    );
    const send = (name: string, x: number, y: number) =>
      act(() => {
        canvas.dispatchEvent(
          new MouseEvent(name, {
            clientX: x,
            clientY: y,
            button: 0,
            bubbles: true,
          })
        );
      });
    send('pointermove', 123, 117);
    const first = result.current!;
    expect(Number.isInteger(first.x)).toBe(snap);
    send('pointermove', 124, 117);
    if (!snap) {
      expect(result.current).not.toEqual(first);
      expect(cubeToWorld(result.current!, 1).x).toBeCloseTo(2.4);
    } else {
      expect(Number.isInteger(result.current!.x)).toBe(true);
      expect(Number.isInteger(result.current!.y)).toBe(true);
      expect(Number.isInteger(result.current!.z)).toBe(true);
    }
    send('pointerdown', 124, 117);
    send('click', 124, 117);
    expect(cast).toHaveBeenCalledWith(result.current);
    expect(meshClick).not.toHaveBeenCalled();
    send('pointerdown', 100, 100);
    send('click', 150, 100);
    expect(cast).toHaveBeenCalledTimes(1);
    rerender({ enabled: false });
    expect(result.current).toBeNull();
    send('click', 124, 117);
    expect(meshClick).toHaveBeenCalledTimes(1);
    unmount();
  }
);
