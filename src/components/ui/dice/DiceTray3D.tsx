import { AttackDie3D, type AttackDie3DProps } from './AttackDie3D';
import type { QuaternionTuple } from './attackDieContract';
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
  phase: 'rolling' | 'settled';
  dice: readonly DiceTray3DItem[];
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
  phase,
  dice,
  reducedMotion = false,
  sceneOverride,
  sidecarOverride,
  calibrationPose,
}: DiceTray3DProps) {
  if (!supportedDie(dice)) {
    return (
      <DiceTray3DShell label={label} phase={phase}>
        <p role="status">Unable to display this dice tray.</p>
      </DiceTray3DShell>
    );
  }

  const item = dice[0];
  return (
    <DiceTray3DShell
      label={label}
      phase={phase}
      className="dice-tray-3d-shell--compact"
    >
      <div
        className="dice-tray-3d-renderer"
        data-testid="dice-tray-3d-renderer"
      >
        <AttackDie3D
          result={item.authoritativeResult}
          presentationToken={item.presentationToken}
          phase={phase}
          materialMode="magical"
          reducedMotion={reducedMotion}
          fallback={
            <DiceTray
              phase="settled"
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
