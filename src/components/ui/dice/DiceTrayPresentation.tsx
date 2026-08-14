import { useCallback, useReducer, useRef } from 'react';
import type { AttackDie3DProps, AttackDieTelemetry } from './AttackDie3D';
import type { QuaternionTuple } from './attackDieContract';
import {
  projectDicePresentationEvents,
  type DicePresentationEvent,
  type DicePresentationReleasedEvent,
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
  presentationId?: string;
  acceptedDelivery: readonly string[];
  releaseIdentity?: string;
  phase: PresentationPhase;
  rendererFailed: boolean;
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

function sameDelivery(first: readonly string[], second: readonly string[]) {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function isDeliveryPrefix(
  prefix: readonly string[],
  delivery: readonly string[]
) {
  return (
    prefix.length <= delivery.length &&
    prefix.every((value, index) => value === delivery[index])
  );
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
  const release = projection.release;
  const acceptedDelivery = projection.acceptedEvents.map(eventIdentity);
  const releaseIdentity = release ? eventIdentity(release) : undefined;
  const lifecycle = useRef<PresentationLifecycle>({
    acceptedDelivery: [],
    phase: 'armed',
    rendererFailed: false,
  });
  const renderer = useRef<
    | {
        presentationId: string;
        generation: number;
      }
    | undefined
  >(undefined);
  const requestedRelease = useRef(new Set<string>());
  const [, rerender] = useReducer((value: number) => value + 1, 0);

  if (!request) {
    lifecycle.current = {
      acceptedDelivery,
      phase: 'armed',
      rendererFailed: false,
    };
  } else if (lifecycle.current.presentationId !== request.presentationId) {
    lifecycle.current = {
      presentationId: request.presentationId,
      acceptedDelivery,
      releaseIdentity,
      phase: release ? 'settled' : 'armed',
      rendererFailed: false,
    };
  } else if (
    !sameDelivery(lifecycle.current.acceptedDelivery, acceptedDelivery)
  ) {
    const previous = lifecycle.current;
    const appendOnly = isDeliveryPrefix(
      previous.acceptedDelivery,
      acceptedDelivery
    );
    let phase = previous.phase;
    let rendererFailed = previous.rendererFailed;

    if (!releaseIdentity) {
      phase = 'armed';
      if (!appendOnly) rendererFailed = false;
    } else if (releaseIdentity !== previous.releaseIdentity) {
      phase = appendOnly && !previous.releaseIdentity ? 'rolling' : 'settled';
      if (rendererFailed) phase = 'settled';
    } else if (!appendOnly) {
      phase = 'settled';
    }

    lifecycle.current = {
      presentationId: request.presentationId,
      acceptedDelivery,
      releaseIdentity,
      phase,
      rendererFailed,
    };
  }

  if (request && renderer.current?.presentationId !== request.presentationId) {
    renderer.current = {
      presentationId: request.presentationId,
      generation: allocateRendererGeneration(),
    };
  }
  const rendererGeneration = renderer.current?.generation ?? 0;
  const requestPresentationId = request?.presentationId;
  const result = request?.die.authoritativeResult ?? 0;

  const handleReleaseRequest = useCallback(() => {
    const currentRequest = projection.request;
    if (
      !currentRequest ||
      lifecycle.current.presentationId !== currentRequest.presentationId ||
      lifecycle.current.phase !== 'armed' ||
      currentRequest.roller.role !== 'player' ||
      witnessRole !== 'roller' ||
      requestedRelease.current.has(currentRequest.presentationId)
    )
      return;

    const variation = presentationHash(currentRequest.presentationId) % 997;
    const next: DicePresentationReleasedEvent = Object.freeze({
      schemaVersion: 1,
      type: 'dice-presentation-released',
      eventId: releaseEventId(currentRequest.presentationId),
      presentationId: currentRequest.presentationId,
      release: createDicePresentationRelease({
        presentationId: currentRequest.presentationId,
        presetId: currentRequest.die.presetId,
        variation,
      }),
    });
    requestedRelease.current.add(currentRequest.presentationId);
    onReleaseRequest?.(next);
  }, [onReleaseRequest, projection.request, witnessRole]);

  const handleTelemetry = useCallback(
    (event: AttackDieTelemetry) => {
      if (
        !requestPresentationId ||
        event.presentationToken !== rendererGeneration ||
        event.requestedResult !== result ||
        lifecycle.current.presentationId !== requestPresentationId
      )
        return;

      if (event.state === 'failed') {
        lifecycle.current.rendererFailed = true;
        if (lifecycle.current.releaseIdentity)
          lifecycle.current.phase = 'settled';
        rerender();
        return;
      }
      if (
        event.state === 'observed' &&
        event.exactTargetHeld &&
        lifecycle.current.phase === 'rolling' &&
        lifecycle.current.releaseIdentity
      ) {
        lifecycle.current.phase = 'settled';
        rerender();
      }
    },
    [rendererGeneration, requestPresentationId, result]
  );

  const handleFallbackPresentationComplete = useCallback(() => {
    if (
      requestPresentationId &&
      lifecycle.current.presentationId === requestPresentationId &&
      lifecycle.current.phase === 'rolling' &&
      lifecycle.current.releaseIdentity
    ) {
      lifecycle.current.phase = 'settled';
      rerender();
    }
  }, [requestPresentationId]);

  if (!request) return null;

  const developmentInjectionEligible =
    request.die.presetId === 'lightning' &&
    result === 10 &&
    developmentOnlyRenderer?.scene !== undefined &&
    developmentOnlyRenderer.sidecar !== undefined &&
    developmentOnlyRenderer.calibrationPose !== undefined;
  const phase = lifecycle.current.phase;
  const status =
    phase === 'armed'
      ? `Result ${result} requested · waiting for release event`
      : phase === 'rolling'
        ? `Result ${result} release delivered · rolling`
        : lifecycle.current.rendererFailed ||
            request.die.presetId !== 'lightning'
          ? `Result ${result} released · truthful SVG settled`
          : `Result ${result} presented · roll settled`;

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      <DiceTray3D
        label={label}
        presentationId={request.presentationId}
        rendererGeneration={rendererGeneration}
        rollerRole={request.roller.role}
        witnessRole={witnessRole}
        phase={phase}
        dice={[request.die]}
        release={release?.release}
        onReleaseRequest={handleReleaseRequest}
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
