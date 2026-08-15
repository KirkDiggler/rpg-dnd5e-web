import {
  useCallback,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import type {
  AttackDie3DProps,
  AttackDieProvider,
  AttackDieTelemetry,
} from './AttackDie3D';
import type { QuaternionTuple } from './attackDieContract';
import {
  parseDicePresentationEvent,
  projectDicePresentationEvents,
  type DicePresentationEvent,
  type DicePresentationReleasedEvent,
  type DicePresentationRequestedEvent,
} from './dicePresentationEvent';
import { createDicePresentationRelease } from './dicePresentationRelease';
import { DiceTray3D } from './DiceTray3D';
import {
  createNeutralVisualThrowProfile,
  type VisualThrowProfileV1,
} from './visualThrowProfile';

export interface DiceTrayPresentationDevelopmentRenderer {
  scene: AttackDie3DProps['sceneOverride'];
  sidecar: AttackDie3DProps['sidecarOverride'];
  calibrationPose: QuaternionTuple;
}

export interface DiceTrayPresentationBoundaryDiagnostic {
  readonly events: readonly DicePresentationEvent[];
  readonly provider: AttackDieProvider;
  readonly rendererGeneration: number;
}

export interface DiceTrayPresentationProps {
  label: string;
  events: readonly DicePresentationEvent[];
  witnessRole: 'roller' | 'spectator';
  onReleaseRequest?: (event: DicePresentationReleasedEvent) => void;
  onTelemetry?: AttackDie3DProps['onTelemetry'];
  onRendererInfo?: AttackDie3DProps['onRendererInfo'];
  /** Read-only development evidence emitted from this actual boundary. */
  onBoundaryDiagnostic?: (
    diagnostic: DiceTrayPresentationBoundaryDiagnostic
  ) => void;
  reducedMotion?: boolean;
  developmentOnlyRenderer?: DiceTrayPresentationDevelopmentRenderer;
  /** Development concept failure exercise; never supplied by production. */
  forceFailure?: AttackDie3DProps['forceFailure'];
}

type PresentationPhase = 'armed' | 'rolling' | 'settled';

interface PresentationLifecycle {
  acceptedRequest: DicePresentationRequestedEvent;
  acceptedDeliveryIdentity: string;
  observedDeliveryIdentity: string;
  acceptedRelease?: DicePresentationReleasedEvent;
  releaseIdentity?: string;
  phase: PresentationPhase;
  rendererFailed: boolean;
  settlementRenderer: 'pending' | '3d' | 'svg';
  discontinuityObserved: boolean;
}

type LifecycleAction =
  | {
      type: 'reconcile-delivery';
      acceptedDeliveryIdentity: string;
      observedDeliveryIdentity: string;
    }
  | { type: 'renderer-failed' }
  | { type: 'renderer-observed' }
  | { type: 'fallback-complete' };

interface PresentationInstanceProps {
  label: string;
  request: DicePresentationRequestedEvent;
  release?: DicePresentationReleasedEvent;
  acceptedDeliveryIdentity: string;
  observedDeliveryIdentity: string;
  releaseIdentity?: string;
  witnessRole: 'roller' | 'spectator';
  onReleaseRequest?: (event: DicePresentationReleasedEvent) => void;
  onTelemetry?: AttackDie3DProps['onTelemetry'];
  onRendererInfo?: AttackDie3DProps['onRendererInfo'];
  diagnosticEvents: readonly DicePresentationEvent[];
  onBoundaryDiagnostic?: (
    diagnostic: DiceTrayPresentationBoundaryDiagnostic
  ) => void;
  reducedMotion: boolean;
  developmentOnlyRenderer?: DiceTrayPresentationDevelopmentRenderer;
  forceFailure?: AttackDie3DProps['forceFailure'];
}

let nextRendererGeneration = -1;

function allocateRendererGeneration() {
  const generation = nextRendererGeneration;
  nextRendererGeneration -= 1;
  return generation;
}

function eventIdentity(event: DicePresentationEvent) {
  return JSON.stringify(event);
}

function deliveryValues(identity: string): readonly string[] | undefined {
  try {
    const values: unknown = JSON.parse(identity);
    return Array.isArray(values) &&
      values.every((value) => typeof value === 'string')
      ? values
      : undefined;
  } catch {
    return undefined;
  }
}

function isDeliveryPrefix(prefixIdentity: string, deliveryIdentity: string) {
  const prefix = deliveryValues(prefixIdentity);
  const delivery = deliveryValues(deliveryIdentity);
  return (
    prefix !== undefined &&
    delivery !== undefined &&
    prefix.length <= delivery.length &&
    prefix.every((value, index) => value === delivery[index])
  );
}

function deliveryEvents(identity: string) {
  const values = deliveryValues(identity);
  if (!values) return [];

  const events: DicePresentationEvent[] = [];
  for (const value of values) {
    try {
      const event = parseDicePresentationEvent(JSON.parse(value));
      if (event) events.push(event);
    } catch {
      // Internal identities still fail closed if corrupted.
    }
  }
  return events;
}

function isReleaseCompatible(
  request: DicePresentationRequestedEvent,
  release: DicePresentationReleasedEvent
) {
  return (
    release.presentationId === request.presentationId &&
    release.release.presentationId === request.presentationId &&
    release.release.presetId === request.die.presetId
  );
}

function retainedRequestReleaseCandidate(
  request: DicePresentationRequestedEvent,
  observedDeliveryIdentity: string
) {
  const events = deliveryEvents(observedDeliveryIdentity);
  const requestIdentity = eventIdentity(request);
  const requestIndex = events.findIndex(
    (event) => eventIdentity(event) === requestIdentity
  );
  const firstEligibleIndex = requestIndex >= 0 ? requestIndex + 1 : 0;
  for (let index = firstEligibleIndex; index < events.length; index += 1) {
    const event = events[index];
    if (
      event.type === 'dice-presentation-released' &&
      isReleaseCompatible(request, event)
    )
      return { release: event, releaseIdentity: eventIdentity(event) };
  }
  return undefined;
}

function createLifecycle(input: {
  acceptedRequest: DicePresentationRequestedEvent;
  acceptedDeliveryIdentity: string;
  observedDeliveryIdentity: string;
  release?: DicePresentationReleasedEvent;
  releaseIdentity?: string;
}): PresentationLifecycle {
  const release =
    input.release && isReleaseCompatible(input.acceptedRequest, input.release)
      ? input.release
      : undefined;
  return {
    acceptedRequest: input.acceptedRequest,
    acceptedDeliveryIdentity: input.acceptedDeliveryIdentity,
    observedDeliveryIdentity: input.observedDeliveryIdentity,
    acceptedRelease: release,
    releaseIdentity: release ? input.releaseIdentity : undefined,
    phase: release ? 'settled' : 'armed',
    rendererFailed: false,
    settlementRenderer: 'pending',
    discontinuityObserved: false,
  };
}

function lifecycleReducer(
  state: PresentationLifecycle,
  action: LifecycleAction
): PresentationLifecycle {
  if (action.type === 'renderer-failed') {
    return {
      ...state,
      rendererFailed: true,
      settlementRenderer: 'svg',
      phase: state.acceptedRelease ? 'settled' : 'armed',
    };
  }
  if (action.type === 'renderer-observed') {
    if (state.rendererFailed) return state;
    return {
      ...state,
      settlementRenderer: '3d',
      phase:
        state.phase === 'rolling' && state.acceptedRelease
          ? 'settled'
          : state.phase,
    };
  }
  if (action.type === 'fallback-complete') {
    if (state.settlementRenderer === '3d') return state;
    return {
      ...state,
      settlementRenderer: 'svg',
      phase:
        state.phase === 'rolling' && state.acceptedRelease
          ? 'settled'
          : state.phase,
    };
  }
  if (
    action.acceptedDeliveryIdentity === state.acceptedDeliveryIdentity &&
    action.observedDeliveryIdentity === state.observedDeliveryIdentity
  )
    return state;

  const appendOnly = isDeliveryPrefix(
    state.observedDeliveryIdentity,
    action.observedDeliveryIdentity
  );
  const discontinuityObserved = state.discontinuityObserved || !appendOnly;
  if (state.acceptedRelease) {
    return {
      ...state,
      acceptedDeliveryIdentity: action.acceptedDeliveryIdentity,
      observedDeliveryIdentity: action.observedDeliveryIdentity,
      phase: appendOnly ? state.phase : 'settled',
      discontinuityObserved,
    };
  }

  const candidate = retainedRequestReleaseCandidate(
    state.acceptedRequest,
    action.observedDeliveryIdentity
  );
  return {
    ...state,
    acceptedDeliveryIdentity: action.acceptedDeliveryIdentity,
    observedDeliveryIdentity: action.observedDeliveryIdentity,
    acceptedRelease: candidate?.release,
    releaseIdentity: candidate?.releaseIdentity,
    phase: candidate
      ? state.rendererFailed || discontinuityObserved
        ? 'settled'
        : 'rolling'
      : 'armed',
    discontinuityObserved,
  };
}

function presentationHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function releaseEventId(presentationId: string) {
  const readable = `${presentationId}:release`;
  return readable.length <= 128
    ? readable
    : `release:${presentationHash(presentationId).toString(16)}`;
}

function DiceTrayPresentationInstance({
  label,
  request,
  release,
  acceptedDeliveryIdentity,
  observedDeliveryIdentity,
  releaseIdentity,
  witnessRole,
  onReleaseRequest,
  onTelemetry,
  onRendererInfo,
  diagnosticEvents,
  onBoundaryDiagnostic,
  reducedMotion,
  developmentOnlyRenderer,
  forceFailure,
}: PresentationInstanceProps) {
  const [lifecycle, dispatch] = useReducer(
    lifecycleReducer,
    {
      acceptedRequest: request,
      acceptedDeliveryIdentity,
      observedDeliveryIdentity,
      release,
      releaseIdentity,
    },
    createLifecycle
  );
  const generationRef = useRef<number | undefined>(undefined);
  const [rendererGeneration, setRendererGeneration] = useState<
    number | undefined
  >(undefined);
  const requestedRelease = useRef(false);
  const instanceActive = useRef(false);
  const callbackFence = useRef<{
    release?: (requestedProfile?: VisualThrowProfileV1) => void;
    telemetry?: (event: AttackDieTelemetry) => void;
    rendererInfo?: NonNullable<AttackDie3DProps['onRendererInfo']>;
    provider?: (provider: AttackDieProvider) => void;
  }>({});

  useLayoutEffect(() => {
    instanceActive.current = true;
    return () => {
      instanceActive.current = false;
      callbackFence.current = {};
    };
  }, []);

  useLayoutEffect(() => {
    if (generationRef.current === undefined)
      generationRef.current = allocateRendererGeneration();
    const committedGeneration = generationRef.current;
    setRendererGeneration((current) => current ?? committedGeneration);
  }, []);

  useLayoutEffect(() => {
    dispatch({
      type: 'reconcile-delivery',
      acceptedDeliveryIdentity,
      observedDeliveryIdentity,
    });
  }, [acceptedDeliveryIdentity, observedDeliveryIdentity]);

  const acceptedRequest = lifecycle.acceptedRequest;
  const presentationId = acceptedRequest.presentationId;
  const presetId = acceptedRequest.die.presetId;
  const result = acceptedRequest.die.authoritativeResult;
  const rollerRole = acceptedRequest.roller.role;

  const handleReleaseRequest = useCallback(
    (requestedProfile?: VisualThrowProfileV1) => {
      if (
        !instanceActive.current ||
        callbackFence.current.release !== handleReleaseRequest ||
        !onReleaseRequest ||
        lifecycle.phase !== 'armed' ||
        rollerRole !== 'player' ||
        witnessRole !== 'roller' ||
        requestedRelease.current
      )
        return;

      const throwProfile =
        requestedProfile ??
        createNeutralVisualThrowProfile(presentationHash(presentationId));
      const next: DicePresentationReleasedEvent = Object.freeze({
        schemaVersion: 1,
        type: 'dice-presentation-released',
        eventId: releaseEventId(presentationId),
        presentationId,
        release: createDicePresentationRelease({
          presentationId,
          presetId,
          throwProfile,
        }),
      });
      requestedRelease.current = true;
      onReleaseRequest(next);
    },
    [
      lifecycle.phase,
      onReleaseRequest,
      presentationId,
      presetId,
      rollerRole,
      witnessRole,
    ]
  );

  const handleTelemetry = useCallback(
    (event: AttackDieTelemetry) => {
      if (
        !instanceActive.current ||
        callbackFence.current.telemetry !== handleTelemetry ||
        rendererGeneration === undefined ||
        event.presentationToken !== rendererGeneration ||
        event.requestedResult !== result
      )
        return;

      onTelemetry?.(event);
      if (event.renderer === 'svg' && event.state === 'failed') {
        dispatch({ type: 'renderer-failed' });
        return;
      }
      if (
        event.renderer === '3d' &&
        event.state === 'observed' &&
        event.exactTargetHeld &&
        event.observedUpwardResult === result &&
        event.observedUpDot !== undefined &&
        Number.isFinite(event.observedUpDot) &&
        event.observedUpDot > 0.999999 &&
        event.observedUpMargin !== undefined &&
        Number.isFinite(event.observedUpMargin) &&
        event.observedUpMargin > 0.2 &&
        event.angularErrorDegrees !== undefined &&
        Number.isFinite(event.angularErrorDegrees) &&
        event.angularErrorDegrees >= 0 &&
        event.angularErrorDegrees <= 0.25
      )
        dispatch({ type: 'renderer-observed' });
    },
    [onTelemetry, rendererGeneration, result]
  );

  const handleRendererInfo = useCallback<
    NonNullable<AttackDie3DProps['onRendererInfo']>
  >(
    (info) => {
      if (
        !instanceActive.current ||
        callbackFence.current.rendererInfo !== handleRendererInfo ||
        rendererGeneration === undefined ||
        info.presentationToken !== rendererGeneration
      )
        return;
      onRendererInfo?.(info);
    },
    [onRendererInfo, rendererGeneration]
  );
  const handleFallbackPresentationComplete = useCallback(() => {
    if (instanceActive.current) dispatch({ type: 'fallback-complete' });
  }, []);
  const handleProviderDiagnostic = useCallback(
    (provider: AttackDieProvider) => {
      if (
        !instanceActive.current ||
        callbackFence.current.provider !== handleProviderDiagnostic ||
        rendererGeneration === undefined
      )
        return;
      onBoundaryDiagnostic?.({
        events: diagnosticEvents,
        provider,
        rendererGeneration,
      });
    },
    [diagnosticEvents, onBoundaryDiagnostic, rendererGeneration]
  );

  useLayoutEffect(() => {
    callbackFence.current = {
      release: handleReleaseRequest,
      telemetry: handleTelemetry,
      rendererInfo: handleRendererInfo,
      provider: handleProviderDiagnostic,
    };
    return () => {
      if (callbackFence.current.release === handleReleaseRequest)
        callbackFence.current = {};
    };
  }, [
    handleProviderDiagnostic,
    handleReleaseRequest,
    handleRendererInfo,
    handleTelemetry,
  ]);

  const phase = lifecycle.phase;
  const status =
    phase === 'armed'
      ? 'Dice presentation requested · waiting for release event'
      : phase === 'rolling'
        ? 'Dice release delivered · rolling'
        : lifecycle.settlementRenderer === '3d'
          ? `Result ${result} presented · roll settled`
          : lifecycle.settlementRenderer === 'svg'
            ? `Result ${result} released · truthful SVG settled`
            : `Result ${result} released · settled`;

  if (rendererGeneration === undefined)
    return (
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    );

  const developmentInjectionEligible =
    presetId === 'lightning' &&
    result === 10 &&
    developmentOnlyRenderer?.scene !== undefined &&
    developmentOnlyRenderer.sidecar !== undefined &&
    developmentOnlyRenderer.calibrationPose !== undefined;

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      <DiceTray3D
        label={label}
        presentationId={presentationId}
        rendererGeneration={rendererGeneration}
        motionSeed={presentationHash(presentationId)}
        rollerRole={rollerRole}
        witnessRole={witnessRole}
        phase={phase}
        dice={[acceptedRequest.die]}
        release={lifecycle.acceptedRelease?.release}
        onReleaseRequest={onReleaseRequest ? handleReleaseRequest : undefined}
        onTelemetry={handleTelemetry}
        onRendererInfo={handleRendererInfo}
        onProviderDiagnostic={handleProviderDiagnostic}
        onFallbackPresentationComplete={handleFallbackPresentationComplete}
        reducedMotion={reducedMotion}
        sceneOverride={
          developmentInjectionEligible
            ? developmentOnlyRenderer.scene
            : undefined
        }
        sidecarOverride={
          developmentInjectionEligible
            ? developmentOnlyRenderer.sidecar
            : undefined
        }
        calibrationPose={
          developmentInjectionEligible
            ? developmentOnlyRenderer.calibrationPose
            : undefined
        }
        forceFailure={forceFailure}
      />
    </>
  );
}

export function DiceTrayPresentation({
  label,
  events,
  witnessRole,
  onReleaseRequest,
  onTelemetry,
  onRendererInfo,
  onBoundaryDiagnostic,
  reducedMotion = false,
  developmentOnlyRenderer,
  forceFailure,
}: DiceTrayPresentationProps) {
  const snapshots: DicePresentationEvent[] = [];
  for (const event of events) {
    try {
      const snapshot = parseDicePresentationEvent(event);
      if (snapshot) snapshots.push(snapshot);
    } catch {
      // Hostile inbound values fail closed without affecting valid snapshots.
    }
  }
  const projection = projectDicePresentationEvents(snapshots);
  const request = projection.request;
  if (!request) return null;

  const acceptedDeliveryIdentity = JSON.stringify(
    projection.acceptedEvents.map(eventIdentity)
  );
  const observedDeliveryIdentity = JSON.stringify(snapshots.map(eventIdentity));
  const releaseIdentity = projection.release
    ? eventIdentity(projection.release)
    : undefined;

  return (
    <DiceTrayPresentationInstance
      key={request.presentationId}
      label={label}
      request={request}
      release={projection.release}
      acceptedDeliveryIdentity={acceptedDeliveryIdentity}
      observedDeliveryIdentity={observedDeliveryIdentity}
      releaseIdentity={releaseIdentity}
      witnessRole={witnessRole}
      onReleaseRequest={onReleaseRequest}
      onTelemetry={onTelemetry}
      onRendererInfo={onRendererInfo}
      diagnosticEvents={events}
      onBoundaryDiagnostic={onBoundaryDiagnostic}
      reducedMotion={reducedMotion}
      developmentOnlyRenderer={developmentOnlyRenderer}
      forceFailure={forceFailure}
    />
  );
}
