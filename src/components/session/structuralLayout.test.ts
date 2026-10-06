// @vitest-environment node
/**
 * structuralLayout — the runtime adapter's own contract.
 *
 * THE NUMERIC WITNESS is the whole point: the encounter compiler converts
 * authored scene units into canonical feet by multiplying by
 * `k = FEET_PER_HEX / sqrt(3)` (five feet across the flats of a pointy hex).
 * The renderer must apply the INVERSE render-only convention exactly once, so
 * a wall the compiler measured as `0 → 10k` with a `7k`-centred `2k` opening
 * must draw as `0 → 10` with a `7`-centred `2` cut at `HEX_SIZE = 1`. A second
 * application of either scale (or the catalog runtime scale) is the double-fit
 * bug this test exists to catch.
 */
import { create } from '@bufbuild/protobuf';
import {
  AtlasStructuralDoorSchema,
  AtlasStructuralWallSchema,
  FootprintPointSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  sceneUnitsPerFoot,
  structuralDoorPoseFromAtlas,
  structuralLayoutRender,
  structuralWallSurfaceFromAtlas,
} from './structuralLayout';

/** Canonical feet per authored source unit, from `FEET_PER_HEX = 5`. */
const K = 5 / Math.sqrt(3);

const feet = (x: number, y: number) => create(FootprintPointSchema, { x, y });

function wallAtlas(
  overrides: Partial<{
    id: string;
    ref: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    height: number;
    thickness: number;
    elevation: number;
    openings: { id: string; position: number; width: number }[];
  }> = {}
) {
  return create(AtlasStructuralWallSchema, {
    id: 'wall-1',
    ref: 'dnd5e:env:dark-fortress:45_wall_01',
    from: feet(0, 0),
    to: feet(10 * K, 0),
    height: 3 * K,
    thickness: 0.3 * K,
    elevation: 0.2 * K,
    openings: [{ id: 'cut-1', position: 7 * K, width: 2 * K }],
    ...overrides,
  });
}

describe('sceneUnitsPerFoot', () => {
  it('is the inverse of the compiler’s feet-per-source conversion at HEX_SIZE 1', () => {
    expect(sceneUnitsPerFoot(1)).toBeCloseTo(Math.sqrt(3) / 5, 12);
    // k * (1/k) === 1: the round trip the witness below depends on.
    expect(sceneUnitsPerFoot(1) * K).toBeCloseTo(1, 12);
  });

  it('refuses a nonpositive or non-finite hex size by name', () => {
    expect(() => sceneUnitsPerFoot(0)).toThrow(/hex size/);
    expect(() => sceneUnitsPerFoot(Number.NaN)).toThrow(/hex size/);
  });
});

describe('structuralWallSurfaceFromAtlas', () => {
  it('applies the feet→scene convention once: canonical 0→10k / 7k / 2k draw 0→10 / 7 / 2', () => {
    const surface = structuralWallSurfaceFromAtlas(
      wallAtlas(),
      sceneUnitsPerFoot(1)
    );
    expect(surface.id).toBe('wall-1');
    expect(surface.line.start).toEqual({ x: 0, z: 0 });
    expect(surface.line.end.x).toBeCloseTo(10, 10);
    expect(surface.line.end.z).toBeCloseTo(0, 10);
    expect(surface.appearance.assetRef).toBe(
      'dnd5e:env:dark-fortress:45_wall_01'
    );
    expect(surface.appearance.height).toBeCloseTo(3, 10);
    expect(surface.appearance.thickness).toBeCloseTo(0.3, 10);
    expect(surface.appearance.elevation).toBeCloseTo(0.2, 10);
    expect(surface.openings).toHaveLength(1);
    expect(surface.openings[0]!.id).toBe('cut-1');
    expect(surface.openings[0]!.position).toBeCloseTo(7, 10);
    expect(surface.openings[0]!.width).toBeCloseTo(2, 10);
  });

  it('maps canonical Point.Y onto scene Z, not scene Y', () => {
    const surface = structuralWallSurfaceFromAtlas(
      wallAtlas({
        from: feet(0, 2 * K),
        to: feet(10 * K, 2 * K),
        openings: [],
      }),
      sceneUnitsPerFoot(1)
    );
    expect(surface.line.start.z).toBeCloseTo(2, 10);
    expect(surface.line.end.z).toBeCloseTo(2, 10);
    expect(surface.line.start).not.toHaveProperty('y');
  });

  it('scales with hex size through the one convention', () => {
    const surface = structuralWallSurfaceFromAtlas(
      wallAtlas(),
      sceneUnitsPerFoot(2)
    );
    // 2x the hex size ⇒ 2x the world units for the same canonical feet.
    expect(surface.line.end.x).toBeCloseTo(20, 10);
    expect(surface.appearance.height).toBeCloseTo(6, 10);
  });

  it('keeps an empty cut list an uninterrupted wall, not a dropped record', () => {
    const surface = structuralWallSurfaceFromAtlas(
      wallAtlas({ openings: [] }),
      sceneUnitsPerFoot(1)
    );
    expect(surface.openings).toEqual([]);
  });

  it('refuses a missing endpoint by name instead of defaulting it to the origin', () => {
    expect(() =>
      structuralWallSurfaceFromAtlas(
        create(AtlasStructuralWallSchema, {
          id: 'wall-x',
          ref: 'r',
          from: feet(0, 0),
          // `to` deliberately absent.
          height: 1,
          thickness: 1,
          elevation: 0,
        }),
        sceneUnitsPerFoot(1)
      )
    ).toThrow(/wall wall-x\.to/);
  });

  it('refuses a non-finite or degenerate line by name', () => {
    expect(() =>
      structuralWallSurfaceFromAtlas(
        wallAtlas({ from: feet(Number.NaN, 0) }),
        sceneUnitsPerFoot(1)
      )
    ).toThrow(/wall wall-1\.from/);
    expect(() =>
      structuralWallSurfaceFromAtlas(
        wallAtlas({ to: feet(0, 0) }),
        sceneUnitsPerFoot(1)
      )
    ).toThrow(/positive line/);
  });

  it('refuses a nonpositive dimension by name', () => {
    expect(() =>
      structuralWallSurfaceFromAtlas(
        wallAtlas({ height: 0 }),
        sceneUnitsPerFoot(1)
      )
    ).toThrow(/wall wall-1\.height/);
    expect(() =>
      structuralWallSurfaceFromAtlas(
        wallAtlas({ openings: [{ id: 'cut-1', position: 1, width: 0 }] }),
        sceneUnitsPerFoot(1)
      )
    ).toThrow(/openings\[0\]\.width/);
  });

  it('refuses an opening with no identity by name', () => {
    expect(() =>
      structuralWallSurfaceFromAtlas(
        wallAtlas({ openings: [{ id: '', position: 1, width: 1 }] }),
        sceneUnitsPerFoot(1)
      )
    ).toThrow(/nonempty opening id/);
  });
});

describe('structuralDoorPoseFromAtlas', () => {
  const door = (overrides: Record<string, unknown> = {}) =>
    create(AtlasStructuralDoorSchema, {
      id: 'front-room/gate',
      ref: 'dnd5e:env:dark-fortress:wall_door_double_01',
      from: feet(6 * K, 0),
      to: feet(8 * K, 0),
      height: 3 * K,
      thickness: 0.3 * K,
      elevation: 0.2 * K,
      ...overrides,
    });

  it('resolves the endpoint midline, width and yaw from its own endpoints', () => {
    const pose = structuralDoorPoseFromAtlas(door(), sceneUnitsPerFoot(1));
    expect(pose.point.x).toBeCloseTo(7, 10);
    expect(pose.point.z).toBeCloseTo(0, 10);
    expect(pose.width).toBeCloseTo(2, 10);
    expect(pose.rotationY).toBeCloseTo(0, 10);
    expect(pose.height).toBeCloseTo(3, 10);
    expect(pose.thickness).toBeCloseTo(0.3, 10);
    expect(pose.y).toBeCloseTo(0.2, 10);
  });

  it('uses the shared atan2(-dz, dx) yaw for an off-axis opening', () => {
    const pose = structuralDoorPoseFromAtlas(
      door({ from: feet(6 * K, 0), to: feet(6 * K, 2 * K) }),
      sceneUnitsPerFoot(1)
    );
    expect(pose.rotationY).toBeCloseTo(Math.atan2(-2, 0), 10);
    expect(pose.width).toBeCloseTo(2, 10);
  });

  it('refuses a zero-width or malformed door by name', () => {
    expect(() =>
      structuralDoorPoseFromAtlas(
        door({ to: feet(6 * K, 0) }),
        sceneUnitsPerFoot(1)
      )
    ).toThrow(/front-room\/gate/);
    expect(() =>
      structuralDoorPoseFromAtlas(
        create(AtlasStructuralDoorSchema, { id: 'd', ref: 'r' }),
        sceneUnitsPerFoot(1)
      )
    ).toThrow(/door d\.from/);
  });

  it('carries the canonical gameplay id and ref verbatim', () => {
    const render = structuralLayoutRender([], [door()], 1);
    expect(render.doors[0]!.id).toBe('front-room/gate');
    expect(render.doors[0]!.assetRef).toBe(
      'dnd5e:env:dark-fortress:wall_door_double_01'
    );
  });
});

describe('structuralLayoutRender', () => {
  it('treats absent (legacy) collections as empty and consumes nothing', () => {
    expect(structuralLayoutRender(undefined, undefined, 1)).toEqual({
      walls: [],
      doors: [],
      diagnostics: [],
    });
  });

  it('renders every supplied record — identity presence is decided upstream', () => {
    const render = structuralLayoutRender(
      [wallAtlas({ id: 'w1' }), wallAtlas({ id: 'w2', openings: [] })],
      [],
      1
    );
    expect(render.walls.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(render.diagnostics).toEqual([]);
  });

  it('names a malformed record and contributes no geometry for it', () => {
    const render = structuralLayoutRender(
      [
        wallAtlas({ id: 'good' }),
        create(AtlasStructuralWallSchema, { id: 'broken', ref: 'r' }),
      ],
      [],
      1
    );
    expect(render.walls.map((w) => w.id)).toEqual(['good']);
    expect(render.diagnostics).toHaveLength(1);
    expect(render.diagnostics[0]).toMatch(/wall broken/);
  });
});
