/**
 * SyntyHexFloor — real-dungeon-rendering floor renderer, gated behind
 * HexGrid's `syntyDungeon` dev flag (rpg-dnd5e-web#432 harness-parity).
 * Renders the SAME real `floorTiles` map ShadedHexFloor already consumes
 * (from `synthesizeFloorTiles` — no new reveal concept, no fixed room set)
 * with a Synty stone-tile texture per hex instead of ShadedHexFloor's
 * procedural extruded material.
 *
 * Lifted from SyntyRoomDemo.tsx's `HexFloorTile`/`RoomFloors` (PR #472),
 * generalized from "a fixed 7-hex room" to "every tile in the real
 * floorTiles map". Deliberately drops SyntyRoomDemo's ad-hoc `darken`
 * frontier prop and FRONTIER_HEXES set — fog-edge dimming stays exactly
 * the existing FrontierGroundHint mechanism (rpg-dnd5e-web#457), which
 * HexGrid already renders independently of which floor renderer is active.
 *
 * Known MVP limitation: one `<mesh>` per tile (matching the demo), not
 * ShadedHexFloor's InstancedMesh — fine at this wave's single-room scale,
 * a perf pass if/when this graduates past the dev flag. No hover/select
 * tint either (ShadedHexFloor's HIGHLIGHT_COLORS) — PathPreview and
 * MovementRangeBorder already overlay movement feedback on top of the
 * floor, so this is deliberately floor-texture-only.
 */

import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import { useTexture } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { cubeToWorld, hexCorners } from './hexMath';

const TEX_BASE = '/models/synty/textures/';
const FLOOR_TEXTURE = TEX_BASE + 'Dungeons_Texture_FloorTiles_01.png';

// Sits above ShadedHexFloor's extruded top (0.05-0.15) so the two never
// z-fight if both are ever mounted at once during a toggle transition.
const FLOOR_Y = 0.2;

interface SyntyHexFloorTileProps {
  tile: AbsoluteFloorTile;
  hexSize: number;
  texture: THREE.Texture;
}

function SyntyHexFloorTile({ tile, hexSize, texture }: SyntyHexFloorTileProps) {
  const world = cubeToWorld({ x: tile.x, y: tile.y, z: tile.z }, hexSize);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const corners = hexCorners({ x: 0, z: 0 }, hexSize);
    // hexCorners' z already applies the world-space z = -sin(angle)
    // convention (for alignment with cubeToWorld) — feeding it straight
    // into the shape's local Y would wind the 2D shape clockwise (Copilot
    // review #477), flipping the face normal away from the overhead
    // camera post-rotateX. Negate it to restore the CCW winding
    // SyntyRoomDemo's original HexFloorTile (and ShadedHexFloor) use:
    // local y = +size*sin(angle), which rotateX(-90deg) then maps to
    // world -z, matching cubeToWorld's convention on the OTHER axis.
    corners.forEach((c, i) => {
      if (i === 0) shape.moveTo(c.x, -c.z);
      else shape.lineTo(c.x, -c.z);
    });
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);

    // ShapeGeometry's default UVs are the shape's raw local coordinates,
    // not normalized to [0,1] — remap against the hex's own bounding box
    // so the texture tiles across the whole hex instead of clamping to a
    // single dark edge texel (see SyntyRoomDemo.tsx's HexFloorTile, which
    // this is lifted from).
    const pos = geo.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) + hexSize) / (2 * hexSize);
      uv[i * 2 + 1] = (pos.getY(i) + hexSize) / (2 * hexSize);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [hexSize]);

  return (
    <mesh geometry={geometry} position={[world.x, FLOOR_Y, world.z]}>
      {/* rpg-dnd5e-web#481: MeshStandardMaterial (PBR, lit) rendered this
          floor nearly invisible in the deployed environment — under the
          scene's ambientLight(0.6)/directionalLight(0.8) rig plus r3f's
          default ACES tone-mapping, a fully-rough unlit-by-comparison
          texture compresses down close to black, and Kirk's Discord webview
          frame was measurably darker than local dev frames of the same
          build (GPU/tone-mapping path difference, unconfirmed but real).
          ShadedHexFloor's cel-shader (FloorBuilder.getMaterial →
          AdvancedCharacterShader) reads fine in the same rig because it's
          a hand-tuned custom shader with its own guaranteed-bright output,
          not dependent on scene lights at all. MeshBasicMaterial matches
          that: fully unlit, renders the texture at a light-rig-independent
          brightness — the floor no longer needs the ambient/directional
          setup (or any given deployment's tone-mapping/GPU quirks) to be
          visibly correct. This is a code-side fix; if it still reads too
          flat once seen against real deployed lighting, a lighter floor
          texture variant is the asset-request fallback (#481). */}
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

export interface SyntyHexFloorProps {
  floorTiles: Map<string, AbsoluteFloorTile>;
  hexSize: number;
}

export function SyntyHexFloor({ floorTiles, hexSize }: SyntyHexFloorProps) {
  // useTexture returns drei's shared, URL-keyed texture cache — mutating it
  // directly during render is a render-phase side effect on shared state
  // (Copilot review on #472). Clone it and configure the clone instead.
  const baseMap = useTexture(FLOOR_TEXTURE);
  const floorMap = useMemo(() => {
    const t = baseMap.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    t.needsUpdate = true;
    return t;
  }, [baseMap]);

  useEffect(() => {
    return () => floorMap.dispose();
  }, [floorMap]);

  const tiles = useMemo(() => Array.from(floorTiles.values()), [floorTiles]);

  return (
    <Suspense fallback={null}>
      {tiles.map((tile) => (
        <SyntyHexFloorTile
          key={`${tile.x},${tile.y},${tile.z}`}
          tile={tile}
          hexSize={hexSize}
          texture={floorMap}
        />
      ))}
    </Suspense>
  );
}
