// @vitest-environment node
import type { MessageInitShape } from '@bufbuild/protobuf';
import { create } from '@bufbuild/protobuf';
import {
  ConcealmentRevealedSchema,
  DoorRevealedSchema,
  RegionRevealedSchema,
  type DoorRevealed,
  type RegionRevealed,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  GetAtlasResponseSchema,
  type GetAtlasResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AtlasStructuralDoorSchema,
  AtlasStructuralWallSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  applyConcealmentRevealed,
  applyDoorRevealed,
  applyRegionRevealed,
  applyStructuralRecords,
} from './applyReveal';
import { segmentsToWallRuns } from './atlasWallRuns';

const cell = (x: number, y: number) => ({ x, y });
const keys = (cells: readonly { x: number; y: number }[]) =>
  cells.map((c) => `${c.x},${c.y}`).sort();

/**
 * What a non-knower holds before the reveal: the visible room, one wall
 * they can see, and the FOOTING under it — the cells that wall stands on,
 * which belong to the hidden room and reach this member as ownerless,
 * sealed floor (design C18).
 */
function beforeAtlas(
  sealed: { x: number; y: number }[] = [cell(2, 0), cell(3, 0)]
): GetAtlasResponse {
  return create(GetAtlasResponseSchema, {
    cells: [cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0), cell(4, 0)],
    regions: [{ id: 'hall', name: 'Hall', cells: [cell(0, 0), cell(1, 0)] }],
    // The footing: floor they can see, owned by nobody they know of.
    sealed,
    // The wall this member CAN see: the vertical line through the side
    // between (1,0) and (2,0), which is where the secret door stands.
    segments: [{ from: { q: 2, r: -1 }, to: { q: 1, r: 1 }, height: 0 }],
    boundaries: [{ from: cell(1, 0), to: cell(2, 0) }],
  });
}

/** The beat, with its slice-2 fields set directly: `segments = 4` and
 * `sealed = 5` landed in rpg-api-protos#285 and this repo pins the
 * generated commit that carries them. */
type RevealInit = MessageInitShape<typeof RegionRevealedSchema>;
function regionRevealed(
  over: Pick<RevealInit, 'segments' | 'sealed'> = {}
): RegionRevealed {
  return create(RegionRevealedSchema, {
    region: {
      id: 'crypt',
      name: 'Crypt',
      cells: [cell(2, 0), cell(3, 0), cell(4, 0)],
    },
    props: [],
    boundaries: [{ from: cell(3, 0), to: cell(4, 0) }],
    segments: over.segments ?? [
      { from: { q: 4, r: -1 }, to: { q: 3, r: 1 }, height: 0 },
    ],
    sealed: over.sealed ?? [],
  });
}

describe('a region reveal', () => {
  it('makes the revealed room’s footing WALKABLE — sealed replaces, it does not append', () => {
    // The acceptance case. Cells (2,0) and (3,0) were footing under a
    // wall this member could see: floor with no owner they knew, hence
    // sealed. The room is theirs now, so those cells are ordinary
    // standable floor. A client that appended `sealed` would leave a
    // room you can see and cannot walk into.
    const before = beforeAtlas();
    expect(keys(before.sealed)).toEqual(['2,0', '3,0']);

    const after = applyRegionRevealed(before, regionRevealed());

    expect(after.sealed).toEqual([]);
    expect(after.regions.map((r) => r.id)).toEqual(['hall', 'crypt']);
    // And the cells took the region as owner, which is what makes them
    // the room's floor rather than scenery.
    expect(
      after.regions.find((r) => r.id === 'crypt')?.cells.map((c) => c.x)
    ).toEqual([2, 3, 4]);
  });

  it('applies the exact relation: before.sealed minus region.cells, union event.sealed', () => {
    const before = beforeAtlas([cell(2, 0), cell(3, 0), cell(9, 9)]);
    const after = applyRegionRevealed(
      before,
      regionRevealed({ sealed: [cell(4, 0)] })
    );
    // (9,9) is nothing to do with this room and survives; (2,0) and
    // (3,0) leave because the room now owns them; (4,0) arrives because
    // the beat says a wall seals it.
    expect(keys(after.sealed)).toEqual(['4,0', '9,9']);
  });

  it('appends segments, and draws a wall it already held exactly once', () => {
    // The pin for "never replace by region": a wall drawn for another
    // reason must survive a reveal, and must not double.
    const before = beforeAtlas();
    const held = before.segments[0];
    const after = applyRegionRevealed(
      before,
      // The beat repeats the wall this member already holds, alongside
      // the room's own new one.
      regionRevealed({
        segments: [
          held,
          { from: { q: 4, r: -1 }, to: { q: 3, r: 1 }, height: 0 },
        ],
      })
    );
    expect(after.segments).toHaveLength(2);
    const runs = segmentsToWallRuns(after, 1).wallRuns;
    expect(runs).toHaveLength(2);
    // The wall the member already held is drawn ONCE, not twice.
    const heldX = (Math.sqrt(3) * 6) / 4;
    const onHeld = runs.filter((r) => Math.abs(r.start.x - heldX) < 1e-9);
    expect(onHeld).toHaveLength(1);
  });

  it('never drops a segment the event did not repeat', () => {
    const before = beforeAtlas();
    const after = applyRegionRevealed(before, regionRevealed());
    expect(after.segments[0]).toEqual(before.segments[0]);
  });

  it('is a no-op without a region', () => {
    const before = beforeAtlas();
    const empty = create(RegionRevealedSchema, {});
    expect(applyRegionRevealed(before, empty)).toBe(before);
  });
});

describe('a door reveal', () => {
  function doorRevealed(): DoorRevealed {
    return create(DoorRevealedSchema, {
      doorways: [
        { connection: 'tomb/secret', from: cell(1, 0), to: cell(2, 0) },
      ],
      // Empty: the mask simply comes off.
      boundaries: [],
    });
  }

  it('takes the masquerade’s synthetic wall off the door’s own edges', () => {
    const before = beforeAtlas();
    expect(before.boundaries).toHaveLength(1);
    const after = applyDoorRevealed(before, doorRevealed());
    expect(after.boundaries).toEqual([]);
    expect(after.doorways).toHaveLength(1);
  });

  it('opens the gap where the doorway meets a segment already held', () => {
    // Nothing reveal-specific happens to the geometry. The wall was
    // presented whole (design C19), so the moment the doorway exists the
    // gap falls out of the segment the client already had.
    const before = beforeAtlas();
    expect(segmentsToWallRuns(before, 1).doorGaps).toHaveLength(0);
    expect(segmentsToWallRuns(before, 1).wallRuns).toHaveLength(1);

    const after = applyDoorRevealed(before, doorRevealed());
    const scene = segmentsToWallRuns(after, 1);
    expect(scene.doorGaps).toHaveLength(1);
    expect(scene.doorGaps[0].connection).toBe('tomb/secret');
    // The whole wall became two pieces either side of the gap.
    expect(scene.wallRuns).toHaveLength(2);
  });
});

/** A valid fixed wall record. Updates retain identity/order and pass the same
 * assembled-geometry validation as snapshots before reaching the renderer. */
const structuralWall = (id: string, openingIds: string[] = []) =>
  create(AtlasStructuralWallSchema, {
    id,
    ref: `ref:${id}`,
    from: { x: 0, y: 0 },
    to: { x: 10, y: 0 },
    height: 1,
    thickness: 1,
    elevation: 0,
    openings: openingIds.map((openingId, index) => ({
      id: openingId,
      position: index + 1,
      width: 0.5,
    })),
  });
const structuralDoor = (id: string) =>
  create(AtlasStructuralDoorSchema, {
    id,
    ref: `ref:${id}`,
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    height: 1,
    thickness: 1,
    elevation: 0,
  });

function withStructure(
  walls: ReturnType<typeof structuralWall>[],
  doors: ReturnType<typeof structuralDoor>[] = []
): GetAtlasResponse {
  return create(GetAtlasResponseSchema, {
    structuralWalls: walls,
    structuralDoors: doors,
  });
}

describe('fixed structural records', () => {
  it('upserts the COMPLETE changed wall by id rather than appending a twin', () => {
    const before = withStructure([structuralWall('w', ['cut-1'])]);
    const after = applyStructuralRecords(
      before,
      [structuralWall('w', ['cut-1', 'cut-2'])],
      []
    );
    expect(after.structuralWalls).toHaveLength(1);
    expect(after.structuralWalls[0]!.openings.map((o) => o.id)).toEqual([
      'cut-1',
      'cut-2',
    ]);
  });

  it('restores canonical identity order for walls and doors', () => {
    const after = applyStructuralRecords(
      create(GetAtlasResponseSchema),
      [structuralWall('w2'), structuralWall('w1')],
      [structuralDoor('d2'), structuralDoor('d1')]
    );
    expect(after.structuralWalls.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(after.structuralDoors.map((d) => d.id)).toEqual(['d1', 'd2']);
  });

  it('is a NO-OP for empty legacy arrays — the same atlas object comes back', () => {
    const before = withStructure([structuralWall('w', ['cut-1'])]);
    expect(applyStructuralRecords(before, [], [])).toBe(before);
    expect(applyStructuralRecords(before, undefined, undefined)).toBe(before);
  });

  it('cannot be reverted by a later no-change reveal', () => {
    const before = withStructure([structuralWall('w', ['cut-1'])]);
    const revealed = applyStructuralRecords(
      before,
      [structuralWall('w', ['cut-1', 'cut-2'])],
      []
    );
    const later = applyStructuralRecords(revealed, [], []);
    expect(later.structuralWalls[0]!.openings.map((o) => o.id)).toEqual([
      'cut-1',
      'cut-2',
    ]);
  });

  it('is idempotent under double application', () => {
    const before = withStructure([]);
    const once = applyStructuralRecords(
      before,
      [structuralWall('w', ['cut-1'])],
      [structuralDoor('d')]
    );
    const twice = applyStructuralRecords(
      once,
      [structuralWall('w', ['cut-1'])],
      [structuralDoor('d')]
    );
    expect(twice.structuralWalls).toEqual(once.structuralWalls);
    expect(twice.structuralDoors).toEqual(once.structuralDoors);
  });

  it('rides the EXISTING region-reveal route', () => {
    const after = applyRegionRevealed(
      create(GetAtlasResponseSchema),
      create(RegionRevealedSchema, {
        region: { id: 'crypt', cells: [cell(2, 0)] },
        structuralWalls: [structuralWall('w', ['cut-1'])],
        structuralDoors: [structuralDoor('d')],
      })
    );
    expect(after.structuralWalls.map((w) => w.id)).toEqual(['w']);
    expect(after.structuralDoors.map((d) => d.id)).toEqual(['d']);
  });

  it('carries the same delta on concealment reveal', () => {
    const before = withStructure([structuralWall('parent')]);
    const after = applyConcealmentRevealed(
      before,
      create(ConcealmentRevealedSchema, {
        concealment: 'hidden-door',
        structuralWalls: [structuralWall('parent', ['cut-2'])],
        structuralDoors: [structuralDoor('hidden')],
      })
    );
    // The parent wall is UPDATED with its newly known cut, and the door is an
    // independent row — never nested under the wall.
    expect(after.structuralWalls[0]!.openings.map((o) => o.id)).toEqual([
      'cut-2',
    ]);
    expect(after.structuralDoors.map((d) => d.id)).toEqual(['hidden']);
  });
});
