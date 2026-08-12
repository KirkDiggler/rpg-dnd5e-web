import { describe, expect, it } from 'vitest';
import {
  canonicalCoreJson,
  normalizeSelectorName,
  validateAttackDieSidecar,
} from './attackDieContract';

const q = (result: number) => ({ result, quaternion: [0, 0, 0, 1] as const });
export const validSidecar = (
  state: 'candidate' | 'verified' = 'candidate'
) => ({
  schemaVersion: 1,
  kind: 'attack-die-runtime-contract',
  state,
  contractCoreSha256: 'a'.repeat(64),
  asset: {
    url: '/models/synty/props/SM_Prop_D20_Lightning_01.glb',
    sha256: 'b'.repeat(64),
  },
  coordinates: {
    quaternionOrder: 'xyzw',
    handedness: 'right',
    upAxis: '+Y',
    rootCorrection: [0, 0, 0, 1],
    normalizationEpsilon: 0.000001,
  },
  selectors: {
    blenderSuffixPattern: '\\.\\d{3}$',
    node: 'D20_Lightning_preview_4pct',
    mesh: 'D20_Lightning_preview_4pct_Mesh',
    bodyMaterial: 'D20_Lightning_Material',
    numeralMaterial: 'Paint_Material',
    materialSlots: 2,
  },
  faces: Array.from({ length: 20 }, (_, i) => q(i + 1)),
  tuple: {
    webCommit: 'c'.repeat(40),
    webBuildSha256: 'd'.repeat(64),
    glbSha256: 'b'.repeat(64),
    contractCoreSha256: 'a'.repeat(64),
    selectorRootRevision: 'v1',
    topCamera: {
      type: 'perspective',
      fov: 35,
      near: 0.1,
      far: 100,
      position: [0, 4, 0],
      target: [0, 0, 0],
      up: [0, 0, -1],
    },
    threeQuarterCamera: {
      type: 'perspective',
      fov: 35,
      near: 0.1,
      far: 100,
      position: [3, 3, 3],
      target: [0, 0, 0],
      up: [0, 1, 0],
    },
    materialMode: 'magical',
    shaderRevision: 'v1',
    lightingRevision: 'v1',
    environmentRevision: 'v1',
    exposure: 1,
    toneMapping: 'ACESFilmic',
    outputColorSpace: 'sRGB',
    dieScale: 1,
    viewportCss: [400, 400],
    outputPixels: [800, 800],
    devicePixelRatio: 2,
    toleranceDegrees: 0.25,
  },
  evidence: null,
});

describe('attack die contract', () => {
  it('rejects unknown, missing, partial and invalid quaternion data', async () => {
    expect(
      (await validateAttackDieSidecar({ ...validSidecar(), surprise: true })).ok
    ).toBe(false);
    expect(
      (
        await validateAttackDieSidecar({
          ...validSidecar(),
          faces: validSidecar().faces.slice(1),
        })
      ).ok
    ).toBe(false);
    expect(
      (
        await validateAttackDieSidecar({
          ...validSidecar(),
          faces: [...validSidecar().faces.slice(0, 19), q(19)],
        })
      ).ok
    ).toBe(false);
    expect(
      (
        await validateAttackDieSidecar({
          ...validSidecar(),
          faces: [
            ...validSidecar().faces.slice(0, 19),
            { result: 20, quaternion: [0, 0, 0, 0] },
          ],
        })
      ).ok
    ).toBe(false);
  });
  it('binds schema/kind/core but excludes state and evidence from canonical core', () => {
    const a = validSidecar();
    const b = {
      ...a,
      state: 'verified' as const,
      evidence: {
        machineRunSha256: 'e'.repeat(64),
        humanReviewSha256: 'f'.repeat(64),
        performanceSha256: '1'.repeat(64),
      },
    };
    expect(canonicalCoreJson(a)).toBe(canonicalCoreJson(b));
    expect(canonicalCoreJson({ ...a, kind: 'changed' })).not.toBe(
      canonicalCoreJson(a)
    );
  });
  it('separately rejects verified contracts without complete valid evidence', async () => {
    expect(
      (
        await validateAttackDieSidecar(validSidecar('verified'), {
          verifyDigest: false,
        })
      ).ok
    ).toBe(false);
    expect(
      (
        await validateAttackDieSidecar(
          {
            ...validSidecar('verified'),
            evidence: {
              machineRunSha256: 'x',
              humanReviewSha256: 'f'.repeat(64),
              performanceSha256: '1'.repeat(64),
            },
          },
          { verifyDigest: false }
        )
      ).ok
    ).toBe(false);
  });
  it('normalizes only a Blender numeric suffix', () => {
    expect(normalizeSelectorName('Paint_Material.010')).toBe('Paint_Material');
    expect(normalizeSelectorName('Paint_Material.extra')).toBe(
      'Paint_Material.extra'
    );
  });
});
