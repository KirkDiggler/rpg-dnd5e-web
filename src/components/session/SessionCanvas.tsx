/**
 * SessionCanvas — the actual Three.js scene for the session route, split
 * out of `SessionEncounterView.tsx` so that file's data-orchestration
 * (fetch atlas/position/character, gate on layout, show loading/error
 * states) can be unit-tested without a WebGL canvas (jsdom can't provide
 * one — same reasoning `EncounterMap.test.tsx`'s own doc comment gives for
 * stubbing `HexGrid`). This component is the thing that gets stubbed
 * there.
 *
 * `SessionScene` (the part that actually needs the R3F context — it calls
 * `useCameraControls`, which needs `useThree`) is exported separately so
 * `SessionCanvas.test.tsx` can render it directly through
 * `@react-three/test-renderer`, the same way `SyntyHexWall.test.tsx`
 * renders `SyntyHexWall` directly rather than nesting a second `<Canvas>`
 * inside the test renderer's own root.
 */

import { CAMERA_OFFSET } from '@/rendering/calibrationConstants';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Canvas } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { HexEntity } from '../hex-grid/HexEntity';
import { type CubeCoord, cubeToWorld } from '../hex-grid/hexMath';
import { SyntyHexFloor } from '../hex-grid/SyntyHexFloor';
import { useCameraControls } from '../hex-grid/useCameraControls';
import { useHexInteraction } from '../hex-grid/useHexInteraction';
import type { Scene3D } from './atlasToScene3D';
import { AtlasWalls } from './AtlasWalls';
import type { SightedMember } from './sightingEntities';

/** Matches `HexGrid.tsx`'s own invisible ground plane — big enough to
 * cover any dungeon this route draws; only its raycast target, never
 * rendered. */
const GROUND_PLANE_SIZE = 200;

export interface SessionCanvasProps {
  scene: Scene3D;
  hexSize: number;
  characterId: string;
  characterName: string;
  character: Character | undefined;
  classRefId: string | undefined;
  myPosition: CubeCoord;
  /** The local player's real hex-by-hex route for the CURRENT `moveSeq`
   * (`MoveResponse.steps`, already bridged to cube coords) — passed
   * straight through to `HexEntity.movePath`. `undefined` when no walk
   * has happened yet this mount. */
  movePath?: CubeCoord[];
  /** Bumped once per genuine walk — passed straight through to
   * `HexEntity.moveSeq`, which is what actually triggers the animation
   * (see `useHexMovePath.ts`). */
  moveSeq?: number;
  /** Fires when a floor hex is clicked — the request-shaping/pathfinding
   * and the `Move` RPC itself live in the caller (`useSessionWalk`), not
   * here; this component only owns the raycast. */
  onHexClick?: (coord: CubeCoord) => void;
  /** Fires once the local player's walk ANIMATION finishes painting
   * `movePath` for the given `moveSeq` — presentation-only, matches
   * `HexEntity`'s own `onMovementPresentationComplete` contract (entityId
   * dropped here since this route only ever animates the local player). */
  onMovementPresentationComplete?: (moveSeq: number) => void;
  /** Every OTHER member the local player currently perceives
   * (`GetView.sightings`, mapped by `sightingsToEntities` — rpg-dnd5e-web
   * #762 slice 3). Drawn as monster `HexEntity`s with no `movePath`/
   * `moveSeq` of their own: `useHexMovePath` already snaps an entity
   * straight to a new `position` when `moveSeq` never advances (its own
   * doc comment's "initial mount / non-move position change" branch), so a
   * `GetView` refetch that moves one of these simply relocates it on the
   * next render — no animation plumbing needed for this slice. Undefined/
   * empty draws nothing extra, matching every pre-#762-slice-3 caller. */
  otherMembers?: SightedMember[];
}

/** Renders inside the Canvas — `useCameraControls` needs the R3F context
 * (`useThree`), so it cannot run in the component that owns `<Canvas>`
 * itself. */
export function SessionScene({
  hexSize,
  scene,
  characterId,
  characterName,
  character,
  classRefId,
  myPosition,
  movePath,
  moveSeq,
  onHexClick,
  onMovementPresentationComplete,
  otherMembers,
}: SessionCanvasProps) {
  // Stable base target, seeded ONCE from the character's starting position
  // and frozen after that (HexGrid.tsx's own `initialTargetRef` pattern —
  // see its doc comment). `useCameraControls` mutates this same object in
  // place as the player pans (WASD/right-drag), and its own effects
  // re-initialize whenever the TARGET REFERENCE changes — a fresh
  // `new THREE.Vector3(...)` built inline on every render (Copilot review,
  // PR #764) would snap the camera back to the character on any unrelated
  // re-render, silently discarding whatever the player just panned to.
  const target = cubeToWorld(myPosition, hexSize);
  const initialTargetRef = useRef<THREE.Vector3 | null>(null);
  if (initialTargetRef.current === null) {
    initialTargetRef.current = new THREE.Vector3(target.x, 0, target.z);
  }

  // Slice 2: the camera now CONTINUOUSLY follows the local player
  // (`focusTarget`, HexGrid.tsx's own pattern — `useCameraControls` lerps
  // its target toward this whenever the reference changes, and a manual
  // pan clears it) instead of the slice-1 frozen seed alone, so a walk
  // across the tomb stays in frame rather than leaving the character to
  // exit-stage as they cross into another room.
  const focusTarget = useMemo(
    () => new THREE.Vector3(target.x, 0, target.z),
    [target.x, target.z]
  );
  useCameraControls({ target: initialTargetRef.current, focusTarget });

  // Click-to-walk: the raycast/hover/validity machinery is the SAME
  // ground-plane convention `HexGrid`'s own `useHexInteraction` already
  // established (worldToCube, floor-membership gating) — reused rather
  // than re-derived, since it's convention-independent geometry, not
  // anything specific to the OLD wire's movement rules. This route
  // ignores the hook's own path-preview/attack fields (those are node-
  // only, per-hex; the atlas's real reachability is edge-aware and lives
  // in `atlasPath.ts`/`useSessionWalk`, the caller of `onHexClick`).
  const { groundPlaneProps } = useHexInteraction({
    hexSize,
    floorTiles: scene.floorTiles,
    onHexClick,
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight intensity={0.8} position={[10, 20, 10]} />
      {/* Invisible ground plane for hit detection — HexGrid.tsx's own
          convention, unchanged. */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        {...groundPlaneProps}
      >
        <planeGeometry args={[GROUND_PLANE_SIZE, GROUND_PLANE_SIZE]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <SyntyHexFloor floorTiles={scene.floorTiles} hexSize={hexSize} />
      <AtlasWalls
        envelopeRuns={scene.envelopeRuns}
        connectorRuns={scene.connectorRuns}
        doorGaps={scene.doorGaps}
      />
      <HexEntity
        entityId={characterId}
        name={characterName}
        position={myPosition}
        type="player"
        hexSize={hexSize}
        character={character}
        classRefId={classRefId}
        movePath={movePath}
        moveSeq={moveSeq}
        onMovementPresentationComplete={(_entityId, completedMoveSeq) =>
          onMovementPresentationComplete?.(completedMoveSeq)
        }
      />
      {otherMembers?.map((member) => (
        <HexEntity
          key={member.subject}
          entityId={member.subject}
          name={member.subject}
          position={member.position}
          type="monster"
          hexSize={hexSize}
          monsterRefId={member.monsterRefId}
          knowledgeState={member.remembered ? 'remembered' : undefined}
        />
      ))}
    </>
  );
}

/**
 * The Canvas wrapper. Orthographic isometric camera at the same
 * `CAMERA_OFFSET`/zoom the rest of the game uses (`HexGrid.tsx`), so the
 * session route reads as the same game, not a different renderer —
 * `useCameraControls` (WASD/Q-E/wheel/right-drag) takes over placement
 * from there exactly as it does in `HexGrid`.
 */
export function SessionCanvas(props: SessionCanvasProps) {
  return (
    <Canvas
      orthographic
      frameloop="demand"
      camera={{ position: CAMERA_OFFSET, near: 0.1, far: 1000, zoom: 80 }}
      style={{ width: '100%', height: '100%' }}
    >
      <SessionScene {...props} />
    </Canvas>
  );
}
