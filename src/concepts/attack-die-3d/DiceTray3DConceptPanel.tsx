import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import type {
  AttackDie3DProps,
  AttackDieMotionDiagnostic,
  AttackDieRendererInfo,
  AttackDieTelemetry,
} from '../../components/ui/dice/AttackDie3D';
import type { DicePresentationEvent } from '../../components/ui/dice/dicePresentationEvent';
import {
  DiceTrayPresentation,
  type DiceTrayPresentationBoundaryDiagnostic,
} from '../../components/ui/dice/DiceTrayPresentation';
import {
  parseVisualThrowProfile,
  type VisualThrowProfileV1,
} from '../../components/ui/dice/visualThrowProfile';
import { DiceTrayEncounterPreview } from './DiceTrayEncounterPreview';
import {
  appendDiceTrayWitnessEvent,
  createDiceTrayWitnessInitialEvents,
  scheduleMonsterDiceTrayWitnessRelease,
  type DiceTrayWitnessMode,
} from './diceTrayWitnessFixture';

type DiceTrayEvidenceExercise =
  | 'original'
  | 'unknown-safe-preset'
  | 'unmapped-result'
  | 'shader-failure';

export interface Stone1WitnessMotionFact {
  readonly motionRevision: 'choreographed-v1';
  readonly throwProfile?: VisualThrowProfileV1;
  readonly requestedResult: number;
  readonly observedUpwardResult?: number;
  readonly exactTargetHeld: boolean;
  readonly observedUpDot: number;
  readonly observedUpMargin: number;
  readonly angularErrorDegrees: number;
  readonly contextId?: number;
  readonly cloneId?: number;
}

interface Stone1RenderedMotionFact {
  readonly sequence: number;
  readonly phase: AttackDieMotionDiagnostic['phase'];
  readonly reducedMotion: boolean;
  readonly held: boolean;
  readonly translation: AttackDieMotionDiagnostic['translation'];
  readonly quaternion: AttackDieMotionDiagnostic['quaternion'];
}

interface Stone1FailureTelemetryFact {
  readonly renderer: 'svg';
  readonly state: 'failed';
  readonly requestedResult: number;
  readonly failureCode?: string;
}

interface Stone1WitnessEvidence {
  readonly rendererContextId?: number;
  readonly runtimeSourceId?: number;
  readonly runtimeCloneId?: number;
  readonly finalTelemetry?: Stone1WitnessMotionFact;
  readonly releaseProfile?: VisualThrowProfileV1;
  readonly motionSamples: readonly Stone1RenderedMotionFact[];
  readonly failureTelemetry?: Stone1FailureTelemetryFact;
}

interface Stone1TrayEvidenceBridge {
  readonly request: {
    readonly identity: string;
    readonly result: number;
    readonly presetId: string;
  };
  readonly shared: {
    readonly eventArrayId: number;
    readonly providerId?: number;
  };
  readonly witnesses: {
    readonly roller: Stone1WitnessEvidence;
    readonly spectator: Stone1WitnessEvidence;
  };
  readonly rollerGrabbed: boolean;
  readonly spectatorGrabbed: boolean;
  readonly releaseCount: number;
  readonly releaseSchemaVersion?: number;
  readonly lifecyclePhase: 'armed' | 'rolling' | 'settled' | 'mixed';
}

declare global {
  interface Window {
    __stone1TrayEvidence?: Stone1TrayEvidenceBridge;
  }
}

const evidenceObjectIds = new WeakMap<object, number>();
let nextEvidenceObjectId = 1;
function evidenceObjectId(value: object) {
  const existing = evidenceObjectIds.get(value);
  if (existing !== undefined) return existing;
  const identity = nextEvidenceObjectId++;
  evidenceObjectIds.set(value, identity);
  return identity;
}

type WitnessIdentity = 'roller' | 'spectator';

interface WitnessEvidenceData {
  rendererGeneration?: number;
  providerId?: number;
  rendererContextId?: number;
  runtimeSourceId?: number;
  runtimeCloneId?: number;
  finalObservation?: Omit<Stone1WitnessMotionFact, 'contextId' | 'cloneId'>;
  motionSamples: Stone1RenderedMotionFact[];
  failureTelemetry?: Stone1FailureTelemetryFact;
}

function witnessRegion(
  root: HTMLDivElement | null,
  witness: WitnessIdentity
): HTMLElement | undefined {
  const label = witness === 'roller' ? 'Roller' : 'Spectator';
  return (
    root?.querySelector<HTMLElement>(
      `[role="region"][aria-label="${label} attack dice"]`
    ) ?? undefined
  );
}

function localGrabbed(root: HTMLDivElement | null, witness: WitnessIdentity) {
  return (
    witnessRegion(root, witness)
      ?.querySelector<HTMLElement>('[data-testid="dice-tray-3d-renderer"]')
      ?.getAttribute('data-grabbed') === 'true'
  );
}

function localLifecyclePhase(
  root: HTMLDivElement | null
): Stone1TrayEvidenceBridge['lifecyclePhase'] {
  const roller = witnessRegion(root, 'roller')?.getAttribute('data-phase');
  const spectator = witnessRegion(root, 'spectator')?.getAttribute(
    'data-phase'
  );
  if (
    roller === spectator &&
    (roller === 'armed' || roller === 'rolling' || roller === 'settled')
  )
    return roller;
  return 'mixed';
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function sameVisualThrowProfile(
  first: VisualThrowProfileV1,
  second: VisualThrowProfileV1
) {
  return (
    first.schemaVersion === second.schemaVersion &&
    Object.is(first.releasePosition[0], second.releasePosition[0]) &&
    Object.is(first.releasePosition[1], second.releasePosition[1]) &&
    Object.is(first.releaseDirection[0], second.releaseDirection[0]) &&
    Object.is(first.releaseDirection[1], second.releaseDirection[1]) &&
    Object.is(first.releaseSpeed, second.releaseSpeed) &&
    Object.is(first.shakeEnergy, second.shakeEnergy) &&
    Object.is(first.spinBias, second.spinBias) &&
    Object.is(first.motionSeed, second.motionSeed)
  );
}

interface DiceTray3DConceptPanelProps {
  token: number;
  reducedMotion: boolean;
  sceneOverride?: AttackDie3DProps['sceneOverride'];
  sidecarOverride?: AttackDie3DProps['sidecarOverride'];
}

export function DiceTray3DConceptPanel(props: DiceTray3DConceptPanelProps) {
  return <TokenDiceTray3DConceptPanel key={props.token} {...props} />;
}

function TokenDiceTray3DConceptPanel({
  token,
  reducedMotion,
}: DiceTray3DConceptPanelProps) {
  const [mode, setMode] = useState<DiceTrayWitnessMode>('player');
  const [result, setResult] = useState(10);
  const [exercise, setExercise] =
    useState<DiceTrayEvidenceExercise>('original');

  return (
    <section className="dice-tray-3d-concept-panel">
      <header>
        <h3>Gameplay placement checkpoint</h3>
        <p>
          Fixture event delivery · shared component contract · no production
          transport
        </p>
        <label>
          Authoritative fixture result{' '}
          <input
            aria-label="Authoritative fixture result"
            type="number"
            min={1}
            max={20}
            value={result}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isInteger(next) && next >= 1 && next <= 20)
                setResult(next);
            }}
          />
        </label>
        <label>
          Evidence-only renderer exercise{' '}
          <select
            aria-label="Evidence-only renderer exercise"
            value={exercise}
            onChange={(event) =>
              setExercise(event.target.value as DiceTrayEvidenceExercise)
            }
          >
            <option value="original">Original provider</option>
            <option value="unknown-safe-preset">Unknown safe preset</option>
            <option value="unmapped-result">Synthetic unmapped result</option>
            <option value="shader-failure">Shader failure</option>
          </select>
        </label>
        <fieldset
          className="dice-tray-3d-concept-panel__modes"
          aria-label="Dice witness roller mode"
        >
          <legend>Roller mode</legend>
          {(['player', 'monster'] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="dice-tray-witness-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {value === 'player' ? 'Player' : 'Monster'}
            </label>
          ))}
        </fieldset>
      </header>
      <DiceTrayWitnessDeliveryHost
        key={`${token}:${mode}:${result}:${exercise}`}
        token={token}
        mode={mode}
        result={result}
        exercise={exercise}
        reducedMotion={reducedMotion}
      />
    </section>
  );
}

interface DiceTrayWitnessDeliveryHostProps extends DiceTray3DConceptPanelProps {
  mode: DiceTrayWitnessMode;
  result: number;
  exercise: DiceTrayEvidenceExercise;
}

function DiceTrayWitnessDeliveryHost({
  token,
  mode,
  result,
  exercise,
  reducedMotion,
}: DiceTrayWitnessDeliveryHostProps) {
  const presetId =
    exercise === 'unknown-safe-preset'
      ? 'stone0.unknown.safe.d20'
      : 'dice.original.carved.d20';
  const forceFailure =
    exercise === 'unmapped-result'
      ? ('unmapped' as const)
      : exercise === 'shader-failure'
        ? ('shader' as const)
        : undefined;
  const [events, append] = useReducer(
    (
      current: readonly DicePresentationEvent[],
      input: unknown
    ): readonly DicePresentationEvent[] =>
      appendDiceTrayWitnessEvent(current, input),
    createDiceTrayWitnessInitialEvents(token, mode, result, presetId)
  );

  useEffect(() => {
    if (mode !== 'monster') return;
    return scheduleMonsterDiceTrayWitnessRelease(
      token,
      result,
      append,
      presetId
    );
  }, [append, mode, presetId, result, token]);

  const requestIdentity = events[0]?.presentationId ?? 'unavailable';
  const evidenceRoot = useRef<HTMLDivElement>(null);
  const evidenceActive = useRef(false);
  const publishedBridge = useRef<Stone1TrayEvidenceBridge | undefined>(
    undefined
  );
  const evidenceData = useRef<Record<WitnessIdentity, WitnessEvidenceData>>({
    roller: { motionSamples: [] },
    spectator: { motionSamples: [] },
  });
  const callbackFence = useRef<Record<string, unknown>>({});
  const acceptedRelease = events.find(
    (event) => event.type === 'dice-presentation-released'
  );
  const releaseProfile =
    acceptedRelease?.type === 'dice-presentation-released'
      ? parseVisualThrowProfile(acceptedRelease.release.throwProfile)
      : undefined;
  const releaseSchemaVersion =
    acceptedRelease?.type === 'dice-presentation-released'
      ? acceptedRelease.release.schemaVersion
      : undefined;
  const releaseCount = events.filter(
    (event) => event.type === 'dice-presentation-released'
  ).length;
  const currentDelivery = useRef({
    events,
    presetId,
    releaseCount,
    releaseProfile,
    releaseSchemaVersion,
    requestIdentity,
    result,
  });
  currentDelivery.current = {
    events,
    presetId,
    releaseCount,
    releaseProfile,
    releaseSchemaVersion,
    requestIdentity,
    result,
  };

  const publishEvidence = useCallback(() => {
    if (!evidenceActive.current) return;
    const delivery = currentDelivery.current;

    const buildWitness = (witness: WitnessIdentity): Stone1WitnessEvidence => {
      const data = evidenceData.current[witness];
      const finalTelemetry = data.finalObservation
        ? Object.freeze({
            ...data.finalObservation,
            ...(data.rendererContextId === undefined
              ? {}
              : { contextId: data.rendererContextId }),
            ...(data.runtimeCloneId === undefined
              ? {}
              : { cloneId: data.runtimeCloneId }),
          })
        : undefined;
      const bridge = {
        ...(data.rendererContextId === undefined
          ? {}
          : { rendererContextId: data.rendererContextId }),
        ...(data.runtimeSourceId === undefined
          ? {}
          : { runtimeSourceId: data.runtimeSourceId }),
        ...(data.runtimeCloneId === undefined
          ? {}
          : { runtimeCloneId: data.runtimeCloneId }),
        ...(finalTelemetry ? { finalTelemetry } : {}),
        ...(data.failureTelemetry
          ? { failureTelemetry: data.failureTelemetry }
          : {}),
        ...(delivery.releaseProfile
          ? { releaseProfile: delivery.releaseProfile }
          : {}),
      } as Stone1WitnessEvidence;
      Object.defineProperty(bridge, 'motionSamples', {
        enumerable: true,
        get: () => data.motionSamples.slice(),
      });
      return Object.freeze(bridge);
    };

    const providerIds = (['roller', 'spectator'] as const)
      .map((witness) => evidenceData.current[witness].providerId)
      .filter((identity): identity is number => identity !== undefined);
    const providerId =
      providerIds.length > 0 &&
      providerIds.every((identity) => identity === providerIds[0])
        ? providerIds[0]
        : undefined;
    const root = evidenceRoot.current;
    const bridge = {
      request: Object.freeze({
        identity: delivery.requestIdentity,
        result: delivery.result,
        presetId: delivery.presetId,
      }),
      shared: Object.freeze({
        eventArrayId: evidenceObjectId(delivery.events as object),
        ...(providerId === undefined ? {} : { providerId }),
      }),
      witnesses: Object.freeze({
        roller: buildWitness('roller'),
        spectator: buildWitness('spectator'),
      }),
      releaseCount: delivery.releaseCount,
      ...(delivery.releaseSchemaVersion === undefined
        ? {}
        : { releaseSchemaVersion: delivery.releaseSchemaVersion }),
    } as Stone1TrayEvidenceBridge;
    Object.defineProperties(bridge, {
      rollerGrabbed: {
        enumerable: true,
        get: () => localGrabbed(root, 'roller'),
      },
      spectatorGrabbed: {
        enumerable: true,
        get: () => localGrabbed(root, 'spectator'),
      },
      lifecyclePhase: {
        enumerable: true,
        get: () => localLifecyclePhase(root),
      },
    });
    Object.freeze(bridge);
    publishedBridge.current = bridge;
    window.__stone1TrayEvidence = bridge;
  }, []);

  useLayoutEffect(() => {
    evidenceActive.current = true;
    return () => {
      evidenceActive.current = false;
      callbackFence.current = {};
      if (window.__stone1TrayEvidence === publishedBridge.current)
        delete window.__stone1TrayEvidence;
    };
  }, []);

  useLayoutEffect(() => {
    publishEvidence();
  }, [events, publishEvidence]);

  const publishBoundaryDiagnostic = useCallback(
    (
      witness: WitnessIdentity,
      diagnostic: DiceTrayPresentationBoundaryDiagnostic,
      callback: unknown
    ) => {
      if (
        !evidenceActive.current ||
        callbackFence.current[`${witness}Boundary`] !== callback ||
        diagnostic.events !== currentDelivery.current.events ||
        !Number.isSafeInteger(diagnostic.rendererGeneration)
      )
        return;
      const providerId = evidenceObjectId(diagnostic.provider);
      if (
        evidenceData.current[witness].rendererGeneration !==
        diagnostic.rendererGeneration
      ) {
        evidenceData.current[witness] = {
          rendererGeneration: diagnostic.rendererGeneration,
          providerId,
          motionSamples: [],
        };
      } else {
        evidenceData.current[witness].providerId = providerId;
      }
      publishEvidence();
    },
    [publishEvidence]
  );
  const publishTelemetry = useCallback(
    (
      witness: WitnessIdentity,
      telemetry: AttackDieTelemetry,
      callback: unknown
    ) => {
      const data = evidenceData.current[witness];
      const delivery = currentDelivery.current;
      if (
        !evidenceActive.current ||
        callbackFence.current[`${witness}Telemetry`] !== callback ||
        data.rendererGeneration === undefined ||
        telemetry.presentationToken !== data.rendererGeneration ||
        telemetry.requestedResult !== delivery.result
      )
        return;
      if (telemetry.renderer === 'svg' && telemetry.state === 'failed') {
        data.failureTelemetry = Object.freeze({
          renderer: telemetry.renderer,
          state: telemetry.state,
          requestedResult: telemetry.requestedResult,
          ...(telemetry.failureCode
            ? { failureCode: telemetry.failureCode }
            : {}),
        });
        publishEvidence();
        return;
      }
      const parsedProfile = parseVisualThrowProfile(telemetry.throwProfile);
      if (
        delivery.releaseCount !== 1 ||
        !delivery.releaseProfile ||
        !parsedProfile ||
        !sameVisualThrowProfile(parsedProfile, delivery.releaseProfile) ||
        telemetry.renderer !== '3d' ||
        telemetry.state !== 'observed' ||
        telemetry.motionRevision !== 'choreographed-v1' ||
        !telemetry.exactTargetHeld ||
        telemetry.observedUpwardResult !== delivery.result ||
        telemetry.observedUpDot === undefined ||
        !Number.isFinite(telemetry.observedUpDot) ||
        telemetry.observedUpDot <= 0.999999 ||
        telemetry.observedUpMargin === undefined ||
        !Number.isFinite(telemetry.observedUpMargin) ||
        telemetry.observedUpMargin <= 0.2 ||
        telemetry.angularErrorDegrees === undefined ||
        !Number.isFinite(telemetry.angularErrorDegrees) ||
        telemetry.angularErrorDegrees < 0 ||
        telemetry.angularErrorDegrees > 0.25 ||
        (telemetry.runtimeSourceId !== undefined &&
          !isPositiveSafeInteger(telemetry.runtimeSourceId)) ||
        (telemetry.runtimeCloneId !== undefined &&
          !isPositiveSafeInteger(telemetry.runtimeCloneId))
      )
        return;

      data.runtimeSourceId = telemetry.runtimeSourceId;
      data.runtimeCloneId = telemetry.runtimeCloneId;
      data.finalObservation = Object.freeze({
        motionRevision: 'choreographed-v1',
        throwProfile: parsedProfile,
        requestedResult: telemetry.requestedResult,
        observedUpwardResult: telemetry.observedUpwardResult,
        observedUpDot: telemetry.observedUpDot,
        observedUpMargin: telemetry.observedUpMargin,
        angularErrorDegrees: telemetry.angularErrorDegrees,
        exactTargetHeld: true,
      });
      publishEvidence();
    },
    [publishEvidence]
  );
  const publishMotionDiagnostic = useCallback(
    (
      witness: WitnessIdentity,
      diagnostic: AttackDieMotionDiagnostic,
      callback: unknown
    ) => {
      const data = evidenceData.current[witness];
      if (
        !evidenceActive.current ||
        callbackFence.current[`${witness}Motion`] !== callback ||
        data.rendererGeneration === undefined ||
        diagnostic.presentationToken !== data.rendererGeneration
      )
        return;
      const sample = Object.freeze({
        sequence: diagnostic.sequence,
        phase: diagnostic.phase,
        reducedMotion: diagnostic.reducedMotion,
        held: diagnostic.held,
        translation: Object.freeze([
          ...diagnostic.translation,
        ]) as AttackDieMotionDiagnostic['translation'],
        quaternion: Object.freeze([
          ...diagnostic.quaternion,
        ]) as AttackDieMotionDiagnostic['quaternion'],
      });
      data.motionSamples.push(sample);
      if (data.motionSamples.length > 240) data.motionSamples.shift();
    },
    []
  );
  const publishRendererInfo = useCallback(
    (
      witness: WitnessIdentity,
      rendererInfo: AttackDieRendererInfo,
      callback: unknown
    ) => {
      const data = evidenceData.current[witness];
      if (
        !evidenceActive.current ||
        callbackFence.current[`${witness}Renderer`] !== callback ||
        data.rendererGeneration === undefined ||
        rendererInfo.presentationToken !== data.rendererGeneration ||
        !isPositiveSafeInteger(rendererInfo.contextId)
      )
        return;
      data.rendererContextId = rendererInfo.contextId;
      publishEvidence();
    },
    [publishEvidence]
  );
  const publishRollerBoundaryDiagnostic = useCallback(
    (diagnostic: DiceTrayPresentationBoundaryDiagnostic) =>
      publishBoundaryDiagnostic(
        'roller',
        diagnostic,
        publishRollerBoundaryDiagnostic
      ),
    [publishBoundaryDiagnostic]
  );
  const publishSpectatorBoundaryDiagnostic = useCallback(
    (diagnostic: DiceTrayPresentationBoundaryDiagnostic) =>
      publishBoundaryDiagnostic(
        'spectator',
        diagnostic,
        publishSpectatorBoundaryDiagnostic
      ),
    [publishBoundaryDiagnostic]
  );
  const publishRollerTelemetry = useCallback(
    (telemetry: AttackDieTelemetry) =>
      publishTelemetry('roller', telemetry, publishRollerTelemetry),
    [publishTelemetry]
  );
  const publishSpectatorTelemetry = useCallback(
    (telemetry: AttackDieTelemetry) =>
      publishTelemetry('spectator', telemetry, publishSpectatorTelemetry),
    [publishTelemetry]
  );
  const publishRollerMotionDiagnostic = useCallback(
    (diagnostic: AttackDieMotionDiagnostic) =>
      publishMotionDiagnostic(
        'roller',
        diagnostic,
        publishRollerMotionDiagnostic
      ),
    [publishMotionDiagnostic]
  );
  const publishSpectatorMotionDiagnostic = useCallback(
    (diagnostic: AttackDieMotionDiagnostic) =>
      publishMotionDiagnostic(
        'spectator',
        diagnostic,
        publishSpectatorMotionDiagnostic
      ),
    [publishMotionDiagnostic]
  );
  const publishRollerRendererInfo = useCallback(
    (rendererInfo: AttackDieRendererInfo) =>
      publishRendererInfo('roller', rendererInfo, publishRollerRendererInfo),
    [publishRendererInfo]
  );
  const publishSpectatorRendererInfo = useCallback(
    (rendererInfo: AttackDieRendererInfo) =>
      publishRendererInfo(
        'spectator',
        rendererInfo,
        publishSpectatorRendererInfo
      ),
    [publishRendererInfo]
  );

  useLayoutEffect(() => {
    callbackFence.current = {
      rollerBoundary: publishRollerBoundaryDiagnostic,
      spectatorBoundary: publishSpectatorBoundaryDiagnostic,
      rollerTelemetry: publishRollerTelemetry,
      spectatorTelemetry: publishSpectatorTelemetry,
      rollerMotion: publishRollerMotionDiagnostic,
      spectatorMotion: publishSpectatorMotionDiagnostic,
      rollerRenderer: publishRollerRendererInfo,
      spectatorRenderer: publishSpectatorRendererInfo,
    };
    return () => {
      if (callbackFence.current.rollerTelemetry === publishRollerTelemetry)
        callbackFence.current = {};
    };
  }, [
    publishRollerBoundaryDiagnostic,
    publishRollerMotionDiagnostic,
    publishRollerRendererInfo,
    publishRollerTelemetry,
    publishSpectatorBoundaryDiagnostic,
    publishSpectatorMotionDiagnostic,
    publishSpectatorRendererInfo,
    publishSpectatorTelemetry,
  ]);

  return (
    <div ref={evidenceRoot}>
      <DiceTrayEncounterPreview
        trays={[
          {
            label: 'Roller',
            content: (
              <DiceTrayPresentation
                label="Roller attack dice"
                events={events}
                witnessRole="roller"
                onReleaseRequest={mode === 'player' ? append : undefined}
                onTelemetry={publishRollerTelemetry}
                onRendererInfo={publishRollerRendererInfo}
                onMotionDiagnostic={publishRollerMotionDiagnostic}
                onBoundaryDiagnostic={publishRollerBoundaryDiagnostic}
                reducedMotion={reducedMotion}
                forceFailure={forceFailure}
              />
            ),
          },
          {
            label: 'Spectator',
            content: (
              <DiceTrayPresentation
                label="Spectator attack dice"
                events={events}
                witnessRole="spectator"
                onTelemetry={publishSpectatorTelemetry}
                onRendererInfo={publishSpectatorRendererInfo}
                onMotionDiagnostic={publishSpectatorMotionDiagnostic}
                onBoundaryDiagnostic={publishSpectatorBoundaryDiagnostic}
                reducedMotion={reducedMotion}
                forceFailure={forceFailure}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
