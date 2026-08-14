import { useCallback, useRef } from 'react';
import { AttackDie3D, type AttackDie3DProps } from './AttackDie3D';
import type { QuaternionTuple } from './attackDieContract';
import {
  isDicePresentationIdentifier,
  isDicePresetIdentifier,
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
  onReleaseRequest?: () => void;
  onTelemetry?: AttackDie3DProps['onTelemetry'];
  onFallbackPresentationComplete?: () => void;
  reducedMotion?: boolean;
  sceneOverride?: AttackDie3DProps['sceneOverride'];
  sidecarOverride?: AttackDie3DProps['sidecarOverride'];
  calibrationPose?: QuaternionTuple;
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
  const requestRelease = useCallback(() => {
    if (
      !valid ||
      !requestIdentity ||
      phase !== 'armed' ||
      rollerRole !== 'player' ||
      witnessRole !== 'roller' ||
      committedRequest.current === requestIdentity
    )
      return;

    committedRequest.current = requestIdentity;
    onReleaseRequest?.();
  }, [
    onReleaseRequest,
    phase,
    requestIdentity,
    rollerRole,
    valid,
    witnessRole,
  ]);

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
  const controls =
    phase === 'armed' && rollerRole === 'player' && witnessRole === 'roller' ? (
      <button type="button" onClick={requestRelease}>
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
      <div
        className="dice-tray-3d-renderer"
        data-testid="dice-tray-3d-renderer"
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
      </div>
    </DiceTray3DShell>
  );
}
