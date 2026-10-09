// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { enclosureWitnessesEqual } from './authoringRegions';
import { moveMapLabel } from './mapLabelEdits';
import {
  findEnclosureAtPoint,
  resolveAuthoringRegions,
} from './regionBoundaryGeometry';
import { createRoomLabel, useEnclosingWalls } from './regionEdits';
import {
  createRoomDraft,
  parseRoomDocumentJson,
  stringifyRoomDraft,
  type RoomDraft,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import type { StructuralWall } from './structuralWalls';
import { centeredRoomWorkspace, workspaceCells } from './workspaceGeometry';
const p = (x: number, z: number) => ({ x, z });
function wall(
  id: string,
  x: number,
  z: number,
  xx: number,
  zz: number
): StructuralWall {
  return {
    id,
    label: id,
    line: { start: p(x, z), end: p(xx, zz) },
    openings: [],
    appearance: {
      assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
      height: 3,
      thickness: 0.2,
      elevation: 0,
    },
    blocker: {
      footprint: { width: 1, depth: 0.2, offsetX: 0, offsetZ: 0 },
      blocksMovement: true,
      blocksLineOfSight: true,
    },
  };
}
function room(walls: StructuralWall[]): RoomDraft {
  const draft = createRoomDraft(createEmptyScene('scene'), 'room');
  return { ...draft, room: { ...draft.room, walls } };
}
function rectangle(): StructuralWall[] {
  return [
    wall('A', 0, 0, 8, 0),
    wall('B', 8, 0, 8, 4),
    wall('C', 8, 4, 0, 4),
    wall('D', 0, 4, 0, 0),
  ];
}
function triangle(apex = 4): StructuralWall[] {
  return [
    wall('A', 0, 0, 4, 0),
    wall('B', 4, 0, 2, apex),
    wall('C', 2, apex, 0, 0),
  ];
}
function word(draft: RoomDraft, point = p(2, 1)): string[] {
  const result = findEnclosureAtPoint(draft, point);
  expect(result.status).toBe('resolved');
  if (result.status !== 'resolved') throw new Error(result.reason);
  return result.witness.walk.map(
    (r) => r.wallId + (r.direction === 'start-to-end' ? '+' : '-')
  );
}
function reason(draft: RoomDraft): unknown {
  return resolveAuthoringRegions(draft)[0];
}
describe('source-oriented faces and pure resolution', () => {
  it('counterexample 1: reflected same source set is not the accepted face', () => {
    const accepted = createRoomLabel(
      room(triangle()),
      'region',
      'label',
      'Triangle',
      p(2, 1)
    );
    expect(word(accepted)).toEqual(['A+', 'B+', 'C+']);
    const reflected = moveMapLabel(
      { ...accepted, room: { ...accepted.room, walls: triangle(-4) } },
      'label',
      p(2, -1)
    );
    expect(word(reflected, p(2, -1))).toEqual(['A-', 'C-', 'B-']);
    expect(reason(reflected)).toMatchObject({
      status: 'unresolved',
      reason: 'boundary-changed',
    });
    expect(reason(useEnclosingWalls(reflected, 'region'))).toMatchObject({
      status: 'resolved',
    });
  });
  it('counterexample 2: apex motion and cyclic starts preserve identity without writing', () => {
    const accepted = createRoomLabel(
      room(triangle()),
      'region',
      'label',
      'Triangle',
      p(2, 1)
    );
    const witness = accepted.scene.authoringRegions![0].boundary;
    expect(witness.kind).toBe('automatic');
    if (witness.kind !== 'automatic') throw new Error('fixture');
    const walk = witness.witness!.walk;
    for (const offset of [1, 2])
      expect(
        enclosureWitnessesEqual(witness.witness!, {
          walk: [...walk.slice(offset), ...walk.slice(0, offset)],
        })
      ).toBe(true);
    const moved = {
      ...accepted,
      room: { ...accepted.room, walls: triangle(5) },
    };
    const before = JSON.stringify(moved);
    expect(reason(moved)).toMatchObject({
      status: 'resolved',
      area: { ring: [p(0, 0), p(4, 0), p(2, 5)] },
    });
    expect(JSON.stringify(moved)).toBe(before);
  });
  it('counterexample 3: axis T shared-wall rooms follow x4 to x5; anchor crossing requires bind', () => {
    const base = room([...rectangle(), wall('M', 4, 0, 4, 4)]);
    let labels = createRoomLabel(base, 'left', 'left-label', 'Left', p(1, 2));
    labels = createRoomLabel(labels, 'right', 'right-label', 'Right', p(7, 2));
    expect(word(labels, p(1, 2))).toEqual(['A+', 'M+', 'C+', 'D+']);
    expect(word(labels, p(7, 2))).toEqual(['A+', 'B+', 'C+', 'M-']);
    const moved = {
      ...labels,
      room: { ...labels.room, walls: [...rectangle(), wall('M', 5, 0, 5, 4)] },
    };
    expect(resolveAuthoringRegions(moved).map((r) => r.status)).toEqual([
      'resolved',
      'resolved',
    ]);
    const crossed = moveMapLabel(moved, 'left-label', p(7, 2));
    expect(reason(crossed)).toMatchObject({
      reason: 'outside-bound-enclosure',
    });
    expect(reason(useEnclosingWalls(crossed, 'left'))).toMatchObject({
      reason: 'duplicate-room-label',
    });
    expect(reason(moveMapLabel(moved, 'left-label', p(-1, 2)))).toMatchObject({
      reason: 'outside-bound-enclosure',
    });
  });
  it('counterexample 4: exterior branch compresses; interior slit fails before compression; missing M repairs only its old walk', () => {
    const base = createRoomLabel(
      room([...rectangle(), wall('M', 4, 0, 4, 4)]),
      'left',
      'label',
      'Left',
      p(1, 2)
    );
    const exterior = {
      ...base,
      room: {
        ...base.room,
        walls: [...base.room.walls!, wall('E', 0, 2, -2, 2)],
      },
    };
    expect(word(exterior, p(1, 2))).toEqual(['A+', 'M+', 'C+', 'D+']);
    expect(reason(exterior)).toMatchObject({ status: 'resolved' });
    const slit = {
      ...base,
      room: {
        ...base.room,
        walls: [...base.room.walls!, wall('E', 0, 2, 2, 2)],
      },
    };
    expect(reason(slit)).toMatchObject({ reason: 'seed-on-boundary' });
    expect(findEnclosureAtPoint(slit, p(1, 1))).toMatchObject({
      reason: 'unsupported-geometry',
    });
    const broken = { ...base, room: { ...base.room, walls: rectangle() } };
    expect(reason(broken)).toMatchObject({ reason: 'boundary-changed' });
    const loaded = parseRoomDocumentJson(stringifyRoomDraft(broken, {}));
    const repaired = {
      ...loaded.draft,
      room: { ...loaded.draft.room, walls: base.room.walls },
    };
    expect(reason(repaired)).toMatchObject({ status: 'resolved' });
    expect(repaired.scene.authoringRegions).toEqual(
      base.scene.authoringRegions
    );
  });
  it('counterexample 5: authored endpoint reversal is not reversal equivalence', () => {
    const base = createRoomLabel(
      room(triangle()),
      'region',
      'label',
      'Triangle',
      p(2, 1)
    );
    const reversed = triangle();
    reversed[0].line = { start: p(4, 0), end: p(0, 0) };
    const changed = { ...base, room: { ...base.room, walls: reversed } };
    expect(word(changed)).toEqual(['A-', 'B+', 'C+']);
    expect(reason(changed)).toMatchObject({ reason: 'boundary-changed' });
  });
  it('keeps openings and every door policy irrelevant to the full-span logical boundary', () => {
    const base = createRoomLabel(
      room(rectangle()),
      'region',
      'label',
      'Room',
      p(2, 2)
    );
    const opened = {
      ...base,
      room: {
        ...base.room,
        walls: base.room.walls!.map((w, i) =>
          i
            ? w
            : {
                ...w,
                openings: [
                  {
                    id: 'opening',
                    position: 3,
                    width: 2,
                    door: { id: 'door', assetRef: 'door' },
                  },
                ],
              }
        ),
        doorBindings: { door: {} },
      },
    };
    const closed = {
      ...opened,
      room: { ...opened.room, doorBindings: { door: { closed: true } } },
    };
    expect(resolveAuthoringRegions(opened)).toEqual(
      resolveAuthoringRegions(base)
    );
    expect(resolveAuthoringRegions(closed)).toEqual(
      resolveAuthoringRegions(base)
    );
  });
  it('keeps initially unbound intent through closing walls and reload until explicit bind', () => {
    const base = createRoomLabel(
      room(rectangle().slice(0, 3)),
      'region',
      'label',
      'Room',
      p(2, 2)
    );
    const closed = { ...base, room: { ...base.room, walls: rectangle() } };
    const before = JSON.stringify(closed);
    expect(reason(closed)).toMatchObject({ reason: 'unbound' });
    expect(JSON.stringify(closed)).toBe(before);
    const loaded = parseRoomDocumentJson(stringifyRoomDraft(closed, {})).draft;
    expect(reason(loaded)).toMatchObject({ reason: 'unbound' });
    expect(reason(useEnclosingWalls(loaded, 'region'))).toMatchObject({
      status: 'resolved',
    });
  });
  it('refuses a representable gap, nested hole, angled T, coincident sources, and seed on boundary', () => {
    const gap = rectangle();
    gap[3].line.end = p(0, Number.EPSILON);
    expect(findEnclosureAtPoint(room(gap), p(2, 2)).status).toBe('unresolved');
    const nested = [
      ...rectangle(),
      wall('I', 2, 1, 3, 1),
      wall('J', 3, 1, 3, 3),
      wall('K', 3, 3, 2, 3),
      wall('L', 2, 3, 2, 1),
    ];
    expect(findEnclosureAtPoint(room(nested), p(1, 2))).toMatchObject({
      reason: 'unsupported-geometry',
    });
    expect(findEnclosureAtPoint(room(nested), p(2.5, 2))).toMatchObject({
      reason: 'unsupported-geometry',
    });
    expect(
      findEnclosureAtPoint(
        room([...triangle(), wall('T', 3, 2, 4, 4)]),
        p(2, 1)
      )
    ).toMatchObject({ reason: 'uncertain-geometry' });
    expect(
      findEnclosureAtPoint(
        room([...rectangle(), wall('extra', 0, 0, 8, 0)]),
        p(2, 2)
      )
    ).toMatchObject({ reason: 'unsupported-geometry' });
    expect(findEnclosureAtPoint(room(rectangle()), p(2, 0))).toMatchObject({
      reason: 'seed-on-boundary',
    });
    const bound = createRoomLabel(
      room(rectangle()),
      'region',
      'label',
      'Room',
      p(1, 2)
    );
    expect(
      reason({ ...bound, room: { ...bound.room, walls: nested } })
    ).toMatchObject({ reason: 'unsupported-geometry' });
  });
  it('certifies proper free-angle crossings as distinct simple faces', () => {
    const crossed = [
      ...rectangle(),
      wall('X', 0, 1, 8, 3),
      wall('Y', 1, 4, 7, 0),
    ];
    expect(findEnclosureAtPoint(room(crossed), p(1, 0.5)).status).toBe(
      'resolved'
    );
    let labelled = createRoomLabel(
      room(crossed),
      'one',
      'label-one',
      'One',
      p(1, 0.5)
    );
    labelled = createRoomLabel(labelled, 'two', 'label-two', 'Two', p(7, 0.5));
    expect(resolveAuthoringRegions(labelled).map((r) => r.status)).toEqual([
      'resolved',
      'resolved',
    ]);
    expect(
      findEnclosureAtPoint(room([...crossed, wall('Z', 0, 2, 8, 2)]), p(1, 0.5))
    ).toMatchObject({ reason: 'uncertain-geometry' });
  });
  it('profiles representative floor/room counts without geometry caps or floor dependence', () => {
    for (const [count, side] of [
      [4, 16],
      [20, 64],
      [64, 128],
    ]) {
      const walls: StructuralWall[] = [];
      const labels = [];
      const regions = [];
      for (let i = 0; i < count; i++) {
        const x = (i % 8) * 3 - 12,
          z = Math.floor(i / 8) * 3 - 12;
        const corners = [p(x, z), p(x + 2, z), p(x + 2, z + 2), p(x, z + 2)];
        const ids = corners.map((_, j) => `${i}-${j}`);
        for (let j = 0; j < 4; j++)
          walls.push(
            wall(
              ids[j],
              corners[j].x,
              corners[j].z,
              corners[(j + 1) % 4].x,
              corners[(j + 1) % 4].z
            )
          );
        labels.push({
          id: `label-${i}`,
          text: 'Room',
          location: p(x + 1, z + 1),
        });
        regions.push({
          id: `region-${i}`,
          labelId: `label-${i}`,
          boundary: {
            kind: 'automatic' as const,
            witness: {
              walk: ids.map((wallId) => ({
                wallId,
                direction: 'start-to-end' as const,
              })),
            },
          },
        });
      }
      const draft = room(walls);
      draft.workspace = centeredRoomWorkspace(side, side);
      draft.room.walkableHexes = workspaceCells(draft.workspace);
      draft.scene = {
        ...draft.scene,
        version: 3,
        mapLabels: labels,
        authoringRegions: regions,
      };
      const before = JSON.stringify(draft);
      const start = performance.now();
      const results = resolveAuthoringRegions(draft);
      const elapsed = performance.now() - start;
      console.info(
        `region-profile: ${count} rooms / ${walls.length} walls / ${draft.room.walkableHexes.length} floor cells: ${elapsed.toFixed(2)}ms`
      );
      expect(results).toHaveLength(count);
      expect(results.every((r) => r.status === 'resolved')).toBe(true);
      expect(JSON.stringify(draft)).toBe(before);
      expect(
        resolveAuthoringRegions({
          ...draft,
          room: { ...draft.room, walkableHexes: [] },
        })
      ).toEqual(results);
    }
  });
  it('isolates unsupported geometry from a disconnected sound room', () => {
    const bad = [wall('I', -8, -4, -4, -4), wall('J', -7, -4, -3, -4)];
    expect(
      findEnclosureAtPoint(room([...rectangle(), ...bad]), p(2, 2)).status
    ).toBe('resolved');
  });
});
