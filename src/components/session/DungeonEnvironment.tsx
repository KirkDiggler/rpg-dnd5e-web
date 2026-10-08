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
import { PropPresentationEnvironment } from './PropPresentationEnvironment';
import { propPresentationItem } from './propPresentations';
import { RoomSceneEnvironment } from './RoomSceneEnvironment';
import { StructuralLayoutEnvironment } from './StructuralLayoutEnvironment';
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
  // Presentation supplies prop appearance, not the observer's floor or walls.
  // Both dialects draw the atlas shell; only duplicated legacy prop models
  // are suppressed for an authored room. Concealed space must never be
  // restored from the author's full workspace.
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
  const hiddenLegacyIds = useMemo(
    () =>
      new Set([
        ...(scene.hiddenPlacedIds ?? []),
        ...(scene.propPresentations ?? []).map((p) => p.id),
      ]),
    [scene.hiddenPlacedIds, scene.propPresentations]
  );
  const permittedLights = useMemo(
    () =>
      projectCompositionPointLights(
        {
          version: 1,
          id: 'permitted-props',
          name: '',
          groups: [],
          items: (scene.propPresentations ?? [])
            .filter((p) => !scene.rememberedPropPresentationIds?.has(p.id))
            .map((p) => propPresentationItem(p, hexSize)),
        },
        {
          compositionId: 'permitted-props',
          placementId: 'permitted-props',
          transform: { x: 0, y: 0, z: 0, rotationY: 0 },
        }
      ),
    [scene.propPresentations, scene.rememberedPropPresentationIds, hexSize]
  );
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
        {
          ...canonicalPresentation.scene,
          items: canonicalPresentation.scene.items.filter(
            (item) => !hiddenLegacyIds.has(item.id)
          ),
        },
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
        [...canonicalLights, ...permittedLights]
      );
    }
    return resolveDungeonLighting(scene.lighting, focusPoint, [
      ...authoredPointLights,
      ...permittedLights,
    ]);
  }, [
    authoredPointLights,
    canonicalPresentation,
    scene.lighting,
    hiddenLegacyIds,
    permittedLights,
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

  const propModels = (
    <PropPresentationEnvironment
      presentations={scene.propPresentations ?? []}
      hexSize={hexSize}
      rememberedIds={scene.rememberedPropPresentationIds}
      currentDoorIds={scene.currentDoorIds}
      doors={doors}
      onDoorClick={onDoorClick}
    />
  );
  if (canonicalPresentation) {
    return (
      <>
        <DungeonSceneLights plan={plan} />
        {/* The canonical branch renders the authored room, so it is the one
            that has to join live door state to the item that draws the door.
            The legacy branch below takes the same three. */}
        <DungeonShell
          scene={scene}
          doors={doors}
          onDoorClick={onDoorClick}
          onFallbackReason={onShellFallbackReason}
          floorLighting={floorLighting}
        />
        <RoomSceneEnvironment
          presentation={canonicalPresentation}
          renderWorkspaceFloor={false}
          dungeonKey={dungeonKey}
          doors={doors}
          onDoorClick={onDoorClick}
          hiddenPlacedIds={hiddenLegacyIds}
        />
        {/* The supplied structural layout renders in BOTH branches. It is
            independent of the authored room presentation and of the legacy
            atlas props: it is the toolkit's own permitted wall/door records,
            drawn through the shared World Building leaves. */}
        {propModels}
        <StructuralLayoutEnvironment
          walls={scene.structuralWalls ?? []}
          doors={scene.structuralDoors ?? []}
          diagnostics={scene.structuralDiagnostics ?? []}
          observedDoors={doors}
          onDoorClick={onDoorClick}
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
      {propModels}
      <StructuralLayoutEnvironment
        walls={scene.structuralWalls ?? []}
        doors={scene.structuralDoors ?? []}
        diagnostics={scene.structuralDiagnostics ?? []}
        observedDoors={doors}
        onDoorClick={onDoorClick}
      />
    </>
  );
}
