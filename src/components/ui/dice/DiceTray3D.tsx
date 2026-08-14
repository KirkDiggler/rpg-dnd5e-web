import { useCallback, useEffect, useRef } from 'react';
import { AttackDie3D, type AttackDie3DProps } from './AttackDie3D';
import type { QuaternionTuple } from './attackDieContract';
import {
  createDicePresentationRelease,
  type DicePresentationRelease,
} from './dicePresentationRelease';
import { DiceTray } from './DiceTray';
import { DiceTray3DShell } from './DiceTray3DShell';

export interface DiceTray3DItem {
  id: string;
  kind: 'd20';
  presetId: string;
  authoritativeResult: number;
  presentationToken: number;
}

export interface DiceTray3DProps {
  label: string;
  rollerRole: 'player' | 'monster';
  witnessRole: 'roller' | 'spectator';
  phase: 'armed' | 'rolling' | 'settled';
  dice: readonly DiceTray3DItem[];
  release?: DicePresentationRelease;
  onReleaseRequest?: (value: DicePresentationRelease) => void;
  onTelemetry?: AttackDie3DProps['onTelemetry'];
  reducedMotion?: boolean;
  sceneOverride?: AttackDie3DProps['sceneOverride'];
  sidecarOverride?: AttackDie3DProps['sidecarOverride'];
  calibrationPose?: QuaternionTuple;
}

function supportedDie(dice: readonly DiceTray3DItem[]) {
  const item = dice[0];
  return (
    dice.length === 1 &&
    item?.kind === 'd20' &&
    item.presetId === 'lightning' &&
    Number.isInteger(item.authoritativeResult) &&
    item.authoritativeResult >= 1 &&
    item.authoritativeResult <= 20
  );
}

export function DiceTray3D({
  label,
  rollerRole,
  witnessRole,
  phase,
  dice,
  release,
  onReleaseRequest,
  onTelemetry,
  reducedMotion = false,
  sceneOverride,
  sidecarOverride,
  calibrationPose,
}: DiceTray3DProps) {
  const supported = supportedDie(dice);
  const item = dice[0];
  const presentationId = supported
    ? `${item.id}:${item.presentationToken}`
    : undefined;
  const committedPresentationId = useRef<string | undefined>(undefined);
  const requestRelease = useCallback(() => {
    if (
      !supported ||
      !presentationId ||
      phase !== 'armed' ||
      witnessRole !== 'roller' ||
      committedPresentationId.current === presentationId
    )
      return;

    const next = createDicePresentationRelease({
      presentationId,
      presetId: item.presetId,
      variation: item.presentationToken,
    });
    committedPresentationId.current = presentationId;
    onReleaseRequest?.(next);
  }, [
    item?.presentationToken,
    item?.presetId,
    onReleaseRequest,
    phase,
    presentationId,
    supported,
    witnessRole,
  ]);

  useEffect(() => {
    if (rollerRole === 'monster') requestRelease();
  }, [requestRelease, rollerRole]);

  if (!supported) {
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
  return (
    <DiceTray3DShell
      label={label}
      phase={phase}
      className="dice-tray-3d-shell--compact"
      controls={
        phase === 'armed' &&
        rollerRole === 'player' &&
        witnessRole === 'roller' ? (
          <button type="button" onClick={requestRelease}>
            Roll d20
          </button>
        ) : undefined
      }
    >
      <div
        className="dice-tray-3d-renderer"
        data-testid="dice-tray-3d-renderer"
      >
        <AttackDie3D
          result={item.authoritativeResult}
          presentationToken={item.presentationToken}
          phase={rendererPhase}
          materialMode="magical"
          reducedMotion={reducedMotion}
          decorativeRelease={effectiveRelease}
          onTelemetry={onTelemetry}
          fallback={
            <DiceTray
              phase={rendererPhase}
              finalFace={item.authoritativeResult}
              outcome=""
              reducedMotion={reducedMotion}
            />
          }
          sceneOverride={sceneOverride}
          sidecarOverride={sidecarOverride}
          calibrationPose={calibrationPose}
        />
      </div>
    </DiceTray3DShell>
  );
}
