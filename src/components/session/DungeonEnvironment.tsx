import { projectCompositionPointLights } from '@/compositions/compositionLightSources';
import { compositionIdFromRef } from '@/compositions/compositionRef';
import { decodeCompositionScene } from '@/compositions/compositionScene';
import type { CompositionSource } from '@/compositions/compositionSource';
import type { DoorInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { resolveDungeonLighting } from '../../rendering/dungeonLighting';
import { facingToYaw } from '../hex-grid/facingYaw';
import { coordToKey } from '../hex-grid/hexMath';
import { AtlasPropModel } from './AtlasPropModel';
import { propWorldPosition, type Scene3D } from './atlasToScene3D';
import { DungeonSceneLights } from './DungeonSceneLights';
import { DungeonShell, type ShellFallbackReason } from './DungeonShell';
import { useDungeonCompositions } from './useDungeonCompositions';

export interface DungeonEnvironmentProps {
  readonly scene: Scene3D;
  readonly focus: Readonly<{ x: number; z: number }>;
  readonly hexSize: number;
  readonly doors?: ReadonlyMap<string, DoorInfo>;
  readonly onDoorClick?: (door: string) => void;
  readonly onShellFallbackReason?: (reason: ShellFallbackReason | null) => void;
  readonly onLightingDiagnostics?: (messages: readonly string[]) => void;
  readonly compositionSource?: CompositionSource;
}

export function DungeonEnvironment({
  scene,
  focus,
  hexSize,
  doors,
  onDoorClick,
  onShellFallbackReason,
  onLightingDiagnostics,
  compositionSource,
}: DungeonEnvironmentProps): ReactElement {
  const compositionResolutions = useDungeonCompositions(
    scene.props,
    compositionSource
  );
  const authoredPointLights = useMemo(
    () =>
      scene.props.flatMap((prop) => {
        const compositionId = compositionIdFromRef(prop.ref);
        const resolution = compositionId
          ? compositionResolutions.get(compositionId)
          : undefined;
        if (!compositionId || !prop.id || resolution?.status !== 'ready') {
          return [];
        }
        try {
          const world = propWorldPosition(prop, hexSize);
          return projectCompositionPointLights(
            decodeCompositionScene(resolution.composition),
            {
              compositionId,
              placementId: prop.id,
              transform: {
                x: world.x,
                y: world.y,
                z: world.z,
                rotationY: facingToYaw(prop.facing),
              },
            }
          );
        } catch {
          // CompositionPlacementModel's existing boundary presents malformed
          // snapshots. One bad placement contributes no lights but does not
          // erase healthy resolved placements.
          return [];
        }
      }),
    [compositionResolutions, hexSize, scene.props]
  );
  const plan = useMemo(
    () =>
      resolveDungeonLighting(
        scene.lighting,
        { x: focus.x, z: focus.z },
        authoredPointLights
      ),
    [authoredPointLights, scene.lighting, focus.x, focus.z]
  );
  const floorLighting = useMemo(
    () => ({
      exposureByCell: plan.floorExposureByCell,
      poolsByCell: plan.floorPoolsByCell,
    }),
    [plan.floorExposureByCell, plan.floorPoolsByCell]
  );
  const diagnosticsSignature = plan.diagnostics.join('\u0000');
  const reportedDiagnostics = useRef<{
    signature: string;
    callback: typeof onLightingDiagnostics;
  } | null>(null);
  useEffect(() => {
    if (!onLightingDiagnostics) return;
    if (
      reportedDiagnostics.current?.signature === diagnosticsSignature &&
      reportedDiagnostics.current.callback === onLightingDiagnostics
    ) {
      return;
    }
    reportedDiagnostics.current = {
      signature: diagnosticsSignature,
      callback: onLightingDiagnostics,
    };
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
      {scene.props.map((prop, index) => {
        const compositionId = compositionIdFromRef(prop.ref);
        const compositionResolution =
          compositionSource && compositionId
            ? (compositionResolutions.get(compositionId) ?? {
                status: 'loading' as const,
              })
            : undefined;
        return (
          <AtlasPropModel
            key={`${prop.ref}-${coordToKey(prop.position)}-${index}`}
            prop={prop}
            hexSize={hexSize}
            orientation="pointy"
            compositionSource={compositionSource}
            compositionResolution={compositionResolution}
          />
        );
      })}
    </>
  );
}
