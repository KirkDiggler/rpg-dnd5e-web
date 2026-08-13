import { describe, expect, it } from 'vitest';
import {
  ATTACK_DIE_VISUAL_CONFIG,
  tupleFromVisualConfig,
} from './attackDieVisualConfig';
describe('renderer-owned visual authority', () => {
  it('projects the exact same camera/DPR/scale/exposure tuple for export', () => {
    const tuple = tupleFromVisualConfig({
      webCommit: 'a'.repeat(40),
      glbSha256: 'b'.repeat(64),
      materialMode: 'magical',
    });
    expect(tuple.topCamera).toBe(ATTACK_DIE_VISUAL_CONFIG.topCamera);
    expect(tuple.threeQuarterCamera).toBe(
      ATTACK_DIE_VISUAL_CONFIG.threeQuarterCamera
    );
    expect(tuple.devicePixelRatio).toBe(
      ATTACK_DIE_VISUAL_CONFIG.devicePixelRatio
    );
    expect(tuple.dieScale).toBe(ATTACK_DIE_VISUAL_CONFIG.dieScale);
    expect(tuple.exposure).toBe(ATTACK_DIE_VISUAL_CONFIG.exposure);
  });
});

it('maps every validated renderer visual constant and rejects drift', async () => {
  const { ACESFilmicToneMapping, SRGBColorSpace } = await import('three');
  const { resolveAttackDieRendererVisuals } =
    await import('./attackDieVisualRuntime');
  expect(resolveAttackDieRendererVisuals(ATTACK_DIE_VISUAL_CONFIG)).toEqual({
    toneMapping: ACESFilmicToneMapping,
    outputColorSpace: SRGBColorSpace,
    environment: null,
  });
  expect(() =>
    resolveAttackDieRendererVisuals({
      ...ATTACK_DIE_VISUAL_CONFIG,
      toneMapping: 'other',
    } as never)
  ).toThrow(/tone mapping/);
  expect(() =>
    resolveAttackDieRendererVisuals({
      ...ATTACK_DIE_VISUAL_CONFIG,
      outputColorSpace: 'other',
    } as never)
  ).toThrow(/color space/);
  expect(() =>
    resolveAttackDieRendererVisuals({
      ...ATTACK_DIE_VISUAL_CONFIG,
      environment: {},
    } as never)
  ).toThrow(/environment/);
  const tuple = tupleFromVisualConfig({
    webCommit: 'a'.repeat(40),
    glbSha256: 'b'.repeat(64),
    materialMode: 'raw',
  });
  for (const key of [
    'topCamera',
    'threeQuarterCamera',
    'devicePixelRatio',
    'dieScale',
    'exposure',
    'toneMapping',
    'outputColorSpace',
    'viewportCss',
    'outputPixels',
  ] as const)
    expect(tuple[key]).toBe(ATTACK_DIE_VISUAL_CONFIG[key]);
  expect(ATTACK_DIE_VISUAL_CONFIG.environment).toBeNull();
  expect(ATTACK_DIE_VISUAL_CONFIG.ambientIntensity).toBeTypeOf('number');
  expect(ATTACK_DIE_VISUAL_CONFIG.keyLight.position).toHaveLength(3);
  expect(ATTACK_DIE_VISUAL_CONFIG.fillLight.intensity).toBeTypeOf('number');
});
