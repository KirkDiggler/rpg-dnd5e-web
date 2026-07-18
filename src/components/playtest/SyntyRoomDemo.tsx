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
 * rendering — see rpg-dnd5e-web#466. WALL_HEIGHT/SYNTY_SCALE/HEX_SIZE come
 * from the shared `rendering/calibrationConstants` + `hex-grid/hexMath`
 * homes (rpg-dnd5e-web#432 harness-parity — previously three independent
 * re-declarations); the game's wall/floor/door RENDERING components
 * (ShadedHexWall, HexDoor, ShadedHexFloor, WallBuilder) are still never
 * imported/modified here.
 *
 * The GLBs/textures live in public/models/synty/ which is gitignored —
 * Synty's license allows shipping them in the built game but not
 * redistributing them as files via a public repo.
 */

import { useGLTF, useTexture } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';

import { SYNTY_SCALE, WALL_HEIGHT } from '../../rendering/calibrationConstants';
import {
  coordToKey,
  cubeToWorld,
  HEX_DIRECTIONS,
  HEX_SIZE,
  type CubeCoord,
  type WorldPos,
} from '../hex-grid/hexMath';

const SYNTY_BASE = '/models/synty/';
const ENV_BASE = SYNTY_BASE + 'env/';
const TEX_BASE = SYNTY_BASE + 'textures/';

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

/** The 6 corners of a pointy-top hex, matching ShadedHexFloor's shape
 * construction (angle = 30 + 60*i degrees, then rotateX(-90deg) maps the
 * shape's local y to world -z). */
function hexCorners(center: WorldPos, size: number): WorldPos[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = ((30 + 60 * i) * Math.PI) / 180;
    return {
      x: center.x + size * Math.cos(angle),
      z: center.z - size * Math.sin(angle),
    };
  });
}

interface BorderEdge {
  hex: CubeCoord;
  neighbor: CubeCoord;
  a: WorldPos;
  b: WorldPos;
  mid: WorldPos;
  rotationY: number;
}

/** Every edge of every room hex that faces a hex outside the room. Found
 * geometrically (nearest corner-pair to the hex/neighbor edge midpoint)
 * rather than a hand-derived direction→corner-index table, so it stays
 * correct regardless of hex orientation conventions. */
function computeBorderEdges(): BorderEdge[] {
  const edges: BorderEdge[] = [];
  for (const hex of ROOM_HEXES) {
    const hexWorld = cubeToWorld(hex, HEX_SIZE);
    const corners = hexCorners(hexWorld, HEX_SIZE);
    for (const dir of HEX_DIRECTIONS) {
      const neighbor: CubeCoord = {
        x: hex.x + dir.x,
        y: hex.y + dir.y,
        z: hex.z + dir.z,
      };
      if (ROOM_SET.has(coordToKey(neighbor))) continue; // interior edge

      const neighborWorld = cubeToWorld(neighbor, HEX_SIZE);
      const edgeMid: WorldPos = {
        x: (hexWorld.x + neighborWorld.x) / 2,
        z: (hexWorld.z + neighborWorld.z) / 2,
      };

      let bestIndex = 0;
      let bestDist = Infinity;
      for (let i = 0; i < 6; i++) {
        const c1 = corners[i];
        const c2 = corners[(i + 1) % 6];
        const mid = { x: (c1.x + c2.x) / 2, z: (c1.z + c2.z) / 2 };
        const dist = (mid.x - edgeMid.x) ** 2 + (mid.z - edgeMid.z) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
        }
      }

      const a = corners[bestIndex];
      const b = corners[(bestIndex + 1) % 6];
      // Local +X of the env pieces is their width axis. A Y rotation by θ
      // sends local X (1,0,0) to world (cosθ, 0, -sinθ), so solving
      // cosθ = ux, -sinθ = uz gives the θ that lines +X up with edge a→b.
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const rotationY = Math.atan2(-dz, dx);

      edges.push({ hex, neighbor, a, b, mid: edgeMid, rotationY });
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
    for (let i = 0; i < 6; i++) {
      const angle = ((30 + 60 * i) * Math.PI) / 180;
      const x = HEX_SIZE * Math.cos(angle);
      const y = HEX_SIZE * Math.sin(angle);
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
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
