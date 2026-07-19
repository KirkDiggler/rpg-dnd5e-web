/**
 * SyntyRoomDemo — dev-only reference implementation for real dungeon
 * rendering. Rendered as HexGrid children when the harness URL has
 * `&syntyroom=1` (independent of the `&synty=1` character/prop showcase —
 * wired the same way in PlaytestMap).
 *
 * Builds a small 7-hex room (center + ring-1) out of Synty modular env
 * pieces: a wall segment per border edge, one edge swapped for a framed
 * door, and textured hex floor tiles (plus a couple of darkened "frontier"
 * hexes beyond the door — a fog-of-war edge prototype).
 *
 * This is the calibration surface the game dev lifts for real dungeon
 * rendering — see rpg-dnd5e-web#466. Game components (ShadedHexWall,
 * HexDoor, ShadedHexFloor, WallBuilder) are read here for constants only
 * and are never imported/modified.
 *
 * The GLBs/textures live in public/models/synty/ which is gitignored —
 * Synty's license allows shipping them in the built game but not
 * redistributing them as files via a public repo.
 */

import { useGLTF, useTexture } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';

import {
  coordToKey,
  cubeToWorld,
  HEX_DIRECTIONS,
  hexCorners,
  hexEdgeBetween,
  type CubeCoord,
  type WorldPos,
} from '../hex-grid/hexMath';

const SYNTY_BASE = '/models/synty/';
const ENV_BASE = SYNTY_BASE + 'env/';
const TEX_BASE = SYNTY_BASE + 'textures/';

// Matches HEX_SIZE in HexGrid.tsx / hexMath usage elsewhere (not exported).
const HEX_SIZE = 1.0;

// Matches WALL_HEIGHT in ShadedHexWall.tsx (world-space wall height used
// by the existing game wall rendering / WallBuilder).
const WALL_HEIGHT = 0.8;

// Same uniform scale SyntyShowcase uses to land Synty's meter-scale assets
// next to the game's ~1.5-unit-tall characters on HEX_SIZE=1 hexes.
const SYNTY_SCALE = 0.75;

// Raw (scale=1) local-space bounding sizes measured directly off the GLBs
// with @gltf-transform/core (see PR description for the inspection
// script/output). Local X = width, Y = height, Z = thickness/depth for all
// four pieces below.
const WALL_HALF_RAW_WIDTH = 2.672; // SM_Env_Wall_Half_01
const WALL_HALF_RAW_HEIGHT = 5.102;
const DOOR_FRAME_RAW_WIDTH = 1.999; // SM_Env_Door_Frame_01 (pivot centered)

// Non-uniform wall calibration: squeeze width to exactly one hex edge,
// scale height to match the existing game wall height, and use the same
// SYNTY_SCALE for thickness (per task spec: "thickness at 0.75").
const WALL_SCALE: [number, number, number] = [
  HEX_SIZE / WALL_HALF_RAW_WIDTH,
  WALL_HEIGHT / WALL_HALF_RAW_HEIGHT,
  SYNTY_SCALE,
];

// Door frame: squeeze width to the edge like the wall, but keep height/depth
// at SYNTY_SCALE (the door is a human-scale feature, not clamped to the
// short game wall height — it needs to actually read as a doorway).
const DOOR_FRAME_SCALE: [number, number, number] = [
  HEX_SIZE / DOOR_FRAME_RAW_WIDTH,
  SYNTY_SCALE,
  SYNTY_SCALE,
];

// SM_Env_Door_01 is 1.3236 wide at scale 1 (pivot at one end, like the wall
// piece) — 1.3236 * 0.75 = 0.9927, a near-perfect fit against a 1.0 edge
// with no extra squeeze needed.
const DOOR_SCALE = SYNTY_SCALE;

const ROOM_CENTER: CubeCoord = { x: 0, y: 0, z: 0 };
const ROOM_HEXES: CubeCoord[] = [ROOM_CENTER, ...HEX_DIRECTIONS];
const ROOM_SET = new Set(ROOM_HEXES.map(coordToKey));

// The door replaces the outward-facing border edge of ring hex (1,-1,0) —
// its neighbor in the same (E) direction, i.e. the most radially-outward
// edge of that hex. Two hexes beyond it are "frontier" — revealed geometry
// with no light reaching it yet (fog-edge prototype).
const DOOR_HEX: CubeCoord = { x: 1, y: -1, z: 0 };
const DOOR_NEIGHBOR: CubeCoord = { x: 2, y: -2, z: 0 };
const FRONTIER_HEXES: CubeCoord[] = [
  { x: 2, y: -2, z: 0 },
  { x: 3, y: -3, z: 0 },
];

// HexGrid's own single-tile fallback floor (ShadedHexFloor, seeded at the
// player's fallback position, i.e. our room's center hex) extrudes 0.1
// units and translates +0.05, landing its top face at world Y=0.15 — sit
// above that so our textured tile doesn't lose the depth test to it there.
const FLOOR_Y = 0.2;

interface BorderEdge {
  hex: CubeCoord;
  neighbor: CubeCoord;
  a: WorldPos;
  b: WorldPos;
  mid: WorldPos;
  rotationY: number;
}

/** Every edge of every room hex that faces a hex outside the room, using
 * the shared `hexEdgeBetween` (hexMath.ts) — extracted from this file's
 * original hand-rolled corner-finding loop and generalized for
 * rpg-dnd5e-web#432's harness-parity gate (deduped back onto the shared
 * primitive here, so this demo and the real dungeon-rendering path
 * (SyntyHexWall.tsx) share one implementation instead of two copies). */
function computeBorderEdges(): BorderEdge[] {
  const edges: BorderEdge[] = [];
  for (const hex of ROOM_HEXES) {
    for (const dir of HEX_DIRECTIONS) {
      const neighbor: CubeCoord = {
        x: hex.x + dir.x,
        y: hex.y + dir.y,
        z: hex.z + dir.z,
      };
      if (ROOM_SET.has(coordToKey(neighbor))) continue; // interior edge
      const { a, b, mid, rotationY } = hexEdgeBetween(hex, neighbor, HEX_SIZE);
      edges.push({ hex, neighbor, a, b, mid, rotationY });
    }
  }
  return edges;
}

function isDoorEdge(edge: BorderEdge): boolean {
  return (
    edge.hex.x === DOOR_HEX.x &&
    edge.hex.y === DOOR_HEX.y &&
    edge.hex.z === DOOR_HEX.z &&
    edge.neighbor.x === DOOR_NEIGHBOR.x &&
    edge.neighbor.y === DOOR_NEIGHBOR.y &&
    edge.neighbor.z === DOOR_NEIGHBOR.z
  );
}

interface GlbInstanceProps {
  file: string;
  position: WorldPos;
  rotationY: number;
  scale: [number, number, number] | number;
}

/** Renders one instance of a GLB. useGLTF caches the loaded scene by URL,
 * so repeated placements of the same file (17 wall segments here) must each
 * clone the cached Object3D — reusing the same instance across multiple
 * `<primitive>`s would just reparent it to the last placement. */
function GlbInstance({ file, position, rotationY, scale }: GlbInstanceProps) {
  const { scene } = useGLTF(ENV_BASE + file);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  return (
    <primitive
      object={cloned}
      position={[position.x, 0, position.z]}
      rotation={[0, rotationY, 0]}
      scale={scale}
    />
  );
}

function RoomWalls() {
  const edges = useMemo(() => computeBorderEdges(), []);
  return (
    <>
      {edges.map((edge) => {
        const key = `${coordToKey(edge.hex)}->${coordToKey(edge.neighbor)}`;
        if (isDoorEdge(edge)) {
          return (
            <group key={key}>
              <GlbInstance
                file="SM_Env_Door_Frame_01.glb"
                position={edge.mid}
                rotationY={edge.rotationY}
                scale={DOOR_FRAME_SCALE}
              />
              <GlbInstance
                file="SM_Env_Door_01.glb"
                position={edge.a}
                rotationY={edge.rotationY}
                scale={DOOR_SCALE}
              />
            </group>
          );
        }
        return (
          <GlbInstance
            key={key}
            file="SM_Env_Wall_Half_01.glb"
            position={edge.a}
            rotationY={edge.rotationY}
            scale={WALL_SCALE}
          />
        );
      })}
    </>
  );
}

interface HexFloorTileProps {
  hex: CubeCoord;
  texture: THREE.Texture;
  darken?: boolean;
}

/** Flat hex floor mesh, one texture tile per hex. Uses ShapeGeometry (not
 * extruded, like ShadedHexFloor's game-floor tiles) — this is a visual
 * reference layer, not the game floor. */
function HexFloorTile({ hex, texture, darken }: HexFloorTileProps) {
  const world = cubeToWorld(hex, HEX_SIZE);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    // hexCorners' z applies the world-space z = -sin(angle) convention (for
    // alignment with cubeToWorld) — negate it here to land back on this
    // shape's local y = +size*sin(angle), the CCW winding that keeps the
    // face normal pointing toward the overhead camera post-rotateX
    // (rpg-dnd5e-web#432's harness-parity gate — SyntyHexFloor.tsx hit this
    // exact sign trap when it started consuming hexCorners directly).
    const corners = hexCorners({ x: 0, z: 0 }, HEX_SIZE);
    corners.forEach((c, i) => {
      if (i === 0) shape.moveTo(c.x, -c.z);
      else shape.lineTo(c.x, -c.z);
    });
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);

    // THREE.ShapeGeometry's default UVs are the shape's raw local
    // coordinates, NOT normalized to [0,1] — for a hex centered on the
    // origin (local x,y roughly in [-1,1]) that puts most of the shape's
    // UVs outside the texture, clamping to a single dark edge texel and
    // leaving only a sliver near the (0,0)-(1,1) corner showing real
    // texture. Remap to [0,1] against the hex's own bounding box so the
    // whole texture tiles across the whole hex.
    const pos = geo.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) + HEX_SIZE) / (2 * HEX_SIZE);
      uv[i * 2 + 1] = (pos.getY(i) + HEX_SIZE) / (2 * HEX_SIZE);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

    // Match hexCorners' world mapping (rotateX(-90deg): local y -> world -z)
    // and keep the face normal pointing +Y (up) so it isn't backface-culled
    // from the camera's overhead angle.
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  return (
    <mesh
      geometry={geometry}
      position={[world.x, FLOOR_Y, world.z]}
      rotation={[0, 0, 0]}
    >
      <meshStandardMaterial
        map={texture}
        color={darken ? new THREE.Color(0.35, 0.35, 0.35) : 0xffffff}
      />
    </mesh>
  );
}

function RoomFloors() {
  // useTexture returns drei's shared, URL-keyed texture cache — mutating it
  // directly (wrapS/wrapT/repeat) during render is a render-phase side
  // effect that leaks into every other consumer of the same URL. Clone it
  // per-use and configure the clone instead.
  const baseMap = useTexture(TEX_BASE + 'Dungeons_Texture_FloorTiles_01.png');
  const floorMap = useMemo(() => {
    // Dungeons_Texture_FloorTiles_01.png is a multi-pattern trim sheet, not
    // a single repeatable tile — stretching the whole 2048px sheet across
    // one hex (repeat 1x1) reads as a busy, un-floor-like collage. Repeating
    // it breaks that up into a denser, more even stone-tile texture per hex.
    const t = baseMap.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    t.needsUpdate = true;
    return t;
  }, [baseMap]);

  // Clone is owned by this component instance — dispose it on unmount so we
  // don't leak a GPU texture per mount (the shared base from useTexture's
  // cache is left untouched and disposed by drei itself).
  useEffect(() => {
    return () => floorMap.dispose();
  }, [floorMap]);

  return (
    <>
      {ROOM_HEXES.map((hex) => (
        <HexFloorTile key={coordToKey(hex)} hex={hex} texture={floorMap} />
      ))}
      {FRONTIER_HEXES.map((hex) => (
        <HexFloorTile
          key={coordToKey(hex)}
          hex={hex}
          texture={floorMap}
          darken
        />
      ))}
    </>
  );
}

export function SyntyRoomDemo() {
  return (
    <Suspense fallback={null}>
      <RoomFloors />
      <RoomWalls />
    </Suspense>
  );
}
