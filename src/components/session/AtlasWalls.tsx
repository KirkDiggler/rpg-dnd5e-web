/**
 * AtlasWalls — one edge-aligned Synty wall piece per DECLARED atlas
 * boundary and IMPLICIT perimeter edge (`atlasToScene3D.buildScene3D`),
 * one door frame+leaf per declared doorway. The 3D counterpart of
 * `atlas.ts`'s SVG wall/doorway rendering in `SessionTombConcept.tsx`.
 *
 * Deliberately NOT `SyntyHexWall`: that component's prop type (`walls:
 * Wall[]`) is the OLD v1alpha2 `EncounterService` shape, and its
 * `buildDungeonWallSegments` derives edges from wall-hex-set MEMBERSHIP —
 * the algorithm that exists because the old wire had no walls at all. The
 * new atlas already says exactly where every interior wall and doorway is
 * (`AtlasBoundary`/`AtlasDoorway`, rpg-toolkit#1130), and the outer
 * perimeter is a fact of `atlas.cells` membership (see atlasToScene3D.ts's
 * module doc comment), so this component does no room/zone derivation: it
 * places one `GlbInstance` per `WallEdgePiece`/`DoorEdgePiece` directly,
 * reusing only the PURE placement math (`wallVariantScale`,
 * `doorFrameScale`/`doorLeafScale`, `GlbInstance` itself) that has no
 * dependency on the old wire's shape.
 *
 * # Every wall piece is the SAME plain variant — not `selectWallVariant`
 *
 * `SyntyHexWall`'s `selectWallVariant` weights a wall-hex-set edge toward
 * a 3-GLB pool (plain/broken/alcove, ~60/20/20) for visual rubble variety
 * across a WHOLE dungeon's worth of walls. Found live (PR #764 review,
 * Kirk walking the real route): applied to a single 14-edge SEAM, that
 * pool's per-edge independence has a real chance of landing 'alcove'
 * (a recessed nook with a distinctly peaked, non-flat silhouette) and
 * 'broken' (a deliberately gap-toothed damaged-masonry model) two or three
 * edges in a row — which reads as a broken, discontinuous wall with real
 * visual gaps, not "rubble variety." Both pieces are correctly anchored
 * (verified: 28/28 declared+perimeter edges present, unique React keys, no
 * position collisions, runtime props matching the computed geometry
 * exactly) — the defect was never geometry, only which GLB got picked.
 * Every piece here uses `WALL_VARIANTS[0]` ('plain', a flat panel)
 * directly instead. Variety is a real follow-up (with a pool WEIGHTED and
 * VERIFIED for a short deliberate seam, not borrowed wholesale from the
 * old wire's dense per-cell dungeon), not something to re-guess now.
 *
 * Slice 1 scope: every boundary/perimeter edge renders the same way
 * regardless of its `blocksMovement`/`blocksLineOfSight` flags (the
 * reference tomb has no windows), and doors render in their closed pose
 * with no click handler — `SessionService` (v0.1.128) has no
 * `Interact`-equivalent verb at all (fourteen RPCs: Join/Exit/Move/
 * Attack/Turn/EndTurn/Dissolve/End/GetStatus/GetStory/GetView/GetWhere/
 * GetAtlas/StreamEvents — no door/prop interaction verb among them), noted
 * alongside the missing `Answer` RPC finding on rpg-api-protos#232. Both
 * the flags and the click handler are natural follow-up slices once
 * there's a real case (and a verb) to test them against.
 */

import { SYNTY_SCALE, WALL_HEIGHT } from '@/rendering/calibrationConstants';
import { GlbInstance } from '../hex-grid/GlbInstance';
import {
  DOOR_FRAME_FILE,
  DOOR_LEAF_FILE,
  doorFrameScale,
  doorLeafScale,
  WALL_VARIANTS,
  wallVariantScale,
} from '../hex-grid/syntyHexWallHelpers';
import type { DoorEdgePiece, WallEdgePiece } from './atlasToScene3D';

/** The flat panel every wall piece here uses — see this file's module doc
 * comment for why this isn't `selectWallVariant`'s weighted pool. */
const PLAIN_WALL_VARIANT = WALL_VARIANTS[0]!;

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
      {walls.map((wall) => (
        <GlbInstance
          key={wall.key}
          file={PLAIN_WALL_VARIANT.file}
          position={wall.edge.a}
          rotationY={wall.edge.rotationY}
          scale={wallVariantScale(PLAIN_WALL_VARIANT, wallHeight, SYNTY_SCALE)}
        />
      ))}
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
