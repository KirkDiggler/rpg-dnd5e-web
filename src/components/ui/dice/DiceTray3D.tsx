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
  type DiceGestureSample,
  type DicePresentationRelease,
} from './dicePresentationRelease';
import { DiceTray } from './DiceTray';
import { DiceTray3DShell } from './DiceTray3DShell';

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
  rollerRole: 'player' | 'monster';
  witnessRole: 'roller' | 'spectator';
  phase: 'armed' | 'rolling' | 'settled';
  dice: readonly DiceTray3DItem[];
  release?: DicePresentationRelease;
  onReleaseRequest?: (gesture?: DiceGestureSample) => void;
  onTelemetry?: AttackDie3DProps['onTelemetry'];
  onFallbackPresentationComplete?: () => void;
  reducedMotion?: boolean;
  sceneOverride?: AttackDie3DProps['sceneOverride'];
  sidecarOverride?: AttackDie3DProps['sidecarOverride'];
  calibrationPose?: QuaternionTuple;
}

interface ActiveDiceGesture {
  pointerId: number;
  requestIdentity: string;
  origin: readonly [number, number];
  current: readonly [number, number];
  distance: number;
  captureTarget: HTMLButtonElement;
  captureStatus: 'accepted' | 'rejected';
}

function safelyReleaseCapture(active: ActiveDiceGesture) {
  let captureHeld: boolean | undefined;
  try {
    captureHeld = active.captureTarget.hasPointerCapture(active.pointerId);
  } catch {
    captureHeld = undefined;
  }
  if (captureHeld === false) return true;

  try {
    active.captureTarget.releasePointerCapture(active.pointerId);
    return true;
  } catch {
    return false;
  }
}

function validDieInput(
  presentationId: string,
  rendererGeneration: number,
  dice: readonly DiceTray3DItem[]
) {
  const item = dice[0];
  return (
    isDicePresentationIdentifier(presentationId) &&
    Number.isSafeInteger(rendererGeneration) &&
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
  rollerRole,
  witnessRole,
  phase,
  dice,
  release,
  onReleaseRequest,
  onTelemetry,
  onFallbackPresentationComplete,
  reducedMotion = false,
  sceneOverride,
  sidecarOverride,
  calibrationPose,
}: DiceTray3DProps) {
  const valid = validDieInput(presentationId, rendererGeneration, dice);
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
  const committedRequest = useRef<string | undefined>(undefined);
  const activeGesture = useRef<ActiveDiceGesture | undefined>(undefined);
  const completedFallback = useRef<string | undefined>(undefined);
  const [grabbed, setGrabbed] = useState(false);
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
  const requestRelease = useCallback(
    (gesture?: DiceGestureSample) => {
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
      if (gesture === undefined) onReleaseRequest();
      else onReleaseRequest(gesture);
    },
    [onReleaseRequest, phase, requestIdentity, rollerRole, valid, witnessRole]
  );

  const finishGesture = useCallback((pointerId: number) => {
    const active = activeGesture.current;
    if (!active || active.pointerId !== pointerId) return;
    activeGesture.current = undefined;
    setGrabbed(false);
    safelyReleaseCapture(active);
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (
        !canInteract ||
        !requestIdentity ||
        committedRequest.current === requestIdentity ||
        activeGesture.current
      )
        return;

      const pointerId = event.pointerId;
      const point = [event.clientX, event.clientY] as const;
      const active: ActiveDiceGesture = {
        pointerId,
        requestIdentity,
        origin: point,
        current: point,
        distance: 0,
        captureTarget: event.currentTarget,
        captureStatus: 'rejected',
      };
      activeGesture.current = active;

      let captureVerified = false;
      try {
        active.captureTarget.setPointerCapture(pointerId);
        captureVerified = active.captureTarget.hasPointerCapture(pointerId);
      } catch {
        captureVerified = false;
      }
      if (!captureVerified) {
        setGrabbed(false);
        if (safelyReleaseCapture(active)) activeGesture.current = undefined;
        return;
      }

      activeGesture.current = { ...active, captureStatus: 'accepted' };
      setGrabbed(true);
    },
    [canInteract, requestIdentity]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const active = activeGesture.current;
      if (
        !active ||
        active.captureStatus !== 'accepted' ||
        active.pointerId !== event.pointerId ||
        active.requestIdentity !== requestIdentity
      )
        return;

      const current = [event.clientX, event.clientY] as const;
      activeGesture.current = {
        ...active,
        current,
        distance:
          active.distance +
          Math.hypot(
            current[0] - active.current[0],
            current[1] - active.current[1]
          ),
      };
    },
    [requestIdentity]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const active = activeGesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      if (
        active.captureStatus !== 'accepted' ||
        !canInteract ||
        active.requestIdentity !== requestIdentity
      ) {
        finishGesture(event.pointerId);
        return;
      }

      const current = [event.clientX, event.clientY] as const;
      const sample: DiceGestureSample = {
        origin: [active.origin[0], active.origin[1]],
        current,
        distance:
          active.distance +
          Math.hypot(
            current[0] - active.current[0],
            current[1] - active.current[1]
          ),
      };
      activeGesture.current = undefined;
      setGrabbed(false);
      safelyReleaseCapture(active);
      requestRelease(sample);
    },
    [canInteract, finishGesture, requestIdentity, requestRelease]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      finishGesture(event.pointerId);
    },
    [finishGesture]
  );

  const handleGrabClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.detail !== 0 || activeGesture.current) return;
      requestRelease();
    },
    [requestRelease]
  );

  useLayoutEffect(() => {
    const active = activeGesture.current;
    if (!active || (canInteract && active.requestIdentity === requestIdentity))
      return;

    setGrabbed(false);
    if (safelyReleaseCapture(active)) activeGesture.current = undefined;
    else activeGesture.current = { ...active, captureStatus: 'rejected' };
  }, [canInteract, requestIdentity]);

  useEffect(
    () => () => {
      const active = activeGesture.current;
      if (!active) return;
      activeGesture.current = undefined;
      safelyReleaseCapture(active);
    },
    []
  );

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
  const controls = canInteract ? (
    <button type="button" onClick={() => requestRelease()}>
      Roll d20
    </button>
  ) : undefined;
  const reviewGrabbed = canInteract && grabbed;
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
        className="dice-tray-3d-renderer"
        data-testid="dice-tray-3d-renderer"
        data-grabbed={reviewGrabbed ? 'true' : 'false'}
      >
        {originalRuntime || lightningDevelopment ? (
          <AttackDie3D
            result={item.authoritativeResult}
            presentationToken={rendererGeneration}
            phase={rendererPhase}
            materialMode={originalRuntime ? 'raw' : 'magical'}
            reducedMotion={reducedMotion}
            magicalAnimation={!originalRuntime}
            decorativeRelease={effectiveRelease}
            provider={
              originalRuntime
                ? ORIGINAL_CARVED_D20_PROVIDER
                : LIGHTNING_DEVELOPMENT_PROVIDER
            }
            onTelemetry={onTelemetry}
            fallback={fallback}
            sceneOverride={lightningDevelopment ? sceneOverride : undefined}
            sidecarOverride={lightningDevelopment ? sidecarOverride : undefined}
            calibrationPose={lightningDevelopment ? calibrationPose : undefined}
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
            type="button"
            className="dice-tray-3d-grab-target"
            aria-label="Grab d20"
            data-grabbed={reviewGrabbed ? 'true' : 'false'}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handlePointerCancel}
            onClick={handleGrabClick}
          />
        )}
      </div>
    </DiceTray3DShell>
  );
}
