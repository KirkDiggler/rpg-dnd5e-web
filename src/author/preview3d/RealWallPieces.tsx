/**
 * RealWallPieces — the game's own Synty wall/door GLBs, mounted in place of
 * `WallBox`/`DoorGap`'s procedural boxes (real-wall-assets unit,
 * rpg-project#169). Kirk's verdict driving this, seen through the new Play
 * camera: "walls are there they are just plain white. the door is there but
 * it is a yellow placeholder looking thing... not the assets we typically
 * load."
 *
 * **Reuses the real game renderers' own building blocks directly, not a
 * re-implementation** — the same "REUSES the REAL game renderers" principle
 * this file's sibling `DungeonPreview3D.tsx` already follows for
 * `SyntyHexFloor`/`PropModel`:
 * - `GlbInstance` (`@/components/hex-grid/GlbInstance`) for load/clone/
 *   tint/bake — the exact primitive `SyntyHexWall`/`WallRunMesh` both use.
 * - `WALL_VARIANTS`/`selectWallVariant`/`wallVariantScale`/`DOOR_FRAME_FILE`/
 *   `DOOR_LEAF_FILE`/`doorFrameScale`/`doorLeafScale`
 *   (`@/components/hex-grid/syntyHexWallHelpers`) — the game's own
 *   calibrated file names/scale formulas, unchanged.
 * - `facingCorrectedRotationY`/`tileWallSegment`
 *   (`@/components/hex-grid/wallRunMeshHelpers`) — the game's own
 *   front/back-asymmetric-piece and modular-tiling math, unchanged.
 *
 * **What this concept genuinely can't borrow**: the game's `EnvelopeRun`/
 * `ConnectorRun.facing` (a room-envelope/connector concept this freeform
 * authoring surface has no equivalent of) and its fixed-camera
 * `CAMERA_WARD_XZ` cutaway test (invalid for this preview's free Orbit/Play
 * cameras). Both are re-derived for this concept's own data/camera shape in
 * `wallPieceHelpers.ts` — see that file's own header doc comment.
 *
 * **Piece-per-edge for edge-native walls, tiled for `wallLines:` runs** —
 * matches `SyntyHexWall`'s own per-edge convention for the former (a single
 * `WALL_VARIANTS` piece, `selectWallVariant`-chosen for edge-level variety,
 * exactly one hex-edge wide) and `WallRunMesh`'s own tiling convention for
 * the latter (repeated `RUN_WALL_VARIANT` ("plain" only — "a long straight
 * run reads as deliberate architecture, not per-edge rubble variety",
 * `WallRunMesh.tsx`'s own doc comment) instances, `tileWallSegment`'s own
 * even-division-across-the-run scale-to-fit — the SAME choice the game
 * makes for a run whose length isn't an exact multiple of the nominal
 * piece width, reused here rather than inventing separate "partial end
 * piece" handling: a run is NEVER left with a leftover partial piece,
 * every tile is evenly (near-imperceptibly) stretched/squeezed to fill its
 * own even slot instead).
 *
 * **Doors always render at their calibrated nominal width** (`DOOR_FRAME_
 * CALIBRATED_WIDTH = 1.0`, centered on the door's own real midpoint) even
 * for a `wallLines:` door whose own clip interval is narrower or wider —
 * deliberate: the door frame/leaf GLBs are authored art, not a
 * procedurally-any-width box like `DoorGap`, and non-uniformly stretching
 * them to fit an arbitrary interval would visibly distort the asset. Only
 * the FLANKING solid tiling honors the exact clip boundary; the door
 * itself borrows the game's own "doors are always exactly one calibrated
 * width" convention (no `ConnectorRun`/`SyntyHexWall` door is ever
 * stretched either).
 *
 * **Corner/end fittings are OUT of scope this round** — `classifyWallVertices`/
 * `wallEndEdgeKeys` (`syntyHexWallHelpers.ts`) are built around the game's
 * own `Wall[]`/cube-coordinate model; adapting them to this concept's two
 * genuinely different wall shapes (edge-native col/row pairs AND
 * corner-anchored world-space runs, neither a `Wall[]`) is real, separable
 * work, not a quick reuse — named here as a real follow-up, not a silent
 * gap. Two edge/run pieces meeting at a corner simply place independently
 * today (no visible defect for a box-shaped placeholder; a real GLB piece
 * may show a small seam at a corner until fittings land).
 *
 * **Fallback honesty**: every real piece is wrapped in its own
 * `GlbFallbackBoundary` — a GLB load failure for THIS wall/door falls back
 * to exactly the `WallBox`/`DoorGap` geometry that same wall/door rendered
 * as before this unit (never a crash, never an invisible wall), with a
 * console warning deduped per (asset, error) pair so a systemically broken
 * file doesn't spam the console once per instance.
 */
import { GlbInstance } from '@/components/hex-grid/GlbInstance';
import type { WorldPos } from '@/components/hex-grid/hexMath';
import {
  DOOR_FRAME_FILE,
  DOOR_LEAF_FILE,
  doorFrameScale,
  doorLeafScale,
  selectWallVariant,
  WALL_VARIANTS,
  wallVariantScale,
} from '@/components/hex-grid/syntyHexWallHelpers';
import {
  facingCorrectedRotationY,
  tileWallSegment,
} from '@/components/hex-grid/wallRunMeshHelpers';
import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { DoorGap, WallBox } from './placeholderWallPieces';

// The game's own tiling variant for a straight RUN (WallRunMesh.tsx's
// `RUN_WALL_VARIANT`/`NOMINAL_PIECE_WIDTH`/`RUN_WALL_PIVOT_RATIO`/
// `RUN_WALL_TILE_OVERLAP_MARGIN` — copied, not imported: those four are
// `const`s private to that file, not exported, and re-deriving them from
// `WALL_VARIANTS[0]` here is a two-line read of already-public data, not a
// second source of truth for the underlying numbers (`WALL_VARIANTS`
// itself IS imported, unchanged).
const RUN_WALL_VARIANT = WALL_VARIANTS[0]!;
const RUN_NOMINAL_PIECE_WIDTH = 1.0;
const RUN_WALL_PIVOT_RATIO =
  RUN_WALL_VARIANT.rawMinX / RUN_WALL_VARIANT.rawWidth;
const RUN_WALL_TILE_OVERLAP_MARGIN = 0.08;

// SyntyHexWall.tsx's own `LOCKED_DOOR_TINT` — a COPY, not an import (same
// "dialect-runs-ahead, stay self-contained" precedent `walkLighting.ts`
// already set for this concept when it copied the game's mood-light specs
// rather than importing a game-route-coupled module).
const LOCKED_DOOR_TINT = new THREE.Color(0.36, 0.31, 0.27);

let glbFallbackWarnings: Set<string> | undefined;

/** One console.warn per (asset, error message) pair for the life of the
 * page — a systemically missing/broken GLB fails for every instance that
 * requests it (every edge of a long wall run, say), and this concept's own
 * testing discipline never mounts the real `<Canvas>` tree (jsdom can't
 * render WebGL), so this can't be exercised by a unit test either way;
 * kept simple rather than plumbed through as a prop nobody would test. */
function warnGlbFallbackOnce(assetLabel: string, error: Error): void {
  glbFallbackWarnings ??= new Set<string>();
  const key = `${assetLabel}::${error.message}`;
  if (glbFallbackWarnings.has(key)) return;
  glbFallbackWarnings.add(key);
  console.warn(
    `[DungeonPreview3D] real wall asset failed to load (${assetLabel}) — falling back to the placeholder box/gap.`,
    error
  );
}

/** Wraps `children` (real GLB pieces) in an `ErrorBoundary` whose fallback
 * is the exact placeholder geometry that piece rendered as before this
 * unit — "the placeholder tier becomes the explicit fallback tier," not a
 * competing look. */
function GlbFallbackBoundary({
  assetLabel,
  fallback,
  children,
}: {
  assetLabel: string;
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <ErrorBoundary
      fallback={fallback}
      onError={(error) => warnGlbFallbackOnce(assetLabel, error)}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * A single hex-edge wall piece (`doc.walls`/server-truth `FloorPlan.edges`,
 * always exactly one hex-edge long) — `SyntyHexWall`'s own per-edge
 * convention: one `selectWallVariant`-chosen piece, positioned at the
 * edge's own `a` corner (NOT its midpoint — `wallVariantScale`'s
 * squeeze-to-one-edge scale assumes the piece's local origin anchors one
 * END of the edge, matching every other per-edge Synty piece in this
 * codebase), facing-corrected so its detailed face points toward the
 * walkable side.
 */
export function RealEdgeWallPiece({
  edgeKey,
  edgeA,
  rotationY,
  facing,
  wallHeight,
}: {
  /** `WallEdgeSegment.key`-shaped stable id (this concept's own
   * `PlacedWall.key` works fine) — deterministic per-edge variant
   * selection, matching `selectWallVariant`'s own doc comment ("the same
   * edge always picks the same variant across renders"). */
  edgeKey: string;
  edgeA: WorldPos;
  rotationY: number;
  facing: WorldPos;
  wallHeight: number;
}) {
  const variant = useMemo(() => selectWallVariant(edgeKey), [edgeKey]);
  const correctedRotationY = facingCorrectedRotationY(rotationY, facing);
  return (
    <GlbFallbackBoundary
      assetLabel={variant.file}
      fallback={
        <WallBox
          position={[
            /* placeholder's own thickness-centered box wants the edge's
             * MIDPOINT, not `edgeA` — recovered from `edgeA`/`rotationY`
             * by walking back HALF the calibrated edge width along the
             * (un-corrected) direction, since `WallBox`'s own rotation
             * doesn't care about front/back (a symmetric box). */
            edgeA.x + Math.cos(rotationY) * 0.5,
            wallHeight / 2,
            edgeA.z - Math.sin(rotationY) * 0.5,
          ]}
          rotationY={rotationY}
          wallHeight={wallHeight}
        />
      }
    >
      <GlbInstance
        file={variant.file}
        position={edgeA}
        rotationY={correctedRotationY}
        scale={wallVariantScale(variant, wallHeight, SYNTY_SCALE)}
      />
    </GlbFallbackBoundary>
  );
}

/**
 * A single hex-edge door (frame + leaf, closed pose) — server-truth OR
 * authored `doc.walls`, both share this component (matches the pre-this-
 * unit `DoorGap` behavior: "both go through the same branch now").
 */
export function RealEdgeDoorPiece({
  edgeMid,
  edgeA,
  rotationY,
  facing,
  wallHeight,
  locked,
  onSelectDoor,
}: {
  edgeMid: WorldPos;
  edgeA: WorldPos;
  rotationY: number;
  facing: WorldPos;
  wallHeight: number;
  locked: boolean;
  onSelectDoor?: () => void;
}) {
  const correctedRotationY = facingCorrectedRotationY(rotationY, facing);
  return (
    <GlbFallbackBoundary
      assetLabel={DOOR_FRAME_FILE}
      fallback={
        <DoorGap
          position={[edgeMid.x, wallHeight / 2, edgeMid.z]}
          rotationY={rotationY}
          wallHeight={wallHeight}
          onSelectDoor={onSelectDoor}
        />
      }
    >
      <group>
        <GlbInstance
          file={DOOR_FRAME_FILE}
          position={edgeMid}
          rotationY={correctedRotationY}
          scale={doorFrameScale(wallHeight)}
        />
        <GlbInstance
          file={DOOR_LEAF_FILE}
          position={edgeA}
          rotationY={correctedRotationY}
          scale={doorLeafScale(wallHeight)}
          tint={locked ? LOCKED_DOOR_TINT : undefined}
        />
        {onSelectDoor && (
          <mesh
            position={[edgeMid.x, wallHeight / 2, edgeMid.z]}
            rotation={[0, rotationY, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectDoor();
            }}
          >
            <boxGeometry args={[1.0, wallHeight, 0.3]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
      </group>
    </GlbFallbackBoundary>
  );
}

/**
 * A `wallLines:` straight run's own SOLID piece — tiled real Synty pieces
 * (`tileWallSegment`, the game's own modular-run convention), one
 * `GlbFallbackBoundary` for the WHOLE run-piece (a broken/missing GLB
 * affects every tile identically, since they all request the same file —
 * one boundary matches that failure shape, and avoids one class-component
 * instance per tile).
 */
export function RealWallLineRun({
  segKey,
  start,
  end,
  rotationY,
  length,
  facing,
  wallHeight,
}: {
  segKey: string;
  start: WorldPos;
  end: WorldPos;
  rotationY: number;
  length: number;
  facing: WorldPos;
  wallHeight: number;
}) {
  const pieces = useMemo(
    () =>
      tileWallSegment(
        { start, end },
        RUN_NOMINAL_PIECE_WIDTH,
        RUN_WALL_PIVOT_RATIO,
        facing,
        RUN_WALL_TILE_OVERLAP_MARGIN
      ),
    [start, end, facing]
  );
  const position: [number, number, number] = [
    (start.x + end.x) / 2,
    wallHeight / 2,
    (start.z + end.z) / 2,
  ];
  return (
    <GlbFallbackBoundary
      assetLabel={`${RUN_WALL_VARIANT.file} (run ${segKey})`}
      fallback={
        <WallBox
          position={position}
          rotationY={rotationY}
          length={length}
          wallHeight={wallHeight}
        />
      }
    >
      <>
        {pieces.map((piece, i) => (
          <GlbInstance
            key={`${segKey}-${i}`}
            file={RUN_WALL_VARIANT.file}
            position={piece.position}
            rotationY={piece.rotationY}
            scale={[
              piece.pieceWidth / RUN_WALL_VARIANT.rawWidth,
              wallHeight / RUN_WALL_VARIANT.rawHeight,
              SYNTY_SCALE,
            ]}
          />
        ))}
      </>
    </GlbFallbackBoundary>
  );
}

/**
 * A `wallLines:` door segment — see this file's own header doc comment for
 * why it renders at the calibrated nominal width (1.0) centered on the
 * segment's own midpoint rather than stretched to `length`. No
 * `onSelectDoor` — a `wallLines:` door has no connector/doorId
 * correlation, matching the pre-this-unit `DoorGap` call site for this
 * same segment (never wired either).
 */
export function RealWallLineDoorPiece({
  segKey,
  position,
  rotationY,
  length,
  facing,
  wallHeight,
}: {
  segKey: string;
  position: WorldPos;
  rotationY: number;
  length: number;
  facing: WorldPos;
  wallHeight: number;
}) {
  const correctedRotationY = facingCorrectedRotationY(rotationY, facing);
  // Leaf pivot offset — half the calibrated nominal width, along the
  // CORRECTED direction (matches `SyntyHexWall.tsx`'s own plane-override
  // leaf-offset formula: `dirX = cos(rotationY)`, `dirZ = -sin(rotationY)`,
  // applied post-correction so the leaf sits flush against whichever side
  // of the frame the correction actually left facing "forward").
  const dirX = Math.cos(correctedRotationY);
  const dirZ = -Math.sin(correctedRotationY);
  const leafPos: WorldPos = {
    x: position.x - dirX * 0.5,
    z: position.z - dirZ * 0.5,
  };
  return (
    <GlbFallbackBoundary
      assetLabel={`${DOOR_FRAME_FILE} (wallLine ${segKey})`}
      fallback={
        <DoorGap
          position={[position.x, wallHeight / 2, position.z]}
          rotationY={rotationY}
          width={length}
          wallHeight={wallHeight}
        />
      }
    >
      <group>
        <GlbInstance
          file={DOOR_FRAME_FILE}
          position={position}
          rotationY={correctedRotationY}
          scale={doorFrameScale(wallHeight)}
        />
        <GlbInstance
          file={DOOR_LEAF_FILE}
          position={leafPos}
          rotationY={correctedRotationY}
          scale={doorLeafScale(wallHeight)}
        />
      </group>
    </GlbFallbackBoundary>
  );
}

// Dot-product threshold gating a camera-ward update (~5.7 degrees) — see
// `CameraWardTracker`'s own doc comment for why this exists at all
// (avoiding a React re-render on every Orbit-drag frame).
const CAMERA_WARD_UPDATE_DOT_THRESHOLD = 0.995;

/**
 * Live camera-ward tracker — mounted once inside `<Canvas>`, feeds
 * `wallPieceHelpers.facingCutawayHeight` a per-frame-fresh (but
 * update-throttled) "which way is the camera, from the dungeon's own
 * center" vector, since this preview's Orbit/Play cameras are free to move
 * (unlike the game's own fixed isometric rig `CAMERA_WARD_XZ` is
 * calibrated against — see `wallPieceHelpers.ts`'s own header doc
 * comment). Returns `null` (renders nothing) — it's a pure side-channel
 * that calls `onChange`, not a visual component.
 */
export function CameraWardTracker({
  reference,
  onChange,
}: {
  reference: WorldPos;
  onChange: (ward: WorldPos) => void;
}) {
  const lastRef = useRef<WorldPos | null>(null);
  useFrame(({ camera }) => {
    const dx = camera.position.x - reference.x;
    const dz = camera.position.z - reference.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return; // camera directly overhead — no defensible XZ ward this frame, keep the last one
    const ward: WorldPos = { x: dx / len, z: dz / len };
    const last = lastRef.current;
    if (last) {
      const dot = last.x * ward.x + last.z * ward.z;
      if (dot > CAMERA_WARD_UPDATE_DOT_THRESHOLD) return;
    }
    lastRef.current = ward;
    onChange(ward);
  });
  return null;
}
