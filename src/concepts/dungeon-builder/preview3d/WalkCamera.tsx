/**
 * WalkCamera — the author-walkthrough's Walk-mode camera driver
 * (rpg-project#169, Kirk's day-one ask: "a 3d view from the player
 * perspective that has the lighting loaded"). Owns exactly two things:
 *
 * - **Mouse-look + pointer lock**, delegated whole to drei's
 *   `PointerLockControls` (itself a thin wrapper over three-stdlib's own
 *   well-tested implementation) — not reimplemented here. `Esc` releasing
 *   the pointer is the BROWSER's own native pointer-lock behavior
 *   (`document.exitPointerLock()` fires on Escape unconditionally); this
 *   component only listens for the resulting `unlock` event to update its
 *   own "click to look around" prompt, it never installs its OWN Escape
 *   handler — so it can never race the pre-existing region-tool
 *   Escape-deselect handler (`creation/CreationBoard.tsx`) the way a
 *   second, independent Escape listener could.
 * - **WASD movement**, collision-checked against `walkMovement.ts`'s pure
 *   `resolveWalkStep` every frame — this component only reads keyboard
 *   state and the controls' own current facing vector
 *   (`PointerLockControls.getDirection`), it never decides legality
 *   itself.
 *
 * View-only by construction: this component has no prop that could
 * mutate the document — it only moves the shared default camera (`y`
 * pinned to `WALK_EYE_HEIGHT` always; no vertical movement/jumping).
 */
import { WALL_HEIGHT } from '@/rendering/calibrationConstants';
import { PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Euler, PerspectiveCamera, Vector3 } from 'three';
import type { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib';
import type { PlaceableCell } from './DungeonPreview3D';
import { useWasdKeys } from './useWasdKeys';
import {
  nearestCell,
  resolveMoveVector,
  resolveWalkStep,
  type WalkContext,
} from './walkMovement';

/** Player eye height, world units — derived from `WALL_HEIGHT` (2.4
 * world units; `calibrationConstants.ts`'s own doc comment: Synty packs,
 * and by extension this scale, are authored in real-world meters). An
 * average adult's eye height (~1.6-1.7m) is roughly 68-71% of a 2.4m
 * wall; 0.7 lands at 1.68 — squarely in that range. */
export const WALK_EYE_HEIGHT = WALL_HEIGHT * 0.7;

/** World units/second — a brisk walking pace. Not tuned against any
 * real-world figure beyond "covers a hex-ish distance in comfortably
 * under a second," which is what reads as WALKING (not sprinting, not
 * crawling) in live verification. Shared with `PlayCamera.tsx` — the
 * SAME pace either way, only the camera differs. */
export const WALK_SPEED = 3;

/** Walk mode's own near/far clipping planes — rpg-project#169 regression
 * fix. `DungeonPreview3D.tsx`'s `<Bounds fit clip>` sets the SHARED
 * default camera's `near`/`far` ONCE, sized for the wide bird's-eye Orbit
 * view (drei's own `Bounds.clip()`: `near = fittedDistance / 100`) — at
 * this dungeon's scale that fitted distance is large enough to produce a
 * `near` around 0.7-0.8 world units. Fine for viewing an entire dungeon
 * from far away; badly wrong for a first-person camera walking at human
 * eye height, where a wall one step away, or even a nearby pillar, sits
 * well WITHIN that near distance and gets clipped away entirely — found
 * live, not assumed: Kirk's own "walls/doors not loading" report
 * reproduced as a solid black screen after walking a short distance, and
 * a direct `camera.near`/`camera.far` dump during that exact repro read
 * `near: 0.77` — confirmed the culprit, not a collision or rendering-tree
 * regression (movement itself was working correctly the whole time).
 * `PlayCamera.tsx` never hits this because it creates its OWN camera with
 * an explicit small `near` (matching the real game's own `0.1`); Walk
 * reuses the shared default camera, so it has to claim its own
 * appropriate near/far the same way, and hand them back on exit. `0.05`
 * is comfortably smaller than any real geometry at this scale (a wall's
 * own thickness, `WallBox`'s `WALL_THICKNESS = 0.12`, is still more than
 * double it) without being so small it invites z-fighting; `far: 1000`
 * matches `PlayCamera.tsx`'s own value for consistency and is generous
 * at this dungeon's scale. */
const WALK_NEAR = 0.05;
const WALK_FAR = 1000;

export interface WalkCameraProps {
  ctx: WalkContext;
  start: PlaceableCell;
  /** Initial look-at target (typically the floor's own centroid,
   * `walkMovement.ts`'s `floorCentroid`) — so entering Walk mode faces
   * roughly into the dungeon instead of an arbitrary default heading. */
  lookToward: { worldX: number; worldZ: number };
  /** CSS selector for the element `PointerLockControls` should treat as
   * "click here to engage mouse-look" — the caller's own canvas-covering
   * wrapper, deliberately NOT including the mode-toggle button (see
   * `DungeonPreview3D.tsx`'s own layout doc comment for why that
   * exclusion matters). */
  domSelector: string;
  onLockedChange: (locked: boolean) => void;
  /** Fires only when the player's NEAREST cell changes (not every frame)
   * — cheap enough to drive a React state update (light-cap recentering)
   * unlike a per-frame position stream would be. */
  onCellChange: (cell: PlaceableCell | null) => void;
}

export function WalkCamera({
  ctx,
  start,
  lookToward,
  domSelector,
  onLockedChange,
  onCellChange,
}: WalkCameraProps) {
  // `get()` (R3F's own Zustand-style escape hatch — the SAME one drei's
  // `Bounds` itself uses) rather than destructuring `camera` at render
  // time. Real, found-live reason: switching cameras DIRECTLY from Play
  // mode (whose `<OrthographicCamera makeDefault>` swaps `state.camera`
  // to itself, then restores the PREVIOUS default via a LAYOUT-effect
  // cleanup on unmount) straight into Walk skips ever passing through
  // Orbit — React runs Play's layout-effect cleanup and mounts this
  // component in the SAME commit, but this component's own render
  // happens BEFORE that cleanup fires, so a plain `const {camera} =
  // useThree()` captured at render time could still point at Play's own
  // (about to be disposed) orthographic camera instead of the real
  // default. `get().camera`, called from INSIDE the effect body (which
  // only runs in the passive-effects phase, strictly after every layout
  // effect in the same commit has already settled `state.camera`), reads
  // the correct, final camera instead. Confirmed live: without this fix,
  // Play -> Walk (no Orbit stop between) rendered a solid black canvas.
  const getThree = useThree((s) => s.get);
  const controlsRef = useRef<PointerLockControlsImpl | null>(null);
  const pressedKeys = useWasdKeys();
  const lastCellKey = useRef<string | null>(null);
  const forward = useRef(new Vector3());
  const right = useRef(new Vector3());

  // Position + orient the camera once, on entering Walk mode — NOT a
  // dependency-driven effect (re-running on every `ctx`/`start` render
  // would fight the player's own movement each time the document
  // changes underneath them, which it legitimately can if this is
  // creation mode's own live-edited canvas). The cleanup restores
  // whatever pose the camera had the MOMENT Walk mode was entered
  // (Orbit's own `<Bounds fit clip>`-computed framing, whenever Walk is
  // entered from Orbit) — live-verified finding: with no reset at all,
  // leaving Walk mode handed `<OrbitControls>` the camera wherever the
  // player last stood (mid-corridor, at eye height, often facing a wall
  // or open darkness), not the original bird's-eye framing — a real UX
  // papercut, not a hypothetical one.
  useEffect(() => {
    const camera = getThree().camera;
    const restorePosition = camera.position.clone();
    const restoreQuaternion = camera.quaternion.clone();
    // Only a PerspectiveCamera actually carries near/far (the base
    // THREE.Camera type this hook is statically typed against doesn't) —
    // true at runtime for every caller of this component today (Orbit's
    // own default camera, the only one Walk is ever handed, per
    // `DungeonPreview3D.tsx`'s Canvas setup). Guarded rather than
    // asserted so a future non-perspective default camera degrades to
    // "don't touch near/far" instead of throwing.
    const isPerspective = camera instanceof PerspectiveCamera;
    const restoreNear = isPerspective ? camera.near : undefined;
    const restoreFar = isPerspective ? camera.far : undefined;

    camera.position.set(start.worldX, WALK_EYE_HEIGHT, start.worldZ);
    const yaw = Math.atan2(
      -(lookToward.worldZ - start.worldZ),
      lookToward.worldX - start.worldX
    );
    camera.quaternion.setFromEuler(new Euler(0, yaw, 0, 'YXZ'));
    if (isPerspective) {
      // See WALK_NEAR/WALK_FAR's own doc comment — the shared default
      // camera's near/far were sized for Orbit's wide bird's-eye view
      // (`Bounds.clip()`), which clips away nearby geometry entirely once
      // the camera drops to walking eye height.
      camera.near = WALK_NEAR;
      camera.far = WALK_FAR;
      camera.updateProjectionMatrix();
    }
    lastCellKey.current = `${start.col},${start.row}`;
    onCellChange(start);

    return () => {
      camera.position.copy(restorePosition);
      camera.quaternion.copy(restoreQuaternion);
      if (
        isPerspective &&
        restoreNear !== undefined &&
        restoreFar !== undefined
      ) {
        camera.near = restoreNear;
        camera.far = restoreFar;
        camera.updateProjectionMatrix();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, delta) => {
    if (!controlsRef.current?.isLocked) return;
    // `state.camera` — R3F's OWN live current-frame camera, never a
    // render-time closure — same staleness reasoning as the mount
    // effect's `get().camera` above, just via useFrame's own guaranteed-
    // fresh parameter instead.
    const camera = state.camera;

    controlsRef.current.getDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    // Right = forward × world-up, the standard right-hand cross product
    // (`(-fz, 0, fx)` for `up = (0,1,0)`) — verified against the default
    // camera facing (`forward = (0,0,-1)` gives `right = (1,0,0)`, +X, the
    // conventional "right" for a camera looking down -Z).
    right.current.set(-forward.current.z, 0, forward.current.x);

    const { dx, dz } = resolveMoveVector(
      pressedKeys.current,
      forward.current,
      right.current,
      WALK_SPEED,
      delta
    );
    if (dx === 0 && dz === 0) return;

    const { x, z } = resolveWalkStep(
      ctx,
      camera.position.x,
      camera.position.z,
      dx,
      dz
    );
    camera.position.x = x;
    camera.position.z = z;
    camera.position.y = WALK_EYE_HEIGHT;

    const cell = nearestCell(ctx, x, z);
    const key = cell ? `${cell.col},${cell.row}` : null;
    if (key !== lastCellKey.current) {
      lastCellKey.current = key;
      onCellChange(cell);
    }
  });

  return (
    <PointerLockControls
      ref={controlsRef}
      makeDefault
      selector={domSelector}
      onLock={() => onLockedChange(true)}
      onUnlock={() => onLockedChange(false)}
    />
  );
}
