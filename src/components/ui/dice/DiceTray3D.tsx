import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AttackDie3D,
  type AttackDie3DProps,
  type AttackDieProvider,
} from './AttackDie3D';
import type { QuaternionTuple } from './attackDieContract';
import {
  isDicePresentationIdentifier,
  isDicePresetIdentifier,
  type DicePresentationRelease,
} from './dicePresentationRelease';
import { DiceTray } from './DiceTray';
import { DiceTray3DShell } from './DiceTray3DShell';
import {
  createRollGroupGestureController,
  type ClientBounds,
  type HeldRollGroupState,
  type RollGroupGestureController,
  type RollGroupPointerSample,
} from './rollGroupGestureController';
import type { VisualThrowProfileV1 } from './visualThrowProfile';

const ORIGINAL_CARVED_D20_PRESET_ID = 'dice.original.carved.d20';
const ORIGINAL_CARVED_D20_PROVIDER: AttackDieProvider = Object.freeze({
  kind: 'dice-runtime-preset',
  presetId: ORIGINAL_CARVED_D20_PRESET_ID,
});
const LIGHTNING_DEVELOPMENT_PROVIDER: AttackDieProvider = Object.freeze({
  kind: 'lightning-development',
});

export interface DiceTray3DItem {
  kind: 'd20';
  presetId: string;
  authoritativeResult: number;
}

export interface DiceTray3DProps {
  label: string;
  presentationId: string;
  rendererGeneration: number;
  motionSeed: number;
  rollerRole: 'player' | 'monster';
  witnessRole: 'roller' | 'spectator';
  phase: 'armed' | 'rolling' | 'settled';
  dice: readonly DiceTray3DItem[];
  release?: DicePresentationRelease;
  onReleaseRequest?: (throwProfile?: VisualThrowProfileV1) => void;
  onTelemetry?: AttackDie3DProps['onTelemetry'];
  onRendererInfo?: AttackDie3DProps['onRendererInfo'];
  /** Concepts-only rendered-pose diagnostic; never carries pointer samples. */
  onMotionDiagnostic?: AttackDie3DProps['onMotionDiagnostic'];
  /** Read-only development diagnostic for the exact provider object consumed. */
  onProviderDiagnostic?: (provider: AttackDieProvider) => void;
  onFallbackPresentationComplete?: () => void;
  reducedMotion?: boolean;
  sceneOverride?: AttackDie3DProps['sceneOverride'];
  sidecarOverride?: AttackDie3DProps['sidecarOverride'];
  calibrationPose?: QuaternionTuple;
  /** Development concept failure exercise; never supplied by production. */
  forceFailure?: AttackDie3DProps['forceFailure'];
}

function snapshotBounds(rect: DOMRect): ClientBounds {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function pointerSample(
  event: ReactPointerEvent<HTMLElement>
): RollGroupPointerSample {
  return {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    timeMs: event.timeStamp,
  };
}

function validDieInput(
  presentationId: string,
  rendererGeneration: number,
  motionSeed: number,
  dice: readonly DiceTray3DItem[]
) {
  const item = dice[0];
  return (
    isDicePresentationIdentifier(presentationId) &&
    Number.isSafeInteger(rendererGeneration) &&
    Number.isInteger(motionSeed) &&
    dice.length === 1 &&
    item?.kind === 'd20' &&
    isDicePresetIdentifier(item.presetId) &&
    Number.isInteger(item.authoritativeResult) &&
    item.authoritativeResult >= 1 &&
    item.authoritativeResult <= 20
  );
}

export function DiceTray3D({
  label,
  presentationId,
  rendererGeneration,
  motionSeed,
  rollerRole,
  witnessRole,
  phase,
  dice,
  release,
  onReleaseRequest,
  onTelemetry,
  onRendererInfo,
  onMotionDiagnostic,
  onProviderDiagnostic,
  onFallbackPresentationComplete,
  reducedMotion = false,
  sceneOverride,
  sidecarOverride,
  calibrationPose,
  forceFailure,
}: DiceTray3DProps) {
  const valid = validDieInput(
    presentationId,
    rendererGeneration,
    motionSeed,
    dice
  );
  const item = dice[0];
  const requestIdentity = valid
    ? `${presentationId}:${rendererGeneration}`
    : undefined;
  const originalRuntime =
    valid && item?.presetId === ORIGINAL_CARVED_D20_PRESET_ID;
  const lightningDevelopment =
    valid &&
    item?.presetId === 'lightning' &&
    sceneOverride !== undefined &&
    sidecarOverride !== undefined &&
    calibrationPose !== undefined;
  const uses3DRenderer = originalRuntime || lightningDevelopment;
  const provider = originalRuntime
    ? ORIGINAL_CARVED_D20_PROVIDER
    : lightningDevelopment
      ? LIGHTNING_DEVELOPMENT_PROVIDER
      : undefined;
  const committedRequest = useRef<string | undefined>(undefined);
  const gestureController = useRef<RollGroupGestureController | undefined>(
    undefined
  );
  const rendererTarget = useRef<HTMLDivElement>(null);
  const grabTarget = useRef<HTMLButtonElement>(null);
  const gestureIdentity = useRef(requestIdentity);
  const completedFallback = useRef<string | undefined>(undefined);
  const [heldRollGroup, setHeldRollGroup] = useState<
    HeldRollGroupState | undefined
  >(undefined);
  const canInteract =
    valid &&
    requestIdentity !== undefined &&
    phase === 'armed' &&
    rollerRole === 'player' &&
    witnessRole === 'roller' &&
    onReleaseRequest !== undefined;

  const completeFallback = useCallback(() => {
    if (
      !requestIdentity ||
      !onFallbackPresentationComplete ||
      completedFallback.current === requestIdentity
    )
      return;
    completedFallback.current = requestIdentity;
    onFallbackPresentationComplete();
  }, [onFallbackPresentationComplete, requestIdentity]);

  const resetGesture = useCallback(() => {
    gestureController.current?.reset();
    setHeldRollGroup(undefined);
  }, []);

  const requestRelease = useCallback(
    (throwProfile?: VisualThrowProfileV1) => {
      if (
        !valid ||
        !requestIdentity ||
        phase !== 'armed' ||
        rollerRole !== 'player' ||
        witnessRole !== 'roller' ||
        !onReleaseRequest ||
        committedRequest.current === requestIdentity
      )
        return;

      committedRequest.current = requestIdentity;
      onReleaseRequest(throwProfile);
    },
    [onReleaseRequest, phase, requestIdentity, rollerRole, valid, witnessRole]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        !canInteract ||
        !requestIdentity ||
        committedRequest.current === requestIdentity
      )
        return;
      const trayTarget = rendererTarget.current;
      const hitTarget = grabTarget.current;
      if (!trayTarget || !hitTarget) return;

      const controller =
        gestureController.current ?? createRollGroupGestureController();
      gestureController.current = controller;
      const held = controller.begin({
        sample: pointerSample(event),
        captureTarget: event.currentTarget,
        trayBounds: snapshotBounds(trayTarget.getBoundingClientRect()),
        hitBounds: snapshotBounds(hitTarget.getBoundingClientRect()),
        hitPaddingPx: event.pointerType === 'touch' ? 24 : 14,
        motionSeed,
      });
      if (held) setHeldRollGroup(held);
    },
    [canInteract, motionSeed, requestIdentity]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const controller = gestureController.current;
      if (!controller) return;
      const held = controller.move(pointerSample(event));
      if (held) setHeldRollGroup(held);
      else if (!controller.held()) setHeldRollGroup(undefined);
    },
    []
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const controller = gestureController.current;
      if (!controller) return;
      const throwProfile = controller.release(pointerSample(event));
      if (!throwProfile) {
        if (!controller.held()) setHeldRollGroup(undefined);
        return;
      }

      setHeldRollGroup(undefined);
      requestRelease(throwProfile);
    },
    [requestRelease]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (gestureController.current?.cancel(event.pointerId))
        setHeldRollGroup(undefined);
    },
    []
  );

  const handleGrabClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.detail !== 0 || gestureController.current?.held()) return;
      requestRelease(undefined);
    },
    [requestRelease]
  );

  useLayoutEffect(() => {
    const identityChanged = gestureIdentity.current !== requestIdentity;
    gestureIdentity.current = requestIdentity;
    if (!canInteract || identityChanged) resetGesture();
  }, [canInteract, requestIdentity, resetGesture]);

  useEffect(() => resetGesture, [resetGesture]);

  const handleTelemetry = useCallback<
    NonNullable<AttackDie3DProps['onTelemetry']>
  >(
    (event) => {
      if (event.state === 'failed') resetGesture();
      onTelemetry?.(event);
    },
    [onTelemetry, resetGesture]
  );

  useEffect(() => {
    if (provider) onProviderDiagnostic?.(provider);
  }, [onProviderDiagnostic, provider]);

  useEffect(() => {
    if (!uses3DRenderer && phase === 'settled') completeFallback();
  }, [completeFallback, phase, uses3DRenderer]);

  if (!valid) {
    return (
      <DiceTray3DShell label={label} phase={phase}>
        <p role="status">Unable to display this dice tray.</p>
      </DiceTray3DShell>
    );
  }

  const rendererPhase = phase === 'armed' ? 'ready' : phase;
  const effectiveRelease =
    release &&
    release.presentationId === presentationId &&
    release.presetId === item.presetId
      ? release
      : undefined;
  const showsExplicitRollControl =
    valid &&
    rollerRole === 'player' &&
    witnessRole === 'roller' &&
    onReleaseRequest !== undefined;
  const controls = showsExplicitRollControl ? (
    <button
      type="button"
      aria-disabled={!canInteract}
      onClick={() => requestRelease(undefined)}
    >
      Roll d20
    </button>
  ) : undefined;
  const grabbed = canInteract && heldRollGroup !== undefined;
  const fallback = (
    <DiceTray
      phase={rendererPhase}
      finalFace={item.authoritativeResult}
      outcome=""
      reducedMotion={reducedMotion}
    />
  );
  return (
    <DiceTray3DShell
      label={label}
      phase={phase}
      className="dice-tray-3d-shell--compact"
      controls={controls}
    >
      <div
        ref={rendererTarget}
        className="dice-tray-3d-renderer"
        data-testid="dice-tray-3d-renderer"
        data-grabbed={grabbed ? 'true' : 'false'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
      >
        {originalRuntime || lightningDevelopment ? (
          <AttackDie3D
            result={item.authoritativeResult}
            presentationToken={rendererGeneration}
            phase={rendererPhase}
            materialMode={originalRuntime ? 'raw' : 'magical'}
            reducedMotion={reducedMotion}
            magicalAnimation={!originalRuntime}
            throwProfile={effectiveRelease?.throwProfile}
            heldRollGroup={heldRollGroup}
            provider={provider}
            onTelemetry={handleTelemetry}
            onRendererInfo={onRendererInfo}
            onMotionDiagnostic={onMotionDiagnostic}
            fallback={fallback}
            sceneOverride={lightningDevelopment ? sceneOverride : undefined}
            sidecarOverride={lightningDevelopment ? sidecarOverride : undefined}
            calibrationPose={lightningDevelopment ? calibrationPose : undefined}
            forceFailure={originalRuntime ? forceFailure : undefined}
          />
        ) : (
          <DiceTray
            phase={rendererPhase}
            finalFace={item.authoritativeResult}
            outcome=""
            reducedMotion={reducedMotion}
            onPresentationComplete={
              phase === 'rolling' ? completeFallback : undefined
            }
          />
        )}
        {canInteract && (
          <button
            ref={grabTarget}
            type="button"
            className="dice-tray-3d-grab-target"
            aria-label="Grab d20"
            data-grabbed={grabbed ? 'true' : 'false'}
            onClick={handleGrabClick}
          />
        )}
      </div>
    </DiceTray3DShell>
  );
}
