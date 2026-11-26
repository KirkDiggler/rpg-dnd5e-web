import { describe, expect, it } from 'vitest';
import { editorCameraFrame } from './materialEditorFraming';

describe('camera-only asset framing', () => {
  it('fits small chairs visibly without changing source bounds', () => {
    const b = {
      min: [-25, 0, -25] as [number, number, number],
      max: [25, 100, 25] as [number, number, number],
    };
    const before = JSON.stringify(b);
    const f = editorCameraFrame(b, 0.01, 0, 1540, 710);
    expect(f.zoom).toBeGreaterThan(350);
    expect(f.target).toEqual([0, 0.5, 0]);
    expect(JSON.stringify(b)).toBe(before);
  });
  it('fits large and flat assets and responds to viewport resizing', () => {
    const b = {
      min: [0, 0, 0] as [number, number, number],
      max: [1000, 1, 1000] as [number, number, number],
    };
    const a = editorCameraFrame(b, 0.01, 0, 1540, 710),
      c = editorCameraFrame(b, 0.01, 0, 700, 400);
    expect(a.zoom).toBeLessThan(90);
    expect(c.zoom).toBeLessThan(a.zoom);
    expect(a.target[1]).toBe(0.005);
  });
  it('handles point bounds with a finite projection and rejects malformed inputs', () => {
    const b = {
      min: [0, 0, 0] as [number, number, number],
      max: [0, 0, 0] as [number, number, number],
    };
    expect(Number.isFinite(editorCameraFrame(b, 1, 0, 100, 100).zoom)).toBe(
      true
    );
    expect(() => editorCameraFrame(b, 1, 0, 0, 100)).toThrow();
    expect(() =>
      editorCameraFrame({ ...b, max: [NaN, 0, 0] }, 1, 0, 100, 100)
    ).toThrow();
  });
});
