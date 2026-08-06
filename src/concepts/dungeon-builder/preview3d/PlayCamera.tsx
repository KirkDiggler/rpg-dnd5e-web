/**
 * PlayCamera — the author-walkthrough's THIRD camera mode (rpg-project
 * #169 follow-up unit). Kirk played the literal first-person Walk mode
 * live and gave a real, specific verdict: "walk is pretty literal. that
 * is not the view we have when playing. really cool though." Play
 * reuses Walk's own WASD+legality movement WHOLESALE (`walkMovement.ts`'s
 * `resolveWalkStep`/`resolveMoveVector`, the identical `useWasdKeys`
 * listener) and replaces only the CAMERA: instead of an eye-level,
 * mouse-look first-person view, this drives the REAL game's own tactical
 * camera rig, so moving through the dungeon shows exactly what a player
 * at the table sees — lighting (this unit's sibling work, unconditional
 * across all three modes) included.
 *
 * The camera-rig MATH itself (every constant/formula, cited to the real
 * game's own camera code, not re-derived) lives in `playCameraRig.ts` —
 * a pure module with no Three.js/R3F import, independently unit-tested.
 * This file is the thin glue: read input, call the pure functions, apply
 * the result to a real `THREE.OrthographicCamera` each frame.
 *
 * **What's necessarily different from the real game's rig, and why — the
 * ONE deliberate departure `playCameraRig.ts` doesn't cover.** The real
 * game's own `useCameraControls` hook is NOT reused directly: it binds
 * W/A/S/D to PAN the camera's `target`, which would conflict with this
 * authoring tool's own WASD-drives-the-WALKING-POSITION scheme. The real
 * game never has this conflict because it doesn't use WASD for player
 * movement at all (click-to-move pathing) — this concept has no such
 * system, so WASD is the only movement input available and is spent on
 * walking, not panning. `target` is therefore driven by the player's own
 * walked position every frame (through the identical follow-lerp), not
 * by keyboard panning — every other piece of the rig (projection, angle,
 * zoom range, rotate, follow smoothing) is the SAME formula, unmodified.
 */
import { OrthographicCamera } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { OrthographicCamera as OrthographicCameraImpl } from 'three';
import type { PlaceableCell } from './DungeonPreview3D';
import {
  azimuthForwardRight,
  clampZoomStep,
  dragRotateStep,
  followLerp,
  INITIAL_AZIMUTH,
  INITIAL_DISTANCE,
  MAX_ZOOM,
  MIN_ZOOM,
  ORTHO_FAR,
  ORTHO_NEAR,
  ORTHO_ZOOM,
  POLAR_ANGLE,
  ROTATE_SPEED,
  sphericalCameraPosition,
} from './playCameraRig';
import { useWasdKeys } from './useWasdKeys';
import { WALK_SPEED } from './WalkCamera';
import {
  nearestCell,
  resolveMoveVector,
  resolveWalkStep,
  type WalkContext,
} from './walkMovement';

/** The tactical target sits at the FLOOR plane (`y: 0`), matching
 * `useCameraControls.ts`'s own real usage (`focusTarget`'s `y` is always
 * `0` there too) — the elevated LOOK comes entirely from
 * `POLAR_ANGLE`/`INITIAL_DISTANCE`, not from raising the target. */
const TARGET_HEIGHT = 0;

export interface PlayCameraProps {
  ctx: WalkContext;
  start: PlaceableCell;
  onCellChange: (cell: PlaceableCell | null) => void;
}

export function PlayCamera({ ctx, start, onCellChange }: PlayCameraProps) {
  const cameraRef = useRef<OrthographicCameraImpl | null>(null);
  const pressedKeys = useWasdKeys();
  const lastCellKey = useRef<string | null>(null);

  // Player's own walked world position (x, z) — driven by the identical
  // resolveWalkStep collision this concept's Walk mode already uses.
  const playerPos = useRef({ x: start.worldX, z: start.worldZ });
  // Camera orbit target — follow-lerps toward playerPos every frame
  // (playCameraRig.ts's followLerp) rather than snapping instantly.
  const target = useRef({ x: start.worldX, z: start.worldZ });
  const azimuth = useRef(INITIAL_AZIMUTH);
  const distance = useRef(INITIAL_DISTANCE);
  const rotateKeys = useRef({ q: false, e: false });
  const rightDrag = useRef({ down: false, lastX: 0 });

  useEffect(() => {
    playerPos.current = { x: start.worldX, z: start.worldZ };
    target.current = { x: start.worldX, z: start.worldZ };
    azimuth.current = INITIAL_AZIMUTH;
    distance.current = INITIAL_DISTANCE;
    lastCellKey.current = `${start.col},${start.row}`;
    onCellChange(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Q/E rotate — a dedicated key set, deliberately SEPARATE from the
  // shared `useWasdKeys` movement listener: Q/E has no movement meaning
  // in this rig, only camera rotation, and Play's WASD is spent on
  // movement, not panning (this file's own header doc comment), so
  // conflating the two into one listener would blur that boundary.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.code === 'KeyQ') rotateKeys.current.q = true;
      if (e.code === 'KeyE') rotateKeys.current.e = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ') rotateKeys.current.q = false;
      if (e.code === 'KeyE') rotateKeys.current.e = false;
    };
    const onBlur = () => {
      rotateKeys.current.q = false;
      rotateKeys.current.e = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Scroll-wheel zoom + right-click-drag rotate — useCameraControls.ts's
  // own handleWheel (orthographic branch) / handleMouseMove behavior,
  // reattached against this component's own camera/state (this
  // component doesn't use that hook at all — see this file's own header
  // doc comment for why).
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const cam = cameraRef.current;
      if (!cam) return;
      e.preventDefault();
      cam.zoom = clampZoomStep(cam.zoom, e.deltaY, MIN_ZOOM, MAX_ZOOM);
      cam.updateProjectionMatrix();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) rightDrag.current = { down: true, lastX: e.clientX };
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) rightDrag.current.down = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!rightDrag.current.down) return;
      azimuth.current = dragRotateStep(
        azimuth.current,
        e.clientX - rightDrag.current.lastX
      );
      rightDrag.current.lastX = e.clientX;
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  useFrame((_state, delta) => {
    // Movement — identical to WalkCamera, "forward" derived from the
    // rig's own azimuth (the direction the tactical camera currently
    // faces horizontally) rather than a first-person quaternion, since
    // this camera never looks anywhere but straight at `target`. Camera
    // rotation (Q/E, right-drag) therefore also rotates what "forward"
    // means for WASD — the standard third-person/tactical-camera
    // convention, and the only sense in which "forward" can mean
    // anything at all for a fixed-angle orbit rig.
    const { forward, right } = azimuthForwardRight(azimuth.current);
    const { dx, dz } = resolveMoveVector(
      pressedKeys.current,
      forward,
      right,
      WALK_SPEED,
      delta
    );
    if (dx !== 0 || dz !== 0) {
      const { x, z } = resolveWalkStep(
        ctx,
        playerPos.current.x,
        playerPos.current.z,
        dx,
        dz
      );
      playerPos.current = { x, z };

      const cell = nearestCell(ctx, x, z);
      const key = cell ? `${cell.col},${cell.row}` : null;
      if (key !== lastCellKey.current) {
        lastCellKey.current = key;
        onCellChange(cell);
      }
    }

    // Q/E rotate — per-frame increment, matching useCameraControls.ts's
    // own per-frame `azimuth.current += rotateSpeed` while held.
    if (rotateKeys.current.q) azimuth.current += ROTATE_SPEED;
    if (rotateKeys.current.e) azimuth.current -= ROTATE_SPEED;

    target.current = followLerp(target.current, playerPos.current, delta);

    const cam = cameraRef.current;
    if (!cam) return;
    const pos = sphericalCameraPosition(
      { x: target.current.x, y: TARGET_HEIGHT, z: target.current.z },
      POLAR_ANGLE,
      azimuth.current,
      distance.current
    );
    cam.position.set(pos.x, pos.y, pos.z);
    cam.lookAt(target.current.x, TARGET_HEIGHT, target.current.z);
  });

  return (
    // left/right/top/bottom are left to drei's own default (the full
    // canvas size in pixels — OrthographicCamera.js's own JSX) — the
    // same frustum shape the real game's Canvas gets implicitly too.
    <OrthographicCamera
      ref={cameraRef}
      makeDefault
      zoom={ORTHO_ZOOM}
      near={ORTHO_NEAR}
      far={ORTHO_FAR}
    />
  );
}
