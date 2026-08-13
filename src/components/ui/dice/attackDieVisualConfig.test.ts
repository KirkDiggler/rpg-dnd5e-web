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
