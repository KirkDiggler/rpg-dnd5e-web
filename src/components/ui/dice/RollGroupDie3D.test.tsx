import { render } from '@testing-library/react';
import { useEffect } from 'react';
import { Group } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiceMotionPose } from './diceMotionSolver';
import type { DiceRollGroupDie } from './diceRollGroup';
import type { DiceRuntimePreset } from './diceRuntimeManifest';
import { parseDiceRuntimeManifest } from './diceRuntimeManifest';
import { validDiceRuntimeManifest } from './diceRuntimeTestFixtures';
import type { DiceMaterialTreatment } from './materialFreeCarvedMesh';
import { RollGroupDie3D, type RollGroupDie3DProps } from './RollGroupDie3D';

const mocks = vi.hoisted(() => ({
  productionSnapshot: undefined as Record<string, unknown> | undefined,
  conceptSnapshot: undefined as Record<string, unknown> | undefined,
  productionPreload: vi.fn().mockResolvedValue(undefined),
  conceptPreload: vi.fn().mockResolvedValue(undefined),
  meshCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="group-canvas">{children}</div>
  ),
}));
vi.mock('./diceRuntimeProvider', () => ({
  getDiceRuntimePresetSnapshot: () => mocks.productionSnapshot,
  preloadDiceRuntimePreset: (presetId: string) =>
    mocks.productionPreload(presetId),
}));
vi.mock('./conceptDiceRuntimeProvider', () => ({
  getConceptDiceRuntimePresetSnapshot: () => mocks.conceptSnapshot,
  preloadConceptDiceRuntimePreset: (presetId: string) =>
    mocks.conceptPreload(presetId),
}));
vi.mock('./RuntimeDiceMesh', () => ({
  RuntimeDiceMesh: (props: Record<string, unknown>) => {
    mocks.meshCalls.push(props);
    const onReady = props.onReady as
      | ((input: { runtimeSourceId: number; runtimeCloneId: number }) => void)
      | undefined;
    useEffect(() => {
      onReady?.({ runtimeSourceId: 11, runtimeCloneId: 12 });
    }, [onReady]);
    return <div data-testid="mock-runtime-dice-mesh" />;
  },
}));

const POSE: DiceMotionPose = Object.freeze({
  quaternion: Object.freeze([0, 0, 0, 1] as const),
  translation: Object.freeze([0, 0, 0] as const),
  shadow: Object.freeze({
    translation: Object.freeze([0, 0, 0] as const),
    scale: 1,
    opacity: 0.3,
  }),
  observeNow: false,
  exactTargetHeld: false,
  failed: false,
});
const TREATMENT: DiceMaterialTreatment = Object.freeze({
  bodyColor: '#15233b',
  numeralColor: '#f5eddc',
  roughness: 0.72,
  metalness: 0.08,
});

function presetFor(kind: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20') {
  const value = validDiceRuntimeManifest(kind);
  value.presets[0].presetId = `dice.original.carved.${kind}`;
  const parsed = parseDiceRuntimeManifest(value);
  if (!parsed.ok) throw Error(parsed.reason);
  return parsed.manifest.presets[0];
}

function readySnapshot(
  preset: DiceRuntimePreset,
  assurance: 'verified-production' | 'provisional-concept'
) {
  const scene = new Group();
  return {
    status: 'ready' as const,
    assurance,
    preset,
    scene,
    binding: Object.freeze({
      objectNode:
        preset.model.selectors.kind === 'single-mesh'
          ? preset.model.selectors.objectNode
          : 'root',
      meshDefinition:
        preset.model.selectors.kind === 'single-mesh'
          ? preset.model.selectors.meshDefinition
          : 'shell',
      meshDefinitionIndex: 0,
    }),
  };
}

function dieFor(
  kind: DiceRollGroupDie['kind'],
  presetId: string,
  finalFace: number
): DiceRollGroupDie {
  return {
    id: `${kind}:1`,
    kind,
    presetId,
    setId: 'set:1',
    originalFace: finalFace,
    finalFace,
    rerolls: [],
    disposition: 'counted',
    sourceRef: 'source:1',
    sourceLabel: 'Source',
    contributorMemberId: 'member:1',
    purpose: 'base',
  };
}

function props(
  die: DiceRollGroupDie,
  displayedFace: number
): RollGroupDie3DProps {
  return {
    die,
    displayedFace,
    presentationToken: 1,
    pose: POSE,
    treatment: TREATMENT,
  };
}

beforeEach(() => {
  mocks.productionSnapshot = undefined;
  mocks.conceptSnapshot = undefined;
  mocks.productionPreload.mockClear();
  mocks.conceptPreload.mockClear();
  mocks.meshCalls = [];
});

describe('RollGroupDie3D', () => {
  it.each([
    ['d4', 4],
    ['d6', 6],
    ['d8', 8],
    ['d10', 10],
    ['d12', 12],
    ['d20', 20],
  ] as const)(
    'validates displayedFace through the %s preset result list',
    async (kind, face) => {
      const preset = presetFor(kind);
      const assurance =
        kind === 'd20' ? 'verified-production' : 'provisional-concept';
      const snapshot = readySnapshot(preset, assurance);
      if (kind === 'd20') mocks.productionSnapshot = snapshot;
      else mocks.conceptSnapshot = snapshot;
      const onFailure = vi.fn();

      render(
        <RollGroupDie3D
          {...props(dieFor(kind, preset.presetId, face), face)}
          onFailure={onFailure}
        />
      );

      expect(onFailure).not.toHaveBeenCalled();
      expect(mocks.meshCalls).toHaveLength(1);
      expect(mocks.meshCalls[0].source).toMatchObject({ preset });
    }
  );

  it.each([
    ['d6', 7],
    ['d10', 0],
    ['d12', 13],
  ] as const)(
    'rejects an unmapped %s displayedFace before rendering',
    (kind, face) => {
      const preset = presetFor(kind);
      mocks.conceptSnapshot = readySnapshot(preset, 'provisional-concept');
      const onFailure = vi.fn();

      render(
        <RollGroupDie3D
          {...props(dieFor(kind, preset.presetId, Math.min(face, 1)), face)}
          onFailure={onFailure}
        />
      );

      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(onFailure).toHaveBeenCalledWith(
        `${kind}:1`,
        expect.stringMatching(/mapped|supported|settlement/i)
      );
      expect(mocks.meshCalls).toHaveLength(0);
    }
  );

  it('fails missing, unmapped, and non-provisional concept readiness exactly once', () => {
    const preset = presetFor('d6');
    const die = dieFor('d6', preset.presetId, 3);
    const onFailure = vi.fn();

    mocks.conceptSnapshot = {
      status: 'failed',
      assurance: 'provisional-concept',
      failureReason: 'concept model unavailable',
    };
    render(<RollGroupDie3D {...props(die, 3)} onFailure={onFailure} />);
    expect(onFailure).toHaveBeenCalledTimes(1);

    onFailure.mockClear();
    mocks.conceptSnapshot = readySnapshot(preset, 'verified-production');
    render(<RollGroupDie3D {...props(die, 3)} onFailure={onFailure} />);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][1]).toMatch(/assurance|provisional/i);
  });

  it('keeps production d20 assurance and ownership separate from provisional concept d6', async () => {
    const d20 = presetFor('d20');
    const d6 = presetFor('d6');
    mocks.productionSnapshot = readySnapshot(d20, 'verified-production');
    mocks.conceptSnapshot = readySnapshot(d6, 'provisional-concept');
    const ready = vi.fn();

    render(
      <>
        <RollGroupDie3D
          {...props(dieFor('d20', d20.presetId, 20), 20)}
          onReady={(input) => ready(input)}
        />
        <RollGroupDie3D
          {...props(dieFor('d6', d6.presetId, 6), 6)}
          onReady={(input) => ready(input)}
        />
      </>
    );

    expect(mocks.productionPreload).not.toHaveBeenCalledWith(d6.presetId);
    expect(mocks.conceptPreload).not.toHaveBeenCalledWith(d20.presetId);
    expect(mocks.meshCalls.map((call) => call.source)).toEqual([
      expect.objectContaining({ preset: d20 }),
      expect.objectContaining({ preset: d6 }),
    ]);
    expect(ready).toHaveBeenCalledTimes(2);
    expect(ready).toHaveBeenCalledWith({
      dieId: 'd20:1',
      assurance: 'verified-production',
      runtimeSourceId: 11,
      runtimeCloneId: 12,
    });
    expect(ready).toHaveBeenCalledWith({
      dieId: 'd6:1',
      assurance: 'provisional-concept',
      runtimeSourceId: 11,
      runtimeCloneId: 12,
    });
  });
});
