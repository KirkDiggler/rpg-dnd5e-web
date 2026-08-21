/**
 * AtlasWalls — one edge-aligned Synty wall piece per DECLARED atlas
 * boundary, one door frame+leaf per declared doorway. The 3D counterpart
 * of `atlas.ts`'s SVG wall/doorway rendering in `SessionTombConcept.tsx`.
 *
 * Deliberately NOT `SyntyHexWall`: that component's prop type (`walls:
 * Wall[]`) is the OLD v1alpha2 `EncounterService` shape, and its
 * `buildDungeonWallSegments` derives edges from wall-hex-set MEMBERSHIP —
 * the algorithm that exists because the old wire had no walls at all. The
 * new atlas already says exactly where every wall and doorway is
 * (`AtlasBoundary`/`AtlasDoorway`, rpg-toolkit#1130), so this component
 * does no derivation: it places one `GlbInstance` per `WallEdgePiece`/
 * `DoorEdgePiece` (`atlasToScene3D.ts`) directly, reusing only the
 * PURE placement math (`selectWallVariant`, `wallVariantScale`,
 * `doorFrameScale`/`doorLeafScale`, `GlbInstance` itself) that has no
 * dependency on the old wire's shape.
 *
 * Slice 1 scope: every boundary renders the same way regardless of its
 * `blocksMovement`/`blocksLineOfSight` flags (the reference tomb has no
 * windows), and doors render in their closed pose with no click handler —
 * `SessionService` (v0.1.128) has no `Interact`-equivalent verb at all
 * (fourteen RPCs: Join/Exit/Move/Attack/Turn/EndTurn/Dissolve/End/
 * GetStatus/GetStory/GetView/GetWhere/GetAtlas/StreamEvents — no door/prop
 * interaction verb among them), noted alongside the missing `Answer` RPC
 * finding on rpg-api-protos#232. Both the flags and the click handler are
 * natural follow-up slices once there's a real case (and a verb) to test
 * them against.
 */

import { SYNTY_SCALE, WALL_HEIGHT } from '@/rendering/calibrationConstants';
import { GlbInstance } from '../hex-grid/GlbInstance';
import {
  DOOR_FRAME_FILE,
  DOOR_LEAF_FILE,
  doorFrameScale,
  doorLeafScale,
  selectWallVariant,
  wallVariantScale,
} from '../hex-grid/syntyHexWallHelpers';
import type { DoorEdgePiece, WallEdgePiece } from './atlasToScene3D';

export interface AtlasWallsProps {
  walls: WallEdgePiece[];
  doors: DoorEdgePiece[];
  /** Defaults to the game's standard wall height so this renders at the
   * same scale as every other wall in the game, unless a caller has a
   * reason to override it (matches SyntyHexWall's own `wallHeight` prop
   * convention). */
  wallHeight?: number;
}

export function AtlasWalls({
  walls,
  doors,
  wallHeight = WALL_HEIGHT,
}: AtlasWallsProps) {
  return (
    <>
      {walls.map((wall) => {
        const variant = selectWallVariant(wall.key);
        return (
          <GlbInstance
            key={wall.key}
            file={variant.file}
            position={wall.edge.a}
            rotationY={wall.edge.rotationY}
            scale={wallVariantScale(variant, wallHeight, SYNTY_SCALE)}
          />
        );
      })}
      {doors.map((door) => (
        <group key={door.key}>
          <GlbInstance
            file={DOOR_FRAME_FILE}
            position={door.edge.mid}
            rotationY={door.edge.rotationY}
            scale={doorFrameScale(wallHeight)}
          />
          <GlbInstance
            file={DOOR_LEAF_FILE}
            position={door.edge.a}
            rotationY={door.edge.rotationY}
            scale={doorLeafScale(wallHeight)}
          />
        </group>
      ))}
    </>
  );
}
