/**
 * StructuralLayoutEnvironment — the runtime body for the session's supplied
 * structural walls and doors.
 *
 * It consumes the ephemeral render units `atlasToScene3D.buildScene3D`
 * produced from the generated `AtlasStructuralWall`/`AtlasStructuralDoor`
 * records (canonical feet converted once) and reuses the ACTUAL shared World
 * Building leaves the authoring editor draws with — `StructuralWallSurfacePieces`
 * for the repeated wall surface and `FittedDoorSurface` for a fitted door.
 * There is no cloned renderer, no fabricated blocker and no second
 * parent-wall/WorldProp stand-in.
 *
 * # Doors are independent of walls
 *
 * The door collection is rendered on its own. A permitted door whose parent
 * wall is withheld still draws, because the toolkit already decided presence:
 * this component renders every supplied record and swallows none.
 *
 * # State comes only from existing observations
 *
 * A door's mutable state is joined by its supplied canonical gameplay id
 * against the existing door observations — never a dungeon-prefix guess, never
 * the authored binding. Absent state is `unknown`: an explicit neutral marker
 * (the shared leaf's own), never an opaque wall or an invented closed/open
 * pose. The click affordance is offered only for a supplied KNOWN state, and
 * the server still owns reach and refusals — this component computes no rule.
 */

import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import {
  FittedDoorSurface,
  StructuralWallFallbackMarker,
  StructuralWallSurfacePieces,
  WallMarker,
  type FittedDoorState,
} from '@/concepts/world-building/StructuralWallSurfaces';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import {
  DoorState,
  type DoorInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { ReactElement } from 'react';
import { Suspense } from 'react';
import type {
  StructuralDoorRenderUnit,
  StructuralWallRenderUnit,
} from './structuralLayout';

export interface StructuralLayoutEnvironmentProps {
  readonly walls: readonly StructuralWallRenderUnit[];
  readonly doors: readonly StructuralDoorRenderUnit[];
  /** Named refusals for malformed supplied records. They render as a named,
   * geometry-free node — never a mesh dropped at the origin. */
  readonly diagnostics: readonly string[];
  /** Existing live door observations, keyed by canonical gameplay DoorID,
   * exactly as the atlas carries it. */
  readonly observedDoors?: ReadonlyMap<string, DoorInfo>;
  readonly onDoorClick?: (door: string) => void;
  /** Fog of war (rpg-project#586): walls and doors no seen cell borders
   * (`applyCellKnowledge`). Undefined draws everything lit. */
  readonly rememberedWallIds?: ReadonlySet<string>;
  readonly rememberedDoorIds?: ReadonlySet<string>;
}

/** The observed state, or `unknown` — never an invented closed/open. An
 * UNSPECIFIED state is not an observation of a shut door. */
/**
 * The drawn state for a presented door. A door with NO observation draws
 * CLOSED in the remembered treatment (fog of war, rpg-project#586 R2): the
 * atlas presented it because a cell on its edge is known, and with no sighting
 * of its state the client shows the shape it would take at rest, greyed,
 * rather than a placeholder that announces "a secret is here". An observation
 * whose state is unspecified is still `unknown`.
 */
function fittedDoorStateFromObservation(
  info: DoorInfo | undefined
): FittedDoorState {
  if (!info) return 'closed';
  if (info.state === DoorState.OPEN) return 'open';
  if (info.state === DoorState.CLOSED || info.state === DoorState.LOCKED) {
    return 'closed';
  }
  return 'unknown';
}

export function StructuralLayoutEnvironment({
  walls,
  doors,
  diagnostics,
  observedDoors,
  onDoorClick,
  rememberedWallIds,
  rememberedDoorIds,
}: StructuralLayoutEnvironmentProps): ReactElement {
  return (
    <>
      {diagnostics.length > 0 && (
        // Named, geometry-free: a malformed record contributes no mesh, and
        // never a fallback at the world origin.
        <group
          name="structural-layout-diagnostics"
          userData={{ reasons: [...diagnostics] }}
        />
      )}
      {walls.map((unit) => (
        <ErrorBoundary
          key={`wall:${unit.id}`}
          fallback={
            <StructuralWallFallbackMarker wall={unit.surface} tone="error" />
          }
        >
          <Suspense
            fallback={
              <StructuralWallFallbackMarker
                wall={unit.surface}
                tone="loading"
              />
            }
          >
            <StructuralWallSurfacePieces
              wall={unit.surface}
              remembered={rememberedWallIds?.has(unit.id) ?? false}
            />
          </Suspense>
        </ErrorBoundary>
      ))}
      {doors.map((unit) => {
        const info = observedDoors?.get(unit.id);
        const state = fittedDoorStateFromObservation(info);
        const remembered =
          info === undefined || !!rememberedDoorIds?.has(unit.id);
        const clickable =
          onDoorClick !== undefined &&
          info !== undefined &&
          !remembered &&
          state !== 'unknown';
        const marker = {
          position: [
            unit.pose.point.x,
            DUNGEON_SURFACE_Y + unit.pose.y + 0.35,
            unit.pose.point.z,
          ] as [number, number, number],
          rotationY: unit.pose.rotationY,
        };
        return (
          <ErrorBoundary
            key={`door:${unit.id}`}
            fallback={
              <WallMarker
                wallId={unit.id}
                tone="error"
                reason="door asset could not be drawn"
                position={marker.position}
                rotationY={marker.rotationY}
              />
            }
          >
            <Suspense
              fallback={
                <WallMarker
                  wallId={unit.id}
                  tone="loading"
                  position={marker.position}
                  rotationY={marker.rotationY}
                />
              }
            >
              <FittedDoorSurface
                doorId={unit.id}
                assetRef={unit.assetRef}
                pose={unit.pose}
                state={state}
                remembered={remembered}
                onClick={clickable ? () => onDoorClick(unit.id) : undefined}
              />
            </Suspense>
          </ErrorBoundary>
        );
      })}
    </>
  );
}
