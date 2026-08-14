import {
  useCallback,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { AttackDie3DProps, AttackDieTelemetry } from './AttackDie3D';
import type { QuaternionTuple } from './attackDieContract';
import {
  projectDicePresentationEvents,
  type DicePresentationEvent,
  type DicePresentationReleasedEvent,
  type DicePresentationRequestedEvent,
} from './dicePresentationEvent';
import { createDicePresentationRelease } from './dicePresentationRelease';
import { DiceTray3D } from './DiceTray3D';

export interface DiceTrayPresentationDevelopmentRenderer {
  scene: AttackDie3DProps['sceneOverride'];
  sidecar: AttackDie3DProps['sidecarOverride'];
  calibrationPose: QuaternionTuple;
}

export interface DiceTrayPresentationProps {
  label: string;
  events: readonly DicePresentationEvent[];
  witnessRole: 'roller' | 'spectator';
  onReleaseRequest?: (event: DicePresentationReleasedEvent) => void;
  reducedMotion?: boolean;
  developmentOnlyRenderer?: DiceTrayPresentationDevelopmentRenderer;
}

type PresentationPhase = 'armed' | 'rolling' | 'settled';

interface PresentationLifecycle {
  acceptedDeliveryIdentity: string;
  releaseIdentity?: string;
  phase: PresentationPhase;
  rendererFailed: boolean;
}

type LifecycleAction =
  | {
      type: 'reconcile-delivery';
      acceptedDeliveryIdentity: string;
      releaseIdentity?: string;
    }
  | { type: 'renderer-failed' }
  | { type: 'renderer-observed' }
  | { type: 'fallback-complete' };

interface PresentationInstanceProps {
  label: string;
  request: DicePresentationRequestedEvent;
  release?: DicePresentationReleasedEvent;
  acceptedDeliveryIdentity: string;
  releaseIdentity?: string;
  witnessRole: 'roller' | 'spectator';
  onReleaseRequest?: (event: DicePresentationReleasedEvent) => void;
  reducedMotion: boolean;
  developmentOnlyRenderer?: DiceTrayPresentationDevelopmentRenderer;
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

function deliveryValues(identity: string): readonly string[] {
  return JSON.parse(identity) as readonly string[];
}

function isDeliveryPrefix(prefixIdentity: string, deliveryIdentity: string) {
  const prefix = deliveryValues(prefixIdentity);
  const delivery = deliveryValues(deliveryIdentity);
  return (
    prefix.length <= delivery.length &&
    prefix.every((value, index) => value === delivery[index])
  );
}

function createLifecycle(input: {
  acceptedDeliveryIdentity: string;
  releaseIdentity?: string;
}): PresentationLifecycle {
  return {
    acceptedDeliveryIdentity: input.acceptedDeliveryIdentity,
    releaseIdentity: input.releaseIdentity,
    phase: input.releaseIdentity ? 'settled' : 'armed',
    rendererFailed: false,
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
      phase: state.releaseIdentity ? 'settled' : 'armed',
    };
  }
  if (action.type === 'renderer-observed') {
    return state.phase === 'rolling' && state.releaseIdentity
      ? { ...state, phase: 'settled' }
      : state;
  }
  if (action.type === 'fallback-complete') {
    return state.phase === 'rolling' && state.releaseIdentity
      ? { ...state, phase: 'settled' }
      : state;
  }
  if (
    action.acceptedDeliveryIdentity === state.acceptedDeliveryIdentity &&
    action.releaseIdentity === state.releaseIdentity
  )
    return state;

  const appendOnly = isDeliveryPrefix(
    state.acceptedDeliveryIdentity,
    action.acceptedDeliveryIdentity
  );
  let phase = state.phase;
  if (!action.releaseIdentity) {
    phase = 'armed';
  } else if (action.releaseIdentity !== state.releaseIdentity) {
    phase =
      state.rendererFailed || !appendOnly || state.releaseIdentity !== undefined
        ? 'settled'
        : 'rolling';
  } else if (!appendOnly) {
    phase = 'settled';
  }

  return {
    ...state,
    acceptedDeliveryIdentity: action.acceptedDeliveryIdentity,
    releaseIdentity: action.releaseIdentity,
    phase,
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
  releaseIdentity,
  witnessRole,
  onReleaseRequest,
  reducedMotion,
  developmentOnlyRenderer,
}: PresentationInstanceProps) {
  const [lifecycle, dispatch] = useReducer(
    lifecycleReducer,
    { acceptedDeliveryIdentity, releaseIdentity },
    createLifecycle
  );
  const generationRef = useRef<number | undefined>(undefined);
  const [rendererGeneration, setRendererGeneration] = useState<
    number | undefined
  >(undefined);
  const requestedRelease = useRef(false);

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
      releaseIdentity,
    });
  }, [acceptedDeliveryIdentity, releaseIdentity]);

  const presentationId = request.presentationId;
  const presetId = request.die.presetId;
  const result = request.die.authoritativeResult;
  const rollerRole = request.roller.role;

  const handleReleaseRequest = useCallback(() => {
    if (
      !onReleaseRequest ||
      lifecycle.phase !== 'armed' ||
      rollerRole !== 'player' ||
      witnessRole !== 'roller' ||
      requestedRelease.current
    )
      return;

    const variation = presentationHash(presentationId) % 997;
    const next: DicePresentationReleasedEvent = Object.freeze({
      schemaVersion: 1,
      type: 'dice-presentation-released',
      eventId: releaseEventId(presentationId),
      presentationId,
      release: createDicePresentationRelease({
        presentationId,
        presetId,
        variation,
      }),
    });
    requestedRelease.current = true;
    onReleaseRequest(next);
  }, [
    lifecycle.phase,
    onReleaseRequest,
    presentationId,
    presetId,
    rollerRole,
    witnessRole,
  ]);

  const handleTelemetry = useCallback(
    (event: AttackDieTelemetry) => {
      if (
        rendererGeneration === undefined ||
        event.presentationToken !== rendererGeneration ||
        event.requestedResult !== result
      )
        return;

      if (event.state === 'failed') {
        dispatch({ type: 'renderer-failed' });
        return;
      }
      if (event.state === 'observed' && event.exactTargetHeld)
        dispatch({ type: 'renderer-observed' });
    },
    [rendererGeneration, result]
  );

  const handleFallbackPresentationComplete = useCallback(() => {
    dispatch({ type: 'fallback-complete' });
  }, []);

  const phase = lifecycle.phase;
  const status =
    phase === 'armed'
      ? 'Dice presentation requested · waiting for release event'
      : phase === 'rolling'
        ? 'Dice release delivered · rolling'
        : lifecycle.rendererFailed || presetId !== 'lightning'
          ? `Result ${result} released · truthful SVG settled`
          : `Result ${result} presented · roll settled`;

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
        rollerRole={rollerRole}
        witnessRole={witnessRole}
        phase={phase}
        dice={[request.die]}
        release={release?.release}
        onReleaseRequest={onReleaseRequest ? handleReleaseRequest : undefined}
        onTelemetry={handleTelemetry}
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
      />
    </>
  );
}

export function DiceTrayPresentation({
  label,
  events,
  witnessRole,
  onReleaseRequest,
  reducedMotion = false,
  developmentOnlyRenderer,
}: DiceTrayPresentationProps) {
  const projection = projectDicePresentationEvents(events);
  const request = projection.request;
  if (!request) return null;

  const acceptedDeliveryIdentity = JSON.stringify(
    projection.acceptedEvents.map(eventIdentity)
  );
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
      releaseIdentity={releaseIdentity}
      witnessRole={witnessRole}
      onReleaseRequest={onReleaseRequest}
      reducedMotion={reducedMotion}
      developmentOnlyRenderer={developmentOnlyRenderer}
    />
  );
}
