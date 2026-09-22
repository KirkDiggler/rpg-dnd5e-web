import { projectCompositionPointLights } from '@/compositions/compositionLightSources';
import { compositionIdFromRef } from '@/compositions/compositionRef';
import { decodeCompositionScene } from '@/compositions/compositionScene';
import type { CompositionSource } from '@/compositions/compositionSource';
import type { DoorInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import {
  type DungeonLightSource,
  resolveDungeonLighting,
} from '../../rendering/dungeonLighting';
import { facingToYaw } from '../hex-grid/facingYaw';
import { coordToKey } from '../hex-grid/hexMath';
import { AtlasPropModel } from './AtlasPropModel';
import {
  propWorldPosition,
  type Scene3D,
  type SceneProp3D,
} from './atlasToScene3D';
import { DungeonSceneLights } from './DungeonSceneLights';
import { DungeonShell, type ShellFallbackReason } from './DungeonShell';
import { RoomSceneEnvironment } from './RoomSceneEnvironment';
import { useDungeonCompositions } from './useDungeonCompositions';

export interface DungeonEnvironmentProps {
  readonly scene: Scene3D;
  readonly focus: Readonly<{ x: number; z: number }>;
  readonly hexSize: number;
  readonly doors?: ReadonlyMap<string, DoorInfo>;
  readonly onDoorClick?: (door: string) => void;
  /** The dungeon key the canonical presentation was fetched by — the prefix
   * of every `<key>/<itemId>` door id, so the canonical branch can join live
   * door state to the item that renders it. */
  readonly dungeonKey?: string;
  readonly onShellFallbackReason?: (reason: ShellFallbackReason | null) => void;
  readonly onLightingDiagnostics?: (messages: readonly string[]) => void;
  readonly compositionSource?: CompositionSource;
}

/** Stable empty input so the canonical branch resolves NO duplicated
 * legacy composition sources (empty references ⇒ no fetches). */
const NO_LEGACY_PROPS: readonly SceneProp3D[] = Object.freeze([]);

export function DungeonEnvironment({
  scene,
  focus,
  hexSize,
  doors,
  onDoorClick,
  dungeonKey,
  onShellFallbackReason,
  onLightingDiagnostics,
  compositionSource,
}: DungeonEnvironmentProps): ReactElement {
  // THE CANONICAL BRANCH. A scene carrying a decoded room presentation
  // renders that presentation through the shared World Building leaves;
  // the atlas's own cell props are then the legacy DUPLICATES of the same
  // room, so their placements, shell walls and per-cell floor are
  // suppressed — while the mechanical channels themselves stay untouched
  // (movement, sight, doors' live state and member visibility remain
  // atlas/session answers above this component).
  const canonicalPresentation = scene.roomScene ?? null;
  const compositionResolutions = useDungeonCompositions(
    canonicalPresentation ? NO_LEGACY_PROPS : scene.props,
    compositionSource
  );
  const authoredPointLights = useMemo(() => {
    if (canonicalPresentation) {
      // Canonical lights resolve exactly once, from the canonical
      // scene; the duplicated legacy composition/prop sources are not
      // also resolved.
      return [];
    }
    return scene.props.flatMap((prop) => {
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
    });
  }, [canonicalPresentation, compositionResolutions, hexSize, scene.props]);
  const plan = useMemo(() => {
    const focusPoint = { x: focus.x, z: focus.z };
    if (canonicalPresentation) {
      // Identity outer placement: this inline scene is already
      // world-posed, so the placement exists only to supply the stable
      // light identity (`composition:<scene id>:<item id>`). No synthetic
      // AtlasProp, no external composition lookup, no second group
      // transform — `projectCompositionPointLights` applies the item's
      // own yaw to its light offset and the shared surface lift once.
      const canonicalLights = projectCompositionPointLights(
        canonicalPresentation.scene,
        {
          compositionId: canonicalPresentation.scene.id,
          placementId: canonicalPresentation.scene.id,
          transform: { x: 0, y: 0, z: 0, rotationY: 0 },
        }
      );
      // Same region/focus/budget resolution as always, minus the atlas
      // props' duplicated legacy light sources. Region floor exposure
      // stays the atlas's answer.
      return resolveDungeonLighting(
        {
          ...scene.lighting,
          sources: Object.freeze([] as readonly DungeonLightSource[]),
        },
        focusPoint,
        canonicalLights
      );
    }
    return resolveDungeonLighting(
      scene.lighting,
      focusPoint,
      authoredPointLights
    );
  }, [
    authoredPointLights,
    canonicalPresentation,
    scene.lighting,
    focus.x,
    focus.z,
  ]);
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

  if (canonicalPresentation) {
    return (
      <>
        <DungeonSceneLights plan={plan} />
        {/* The canonical branch renders the authored room, so it is the one
            that has to join live door state to the item that draws the door.
            The legacy branch below takes the same three. */}
        <RoomSceneEnvironment
          presentation={canonicalPresentation}
          dungeonKey={dungeonKey}
          doors={doors}
          onDoorClick={onDoorClick}
          hiddenPlacedIds={scene.hiddenPlacedIds}
        />
      </>
    );
  }

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
