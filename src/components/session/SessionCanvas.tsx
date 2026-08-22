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
 *
 * # Attack is a floor gesture (rpg-project#249)
 *
 * `attackableTargets` names every subject `combatPanel.ts` currently
 * offers as an in-reach, this-turn candidate — drawn with a persistent
 * highlight (`HexEntity.isSelected`, unused elsewhere on this route) so
 * "what can I hit" reads at a glance, per the design's own walkthrough.
 * Hovering one of them (not a separate mode — see `moveIndicator.ts`'s
 * own doc comment) shows the "Attack <name>" ground marker and fires
 * `onHoverEntity`; clicking one fires `onEntityClick` directly — no
 * intermediate "arm" step. Clicking a NON-attackable entity's cell is a
 * no-op (never treated as a walk target either — an occupied cell was
 * never a legitimate destination); every other click is the ordinary
 * `onHexClick` walk.
 */

import { CAMERA_OFFSET } from '@/rendering/calibrationConstants';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { HexEntity } from '../hex-grid/HexEntity';
import { coordToKey, cubeToWorld, type CubeCoord } from '../hex-grid/hexMath';
import { SyntyHexFloor } from '../hex-grid/SyntyHexFloor';
import { useCameraControls } from '../hex-grid/useCameraControls';
import { useHexInteraction } from '../hex-grid/useHexInteraction';
import type { AtlasPathIndex } from './atlasPath';
import type { Scene3D } from './atlasToScene3D';
import { AtlasWalls } from './AtlasWalls';
import { MoveIndicator } from './MoveIndicator';
import { isSightedDowned, type SightedMember } from './sightingEntities';
import { useMoveIndicator } from './useMoveIndicator';

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
  /** Fires when a floor hex is clicked (and it isn't an attack — see this
   * component's own doc comment) — the request-shaping/pathfinding and
   * the `Move` RPC itself live in the caller (`useSessionWalk`), not
   * here; this component only owns the raycast. */
  onHexClick?: (coord: CubeCoord) => void;
  /** Fires when a click lands on an `attackableTargets` entity's cell —
   * see this component's own doc comment. `onHexClick` is NOT also
   * called in that case. */
  onEntityClick?: (subject: string) => void;
  /** Fires with the subject under the cursor, or `null` — presentation
   * only (drives the panel's "Attack <name>" hover label); this
   * component makes no affordability judgment of its own. */
  onHoverEntity?: (subject: string | null) => void;
  /** Fires once the local player's walk ANIMATION finishes painting
   * `movePath` for the given `moveSeq` — presentation-only, matches
   * `HexEntity`'s own `onMovementPresentationComplete` contract (entityId
   * dropped here since this route only ever animates the local player). */
  onMovementPresentationComplete?: (moveSeq: number) => void;
  /** Every OTHER member the local player currently perceives
   * (`GetView.sightings`, mapped by `sightingsToEntities`). Drawn as
   * monster `HexEntity`s with no `movePath`/`moveSeq` of their own:
   * `useHexMovePath` already snaps an entity straight to a new `position`
   * when `moveSeq` never advances, so a `GetView` refetch that moves one
   * of these simply relocates it on the next render. Undefined/empty
   * draws nothing extra. */
  otherMembers?: SightedMember[];
  /** Subject ids `combatPanel.ts` currently offers as in-reach Attack
   * candidates (rpg-project#249) — see this component's own doc comment.
   * Undefined/empty means nothing is attackable right now. */
  attackableTargets?: string[];
  /** The atlas's movement graph (`atlasPath.ts`'s `buildAtlasPathIndex`) —
   * the SAME index `useSessionWalk` builds its `MoveRequest` path from.
   * Feeds the hover/path indicator via `useMoveIndicator`. `undefined`/
   * `null` simply means nothing is drawn under the cursor yet
   * (`moveIndicator.ts`'s own doc comment). `SessionEncounterView` pins
   * this to the last successfully-loaded atlas rather than passing a
   * live one straight through, so in practice this is only ever null
   * before the FIRST atlas load. */
  pathIndex?: AtlasPathIndex | null;
  /** Not this member's turn (`combatPanel.ts`'s own turn-ownership gate)
   * — when true, every non-attackable hover shows the indicator's locked
   * state instead of a path preview, and floor clicks are ignored
   * upstream (`onHexClick` simply isn't wired to dispatch anything by the
   * caller in that state). Defaults to `false`. */
  turnLocked?: boolean;
  /** The server's own movement bound for this turn, already rounded down
   * to whole cells (toolkit#1169, `combatPanel.ts`'s own `moveMaxCells`)
   * — a path preview longer than this reads `'invalid'`. `undefined`
   * means unbounded (free roam). */
  maxCells?: number;
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
  onEntityClick,
  onHoverEntity,
  onMovementPresentationComplete,
  otherMembers,
  attackableTargets,
  pathIndex = null,
  turnLocked = false,
  maxCells,
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

  const attackableSet = useMemo(
    () => new Set(attackableTargets ?? []),
    [attackableTargets]
  );

  // Click-to-walk/click-to-attack: the raycast/hover/validity machinery is
  // the SAME ground-plane convention `HexGrid`'s own `useHexInteraction`
  // already established (worldToCube, floor-membership gating) — reused
  // rather than re-derived. A click on an attackable entity's cell attacks
  // it (`onEntityClick`); a click on any OTHER entity's cell is a no-op
  // (never a walk attempt either — see this component's own doc comment);
  // every other floor click is the ordinary walk (`onHexClick`).
  const handleGroundClick = useCallback(
    (coord: CubeCoord) => {
      const key = coordToKey(coord);
      const hit = otherMembers?.find(
        (member) => coordToKey(member.position) === key
      );
      if (hit) {
        if (attackableSet.has(hit.subject)) onEntityClick?.(hit.subject);
        return;
      }
      onHexClick?.(coord);
    },
    [otherMembers, attackableSet, onEntityClick, onHexClick]
  );

  const { groundPlaneProps, hoveredHex } = useHexInteraction({
    hexSize,
    floorTiles: scene.floorTiles,
    onHexClick: handleGroundClick,
  });

  // Which OTHER member, if any, sits under the hovered cell. Cheap —
  // otherMembers is small (everyone currently perceived) — and reuses the
  // position this component already draws each HexEntity at, no new
  // lookup structure.
  const hoveredEntityId = useMemo(() => {
    if (!hoveredHex || !otherMembers) return null;
    const key = coordToKey(hoveredHex);
    return (
      otherMembers.find((m) => coordToKey(m.position) === key)?.subject ?? null
    );
  }, [hoveredHex, otherMembers]);

  // Presentation-only: report the hovered subject up so the panel can
  // show "Attack <name>" (or its shortfall) — this component makes no
  // affordability judgment of its own. Only fires on an actual change so
  // a caller's state setter doesn't churn every render.
  const lastReportedHoverRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastReportedHoverRef.current === hoveredEntityId) return;
    lastReportedHoverRef.current = hoveredEntityId;
    onHoverEntity?.(hoveredEntityId);
  }, [hoveredEntityId, onHoverEntity]);

  const moveIndicatorSelection = useMoveIndicator({
    hovered: hoveredHex,
    from: myPosition,
    pathIndex,
    locked: turnLocked,
    hoveredEntityId,
    attackable: hoveredEntityId ? attackableSet.has(hoveredEntityId) : false,
    maxCells,
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
      <MoveIndicator
        selection={moveIndicatorSelection}
        hexSize={hexSize}
        hovered={hoveredHex}
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
          name={member.name}
          position={member.position}
          type="monster"
          hexSize={hexSize}
          monsterRefId={member.monsterRefId}
          knowledgeState={member.remembered ? 'remembered' : undefined}
          isDead={isSightedDowned(member.standing)}
          isSelected={!member.remembered && attackableSet.has(member.subject)}
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
