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
        // A PRESENTED DOOR WITH NO OBSERVED STATE draws CLOSED in the
        // remembered treatment (fog of war, rpg-project#586 R2). The atlas
        // presented it because a cell on its edge is known; without a sighting
        // of its state it shows its rest pose, greyed and inert. There is no
        // "unobserved" placeholder: an unseen door is absent, a seen one shows
        // its last observed state.
        const unobserved =
          !!p.doorId && (!door || door.state === DoorState.UNSPECIFIED);
        const drawnRemembered = remembered || unobserved;
        return (
          <RoomSceneItem
            key={p.id}
            item={item}
            suppliedDoorId={p.doorId || undefined}
            remembered={drawnRemembered}
            doors={unobserved ? undefined : doors}
            onDoorClick={
              !drawnRemembered && p.doorId && currentDoorIds?.has(p.doorId)
                ? onDoorClick
                : undefined
            }
          />
        );
      })}
    </>
  );
}
