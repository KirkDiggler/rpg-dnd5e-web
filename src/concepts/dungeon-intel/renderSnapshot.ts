import {
  HEX_SIZE,
  cubeToWorld,
  type CubeCoord,
} from '@/components/hex-grid/hexMath';
import type { ObservationMarker } from '@/components/session/ObservationMarkers';
import {
  buildScene3D,
  positionToCube,
  propWorldPosition,
  resolveSceneLayout,
  type Scene3D,
} from '@/components/session/atlasToScene3D';
import {
  sightingsToEntities,
  type SightedMember,
} from '@/components/session/sightingEntities';
import {
  DoorState,
  type DoorInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { ObserverSnapshot } from './fixtures';

export interface RenderedSnapshot {
  readonly scene: Scene3D;
  readonly position: CubeCoord;
  readonly members: readonly SightedMember[];
  readonly doors: ReadonlyMap<string, DoorInfo>;
  readonly markers: readonly ObservationMarker[];
}
export function doorWord(state: DoorState): string {
  switch (state) {
    case DoorState.OPEN:
      return 'open';
    case DoorState.CLOSED:
      return 'closed';
    case DoorState.LOCKED:
      return 'locked';
    default:
      return 'unspecified';
  }
}

/** Formatting only: the snapshot already decides every placement, value and
 * observation status. No previous answer is consulted; no missing fact inferred. */
export function renderSnapshot(snapshot: ObserverSnapshot): RenderedSnapshot {
  const layout = resolveSceneLayout(snapshot.atlas);
  if (!layout.ok) throw new Error(layout.message);
  const placements = snapshot.props.flatMap((testimony) =>
    testimony.placement ? [testimony.placement] : []
  );
  const scene = buildScene3D(
    { ...snapshot.atlas, props: [...snapshot.atlas.props, ...placements] },
    HEX_SIZE,
    layout.layout
  );
  const markers: ObservationMarker[] = [];
  for (const testimony of snapshot.props) {
    if (!testimony.placement) continue;
    const rendered = scene.props.find((prop) => prop.id === testimony.id);
    if (!rendered)
      throw new Error(`Missing supplied prop appearance: ${testimony.id}`);
    markers.push({
      id: testimony.id,
      label: testimony.name,
      position: propWorldPosition(rendered, HEX_SIZE),
      knowledge:
        testimony.observation === 'remembered' ? 'remembered' : 'visible',
    });
  }
  for (const testimony of snapshot.doors) {
    const gap = scene.doorGaps.find(
      (door) => door.connection === testimony.info.door
    );
    if (!gap)
      throw new Error(
        `Missing supplied doorway appearance: ${testimony.info.door}`
      );
    markers.push({
      id: testimony.info.door,
      label: `Door ${doorWord(testimony.info.state)}`,
      position: gap.position,
      knowledge:
        testimony.observation === 'remembered' ? 'remembered' : 'visible',
    });
  }
  snapshot.observedEmpty.forEach((position, index) =>
    markers.push({
      id: `observed-empty-${index}`,
      label: 'Observed empty',
      position: cubeToWorld(positionToCube(position), HEX_SIZE),
      knowledge: 'visible',
    })
  );
  return {
    scene,
    markers,
    position: positionToCube(snapshot.position),
    members: sightingsToEntities(snapshot.sightings, snapshot.observer),
    doors: new Map(snapshot.doors.map(({ info }) => [info.door, info])),
  };
}
