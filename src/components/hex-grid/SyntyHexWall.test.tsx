import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => {
  const scene = new THREE.Group();
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    )
  );
  return { useGLTF: () => ({ scene }) };
});

import { SYNTY_SCALE, WALL_HEIGHT } from '@/rendering/calibrationConstants';
import { SyntyHexWall } from './SyntyHexWall';
import { doorFrameScale, doorLeafScale } from './syntyHexWallHelpers';

function wall(kind: WallKind, id = 'boss-door'): Wall {
  return {
    from: { x: 0, y: 0, z: 0 },
    to: { x: 1, y: -1, z: 0 },
    kind,
    id,
  } as Wall;
}

describe('SyntyHexWall R3F scene', () => {
  it('renders a remembered closed door without a hit target', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[wall(WallKind.DOOR_CLOSED)]}
        hexSize={1}
        rememberedWallHexKeys={new Set(['0,0,0'])}
      />
    );
    expect(
      renderer.scene.findAll((node) => typeof node.props.onClick === 'function')
    ).toEqual([]);
  });

  it('tints a fitting when any touching wall hex is remembered', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[
          {
            from: { x: 0, y: 0, z: 0 },
            to: { x: 0, y: 0, z: 0 },
            kind: WallKind.SOLID,
          } as Wall,
          {
            from: { x: 1, y: -1, z: 0 },
            to: { x: 1, y: -1, z: 0 },
            kind: WallKind.SOLID,
          } as Wall,
          {
            from: { x: 1, y: 0, z: -1 },
            to: { x: 1, y: 0, z: -1 },
            kind: WallKind.SOLID,
          } as Wall,
        ]}
        hexSize={1}
        rememberedWallHexKeys={new Set(['1,-1,0'])}
      />
    );
    expect(findTintedMeshes(renderer).length).toBeGreaterThan(0);
  });

  it('renders a tinted locked door hit target that forwards its exact Wall.id', async () => {
    const onDoorClick = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[wall(WallKind.DOOR_LOCKED, 'locked-42')]}
        hexSize={1}
        onDoorClick={onDoorClick}
      />
    );
    const target = renderer.scene.find(
      (node) => typeof node.props.onClick === 'function'
    );
    expect(target).toBeDefined();
    await renderer.fireEvent(target, 'click');
    expect(onDoorClick).toHaveBeenCalledWith('locked-42');
    const tintedMeshes = renderer.scene.findAll((node) => {
      const mesh = node.instance as THREE.Mesh;
      return (
        mesh instanceof THREE.Mesh &&
        mesh.material instanceof THREE.MeshStandardMaterial
      );
    });
    expect(
      tintedMeshes.some((node) => {
        const material = (node.instance as THREE.Mesh)
          .material as THREE.MeshStandardMaterial;
        return (
          material.color.r < 0.5 &&
          material.color.g < 0.5 &&
          material.color.b < 0.5
        );
      })
    ).toBe(true);
  });

  it.each([WallKind.DOOR_CLOSED, WallKind.DOOR_OPEN])(
    '%s preserves a door hit target',
    async (kind) => {
      const renderer = await ReactThreeTestRenderer.create(
        <SyntyHexWall walls={[wall(kind)]} hexSize={1} />
      );
      expect(
        renderer.scene.find((node) => typeof node.props.onClick === 'function')
      ).toBeDefined();
    }
  );

  it('does not make a solid wall a door hit target', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall walls={[wall(WallKind.SOLID)]} hexSize={1} />
    );
    expect(
      renderer.scene.findAll((node) => typeof node.props.onClick === 'function')
    ).toEqual([]);
  });
});

/** Every Y-rotation of every rendered Object3D in the scene — a door hex
 * also produces corner-fitting pieces (classifyWallVertices) with their
 * own unrelated rotations, so these tests check SET MEMBERSHIP (does the
 * override value appear at all / does it appear identically whether or
 * not an unrelated override is present) rather than asserting every node
 * shares one rotation. */
function allRotationYs(renderer: {
  scene: { findAll: (p: (n: unknown) => boolean) => unknown[] };
}): number[] {
  return renderer.scene
    .findAll(
      (node) =>
        (node as { props: { rotation?: unknown } }).props.rotation !== undefined
    )
    .map(
      (node) =>
        (node as { props: { rotation: [number, number, number] } }).props
          .rotation[1]
    );
}

/** Every XZ position of every rendered Object3D in the scene (mirrors
 * allRotationYs' set-membership approach, same reason: a door hex also
 * produces unrelated corner-fitting pieces). */
function allPositionsXZ(renderer: {
  scene: { findAll: (p: (n: unknown) => boolean) => unknown[] };
}): Array<{ x: number; z: number }> {
  return renderer.scene
    .findAll(
      (node) =>
        (node as { props: { position?: unknown } }).props.position !== undefined
    )
    .map((node) => {
      const [x, , z] = (
        node as { props: { position: [number, number, number] } }
      ).props.position;
      return { x, z };
    });
}

describe('SyntyHexWall doorPlaneOverrides (rpg-project#133 dungeon-walls W2, sharpened by the connector-single-wall follow-up rpg-project#132: "can our door rotate a little to line up with the wall?")', () => {
  it("orients the door frame/leaf using the override's rotationY instead of edge.rotationY when the door id matches", async () => {
    // A distinctive angle unlikely to coincide with any real edge/fitting
    // rotation this fixture's geometry would otherwise produce.
    const override = { position: { x: 0, z: 0 }, rotationY: Math.PI * 0.6789 };
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[wall(WallKind.DOOR_CLOSED, 'door-1')]}
        hexSize={1}
        doorPlaneOverrides={new Map([['door-1', override]])}
      />
    );
    const rotations = allRotationYs(renderer);
    // Both the frame and the leaf pick up the override -> at least 2 hits.
    const hits = rotations.filter(
      (r) => Math.abs(r - override.rotationY) < 1e-9
    );
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("moves the door frame to the override's exact position, distinct from the wire's own edge.mid — the exact defect this override exists to fix (frame/leaf visibly off the connector's actual wall plane)", async () => {
    // Distinctive position far from this fixture's own edge.mid (roughly
    // (0.5,-0.5) for the {0,0,0}->{1,-1,0} boundary-edge wall).
    const override = { position: { x: 12.5, z: -7.25 }, rotationY: 0.4 };
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[wall(WallKind.DOOR_CLOSED, 'door-1')]}
        hexSize={1}
        doorPlaneOverrides={new Map([['door-1', override]])}
      />
    );
    const positions = allPositionsXZ(renderer);
    const hit = positions.find(
      (p) =>
        Math.abs(p.x - override.position.x) < 1e-9 &&
        Math.abs(p.z - override.position.z) < 1e-9
    );
    expect(hit).toBeDefined();
  });

  it('renders identically to the no-override case when the doorPlaneOverrides map has no entry for this door', async () => {
    const withUnrelatedOverride = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[wall(WallKind.DOOR_CLOSED, 'door-1')]}
        hexSize={1}
        doorPlaneOverrides={
          new Map([
            ['other-door', { position: { x: 1, z: 1 }, rotationY: Math.PI }],
          ])
        }
      />
    );
    const withoutOverride = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[wall(WallKind.DOOR_CLOSED, 'door-1')]}
        hexSize={1}
      />
    );
    expect(allRotationYs(withUnrelatedOverride).sort()).toEqual(
      allRotationYs(withoutOverride).sort()
    );
    expect(allPositionsXZ(withUnrelatedOverride)).toEqual(
      allPositionsXZ(withoutOverride)
    );
  });
});

// A tinted mesh's base material color (the mocked GLB's pure-white
// MeshStandardMaterial) multiplied by any WALL_TINT_BY_THEME entry lands
// with every channel under 0.5 — same pattern the locked-door tint test
// above already relies on.
function findTintedMeshes(renderer: {
  scene: { findAll: (p: (n: unknown) => boolean) => unknown[] };
}) {
  return renderer.scene.findAll((node) => {
    const mesh = (node as { instance: unknown }).instance as THREE.Mesh;
    return (
      mesh instanceof THREE.Mesh &&
      mesh.material instanceof THREE.MeshStandardMaterial &&
      mesh.material.color.r < 0.5 &&
      mesh.material.color.g < 0.5 &&
      mesh.material.color.b < 0.5
    );
  });
}

describe('SyntyHexWall spaceTheme (rpg-dnd5e-web#558 real-route theme consumption)', () => {
  it('spaceTheme="crypt" tints a solid wall segment even with no themeWallHexKeys at all — the real-route case, where there is no per-hex demo mix to opt in via', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[wall(WallKind.SOLID)]}
        hexSize={1}
        spaceTheme="crypt"
      />
    );
    expect(findTintedMeshes(renderer).length).toBeGreaterThan(0);
  });

  it('no spaceTheme and no themeWallHexKeys renders untinted — byte-identical to pre-#558 behavior for every real dungeon wall today', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall walls={[wall(WallKind.SOLID)]} hexSize={1} />
    );
    expect(findTintedMeshes(renderer)).toEqual([]);
  });

  it('spaceTheme="crypt" themes EVERY wall hex, not just ones named in themeWallHexKeys — multiple independent walls all tint', async () => {
    const secondWall = {
      from: { x: 5, y: -5, z: 0 },
      to: { x: 6, y: -6, z: 0 },
      kind: WallKind.SOLID,
    } as Wall;
    const walls = [wall(WallKind.SOLID), secondWall];
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall walls={walls} hexSize={1} spaceTheme="crypt" />
    );
    // One tinted mesh per wall segment (2 walls -> 2 segments -> 2 tints).
    expect(findTintedMeshes(renderer).length).toBe(2);
  });

  it('spaceTheme is additive with themeWallHexKeys, not a replacement — a hex named in themeWallHexKeys still themes when spaceTheme is absent (the ?cryptdemo=1 harness path keeps working)', async () => {
    const solidWall = wall(WallKind.SOLID);
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[solidWall]}
        hexSize={1}
        themeWallHexKeys={new Set(['0,0,0'])}
      />
    );
    expect(findTintedMeshes(renderer).length).toBeGreaterThan(0);
  });
});

describe('doorFrameScale / doorLeafScale (rpg-project#132 follow-up, Kirk\'s verdict walking the tall-wall default: "at tall walls the door is really really high" — door height must target wallHeight DIRECTLY, not multiply a ratio onto the door\'s own legacy baseline)', () => {
  // SM_Env_Door_Frame_01's own measured raw height at scale=1 (Box3
  // read — see doorFrameScale's own doc comment for the measurement
  // provenance; same convention as wallVariantScale's tests hardcoding
  // WALL_VARIANTS' own known raw dimensions rather than importing a
  // private module constant).
  const DOOR_FRAME_RAW_HEIGHT = 2.5347;

  it("targets wallHeight directly: frame height scale * its own raw height equals wallHeight almost exactly (the frame's top edge lands at the wall height, no ratio compounding)", () => {
    const wallHeight = 2.4;
    const [, sy] = doorFrameScale(wallHeight);
    expect(sy * DOOR_FRAME_RAW_HEIGHT).toBeCloseTo(wallHeight, 5);
  });

  it("the leaf scales by the SAME per-height-unit factor as the frame (not its own raw height) — preserves the leaf's authored ~97% proportion within the frame at any wallHeight", () => {
    const wallHeight = 2.4;
    const [, frameSy] = doorFrameScale(wallHeight);
    const [, leafSy] = doorLeafScale(wallHeight);
    expect(leafSy).toBeCloseTo(frameSy, 9);
  });

  it('scaling is linear in wallHeight — doubling wallHeight exactly doubles the height scale for both pieces, proving a direct target rather than a ratio against a fixed baseline', () => {
    const [, sy1] = doorFrameScale(1.2);
    const [, sy2] = doorFrameScale(2.4);
    expect(sy2).toBeCloseTo(sy1 * 2, 9);
    const [, leafSy1] = doorLeafScale(1.2);
    const [, leafSy2] = doorLeafScale(2.4);
    expect(leafSy2).toBeCloseTo(leafSy1 * 2, 9);
  });

  it('leaves width/depth (X/Z) untouched regardless of wallHeight — only height tracks the wall now', () => {
    const frameLow = doorFrameScale(0.8);
    const frameHigh = doorFrameScale(12.4);
    expect(frameLow[0]).toBe(frameHigh[0]);
    expect(frameLow[2]).toBe(frameHigh[2]);
    const leafLow = doorLeafScale(0.8);
    const leafHigh = doorLeafScale(12.4);
    expect(leafLow[0]).toBe(leafHigh[0]);
    expect(leafLow[2]).toBe(leafHigh[2]);
  });

  it('does NOT compound the door\'s old oversized-relative-to-0.8 baseline — at the OLD default (WALL_HEIGHT was 0.8), frame height scale is far below the historical flat SYNTY_SCALE, proving this is no longer "SYNTY_SCALE times a ratio"', () => {
    const [, sy] = doorFrameScale(0.8);
    // Old formula would have been exactly SYNTY_SCALE (0.75) at the old
    // default; the new formula targets 0.8 directly against the frame's
    // own ~2.53 raw height instead, landing well under that.
    expect(sy).toBeLessThan(SYNTY_SCALE);
  });
});

describe('SyntyHexWall wallHeight prop (rpg-project#132 wall-height dial)', () => {
  it('renders without error at a taller wallHeight override (smoke test — scale is baked into GlbInstance geometry, not exposed as a scene-graph prop, so the door/wall/fitting scale contract is covered by the doorFrameScale/doorLeafScale + wallVariantScale/fittingScale unit tests instead)', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[
          wall(WallKind.DOOR_CLOSED, 'door-1'),
          wall(WallKind.SOLID, undefined),
        ]}
        hexSize={1}
        wallHeight={1.5}
      />
    );
    expect(renderer.scene.children.length).toBeGreaterThan(0);
  });

  it('defaults to calibrationConstants.WALL_HEIGHT when omitted — byte-identical to every caller before this prop existed', async () => {
    const withDefault = await ReactThreeTestRenderer.create(
      <SyntyHexWall walls={[wall(WallKind.SOLID, undefined)]} hexSize={1} />
    );
    const withExplicitDefault = await ReactThreeTestRenderer.create(
      <SyntyHexWall
        walls={[wall(WallKind.SOLID, undefined)]}
        hexSize={1}
        wallHeight={WALL_HEIGHT}
      />
    );
    expect(allRotationYs(withDefault)).toEqual(
      allRotationYs(withExplicitDefault)
    );
  });
});
