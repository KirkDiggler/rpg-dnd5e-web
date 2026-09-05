import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { centeredFloorOffset } from './previewTransform';

describe('prop calibration scene', () => {
  it('centers scaled X/Z bounds and grounds the minimum Y before fine adjustment', () => {
    expect(
      centeredFloorOffset(
        { min: [1, -2, -3], max: [5, 4, 7] },
        1.125,
        [0.1, -0.01, -0.2]
      )
    ).toEqual([-3.275, 2.24, -2.45]);
  });

  it('demand-renders the real prop, real floor, and runtime fighter together', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/dev/prop-calibration/PropCalibrationScene.tsx'
      ),
      'utf8'
    );
    expect(source).toContain('useGLTF(url)');
    expect(source).toContain('SyntyHexFloor');
    expect(source).toContain('ClassCharacterModel');
    expect(source).toContain('frameloop="demand"');
    expect(source).toContain('SceneErrorBoundary');
    expect(source).toContain('ContextLossReporter');
  });
});
