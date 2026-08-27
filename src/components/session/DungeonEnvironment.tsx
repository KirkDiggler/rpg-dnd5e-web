import type { DoorInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { resolveDungeonLighting } from '../../rendering/dungeonLighting';
import { coordToKey } from '../hex-grid/hexMath';
import { AtlasPropModel } from './AtlasPropModel';
import type { Scene3D } from './atlasToScene3D';
import { DungeonSceneLights } from './DungeonSceneLights';
import { DungeonShell, type ShellFallbackReason } from './DungeonShell';

export interface DungeonEnvironmentProps {
  readonly scene: Scene3D;
  readonly focus: Readonly<{ x: number; z: number }>;
  readonly hexSize: number;
  readonly doors?: ReadonlyMap<string, DoorInfo>;
  readonly onDoorClick?: (door: string) => void;
  readonly onShellFallbackReason?: (reason: ShellFallbackReason | null) => void;
  readonly onLightingDiagnostics?: (messages: readonly string[]) => void;
}

export function DungeonEnvironment({
  scene,
  focus,
  hexSize,
  doors,
  onDoorClick,
  onShellFallbackReason,
  onLightingDiagnostics,
}: DungeonEnvironmentProps): ReactElement {
  const plan = useMemo(
    () => resolveDungeonLighting(scene.lighting, { x: focus.x, z: focus.z }),
    [scene.lighting, focus.x, focus.z]
  );
  const floorLighting = useMemo(
    () => ({
      exposureByCell: plan.floorExposureByCell,
      poolsByCell: plan.floorPoolsByCell,
    }),
    [plan.floorExposureByCell, plan.floorPoolsByCell]
  );
  const diagnosticsSignature = plan.diagnostics.join('\u0000');
  const reportedDiagnostics = useRef<string | null>(null);
  useEffect(() => {
    if (
      !onLightingDiagnostics ||
      reportedDiagnostics.current === diagnosticsSignature
    ) {
      return;
    }
    reportedDiagnostics.current = diagnosticsSignature;
    onLightingDiagnostics(plan.diagnostics);
  }, [diagnosticsSignature, onLightingDiagnostics, plan.diagnostics]);

  return (
    <>
      <DungeonSceneLights plan={plan} />
      <DungeonShell
        scene={scene}
        doors={doors}
        onDoorClick={onDoorClick}
        onFallbackReason={onShellFallbackReason}
        floorLighting={floorLighting}
      />
      {scene.props.map((prop, index) => (
        <AtlasPropModel
          key={`${prop.ref}-${coordToKey(prop.position)}-${index}`}
          prop={prop}
          hexSize={hexSize}
          orientation="pointy"
        />
      ))}
    </>
  );
}
