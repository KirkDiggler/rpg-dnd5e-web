/**
 * floorPlanCompile — the chain-layout arithmetic design.md's "grid math is
 * server-authoritative" principle explicitly forbids a real client from
 * doing. This function exists ONLY as FIXTURES-MODE's live-feeling
 * per-edit preview, when `usePutDungeonPreview` has determined the real
 * `PutDungeon` RPC is unreachable (gate off, or no server at all — see
 * CONTRACT.md). It is never called when a live response is available.
 *
 * Verified, not guessed: this exact accumulation rule (`next.startColumn =
 * prev.startColumn + prev.width + 1`) reproduces all three real recorded
 * FloorPlan responses in `fixtures.ts` byte-for-byte — see
 * `floorPlanCompile.test.ts`. That includes showcase.yaml's real 3-room,
 * non-uniform-width chain, which the standalone concept could only guess
 * at; this port closes that gap with a real fixture. The one thing still
 * NOT independently verified is the `entrance` cell rule for a dungeon
 * whose entrance room isn't first-in-chain or isn't width 6 — all three
 * fixtures happen to share that shape. See CONTRACT.md.
 */
import { create } from '@bufbuild/protobuf';
import {
  FloorPlanSchema,
  type FloorPlan,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { DungeonDoc } from './dungeonYaml';

export function compileFloorPlanLocally(doc: DungeonDoc): FloorPlan {
  let col = 0;
  const rooms = doc.rooms.map((room) => {
    const startColumn = col;
    col += room.width + 1; // +1 reserved connector gap column
    return {
      id: room.id,
      archetype: room.archetype,
      width: room.width,
      startColumn,
    };
  });

  const connectors = doc.connectors.map((c) => {
    const fromRoom = rooms.find((r) => r.id === c.from);
    const column = fromRoom ? fromRoom.startColumn + fromRoom.width : 0;
    return {
      doorId: `${doc.key}-door-${c.from}-${c.to}`,
      fromRoomId: c.from,
      toRoomId: c.to,
      column,
      locked: false,
    };
  });

  const height = doc.height;
  const doorRow = Math.floor(height / 2);
  const entranceRoom =
    rooms.find((r) => r.archetype === 'entrance') ?? rooms[0];
  // DERIVED — see this file's own doc comment and CONTRACT.md.
  const entrance = { column: entranceRoom?.startColumn ?? 0, row: doorRow };

  return create(FloorPlanSchema, {
    rooms,
    connectors,
    height,
    doorRow,
    entrance,
  });
}
