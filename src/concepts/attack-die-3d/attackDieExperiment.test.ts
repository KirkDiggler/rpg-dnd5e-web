import { describe, expect, it } from 'vitest';
import {
  PROVISIONAL_VISUAL_DEFAULTS,
  attackDieExperimentReducer,
  createAttackDieExperiment,
  exportCalibrationProposal,
  rotateLocal,
} from './attackDieExperiment';

const asset = {
  url: '/models/synty/props/SM_Prop_D20_Lightning_01.glb' as const,
  sha256: 'a'.repeat(64),
};
const coordinates = {
  quaternionOrder: 'xyzw' as const,
  handedness: 'right' as const,
  upAxis: '+Y' as const,
  rootCorrection: [0, 0, 0, 1] as const,
  normalizationEpsilon: 0.000001 as const,
};
const selectors = {
  blenderSuffixPattern: '\\.\\d{3}$' as const,
  node: 'synthetic-node',
  sourceMesh: 'synthetic-source',
  bodyPrimitive: { material: 'synthetic-body' },
  numeralPrimitive: { material: 'synthetic-numerals' },
};

describe('attack die experiment', () => {
  it('starts explicitly unverified, with zero inferred/saved faces and exact defaults', () => {
    const state = createAttackDieExperiment();
    expect(state.faces).toEqual([]);
    expect(state.camera).toBe('top');
    expect(PROVISIONAL_VISUAL_DEFAULTS).toMatchObject({
      approval: 'unverified-provisional',
      topCamera: { fov: 35, near: 0.1, far: 100, position: [0, 4, 0] },
      threeQuarterCamera: { position: [3, 2.4, 3] },
      viewportCss: [320, 320],
      outputPixels: [640, 640],
      devicePixelRatio: 2,
      dieScale: 0.75,
      ambientIntensity: 0.65,
      keyLight: { position: [4, 6, 5], intensity: 3 },
      fillLight: { position: [-4, 2, -3], intensity: 1.2 },
      shaderRevision: 'attack-die-magical-v1',
      environment: null,
    });
  });

  it('switches camera without changing pose and applies coarse/fine local-axis rotations', () => {
    const state = createAttackDieExperiment();
    const rotated = attackDieExperimentReducer(state, {
      type: 'rotate',
      axis: 'x',
      degrees: 0.1,
    });
    const camera = attackDieExperimentReducer(rotated, {
      type: 'camera',
      camera: 'three-quarter',
    });
    expect(camera.pose).toEqual(rotated.pose);
    expect(camera.camera).toBe('three-quarter');
    expect(camera.pose).toEqual(rotateLocal([0, 0, 0, 1], 'x', 0.1));
  });

  it('saves normalized unique mappings for results 1–20 and resets to saved pose', () => {
    let state = createAttackDieExperiment();
    state = attackDieExperimentReducer(
      { ...state, pose: [0, 0, 0, 2] },
      { type: 'save' }
    );
    expect(state.faces).toEqual([{ result: 1, quaternion: [0, 0, 0, 1] }]);
    state = attackDieExperimentReducer(
      { ...state, pose: [1, 0, 0, 0] },
      { type: 'save' }
    );
    expect(state.faces).toHaveLength(1);
    state = attackDieExperimentReducer(state, {
      type: 'rotate',
      axis: 'y',
      degrees: 15,
    });
    state = attackDieExperimentReducer(state, { type: 'reset' });
    expect(state.pose).toEqual([1, 0, 0, 0]);
    expect(() =>
      attackDieExperimentReducer(state, { type: 'result', result: 21 })
    ).toThrow();
  });

  it.each([0, 1, 20])(
    'exports %i mappings as a loud proposal without approval/provenance claims',
    (count) => {
      const faces = Array.from({ length: count }, (_, index) => ({
        result: index + 1,
        quaternion: [0, 0, 0, 1] as const,
      }));
      const proposal = exportCalibrationProposal({
        webCommit: 'b'.repeat(40),
        webBuildSha256: null,
        asset,
        coordinates,
        selectors,
        faces,
        materialMode: 'magical',
      });
      expect(proposal.warning).toBe('PROVISIONAL — NOT AN ASSET CONTRACT');
      expect(proposal.faces).toHaveLength(count);
      expect(proposal.tupleDraft.topCamera.position).toEqual([0, 4, 0]);
      expect(JSON.stringify(proposal)).not.toMatch(
        /provenance|human|verified|PASS/
      );
    }
  );

  it('rejects duplicate, invalid, or unnormalizable proposal mappings', () => {
    const base = {
      webCommit: 'b'.repeat(40),
      webBuildSha256: null,
      asset,
      coordinates,
      selectors,
      materialMode: 'magical' as const,
    };
    expect(() =>
      exportCalibrationProposal({
        ...base,
        faces: [
          { result: 1, quaternion: [0, 0, 0, 1] },
          { result: 1, quaternion: [0, 0, 0, 1] },
        ],
      })
    ).toThrow();
    expect(() =>
      exportCalibrationProposal({
        ...base,
        faces: [{ result: 21, quaternion: [0, 0, 0, 1] }],
      })
    ).toThrow();
    expect(() =>
      exportCalibrationProposal({
        ...base,
        faces: [{ result: 1, quaternion: [0, 0, 0, 0] }],
      })
    ).toThrow();
  });
});

describe('frozen proposal build binding', () => {
  it('allows null exploration, accepts injected matching hash, rejects invalid and mismatch', () => {
    const base = {
      webCommit: 'b'.repeat(40),
      asset,
      coordinates,
      selectors,
      materialMode: 'magical' as const,
      faces: [],
    };
    expect(
      exportCalibrationProposal({ ...base, webBuildSha256: null })
        .webBuildSha256
    ).toBeNull();
    window.__ATTACK_DIE_BUILD_SHA256__ = 'c'.repeat(64);
    expect(
      exportCalibrationProposal({ ...base, webBuildSha256: 'c'.repeat(64) })
        .webBuildSha256
    ).toBe('c'.repeat(64));
    expect(() =>
      exportCalibrationProposal({ ...base, webBuildSha256: 'bad' })
    ).toThrow(/SHA-256/);
    expect(() =>
      exportCalibrationProposal({ ...base, webBuildSha256: 'd'.repeat(64) })
    ).toThrow(/mismatch/);
    delete window.__ATTACK_DIE_BUILD_SHA256__;
  });
});
