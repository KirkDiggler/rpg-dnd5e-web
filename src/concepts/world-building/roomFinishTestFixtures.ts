import { createRoomLabel } from './regionEdits';
import { createRoomDraft, type RoomDraft } from './roomDraft';
import { createEmptyScene } from './sceneState';
import type { StructuralWall } from './structuralWalls';
import type { WorldPoint } from './types';
export const FIT_WALL_REF = 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01';
export const GRAY_REF = 'dnd5e:material:test:large_gray';
export function finishWall(
  id: string,
  start: WorldPoint,
  end: WorldPoint
): StructuralWall {
  return {
    id,
    label: id,
    line: { start, end },
    openings: [],
    appearance: {
      assetRef: FIT_WALL_REF,
      height: 3,
      thickness: 0.4,
      elevation: 0,
    },
    blocker: {
      blocksMovement: true,
      blocksLineOfSight: true,
      footprint: {
        width: Math.hypot(end.x - start.x, end.z - start.z),
        depth: 0.4,
        offsetX: 0,
        offsetZ: 0,
      },
    },
  };
}
export function finishRoomFixture(two = false): RoomDraft {
  const draft = createRoomDraft(createEmptyScene('scene'), 'room');
  draft.room.walls = [
    finishWall('north', { x: 0, z: 0 }, { x: 8, z: 0 }),
    finishWall('east', { x: 8, z: 0 }, { x: 8, z: 4 }),
    finishWall('south', { x: 8, z: 4 }, { x: 0, z: 4 }),
    finishWall('west', { x: 0, z: 4 }, { x: 0, z: 0 }),
  ];
  if (two)
    draft.room.walls.push(
      finishWall('divider', { x: 4, z: 0 }, { x: 4, z: 4 })
    );
  const left = createRoomLabel(draft, 'left', 'left-label', 'Left', {
    x: 2,
    z: 2,
  });
  return two
    ? createRoomLabel(left, 'right', 'right-label', 'Right', { x: 6, z: 2 })
    : left;
}
