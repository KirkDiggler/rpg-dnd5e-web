import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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
  DiceTrayInteractionSurface,
  type DiceTrayInteractionHeldState,
} from './DiceTrayInteractionSurface';
import type { HeldRollGroupState } from './rollGroupGestureController';
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
  const gestureIdentity = useRef(requestIdentity);
  const completedFallback = useRef<string | undefined>(undefined);
  const [heldRollGroup, setHeldRollGroup] = useState<
    HeldRollGroupState | undefined
  >(undefined);
  const heldRollGroupRef = useRef<HeldRollGroupState | undefined>(undefined);
  const [gestureResetKey, setGestureResetKey] = useState(0);
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

  const handleHeldChange = useCallback(
    (held: DiceTrayInteractionHeldState | undefined) => {
      const legacyHeld = held as HeldRollGroupState | undefined;
      heldRollGroupRef.current = legacyHeld;
      setHeldRollGroup(legacyHeld);
    },
    []
  );
  const resetGesture = useCallback(() => {
    if (heldRollGroupRef.current !== undefined)
      setGestureResetKey((current) => current + 1);
    heldRollGroupRef.current = undefined;
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

  useLayoutEffect(() => {
    const identityChanged = gestureIdentity.current !== requestIdentity;
    gestureIdentity.current = requestIdentity;
    if (!canInteract || identityChanged) resetGesture();
  }, [canInteract, requestIdentity, resetGesture]);

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
      <DiceTrayInteractionSurface
        mode="legacy-normalized"
        canInteract={canInteract}
        motionSeed={motionSeed}
        resetKey={gestureResetKey}
        onHeldChange={handleHeldChange}
        onReleaseRequest={requestRelease}
        className="dice-tray-3d-renderer"
        testId="dice-tray-3d-renderer"
        grabLabel={canInteract ? 'Grab d20' : undefined}
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
      </DiceTrayInteractionSurface>
    </DiceTray3DShell>
  );
}
