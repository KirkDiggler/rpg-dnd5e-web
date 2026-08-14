import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AttackDie3D, type AttackDie3DProps } from './AttackDie3D';
import type { QuaternionTuple } from './attackDieContract';
import {
  isDicePresentationIdentifier,
  isDicePresetIdentifier,
  type DiceGestureSample,
  type DicePresentationRelease,
} from './dicePresentationRelease';
import { DiceTray } from './DiceTray';
import { DiceTray3DShell } from './DiceTray3DShell';

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
}

function safelyReleaseCapture(active: ActiveDiceGesture) {
  try {
    if (active.captureTarget.hasPointerCapture(active.pointerId))
      active.captureTarget.releasePointerCapture(active.pointerId);
  } catch {
    // Capture may already be gone after browser cancellation or element removal.
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
  const committedRequest = useRef<string | undefined>(undefined);
  const activeGesture = useRef<ActiveDiceGesture | undefined>(undefined);
  const [grabbed, setGrabbed] = useState(false);
  const canInteract =
    valid &&
    requestIdentity !== undefined &&
    phase === 'armed' &&
    rollerRole === 'player' &&
    witnessRole === 'roller' &&
    onReleaseRequest !== undefined;
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

  const cancelGesture = useCallback((pointerId: number) => {
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
      };
      activeGesture.current = active;
      try {
        active.captureTarget.setPointerCapture(pointerId);
        if (!active.captureTarget.hasPointerCapture(pointerId)) {
          activeGesture.current = undefined;
          return;
        }
      } catch {
        activeGesture.current = undefined;
        return;
      }
      setGrabbed(true);
    },
    [canInteract, requestIdentity]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const active = activeGesture.current;
      if (
        !active ||
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
      if (!canInteract || active.requestIdentity !== requestIdentity) {
        cancelGesture(event.pointerId);
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
    [canInteract, cancelGesture, requestIdentity, requestRelease]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      cancelGesture(event.pointerId);
    },
    [cancelGesture]
  );

  useLayoutEffect(() => {
    const active = activeGesture.current;
    if (active && (!canInteract || active.requestIdentity !== requestIdentity))
      cancelGesture(active.pointerId);
  }, [canInteract, cancelGesture, requestIdentity]);

  useEffect(
    () => () => {
      const active = activeGesture.current;
      if (!active) return;
      activeGesture.current = undefined;
      safelyReleaseCapture(active);
    },
    []
  );

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
        {item.presetId === 'lightning' ? (
          <AttackDie3D
            result={item.authoritativeResult}
            presentationToken={rendererGeneration}
            phase={rendererPhase}
            materialMode="magical"
            reducedMotion={reducedMotion}
            decorativeRelease={effectiveRelease}
            onTelemetry={onTelemetry}
            fallback={fallback}
            sceneOverride={sceneOverride}
            sidecarOverride={sidecarOverride}
            calibrationPose={calibrationPose}
          />
        ) : (
          <DiceTray
            phase={rendererPhase}
            finalFace={item.authoritativeResult}
            outcome=""
            reducedMotion={reducedMotion}
            onPresentationComplete={
              phase === 'rolling' ? onFallbackPresentationComplete : undefined
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
            onClick={() => requestRelease()}
          />
        )}
      </div>
    </DiceTray3DShell>
  );
}
