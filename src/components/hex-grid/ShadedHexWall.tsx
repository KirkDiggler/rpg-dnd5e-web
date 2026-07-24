/**
 * ShadedHexWall - Visual component for wall segments using WallBuilder
 *
 * Drop-in replacement for HexWall that uses WallBuilder with AdvancedCharacterShader
 * for auto-shaded voxel-style walls instead of plain MeshStandardMaterial pillars.
 *
 * Creates wall meshes between start and end positions using WallBuilder.createWallBetween,
 * converting cube coordinates to world coordinates via hexMath.cubeToWorld.
 */

import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import { WALL_HEIGHT } from '@/rendering/calibrationConstants';
import { WallBuilder, WallColors } from '@/rendering/WallBuilder';

import { cubeToWorld, getHexLine, type CubeCoord } from './hexMath';
import { isDoorWallKind } from './syntyHexWallHelpers';

export interface ShadedHexWallProps {
  wall: Wall;
  hexSize: number;
  /** Fired with the door's Wall.id (rpg-api-protos#186) when a DOOR_* wall
   * is clicked — fallback-renderer parity with SyntyHexWall's click surface
   * (rpg-dnd5e-web#526, wave rpg-project#96 Slice 2). No-op when the wall
   * carries no id. */
  onDoorClick?: (doorId: string) => void;
}

// Color lookup by wall kind. v1alpha2 Wall carries no material field (the
// v1alpha1 room_common Wall this replaced did) — kind is the only semantic
// hook available today. DOOR_OPEN gets a lighter shade than DOOR_CLOSED so
// the two poses are visually distinguishable (rpg-dnd5e-web#526) even in
// this ErrorBoundary/`?syntyDungeon=0` fallback path.
function getKindColor(kind: WallKind): number {
  switch (kind) {
    case WallKind.DOOR_CLOSED:
      return WallColors.woodMedium;
    case WallKind.DOOR_LOCKED:
      return 0x4a3c35;
    case WallKind.DOOR_OPEN:
      return WallColors.woodLight;
    case WallKind.WINDOW:
      return WallColors.dungeonGray;
    case WallKind.SOLID:
    case WallKind.UNSPECIFIED:
    default:
      return WallColors.stoneMedium;
  }
}

export function ShadedHexWall({
  wall,
  hexSize,
  onDoorClick,
}: ShadedHexWallProps) {
  const { invalidate } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const builderRef = useRef<WallBuilder | null>(null);

  useEffect(() => {
    if (!groupRef.current || !wall.from || !wall.to) return;

    const start: CubeCoord = {
      x: wall.from.x,
      y: wall.from.y,
      z: wall.from.z,
    };
    const end: CubeCoord = {
      x: wall.to.x,
      y: wall.to.y,
      z: wall.to.z,
    };

    const color = getKindColor(wall.kind);
    const isDoor = isDoorWallKind(wall.kind);
    const isRealPassageEdge =
      isDoor && !(start.x === end.x && start.y === end.y && start.z === end.z);

    // WallBuilder thickness is relative to hexWidth, so set hexWidth = hexSize * 2
    // (hexWidth in WallBuilder means the full width, hexSize is the radius)
    const builder = new WallBuilder({
      hexWidth: hexSize * 2,
      wallThicknessRatio: 0.1,
      color,
      shadingVariance: 0.15,
    });
    builderRef.current = builder;

    const group = groupRef.current;

    // Doors with a real (from!==to) passage edge (design doc §Q2, mirrors
    // syntyHexWallHelpers.ts's identical fix): render ONLY at `from` (the
    // door's own cell) — `to` names the passage neighbor, real floor in the
    // next chamber, not a second wall cell. The generic "pillar at every
    // hex along the line" path below would otherwise stack a phantom
    // pillar onto that floor cell. DOOR_OPEN gets a low, thin marker
    // instead of the full barrier — a placeholder-acceptable state flip
    // (asset lane, web#523, owns final open-pose art).
    if (isRealPassageEdge) {
      const pos = cubeToWorld(start, hexSize);
      const anchor = new THREE.Vector3(pos.x, 0, pos.z);
      const piece =
        wall.kind === WallKind.DOOR_OPEN
          ? builder.createPillar(anchor, WALL_HEIGHT * 0.15, { color })
          : builder.createSolidHex(anchor, WALL_HEIGHT, { color });
      group.add(piece);
      invalidate();
      return () => {
        while (group.children.length > 0) {
          const child = group.children[0];
          group.remove(child);
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
          }
        }
        builder.dispose();
        builderRef.current = null;
      };
    }

    // Get all hex positions along the wall line
    const hexPositions = getHexLine(start, end);

    // Create wall segments between consecutive hex positions
    for (let i = 0; i < hexPositions.length - 1; i++) {
      const posA = cubeToWorld(hexPositions[i], hexSize);
      const posB = cubeToWorld(hexPositions[i + 1], hexSize);

      const anchorA = new THREE.Vector3(posA.x, 0, posA.z);
      const anchorB = new THREE.Vector3(posB.x, 0, posB.z);

      const wallMesh = builder.createWallBetween(
        anchorA,
        anchorB,
        WALL_HEIGHT,
        { color }
      );
      group.add(wallMesh);
    }

    if (hexPositions.length === 1) {
      // Single-cell wall (from === to): a thin createPillar reads as a
      // near-invisible sliver against the floor. Render a solid
      // hex-footprint mesh instead so the whole cell is unmistakably
      // blocked terrain.
      const pos = cubeToWorld(hexPositions[0], hexSize);
      const solidHex = builder.createSolidHex(
        new THREE.Vector3(pos.x, 0, pos.z),
        WALL_HEIGHT,
        { color }
      );
      group.add(solidHex);
    } else {
      // Multi-cell wall: add corner pillars at each hex position along the
      // line, for visual consistency between adjacent wall segments.
      for (const hexPos of hexPositions) {
        const pos = cubeToWorld(hexPos, hexSize);
        const pillar = builder.createPillar(
          new THREE.Vector3(pos.x, 0, pos.z),
          WALL_HEIGHT,
          { color }
        );
        group.add(pillar);
      }
    }

    invalidate();

    return () => {
      // Remove all children from group
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      }
      builder.dispose();
      builderRef.current = null;
    };
  }, [wall, hexSize, invalidate]);

  const isDoor = isDoorWallKind(wall.kind);

  // Copilot review on #549: the click/hover handlers (and their
  // stopPropagation) must only attach for DOOR_* walls. A plain <group
  // ref={groupRef} /> with no handlers — same as every non-door wall
  // rendered before this PR — leaves SOLID/WINDOW/UNSPECIFIED walls'
  // click/hover behavior completely unchanged; only a door's own group
  // intercepts and forwards the click.
  if (!isDoor) {
    return <group ref={groupRef} />;
  }

  return (
    <group
      ref={groupRef}
      onClick={(e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        if (wall.id) onDoorClick?.(wall.id);
      }}
      onPointerOver={(e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        if (wall.id) document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    />
  );
}
