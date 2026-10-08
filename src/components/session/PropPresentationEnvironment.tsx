import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import {
  DoorState,
  type DoorInfo,
  type PropPresentation,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { RoomSceneItem } from './RoomSceneEnvironment';
import { propPresentationItem } from './propPresentations';

/** Render only supplied records through the existing authoring/game asset leaf.
 * Currency and door identity are supplied facts, never inferred from artwork. */
export function PropPresentationEnvironment({
  presentations,
  hexSize,
  rememberedIds,
  currentDoorIds,
  doors,
  onDoorClick,
}: {
  presentations: readonly PropPresentation[];
  hexSize: number;
  rememberedIds?: ReadonlySet<string>;
  currentDoorIds?: ReadonlySet<string>;
  doors?: ReadonlyMap<string, DoorInfo>;
  onDoorClick?: (id: string) => void;
}) {
  return (
    <>
      {presentations.map((p) => {
        const item = propPresentationItem(p, hexSize);
        const remembered = rememberedIds?.has(p.id) ?? false;
        const door = p.doorId ? doors?.get(p.doorId) : undefined;
        if (p.doorId && (!door || door.state === DoorState.UNSPECIFIED)) {
          return (
            <mesh
              key={p.id}
              name={`prop-door-unknown-${p.doorId}`}
              userData={{
                propId: p.id,
                doorId: p.doorId,
                status: 'unobserved',
              }}
              position={[
                item.transform.x,
                item.transform.y + DUNGEON_SURFACE_Y + 0.5,
                item.transform.z,
              ]}
            >
              <boxGeometry args={[0.4, 1, 0.15]} />
              <meshBasicMaterial color="#a89064" wireframe />
            </mesh>
          );
        }
        return (
          <RoomSceneItem
            key={p.id}
            item={item}
            suppliedDoorId={p.doorId || undefined}
            remembered={remembered}
            doors={doors}
            onDoorClick={
              !remembered && p.doorId && currentDoorIds?.has(p.doorId)
                ? onDoorClick
                : undefined
            }
          />
        );
      })}
    </>
  );
}
