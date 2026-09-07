/**
 * atlasWallRuns tests — `segmentsToWallRuns` (rpg-project#360 slice 2,
 * "walls as lines"). The old suite pinned a chain-fitting engine
 * (`boundariesToWallRuns`/`computeAuthoredWallRuns`): a corner-vertex
 * graph, a least-squares direction fit, `CHAIN_TOLERANCE`, an
 * authored-axis declaration, a force-close pass, facing read off the
 * floor mask, union-find corner closure. All of that is DELETED along
 * with the engine — a wall is now the two points the author drew, sent
 * straight off the wire as an `AtlasSegment`, and this module draws
 * exactly that line. There is nothing left to fit and no tolerance left
 * to tune, so this suite pins the new, much smaller contract instead:
 * one straight run per segment, split around the doors standing in it,
 * with an honest empty answer when the wire sends no segments at all.
 *
 * Every world-position assertion is checked against `cubeToWorld`
 * (hexMath.ts) applied directly to the segment's own axial numbers — a
 * PIXEL-FORMULA check, not a round-trip through the module's own
 * internals, per rpg-toolkit#1150's postmortem: a conversion swapped
 * identically both ways passes every round-trip test and is only caught
 * by comparing against an independent formula.
 */
import { cubeToWorld, type WorldPos } from '@/components/hex-grid/hexMath';
import { DOOR_FRAME_CALIBRATED_WIDTH } from '@/components/hex-grid/syntyHexWallHelpers';
import { create } from '@bufbuild/protobuf';
import { GetAtlasResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import { segmentsToWallRuns } from './atlasWallRuns';
import { worldPositionOf } from './positionBridge';

/** A cell Position, in the wire's own {x: q, y: r} shape. Cast the same
 * way every other test in this codebase casts a bare fixture object
 * against a full proto message type. */
const pos = (q: number, r: number) => ({ x: q, y: r }) as never;

/** The axial<->world pixel formula, applied directly — the same formula
 * `atlasWallRuns.ts`'s own `axialToWorld` uses, but called independently
 * here rather than trusted from that file. */
function worldOf(q: number, r: number, hexSize: number): WorldPos {
  return cubeToWorld({ x: q, y: -q - r, z: r }, hexSize);
}

const sub = (a: WorldPos, b: WorldPos): WorldPos => ({
  x: a.x - b.x,
  z: a.z - b.z,
});
const vlength = (v: WorldPos): number => Math.hypot(v.x, v.z);
function unit(v: WorldPos): WorldPos {
  const len = vlength(v);
  return len === 0 ? { x: 0, z: 0 } : { x: v.x / len, z: v.z / len };
}
const along = (from: WorldPos, dir: WorldPos, t: number): WorldPos => ({
  x: from.x + dir.x * t,
  z: from.z + dir.z * t,
});
const midpoint = (a: WorldPos, b: WorldPos): WorldPos => ({
  x: (a.x + b.x) / 2,
  z: (a.z + b.z) / 2,
});
const distanceBetween = (a: WorldPos, b: WorldPos): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe('segmentsToWallRuns — one segment, no doors', () => {
  it('renders one run whose start/end are exactly the segment endpoints converted by cubeToWorld', () => {
    const hexSize = 1.75;
    // Fractional axial on purpose (design §5.2: the wire carries no
    // second basis, only the fraction) — and already canonically
    // ordered (smaller world x first) so this test isn't also pinning
    // the orient() tie-break.
    const from = { q: -2.5, r: 1.25 };
    const to = { q: 3.75, r: -0.5 };
    const atlas = create(GetAtlasResponseSchema, {
      segments: [{ from, to, height: 1.5 }],
      doorways: [],
    });

    const scene = segmentsToWallRuns(atlas, hexSize);

    expect(scene.wallRuns).toHaveLength(1);
    expect(scene.doorGaps).toHaveLength(0);
    const run = scene.wallRuns[0]!;
    expect(run.start).toEqual(worldOf(from.q, from.r, hexSize));
    expect(run.end).toEqual(worldOf(to.q, to.r, hexSize));
    expect(run.height).toBe(1.5);

    // facing is the run's own perpendicular, unit length.
    const dir = unit(sub(run.end, run.start));
    expect(run.facing).toEqual({ x: -dir.z, z: dir.x });
    expect(vlength(run.facing)).toBeCloseTo(1, 12);
  });
});

describe('segmentsToWallRuns — a door standing on a segment', () => {
  it('splits one run into two, with a gap DOOR_FRAME_CALIBRATED_WIDTH long centred on the doorway crossing, and the runs end exactly on the gap boundaries', () => {
    const hexSize = 1;
    // A segment along r=0 (world z stays 0), long enough to hold the
    // door comfortably clear of both ends.
    const from = { q: -5, r: 0 };
    const to = { q: 5, r: 0 };
    // Two E-adjacent cells straddling the segment's line: the crossing
    // midpoint between (0,0) and (1,0) sits exactly on world z=0.
    const doorFrom = pos(0, 0);
    const doorTo = pos(1, 0);
    const atlas = create(GetAtlasResponseSchema, {
      segments: [{ from, to, height: 0 }],
      doorways: [{ connection: 'mid-door', from: doorFrom, to: doorTo }],
    });

    const scene = segmentsToWallRuns(atlas, hexSize);

    expect(scene.doorGaps).toHaveLength(1);
    expect(scene.wallRuns).toHaveLength(2);

    const expectedCentre = midpoint(
      worldPositionOf(doorFrom, hexSize),
      worldPositionOf(doorTo, hexSize)
    );
    const gap = scene.doorGaps[0]!;
    expect(gap.key).toBe('mid-door');
    expect(gap.connection).toBe('mid-door');
    expect(gap.position.x).toBeCloseTo(expectedCentre.x, 12);
    expect(gap.position.z).toBeCloseTo(expectedCentre.z, 12);

    // leafPosition is one gap boundary; its mirror through the centre is
    // the other. The two are exactly DOOR_FRAME_CALIBRATED_WIDTH apart —
    // not "close to 1.0", the calibrated constant itself.
    const near = gap.leafPosition;
    const far = {
      x: 2 * gap.position.x - near.x,
      z: 2 * gap.position.z - near.z,
    };
    expect(distanceBetween(near, far)).toBeCloseTo(
      DOOR_FRAME_CALIBRATED_WIDTH,
      12
    );

    // Every run's own end touches one of the two gap boundaries exactly
    // — no float slack left to close, because there is no second
    // computation (a fitted chain vs. a door position) to reconcile.
    const runEnds = scene.wallRuns.flatMap((r) => [r.start, r.end]);
    for (const boundary of [near, far]) {
      const touching = runEnds.filter(
        (p) => distanceBetween(p, boundary) < 1e-9
      );
      expect(
        touching,
        `some run end touches ${JSON.stringify(boundary)}`
      ).toHaveLength(1);
    }
  });
});

describe('segmentsToWallRuns — a door at a segment’s very end', () => {
  it('yields one run, not a zero-length second one', () => {
    const hexSize = 1;
    const doorFrom = pos(0, 0);
    const doorTo = pos(1, 0);
    // The segment STARTS exactly at the door's own crossing midpoint —
    // the axial average of two same-row adjacent cells is that midpoint
    // exactly, since world x is linear in q at constant r.
    const from = { q: 0.5, r: 0 };
    const to = { q: 5, r: 0 };
    const atlas = create(GetAtlasResponseSchema, {
      segments: [{ from, to, height: 0 }],
      doorways: [{ connection: 'end-door', from: doorFrom, to: doorTo }],
    });

    const scene = segmentsToWallRuns(atlas, hexSize);

    expect(scene.doorGaps).toHaveLength(1);
    // The old bug this pins against: a door sitting at t=0 produces a
    // "run" on the near side that is negative/zero length and should be
    // dropped, not emitted as a degenerate second piece.
    expect(scene.wallRuns).toHaveLength(1);
    const [run] = scene.wallRuns;
    expect(vlength(sub(run!.end, run!.start))).toBeGreaterThan(0);

    const start = worldOf(from.q, from.r, hexSize);
    const dir = unit(sub(worldOf(to.q, to.r, hexSize), start));
    const expectedStart = along(start, dir, DOOR_FRAME_CALIBRATED_WIDTH / 2);
    expect(run!.start.x).toBeCloseTo(expectedStart.x, 9);
    expect(run!.start.z).toBeCloseTo(expectedStart.z, 9);
  });
});

describe('segmentsToWallRuns — two doors on one segment', () => {
  it('splits into three runs', () => {
    const hexSize = 1;
    const atlas = create(GetAtlasResponseSchema, {
      segments: [{ from: { q: -5, r: 0 }, to: { q: 5, r: 0 }, height: 0 }],
      doorways: [
        { connection: 'door-a', from: pos(0, 0), to: pos(1, 0) },
        { connection: 'door-b', from: pos(-3, 0), to: pos(-2, 0) },
      ],
    });

    const scene = segmentsToWallRuns(atlas, hexSize);

    expect(scene.doorGaps).toHaveLength(2);
    expect(scene.wallRuns).toHaveLength(3);
    for (const run of scene.wallRuns) {
      expect(vlength(sub(run.end, run.start))).toBeGreaterThan(0);
    }
  });
});

describe('segmentsToWallRuns — ACCEPTANCE: empty segments draws nothing', () => {
  it('an atlas with boundaries/doorways but no segments yields zero wallRuns — no fallback to fitting', () => {
    const hexSize = 1;
    const atlas = create(GetAtlasResponseSchema, {
      // A producer that has not adopted segments yet: the mechanical
      // truth (boundaries) is still there, segments is empty.
      boundaries: [
        {
          from: pos(0, 0),
          to: pos(1, 0),
          blocksMovement: true,
          blocksLineOfSight: true,
        },
      ],
      segments: [],
      doorways: [],
    });

    const scene = segmentsToWallRuns(atlas, hexSize);

    // This is the whole point of the rewrite: a fallback to fitting
    // `boundaries` here is exactly how the deleted chain-fitting engine
    // would survive its own deletion. An honest empty answer — floor and
    // doors drawn, no walls — is the correct, reportable degradation.
    expect(scene.wallRuns).toEqual([]);
  });
});

describe('segmentsToWallRuns — a doorway whose crossing lies on no segment', () => {
  it('still draws the door as a gap (a door the server described with no wall) without creating or consuming a run for it', () => {
    const hexSize = 1;
    // A real segment exists elsewhere in the atlas, far from the door's
    // own crossing — proves the fallback triggers on THIS door
    // specifically, not merely because segments happens to be empty
    // (see the empty-segments test above for that case).
    const from = { q: 10, r: 0 };
    const to = { q: 15, r: 0 };
    const doorFrom = pos(0, 0);
    const doorTo = pos(1, 0);
    const atlas = create(GetAtlasResponseSchema, {
      segments: [{ from, to, height: 0 }],
      doorways: [{ connection: 'orphan-door', from: doorFrom, to: doorTo }],
    });

    const scene = segmentsToWallRuns(atlas, hexSize);

    // The unrelated segment still renders, whole and unsplit.
    expect(scene.wallRuns).toHaveLength(1);
    expect(scene.wallRuns[0]!.start).toEqual(worldOf(from.q, from.r, hexSize));
    expect(scene.wallRuns[0]!.end).toEqual(worldOf(to.q, to.r, hexSize));

    expect(scene.doorGaps).toHaveLength(1);
    const gap = scene.doorGaps[0]!;
    const doorFromWorld = worldPositionOf(doorFrom, hexSize);
    const doorToWorld = worldPositionOf(doorTo, hexSize);
    const expectedCentre = midpoint(doorFromWorld, doorToWorld);
    expect(gap.position.x).toBeCloseTo(expectedCentre.x, 12);
    expect(gap.position.z).toBeCloseTo(expectedCentre.z, 12);

    // The fallback frame is laid square to the crossing it opens (this
    // module's own doc comment: "a door with no wall, drawn as one"),
    // not aligned to any segment — independently recomputed here from
    // the crossing direction alone.
    const across = unit(sub(doorToWorld, doorFromWorld));
    const side: WorldPos = { x: -across.z, z: across.x };
    const expectedLeaf = along(
      gap.position,
      side,
      -DOOR_FRAME_CALIBRATED_WIDTH / 2
    );
    expect(gap.leafPosition.x).toBeCloseTo(expectedLeaf.x, 9);
    expect(gap.leafPosition.z).toBeCloseTo(expectedLeaf.z, 9);
    expect(gap.rotationY).toBeCloseTo(Math.atan2(-side.z, side.x), 9);
  });
});

describe('segmentsToWallRuns — facing is a pure function of the segment', () => {
  it('reversing a segment’s from/to yields the identical facing and the identical run geometry', () => {
    // `facing` must not depend on which side of the wall the floor mask
    // says is "inside" — this module takes no cell mask at all as input,
    // and design §1.9's wall invariant requires a wall to look the same
    // from the visible side regardless of what is beyond it. If facing
    // secretly depended on authoring direction (a stand-in for "which
    // side the room was drawn from"), two recipients who saw the same
    // wall authored in opposite directions could render opposite faces
    // — the masquerade's tell, one layer down (this module's header
    // doc comment).
    const hexSize = 1;
    const a = { q: 1, r: 2 };
    const b = { q: -4, r: -1 };

    const forward = segmentsToWallRuns(
      create(GetAtlasResponseSchema, {
        segments: [{ from: a, to: b, height: 0 }],
        doorways: [],
      }),
      hexSize
    );
    const reversed = segmentsToWallRuns(
      create(GetAtlasResponseSchema, {
        segments: [{ from: b, to: a, height: 0 }],
        doorways: [],
      }),
      hexSize
    );

    expect(reversed.wallRuns).toEqual(forward.wallRuns);
  });
});

describe('segmentsToWallRuns — height passes through unchanged', () => {
  it('carries the segment’s own height MULTIPLIER verbatim, 0 included, with no arithmetic applied here', () => {
    const hexSize = 1;
    for (const height of [0, 2.5]) {
      const atlas = create(GetAtlasResponseSchema, {
        segments: [{ from: { q: 0, r: 0 }, to: { q: 4, r: 0 }, height }],
        doorways: [],
      });
      const scene = segmentsToWallRuns(atlas, hexSize);
      expect(scene.wallRuns).toHaveLength(1);
      // Exactly the authored number — this layer never treats 0 as "not
      // authored, render as 1" (AtlasSegment.height's own doc comment);
      // that reading, if any, belongs to whatever consumes
      // AuthoredWallRun downstream.
      expect(scene.wallRuns[0]!.height).toBe(height);
    }
  });
});
