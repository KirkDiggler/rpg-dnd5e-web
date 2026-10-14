import { describe, expect, it } from 'vitest';
import { createLayoutTransform, worldToClient } from './layoutGeometry';
import { frameOf } from './overviewFrame';

const viewport = { left: 0, top: 0, width: 1000, height: 600 };
const target = { minX: 10, maxX: 20, minZ: -5, maxZ: 5 };

describe('frameOf', () => {
  it('centres the target on the surface and fits it', () => {
    const frame = frameOf(target, viewport, 40)!;
    const transform = createLayoutTransform(viewport, frame, 40)!;
    const centre = worldToClient({ x: 15, z: 0 }, transform)!;
    expect(centre.x).toBeCloseTo(500);
    expect(centre.y).toBeCloseTo(300);
    const right = worldToClient({ x: 20, z: 5 }, transform)!;
    expect(right.y).toBeLessThanOrEqual(600);
  });

  it('fits and centres the target in the part an overlay leaves', () => {
    const frame = frameOf(target, viewport, 40, 0.9, { left: 0, right: 400 })!;
    const transform = createLayoutTransform(viewport, frame, 40)!;
    expect(worldToClient({ x: 15, z: 0 }, transform)!.x).toBeCloseTo(300);
    expect(worldToClient({ x: 20, z: 0 }, transform)!.x).toBeLessThanOrEqual(
      600
    );
  });
});
