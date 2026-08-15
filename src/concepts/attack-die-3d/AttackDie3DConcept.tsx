import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  AttackDie3D,
  type AttackDieTelemetry,
} from '../../components/ui/dice/AttackDie3D';
import {
  sha256Hex,
  validateAttackDieSidecar,
  type AttackDieRuntimeSidecar,
  type QuaternionTuple,
} from '../../components/ui/dice/attackDieContract';
import {
  getDiceRuntimePresetSnapshot,
  preloadDiceRuntimePreset,
  type DiceRuntimePresetSnapshot,
} from '../../components/ui/dice/diceRuntimeProvider';
import { DiceTray } from '../../components/ui/dice/DiceTray';
import {
  PROVISIONAL_VISUAL_DEFAULTS,
  PROVISIONAL_WARNING,
  attackDieExperimentReducer,
  createAttackDieExperiment,
  exportCalibrationProposal,
} from './attackDieExperiment';
import { DiceTray3DConceptPanel } from './DiceTray3DConceptPanel';

declare global {
  interface Window {
    __ATTACK_DIE_BUILD_SHA256__?: string;
    __attackDieEvidenceTelemetry?: AttackDieTelemetry;
    __attackDieProposalBuildSha256?: string | null;
    __attackDieEvidenceExpected?: { result: number; token: number };
  }
}
const stages = ['Appearance', 'Calibrate', 'Roll', 'Verify', 'Tray'] as const;
const ORIGINAL_CARVED_D20_PRESET_ID = 'dice.original.carved.d20';
const GLB_URL = '/models/synty/props/SM_Prop_D20_Lightning_01.glb';
const SOURCE_SIDECAR_URL =
  '/models/synty/dice/d20-lightning/attack-die-contract.json';
const fallbackOptions = [
  'none',
  'load',
  'webgl',
  'shader',
  'context-loss',
  'hash',
  'invalid-result',
  'unmapped',
] as const;
type ForcedFailure = Exclude<(typeof fallbackOptions)[number], 'none'>;

interface InspectedProvider {
  digest: string;
  sidecar: AttackDieRuntimeSidecar;
  scene: Awaited<ReturnType<GLTFLoader['parseAsync']>>['scene'];
  note: string;
}

function provisionalSidecar(digest: string): AttackDieRuntimeSidecar {
  const d = PROVISIONAL_VISUAL_DEFAULTS;
  const empty = '0'.repeat(64);
  return {
    schemaVersion: 1,
    kind: 'attack-die-runtime-contract',
    state: 'candidate',
    contractCoreSha256: empty,
    asset: { url: GLB_URL, sha256: digest },
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
      sourceMesh: 'D20_Lightning_preview_4pct_Mesh001',
      bodyPrimitive: {
        mesh: 'D20_Lightning_preview_4pct_Mesh001',
        material: 'D20_Lightning_Material',
      },
      numeralPrimitive: {
        mesh: 'D20_Lightning_preview_4pct_Mesh001_1',
        material: 'Paint_Material',
      },
    },
    faces: [],
    tuple: {
      webCommit: '0'.repeat(40),
      webBuildSha256: empty,
      glbSha256: digest,
      contractCoreSha256: empty,
      selectorRootRevision: d.selectorRootRevision,
      topCamera: d.topCamera,
      threeQuarterCamera: d.threeQuarterCamera,
      materialMode: 'magical',
      shaderRevision: d.shaderRevision,
      lightingRevision: d.lightingRevision,
      environmentRevision: d.environmentRevision,
      exposure: d.exposure,
      toneMapping: d.toneMapping,
      outputColorSpace: d.outputColorSpace,
      dieScale: d.dieScale,
      viewportCss: d.viewportCss,
      outputPixels: d.outputPixels,
      devicePixelRatio: d.devicePixelRatio,
      toleranceDegrees: 0.25,
    },
    evidence: null,
  };
}

async function loadInspectedProvider(): Promise<InspectedProvider> {
  const response = await fetch(GLB_URL);
  if (!response.ok) throw Error(`GLB load failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  const digest = await sha256Hex(bytes);
  const parsed = await new GLTFLoader().parseAsync(bytes, '');
  let sidecar = provisionalSidecar(digest);
  let note =
    'Hardcoded concept preview of the inspected GLB. Result 10 uses a geometry-inspected provisional pose; the full face map is not calibrated.';
  const sidecarResponse = await fetch(SOURCE_SIDECAR_URL);
  if (
    sidecarResponse.ok &&
    sidecarResponse.headers?.get('content-type')?.includes('application/json')
  ) {
    const candidate: unknown = await sidecarResponse.json();
    const checked = await validateAttackDieSidecar(candidate);
    if (!checked.ok)
      throw Error(`candidate sidecar invalid: ${checked.reason}`);
    if (checked.sidecar.state !== 'candidate')
      throw Error('development import requires candidate sidecar');
    if (checked.sidecar.asset.sha256 !== digest)
      throw Error('candidate GLB hash mismatch');
    sidecar = checked.sidecar;
    note =
      'Strictly validated candidate sidecar loaded for provisional evidence; it is not accepted as a verified runtime contract.';
  }
  return { digest, sidecar, scene: parsed.scene, note };
}

let pendingInspectedProvider: Promise<InspectedProvider> | undefined;

function loadPendingInspectedProvider() {
  if (pendingInspectedProvider) return pendingInspectedProvider;

  const pending = loadInspectedProvider();
  pendingInspectedProvider = pending;
  void pending.then(
    () => {
      if (pendingInspectedProvider === pending)
        pendingInspectedProvider = undefined;
    },
    () => {
      if (pendingInspectedProvider === pending)
        pendingInspectedProvider = undefined;
    }
  );
  return pending;
}

function useOriginalTrayProvider(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<DiceRuntimePresetSnapshot>(() =>
    getDiceRuntimePresetSnapshot(ORIGINAL_CARVED_D20_PRESET_ID)
  );
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const refresh = () => {
      if (active)
        setSnapshot(
          getDiceRuntimePresetSnapshot(ORIGINAL_CARVED_D20_PRESET_ID)
        );
    };
    const current = getDiceRuntimePresetSnapshot(ORIGINAL_CARVED_D20_PRESET_ID);
    setSnapshot(current);
    if (current.status === 'idle' || current.status === 'loading')
      void preloadDiceRuntimePreset(ORIGINAL_CARVED_D20_PRESET_ID).then(
        refresh,
        refresh
      );
    return () => {
      active = false;
    };
  }, [enabled]);
  return snapshot;
}

function useInspectedProvider(enabled: boolean) {
  const [provider, setProvider] = useState<InspectedProvider>();
  const [error, setError] = useState('Loading controlled provider bytes…');
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    void loadPendingInspectedProvider().then(
      (loaded) => {
        if (!active) return;
        setProvider(loaded);
        setError('');
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof Error ? caught.message : 'Provider load failed'
        );
        setLoading(false);
      }
    );
    return () => {
      active = false;
    };
  }, [enabled]);
  return { provider, error, loading };
}

const downloadJson = (name: string, value: unknown) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

function Metadata({
  provider,
  error,
}: {
  provider?: InspectedProvider;
  error: string;
}) {
  return (
    <dl className="attack-die-concept__metadata">
      <div>
        <dt>Provider</dt>
        <dd>{error || provider?.note}</dd>
      </div>
      <div>
        <dt>Actual GLB SHA-256</dt>
        <dd data-testid="actual-glb-digest">
          {provider?.digest ?? 'unavailable'}
        </dd>
      </div>
      <div>
        <dt>Body selector</dt>
        <dd>
          {provider?.sidecar.selectors.bodyPrimitive.material ?? 'unavailable'}
        </dd>
      </div>
      <div>
        <dt>Numeral selector</dt>
        <dd>
          {provider?.sidecar.selectors.numeralPrimitive.material ??
            'unavailable'}
        </dd>
      </div>
      <div>
        <dt>Human appearance approval</dt>
        <dd>Pending</dd>
      </div>
    </dl>
  );
}

export function AttackDie3DConcept() {
  const [stage, setStage] = useState(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('attackDieStage') === 'tray'
      ? 4
      : 0
  );
  const [token, setToken] = useState(1);
  const [state, dispatch] = useReducer(
    attackDieExperimentReducer,
    undefined,
    createAttackDieExperiment
  );
  const importedDigest = useRef<string | undefined>(undefined);
  const [forcedFailure, setForcedFailure] = useState<'none' | ForcedFailure>(
    'none'
  );
  const [telemetry, setTelemetry] = useState<AttackDieTelemetry>();
  const [forcedInvalidResult, setForcedInvalidResult] = useState<number>();
  const [machineRows, setMachineRows] = useState<
    Record<number, AttackDieTelemetry>
  >({});
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const { provider, error, loading } = useInspectedProvider(stage !== 4);
  const trayProvider = useOriginalTrayProvider(stage === 4);
  useEffect(() => {
    if (!provider || importedDigest.current === provider.digest) return;
    importedDigest.current = provider.digest;
    setToken((value) => value + 1);
    if (provider.sidecar.faces.length === 20)
      dispatch({ type: 'import-faces', faces: provider.sidecar.faces });
  }, [provider]);
  const [osReducedMotion, setOsReducedMotion] = useState(
    () =>
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setOsReducedMotion(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const effectiveReducedMotion = state.reducedMotion || osReducedMotion;
  const effectiveResult =
    forcedInvalidResult ?? state.verificationResult ?? state.selectedResult;
  const currentMapping = state.faces.find(
    (face) => face.result === effectiveResult
  );
  const displayedPose: QuaternionTuple =
    currentMapping?.quaternion ?? state.pose;
  const selectTab = (index: number) => {
    setStage(index);
    tabs.current[index]?.focus();
  };
  const replay = () => {
    dispatch({ type: 'replay' });
    setToken((value) => value + 1);
  };
  const handleTelemetry = useCallback(
    (event: AttackDieTelemetry) => {
      window.__attackDieEvidenceTelemetry = event;
      setTelemetry(event);
      if (stage === 3 && state.verificationResult)
        setMachineRows((rows) => ({
          ...rows,
          [state.verificationResult!]: event,
        }));
    },
    [stage, state.verificationResult]
  );
  useEffect(() => {
    window.__attackDieEvidenceExpected = { result: effectiveResult, token };
  }, [effectiveResult, token]);
  useEffect(() => {
    if (state.verificationResult === null) return;
    setToken((value) => value + 1);
  }, [state.verificationResult]);
  const proposal = useMemo(() => {
    if (!provider) return null;
    return exportCalibrationProposal({
      webCommit: import.meta.env.VITE_ATTACK_DIE_WEB_COMMIT || '0'.repeat(40),
      webBuildSha256: window.__ATTACK_DIE_BUILD_SHA256__ ?? null,
      asset: provider.sidecar.asset,
      coordinates: provider.sidecar.coordinates,
      selectors: provider.sidecar.selectors,
      materialMode: state.materialMode,
      faces: state.faces,
    });
  }, [provider, state.faces, state.materialMode]);
  useEffect(() => {
    window.__attackDieProposalBuildSha256 = proposal?.webBuildSha256 ?? null;
  }, [proposal]);

  return (
    <section className="attack-die-concept">
      <header>
        <p className="attack-die-concept__eyebrow">
          Development concept · production-intent renderer
        </p>
        <h2>Authoritative 3D Attack Die</h2>
        <p className="attack-die-concept__warning">
          {PROVISIONAL_WARNING} · Unverified provisional visual defaults
        </p>
        <p>
          The SVG remains semantic truth. This lab never drives or completes the
          encounter queue. Historical non-Tray Lightning authoring remains
          provisional; Tray uses the fixture-only Original carved d20 runtime.
        </p>
      </header>
      <div
        role="tablist"
        aria-label="Attack die stages"
        className="attack-die-concept__tabs"
      >
        {stages.map((name, index) => (
          <button
            key={name}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            role="tab"
            aria-selected={stage === index}
            tabIndex={stage === index ? 0 : -1}
            onClick={() => selectTab(index)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight')
                selectTab((index + 1) % stages.length);
              if (event.key === 'ArrowLeft')
                selectTab((index + stages.length - 1) % stages.length);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {stage === 4 && (
        <div
          role="tabpanel"
          aria-label={stages[stage]}
          className="attack-die-concept__stage attack-die-concept__stage--tray"
        >
          {trayProvider.status === 'idle' ||
          trayProvider.status === 'loading' ? (
            <p
              role="status"
              aria-live="polite"
              data-testid="dice-tray-provider-status"
            >
              Loading Original carved d20 provider…
            </p>
          ) : (
            <DiceTray3DConceptPanel
              token={token}
              reducedMotion={effectiveReducedMotion}
            />
          )}
        </div>
      )}
      {stage !== 4 && (
        <div
          role="tabpanel"
          aria-label={stages[stage]}
          className="attack-die-concept__stage"
        >
          <div className="attack-die-concept__controls">
            <h3>{stages[stage]}</h3>
            {stage === 0 && (
              <>
                <fieldset>
                  <legend>Material</legend>
                  {(['raw', 'magical'] as const).map((mode) => (
                    <label key={mode}>
                      <input
                        type="radio"
                        name="material"
                        checked={state.materialMode === mode}
                        onChange={() =>
                          dispatch({ type: 'material', materialMode: mode })
                        }
                      />{' '}
                      {mode === 'raw' ? 'Raw' : 'Magical'}
                    </label>
                  ))}
                </fieldset>
                <label>
                  <input
                    type="checkbox"
                    checked={state.magicalAnimation}
                    disabled={
                      state.reducedMotion || state.materialMode === 'raw'
                    }
                    onChange={(event) =>
                      dispatch({
                        type: 'magical-animation',
                        enabled: event.target.checked,
                      })
                    }
                  />{' '}
                  Animate magical treatment
                </label>
                <CameraControls camera={state.camera} dispatch={dispatch} />
                <p>
                  Top and three-quarter use the same pose, viewport, lighting,
                  and exposure.
                </p>
              </>
            )}
            {stage === 1 && (
              <>
                <ResultControl
                  result={state.selectedResult}
                  onResult={(result) => dispatch({ type: 'result', result })}
                />
                <CameraControls camera={state.camera} dispatch={dispatch} />
                <div
                  className="attack-die-concept__rotation"
                  aria-label="Local-axis calibration controls"
                >
                  {(['x', 'y', 'z'] as const).flatMap((axis) =>
                    [15, -15, 0.1, -0.1].map((degrees) => (
                      <button
                        key={`${axis}${degrees}`}
                        onClick={() =>
                          dispatch({ type: 'rotate', axis, degrees })
                        }
                      >
                        {axis.toUpperCase()} {degrees > 0 ? '+' : ''}
                        {degrees}°
                      </button>
                    ))
                  )}
                </div>
                <output aria-label="Current quaternion">
                  {state.pose.map((value) => value.toFixed(7)).join(', ')}
                </output>
                <p>
                  {currentMapping
                    ? 'Mapped (not human verified)'
                    : 'Unmapped — provisional pose is not a saved or inferred face'}
                </p>
                <button onClick={() => dispatch({ type: 'save' })}>
                  Save normalized proposal mapping
                </button>
                <button onClick={() => dispatch({ type: 'reset' })}>
                  Reset to saved pose
                </button>
                <button
                  disabled={!proposal}
                  onClick={() =>
                    proposal &&
                    downloadJson(
                      'attack-die-calibration-proposal.json',
                      proposal
                    )
                  }
                >
                  Export provisional proposal ({state.faces.length}/20)
                </button>
              </>
            )}
            {stage === 2 && (
              <>
                <ResultControl
                  result={state.selectedResult}
                  onResult={(result) => dispatch({ type: 'result', result })}
                />
                <CameraControls camera={state.camera} dispatch={dispatch} />
                <label>
                  <input
                    type="checkbox"
                    checked={state.reducedMotion}
                    onChange={(event) =>
                      dispatch({
                        type: 'reduced-motion',
                        enabled: event.target.checked,
                      })
                    }
                  />{' '}
                  Reduced motion (suppresses tumble/lightning)
                </label>
                <button onClick={replay}>
                  Replay decorative variation #{state.decorativeVariation + 1}
                </button>
                <Status
                  telemetry={telemetry}
                  target={currentMapping?.quaternion}
                />
              </>
            )}
            {stage === 3 && (
              <>
                <p>
                  Fixed order 1→20. Machine observations are separate from
                  pending human two-camera review.
                </p>
                <button
                  onClick={() => {
                    setMachineRows({});
                    dispatch({ type: 'verify-start', mode: 'animated' });
                  }}
                >
                  Run animated 1→20
                </button>
                <button
                  onClick={() => {
                    setMachineRows({});
                    dispatch({ type: 'verify-start', mode: 'reduced-motion' });
                  }}
                >
                  Run reduced-motion 1→20
                </button>
                <button
                  disabled={state.verificationResult === null}
                  onClick={() => dispatch({ type: 'verify-next' })}
                >
                  Next result
                </button>
                <p>
                  Current: {state.verificationResult ?? 'not running'} · Machine
                  rows: {Object.keys(machineRows).length}/20 · Human review:
                  pending for all top/three-quarter views
                </p>
              </>
            )}
            <label>
              Forced fallback
              <select
                value={forcedFailure}
                onChange={(event) => {
                  const next = event.target.value as typeof forcedFailure;
                  setForcedFailure(next);
                  setForcedInvalidResult(
                    next === 'invalid-result' ? 21 : undefined
                  );
                  setToken((value) => value + 1);
                }}
              >
                {fallbackOptions.map((failure) => (
                  <option key={failure} value={failure}>
                    {failure}
                  </option>
                ))}
              </select>
            </label>
            <Metadata provider={provider} error={error} />
          </div>
          <div
            className="attack-die-concept__viewport"
            data-camera={state.camera}
          >
            {loading ? (
              <DiceTray
                phase="settled"
                finalFace={effectiveResult}
                outcome={
                  effectiveResult === 20
                    ? 'CRIT'
                    : effectiveResult === 1
                      ? 'NAT-1'
                      : 'HIT'
                }
              />
            ) : (
              <AttackDie3D
                result={effectiveResult}
                presentationToken={token}
                phase="rolling"
                materialMode={state.materialMode}
                reducedMotion={effectiveReducedMotion}
                magicalAnimation={
                  state.magicalAnimation && !effectiveReducedMotion
                }
                decorativeSeed={token + state.decorativeVariation}
                fallback={
                  <DiceTray
                    phase="settled"
                    finalFace={effectiveResult}
                    outcome={
                      effectiveResult === 20
                        ? 'CRIT'
                        : effectiveResult === 1
                          ? 'NAT-1'
                          : 'HIT'
                    }
                  />
                }
                onTelemetry={handleTelemetry}
                cameraView={state.camera}
                calibrationPose={displayedPose}
                providerFailureReason={
                  ['load', 'hash'].includes(forcedFailure) && error
                    ? error
                    : undefined
                }
                forceFailure={forcedFailure === 'shader' ? 'shader' : undefined}
                sceneOverride={provider?.scene}
                sidecarOverride={provider?.sidecar}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CameraControls({
  camera,
  dispatch,
}: {
  camera: 'top' | 'three-quarter';
  dispatch: React.Dispatch<Parameters<typeof attackDieExperimentReducer>[1]>;
}) {
  return (
    <fieldset>
      <legend>Camera</legend>
      {(['top', 'three-quarter'] as const).map((view) => (
        <label key={view}>
          <input
            type="radio"
            name="camera"
            checked={camera === view}
            onChange={() => dispatch({ type: 'camera', camera: view })}
          />{' '}
          {view === 'top' ? 'Top' : 'Three-quarter'}
        </label>
      ))}
    </fieldset>
  );
}
function ResultControl({
  result,
  onResult,
}: {
  result: number;
  onResult: (value: number) => void;
}) {
  return (
    <label>
      Authoritative input{' '}
      <input
        aria-label="Authoritative input"
        type="number"
        min={1}
        max={20}
        value={result}
        onChange={(event) => {
          if (event.target.value === '') return;
          onResult(Number(event.target.value));
        }}
      />
    </label>
  );
}
function Status({
  telemetry,
  target,
}: {
  telemetry?: AttackDieTelemetry;
  target?: QuaternionTuple;
}) {
  return (
    <dl className="attack-die-concept__metadata">
      <div>
        <dt>Requested</dt>
        <dd>{telemetry?.requestedResult ?? 'pending'}</dd>
      </div>
      <div>
        <dt>Mapped target</dt>
        <dd>{target?.join(', ') ?? 'unmapped'}</dd>
      </div>
      <div>
        <dt>Measured error</dt>
        <dd>{telemetry?.angularErrorDegrees ?? 'not observed'}</dd>
      </div>
      <div>
        <dt>Renderer lock/fallback</dt>
        <dd>{telemetry?.renderer ?? 'pending'}</dd>
      </div>
    </dl>
  );
}
