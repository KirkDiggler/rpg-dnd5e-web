// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { enclosureWitnessesEqual } from './authoringRegions';
import { moveMapLabel } from './mapLabelEdits';
import {
  findEnclosureAtPoint,
  resolveAuthoringRegions,
} from './regionBoundaryGeometry';
import {
  useEnclosingWalls as bindEnclosingWalls,
  createRoomLabel,
  setRegionLighting,
} from './regionEdits';
import { projectRegionLighting } from './regionLighting';
import {
  createRoomDraft,
  parseRoomDocumentJson,
  stringifyRoomDraft,
  type RoomDraft,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import type { StructuralWall } from './structuralWalls';
import type { WorldPoint } from './types';
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
// Sanitized operator-walk geometry: only source lines/seed are retained. No
// operator IDs, castle assets, floor, policy or profile data are fixture input.
function exteriorCoverageRoom(): RoomDraft {
  const draft = room([
    wall('bottom', -29.444863728670914, 16, -5.196152422706631, 16),
    wall('left', -29.44486372867091, 16, -29.44486372867091, 7),
    wall('top', -29.444863728670914, 7, -5.196152422706631, 7),
    wall('right', -5.196152422706631, 16, -5.196152422706631, 7),
    wall('exterior-top', -5.196152422706632, 7, 8.660254037844386, 7),
    wall('exterior-bottom', -5.196152422706632, 16, 8.660254037844386, 16),
  ]);
  draft.workspace = centeredRoomWorkspace(64, 32);
  return draft;
}
const coverageSeed = p(-19.609612065022446, 11.406561842131094);

describe('exact collinear coverage provenance', () => {
  it('handles vertical coverage and retains distinct non-overlapping end-to-end source transitions', () => {
    const horizontal = exteriorCoverageRoom();
    const swap = (point: WorldPoint): WorldPoint => ({
      x: point.z,
      z: point.x,
    });
    const vertical = {
      ...horizontal,
      workspace: centeredRoomWorkspace(64, 64),
      room: {
        ...horizontal.room,
        walls: horizontal.room.walls!.map((w) => ({
          ...w,
          line: { start: swap(w.line.start), end: swap(w.line.end) },
        })),
      },
    };
    const base = {
      ...vertical,
      room: { ...vertical.room, walls: vertical.room.walls!.slice(0, 4) },
    };
    const bound = createRoomLabel(
      base,
      'region',
      'label',
      'Room',
      swap(coverageSeed)
    );
    const extended = { ...bound, room: vertical.room };
    expect(findEnclosureAtPoint(extended, swap(coverageSeed))).toEqual(
      findEnclosureAtPoint(base, swap(coverageSeed))
    );
    expect(bindEnclosingWalls(extended, 'region')).toBe(extended);
    const joined = room([
      ...rectangle().slice(1),
      wall('A', 0, 0, 4, 0),
      wall('A-next', 4, 0, 8, 0),
    ]);
    const candidate = findEnclosureAtPoint(joined, p(2, 2));
    expect(candidate.status).toBe('resolved');
    if (candidate.status !== 'resolved') throw new Error(candidate.reason);
    expect(candidate.witness.walk.map((r) => r.wallId)).toEqual([
      'A',
      'A-next',
      'B',
      'C',
      'D',
    ]);
    expect(candidate.ring).toContainEqual(p(4, 0)); // Real source transition retained.
  });
  it('supports sizeable exterior overlaps and source permutations without choosing by order or direction', () => {
    const full = exteriorCoverageRoom();
    const base = {
      ...full,
      room: { ...full.room, walls: full.room.walls!.slice(0, 4) },
    };
    const bound = createRoomLabel(
      base,
      'region',
      'label',
      'Room',
      coverageSeed
    );
    const expected = findEnclosureAtPoint(base, coverageSeed);
    const walls = full.room.walls!.map((w, i) =>
      i < 4 ? w : { ...w, line: { ...w.line, start: p(-10, w.line.start.z) } }
    );
    for (const order of [
      walls,
      [...walls].reverse(),
      [...walls.slice(2), ...walls.slice(0, 2)],
    ]) {
      for (const reverseExtras of [false, true]) {
        const sources = order.map((w) =>
          reverseExtras && w.id.startsWith('exterior')
            ? { ...w, line: { start: w.line.end, end: w.line.start } }
            : w
        );
        const draft = { ...bound, room: { ...bound.room, walls: sources } };
        expect(findEnclosureAtPoint(draft, coverageSeed)).toEqual(expected);
        expect(bindEnclosingWalls(draft, 'region')).toBe(draft);
      }
    }
    for (const id of ['top', 'bottom', 'left', 'right']) {
      const draft = {
        ...bound,
        room: {
          ...bound.room,
          walls: walls.map((w) =>
            w.id === id
              ? { ...w, line: { start: w.line.end, end: w.line.start } }
              : w
          ),
        },
      };
      expect(findEnclosureAtPoint(draft, coverageSeed).status).toBe('resolved');
      expect(resolveAuthoringRegions(draft)[0]).toMatchObject({
        status: 'unresolved',
        reason: 'boundary-changed',
      });
      const rebound = bindEnclosingWalls(draft, 'region');
      expect(resolveAuthoringRegions(rebound)[0].status).toBe('resolved');
      expect(rebound.scene.authoringRegions).not.toEqual(
        bound.scene.authoringRegions
      );
    }
  });
  it('does not close even a one-ULP uncovered interval; an irrelevant exterior gap does not break the original side', () => {
    const full = exteriorCoverageRoom();
    const base = {
      ...full,
      room: { ...full.room, walls: full.room.walls!.slice(0, 4) },
    };
    const expected = findEnclosureAtPoint(base, coverageSeed);
    const exteriorGap = {
      ...full,
      room: {
        ...full.room,
        walls: full.room.walls!.map((w) =>
          w.id.startsWith('exterior')
            ? {
                ...w,
                line: {
                  ...w.line,
                  start: p(-5.19615242270663, w.line.start.z),
                },
              }
            : w
        ),
      },
    };
    expect(findEnclosureAtPoint(exteriorGap, coverageSeed)).toEqual(expected);
    for (const end of [-5.196152422706632, -5.446152422706631]) {
      const walls = full.room.walls!.map((w) =>
        w.id === 'top'
          ? { ...w, line: { ...w.line, end: p(end, 7) } }
          : w.id === 'exterior-top'
            ? { ...w, line: { ...w.line, start: p(-5.196152422706631, 7) } }
            : w
      );
      const gap = { ...full, room: { ...full.room, walls } };
      expect(findEnclosureAtPoint(gap, coverageSeed).status).toBe('unresolved');
      const unbound = createRoomLabel(
        gap,
        'region',
        'label',
        'Room',
        coverageSeed
      );
      const before = JSON.stringify(unbound);
      expect(() => bindEnclosingWalls(unbound, 'region')).toThrow();
      expect(JSON.stringify(unbound)).toBe(before);
      expect(unbound.scene.authoringRegions![0].boundary).toEqual({
        kind: 'automatic',
      });
    }
  });
  it('refuses multiple full-span owners or overlapping coverage with no full-span owner', () => {
    const full = exteriorCoverageRoom();
    const top = full.room.walls![2];
    for (const start of [top.line.start, p(-32, 7)]) {
      const ambiguous = {
        ...full,
        room: {
          ...full.room,
          walls: [
            ...full.room.walls!,
            { ...top, id: 'other-owner', line: { start, end: top.line.end } },
          ],
        },
      };
      expect(findEnclosureAtPoint(ambiguous, coverageSeed)).toMatchObject({
        reason: 'unsupported-geometry',
      });
    }
    const chain = {
      ...full,
      room: {
        ...full.room,
        walls: full.room.walls!.map((w) =>
          w.id === 'top'
            ? { ...w, line: { ...w.line, end: p(-15, 7) } }
            : w.id === 'exterior-top'
              ? { ...w, line: { ...w.line, start: p(-16, 7) } }
              : w
        ),
      },
    };
    expect(findEnclosureAtPoint(chain, coverageSeed)).toMatchObject({
      reason: 'unsupported-geometry',
    });
  });
  it('resolves a valid neighbor, isolates ambiguous ownership, and does not hide partitions, holes or interior slits', () => {
    const full = exteriorCoverageRoom();
    const neighbor = {
      ...full,
      room: {
        ...full.room,
        walls: [
          ...full.room.walls!,
          wall('east', 8.660254037844386, 7, 8.660254037844386, 16),
        ],
      },
    };
    let labelled = createRoomLabel(
      neighbor,
      'one',
      'one-label',
      'One',
      coverageSeed
    );
    labelled = createRoomLabel(labelled, 'two', 'two-label', 'Two', p(0, 11));
    expect(resolveAuthoringRegions(labelled).map((r) => r.status)).toEqual([
      'resolved',
      'resolved',
    ]);
    const ambiguous = {
      ...labelled,
      room: {
        ...labelled.room,
        walls: [
          ...labelled.room.walls!,
          { ...full.room.walls![2], id: 'duplicate-top' },
        ],
      },
    };
    expect(resolveAuthoringRegions(ambiguous)).toMatchObject([
      { status: 'unresolved', reason: 'unsupported-geometry' },
      { status: 'resolved' },
    ]);
    const base = createRoomLabel(full, 'region', 'label', 'Room', coverageSeed);
    const partition = {
      ...base,
      room: {
        ...base.room,
        walls: [...base.room.walls!, wall('divider', -18, 7, -18, 16)],
      },
    };
    expect(findEnclosureAtPoint(partition, coverageSeed).status).toBe(
      'resolved'
    );
    expect(findEnclosureAtPoint(partition, p(-10, 11)).status).toBe('resolved');
    expect(resolveAuthoringRegions(partition)[0]).toMatchObject({
      reason: 'boundary-changed',
    });
    const slit = {
      ...base,
      room: {
        ...base.room,
        walls: [
          ...base.room.walls!,
          wall('slit', -29.44486372867091, 11, -25, 11),
        ],
      },
    };
    expect(findEnclosureAtPoint(slit, coverageSeed)).toMatchObject({
      reason: 'unsupported-geometry',
    });
    const hole = {
      ...base,
      room: {
        ...base.room,
        walls: [
          ...base.room.walls!,
          wall('h1', -15, 9, -12, 9),
          wall('h2', -12, 9, -12, 12),
          wall('h3', -12, 12, -15, 12),
          wall('h4', -15, 12, -15, 9),
        ],
      },
    };
    expect(findEnclosureAtPoint(hole, coverageSeed)).toMatchObject({
      reason: 'unsupported-geometry',
    });
  });
  it('retains the same unique full-span source walk with either or both exterior overlaps', () => {
    const full = exteriorCoverageRoom();
    const base = {
      ...full,
      room: { ...full.room, walls: full.room.walls!.slice(0, 4) },
    };
    const bound = createRoomLabel(
      base,
      'region',
      'label',
      'Room',
      coverageSeed
    );
    const expected = findEnclosureAtPoint(base, coverageSeed);
    expect(expected.status).toBe('resolved');
    for (const extras of [[4], [5], [4, 5]]) {
      const draft = {
        ...bound,
        room: {
          ...bound.room,
          walls: [
            ...base.room.walls!,
            ...extras.map((i) => full.room.walls![i]),
          ],
        },
      };
      const before = JSON.stringify(draft);
      const candidate = findEnclosureAtPoint(draft, coverageSeed);
      expect(candidate).toEqual(expected);
      expect(resolveAuthoringRegions(draft)[0].status).toBe('resolved');
      expect(bindEnclosingWalls(draft, 'region')).toBe(draft);
      const initiallyBound = createRoomLabel(
        { ...full, room: { ...full.room, walls: draft.room.walls } },
        'fresh',
        'fresh-label',
        'Fresh',
        coverageSeed
      );
      expect(initiallyBound.scene.authoringRegions![0].boundary).toEqual(
        bound.scene.authoringRegions![0].boundary
      );
      expect(JSON.stringify(draft)).toBe(before);
    }
  });
});

describe('failed-component isolation at certified faces', () => {
  function externalPair(): StructuralWall[] {
    // Shared-endpoint orientation is uncertain, but both segments miss the
    // rectangle: at x=8 they are above z=4. Their bbox still contains (2,2).
    return [
      wall('P', 10, 2, -2, 41),
      wall('Q', 10, 2, -2, 41 - 7.105427357601002e-15),
    ];
  }
  it('resolves a certified face despite an external uncertain component bbox covering its seed', () => {
    const expected = findEnclosureAtPoint(room(rectangle()), p(2, 2));
    expect(expected.status).toBe('resolved');
    const walls = [...rectangle(), ...externalPair()];
    for (const order of [walls, [...walls].reverse()]) {
      const draft = room(order);
      const before = JSON.stringify(draft);
      expect(findEnclosureAtPoint(draft, p(2, 2))).toEqual(expected);
      expect(JSON.stringify(draft)).toBe(before);
    }
  });
  it('preserves a bound witness and configured lighting without a rebind or source writes', () => {
    const bound = setRegionLighting(
      createRoomLabel(room(rectangle()), 'region', 'label', 'Room', p(2, 2)),
      'region',
      { background: 0.15 }
    );
    const draft = {
      ...bound,
      room: { ...bound.room, walls: [...bound.room.walls!, ...externalPair()] },
    };
    const before = JSON.stringify(draft);
    const expected = resolveAuthoringRegions(bound);
    expect(expected[0].status).toBe('resolved');
    if (expected[0].status !== 'resolved') throw new Error('fixture');
    expect(resolveAuthoringRegions(draft)).toEqual(expected);
    expect(
      projectRegionLighting(
        draft.scene.authoringRegions!,
        resolveAuthoringRegions(draft)
      )
    ).toEqual({
      areas: [{ regionId: 'region', background: 0.15, area: expected[0].area }],
    });
    expect(bindEnclosingWalls(draft, 'region')).toBe(draft);
    expect(draft.scene.authoringRegions).toBe(bound.scene.authoringRegions);
    expect(JSON.stringify(draft)).toBe(before);
  });
  it('still reports real uncertainty when no certified face contains the seed', () => {
    expect(findEnclosureAtPoint(room(externalPair()), p(0, 20))).toEqual({
      status: 'unresolved',
      reason: 'uncertain-geometry',
    });
    const gap = rectangle();
    gap[3].line.end = p(0, Number.EPSILON);
    expect(findEnclosureAtPoint(room(gap), p(2, 2)).status).toBe('unresolved');
    expect(
      findEnclosureAtPoint(room([...gap, ...externalPair()]), p(2, 2))
    ).toEqual({ status: 'unresolved', reason: 'uncertain-geometry' });
  });
  it.each([
    ['disconnected wall', [wall('I', 5, 1, 6, 3)], 'unsupported-geometry'],
    [
      'disconnected uncertain pair',
      [wall('I', 5, 1, 6, 3), wall('J', 5, 1, 6, 3 - Number.EPSILON * 2)],
      'unsupported-geometry',
    ],
    ['connected slit', [wall('I', 0, 1, 1, 1)], 'uncertain-geometry'],
    [
      'nested hole',
      [
        wall('I', 5, 1, 6, 1),
        wall('J', 6, 1, 6, 3),
        wall('K', 6, 3, 5, 3),
        wall('L', 5, 3, 5, 1),
      ],
      'unsupported-geometry',
    ],
    [
      'overlapping full-span owners',
      [wall('I', 0, 0, 8, 0)],
      'unsupported-geometry',
    ],
  ] as const)(
    'does not resolve or apply lighting over a %s',
    (_, extras, reason) => {
      const bound = setRegionLighting(
        createRoomLabel(room(rectangle()), 'region', 'label', 'Room', p(2, 2)),
        'region',
        { background: 0.15 }
      );
      const draft = {
        ...bound,
        room: {
          ...bound.room,
          walls: [...rectangle(), ...externalPair(), ...extras],
        },
      };
      const before = JSON.stringify(draft);
      expect(
        findEnclosureAtPoint(room([...rectangle(), ...extras]), p(2, 2))
      ).toEqual({
        status: 'unresolved',
        reason: 'unsupported-geometry',
      });
      // A connected slit removes the outer face; absent a certified candidate,
      // the existing bbox fallback can diagnose the external uncertainty first.
      expect(findEnclosureAtPoint(draft, p(2, 2))).toEqual({
        status: 'unresolved',
        reason,
      });
      const resolutions = resolveAuthoringRegions(draft);
      expect(resolutions[0].status).toBe('unresolved');
      expect(
        projectRegionLighting(draft.scene.authoringRegions!, resolutions)
      ).toEqual({ areas: [] });
      expect(JSON.stringify(draft)).toBe(before);
    }
  );
  it('retains seed-on-wall and connected uncertain-contact refusals', () => {
    expect(
      findEnclosureAtPoint(room([...rectangle(), ...externalPair()]), p(0, 2))
    ).toEqual({ status: 'unresolved', reason: 'seed-on-boundary' });
    const connected = externalPair().map((w) => ({
      ...w,
      line: { ...w.line, start: p(8, 4) },
    }));
    expect(
      findEnclosureAtPoint(room([...rectangle(), ...connected]), p(2, 2))
    ).toEqual({ status: 'unresolved', reason: 'uncertain-geometry' });
  });
  it('does not pick a winner for multiple containing rings or duplicate room labels', () => {
    const nested = room([
      ...rectangle(),
      ...externalPair(),
      wall('I', 1, 1, 3, 1),
      wall('J', 3, 1, 3, 3),
      wall('K', 3, 3, 1, 3),
      wall('L', 1, 3, 1, 1),
    ]);
    expect(findEnclosureAtPoint(nested, p(2, 2))).toEqual({
      status: 'unresolved',
      reason: 'unsupported-geometry',
    });
    const draft = room([...rectangle(), ...externalPair()]);
    const one = createRoomLabel(draft, 'one', 'one-label', 'One', p(2, 2));
    const two = createRoomLabel(one, 'two', 'two-label', 'Two', p(6, 2));
    expect(resolveAuthoringRegions(two)).toEqual([
      { id: 'one', status: 'unresolved', reason: 'duplicate-room-label' },
      { id: 'two', status: 'unresolved', reason: 'duplicate-room-label' },
    ]);
  });
});

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
    expect(reason(bindEnclosingWalls(reflected, 'region'))).toMatchObject({
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
    expect(reason(bindEnclosingWalls(crossed, 'left'))).toMatchObject({
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
    expect(reason(bindEnclosingWalls(loaded, 'region'))).toMatchObject({
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
