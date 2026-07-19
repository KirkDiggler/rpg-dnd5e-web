/**
 * SyntyHexWall — real-dungeon-rendering wall/door renderer, gated behind
 * HexGrid's `syntyDungeon` dev flag (rpg-dnd5e-web#432 harness-parity).
 * Renders the ENTIRE `walls: Wall[]` list HexGrid already has (unlike
 * ShadedHexWall, which mounts once per Wall — see below for why).
 *
 * The geometry mismatch this fixes: ShadedHexWall/WallBuilder.createWallBetween
 * places a box whose long axis runs from hex CENTER to hex CENTER
 * (perpendicular to the actual shared boundary, passing through both cell
 * interiors). SyntyRoomDemo.tsx's `computeBorderEdges` aligns a piece along
 * the actual shared EDGE instead — that's the primitive this component
 * uses, via the generalized `hexEdgeBetween` (hexMath.ts).
 *
 * Why this takes the full wall list, not one Wall at a time (a correction
 * made after checking real server data, not assumed): every `Wall` a real
 * encounter emits today is single-cell (`from === to`) — a wall is a
 * BLOCKED CELL, not a from/to boundary line. `buildDungeonWallSegments`
 * (syntyHexWallHelpers.ts) generalizes SyntyRoomDemo's `computeBorderEdges`
 * correctly for this: instead of "ROOM_SET membership" deciding which
 * edges are borders, "wall-hex-set membership" (built from ALL Wall
 * objects together, since a wall hex's neighbor often belongs to a
 * *different* Wall entry) does — a piece renders on every edge of every
 * wall hex that faces a NON-wall neighbor.
 *
 * Piece selection is intentionally minimal for this slice: ONE default
 * piece per WallKind (SOLID/UNSPECIFIED/WINDOW → wall segment,
 * DOOR_CLOSED/DOOR_OPEN → door + frame), matching ShadedHexWall's
 * `getKindColor` switch. Piece VARIETY (broken/alcove/archway walls,
 * multiple door styles) needs the piece→semantic-role manifest proposed on
 * rpg-dnd5e-web#469, which doesn't exist yet — out of scope here.
 */

import { SYNTY_SCALE, WALL_HEIGHT } from '@/rendering/calibrationConstants';
import type { Wall } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useGLTF } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import type { WorldPos } from './hexMath';
import { buildDungeonWallSegments, edgePieceKind } from './syntyHexWallHelpers';

const ENV_BASE = '/models/synty/env/';

// Raw (scale=1) local-space bounding sizes measured directly off the GLBs
// (see rpg-dnd5e-web#472's PR description for the inspection script/output).
// Local X = width, Y = height, Z = thickness/depth.
const WALL_HALF_RAW_WIDTH = 2.672; // SM_Env_Wall_Half_01
const WALL_HALF_RAW_HEIGHT = 5.102;
const DOOR_FRAME_RAW_WIDTH = 1.999; // SM_Env_Door_Frame_01 (pivot centered)

// Non-uniform wall calibration: squeeze width to exactly one hex edge,
// scale height to match the game's wall height, thickness at SYNTY_SCALE.
const WALL_SCALE: [number, number, number] = [
  1.0 / WALL_HALF_RAW_WIDTH,
  WALL_HEIGHT / WALL_HALF_RAW_HEIGHT,
  SYNTY_SCALE,
];

// Door frame: squeeze width to the edge like the wall, but keep
// height/depth at SYNTY_SCALE — a human-scale feature, not clamped to the
// short game wall height.
const DOOR_FRAME_SCALE: [number, number, number] = [
  1.0 / DOOR_FRAME_RAW_WIDTH,
  SYNTY_SCALE,
  SYNTY_SCALE,
];

// SM_Env_Door_01 is 1.3236 wide at scale 1 (pivot at one end, like the wall
// piece) — 1.3236 * 0.75 = 0.9927, a near-perfect fit against a 1.0 edge.
const DOOR_SCALE = SYNTY_SCALE;

interface GlbInstanceProps {
  file: string;
  position: WorldPos;
  rotationY: number;
  scale: [number, number, number] | number;
}

/** Renders one instance of a GLB. useGLTF caches the loaded scene by URL,
 * so repeated placements of the same file must each clone the cached
 * Object3D — reusing the same instance across multiple `<primitive>`s
 * would just reparent it to the last placement (SyntyRoomDemo.tsx). */
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

export interface SyntyHexWallProps {
  walls: Wall[];
  hexSize: number;
}

export function SyntyHexWall({ walls, hexSize }: SyntyHexWallProps) {
  const segments = useMemo(
    () => buildDungeonWallSegments(walls, hexSize),
    [walls, hexSize]
  );

  if (segments.length === 0) return null;

  return (
    <Suspense fallback={null}>
      {segments.map(({ key, edge, kind }) =>
        edgePieceKind(kind) === 'door' ? (
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
        ) : (
          <GlbInstance
            key={key}
            file="SM_Env_Wall_Half_01.glb"
            position={edge.a}
            rotationY={edge.rotationY}
            scale={WALL_SCALE}
          />
        )
      )}
    </Suspense>
  );
}
