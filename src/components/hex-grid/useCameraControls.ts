/**
 * Custom camera controls for HexGrid
 *
 * - WASD to pan
 * - Q/E to rotate (Y-axis only) — the ONLY way to rotate
 * - Mouse wheel to zoom
 * - Right-click drag to pan ("grab the board"). This used to rotate; Kirk
 *   moved it to panning so rotation lives on Q/E alone and the mouse does
 *   the thing a mouse on a map is expected to do.
 * - Tilt is never under direct player control: it is either a fixed angle
 *   (the default, unchanged) or a function of zoom via the `curve` option
 *   (`?pitchCurve=1`, see cameraDials.ts). There is deliberately no free-look.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';

interface CameraControlsOptions {
  /** Target point to orbit around */
  target: THREE.Vector3;
  /** Fixed polar angle (tilt from vertical) in radians */
  polarAngle?: number;
  /** Pan speed multiplier */
  panSpeed?: number;
  /** Rotation speed multiplier */
  rotateSpeed?: number;
  /** Minimum zoom level */
  minZoom?: number;
  /** Maximum zoom level */
  maxZoom?: number;
  /** When set, camera lerps target to this position. Cleared on manual pan. */
  focusTarget?: THREE.Vector3 | null;
  /**
   * Zoom-coupled pitch (`?pitchCurve=1`, see cameraDials.ts). When set, the
   * polar angle interpolates between `polarFar` at the zoomed-OUT extreme and
   * `polarNear` at the zoomed-IN extreme instead of staying at the single
   * fixed `polarAngle` — the camera goes near top-down for planning and
   * flattens out as you lean in, which is the Gloomhaven behaviour.
   *
   * `undefined`/`null` keeps `polarAngle` fixed: the untouched default path.
   */
  curve?: { polarFar: number; polarNear: number } | null;
  /**
   * Drive a PerspectiveCamera by dollying `distance` instead of driving an
   * OrthographicCamera's `zoom` (`?camera=persp`). Orthographic stays the
   * default — the tactical read depends on hexes being the same size across
   * the whole screen.
   */
  perspective?: boolean;
  /** Perspective dolly range in world units (ignored when orthographic). */
  minDistance?: number;
  maxDistance?: number;
}

export function useCameraControls({
  target,
  polarAngle = Math.PI / 4, // 45 degrees from vertical by default
  panSpeed = 0.5,
  rotateSpeed = 0.03,
  minZoom = 20,
  maxZoom = 200,
  focusTarget,
  curve = null,
  perspective = false,
  minDistance = 5,
  maxDistance = 100,
}: CameraControlsOptions) {
  const { camera, gl, invalidate } = useThree();

  // Track which keys are pressed
  const keys = useRef({
    w: false,
    a: false,
    s: false,
    d: false,
    q: false,
    e: false,
  });

  // Track mouse state for right-click drag (pans the board — rotation is
  // Q/E only, per Kirk: "use Q and E to rotate and rt click could move the
  // board"). Y is tracked too now that the drag moves in both axes.
  const mouse = useRef({
    isRightDown: false,
    lastX: 0,
    lastY: 0,
  });

  // Reusable vectors for camera movement (avoid allocations in useFrame)
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  // Current azimuthal angle (rotation around Y axis)
  const azimuth = useRef(Math.PI / 4); // Start at 45 degrees

  // Current distance from target
  const distance = useRef(20);

  // Track lerp target for auto-center
  const lerpTarget = useRef<THREE.Vector3 | null>(null);

  // Update lerp target when focusTarget changes
  useEffect(() => {
    if (focusTarget) {
      lerpTarget.current = focusTarget.clone();
    }
  }, [focusTarget]);

  /**
   * How far "zoomed in" we currently are, normalised to 0 (furthest out) → 1
   * (closest in), so one pitch curve can serve both projections. Read out of
   * whichever quantity actually drives zoom for this camera — ortho `zoom`
   * grows as you close in, perspective `distance` shrinks — rather than being
   * stored separately, so it can never drift from what's on screen.
   */
  const zoomT = useCallback((): number => {
    if (perspective) {
      const span = maxDistance - minDistance;
      if (span <= 0) return 0;
      return THREE.MathUtils.clamp(
        (maxDistance - distance.current) / span,
        0,
        1
      );
    }
    const span = maxZoom - minZoom;
    if (span <= 0 || !(camera instanceof THREE.OrthographicCamera)) return 0;
    return THREE.MathUtils.clamp((camera.zoom - minZoom) / span, 0, 1);
  }, [perspective, maxDistance, minDistance, maxZoom, minZoom, camera]);

  /** Polar angle for the current zoom — constant unless a curve is supplied. */
  const currentPolar = useCallback((): number => {
    if (!curve) return polarAngle;
    return THREE.MathUtils.lerp(curve.polarFar, curve.polarNear, zoomT());
  }, [curve, polarAngle, zoomT]);

  /**
   * World units spanned by one screen pixel at the current zoom. Right-drag
   * panning multiplies by this so the board tracks the cursor 1:1 instead of
   * moving at a fixed speed that feels sluggish zoomed out and twitchy in.
   */
  const worldPerPixel = useCallback((): number => {
    // R3F sizes the orthographic frustum in PIXELS and then divides by zoom,
    // so world-per-pixel is exactly 1/zoom.
    if (camera instanceof THREE.OrthographicCamera) return 1 / camera.zoom;
    if (camera instanceof THREE.PerspectiveCamera) {
      const heightPx = gl.domElement.clientHeight || 1;
      const vFov = (camera.fov * Math.PI) / 180;
      return (2 * distance.current * Math.tan(vFov / 2)) / heightPx;
    }
    return 1 / 80;
  }, [camera, gl]);

  // Update camera position based on spherical coordinates
  const updateCamera = useCallback(() => {
    const polar = currentPolar();
    const x =
      target.x + distance.current * Math.sin(polar) * Math.cos(azimuth.current);
    const y = target.y + distance.current * Math.cos(polar);
    const z =
      target.z + distance.current * Math.sin(polar) * Math.sin(azimuth.current);

    camera.position.set(x, y, z);
    camera.lookAt(target);
  }, [target, currentPolar, camera]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys.current) {
        keys.current[key as keyof typeof keys.current] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys.current) {
        keys.current[key as keyof typeof keys.current] = false;
      }
    };

    const handleBlur = () => {
      keys.current.w = false;
      keys.current.a = false;
      keys.current.s = false;
      keys.current.d = false;
      keys.current.q = false;
      keys.current.e = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Handle mouse events for right-click rotation
  useEffect(() => {
    const canvas = gl.domElement;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        // Right click
        mouse.current.isRightDown = true;
        mouse.current.lastX = e.clientX;
        mouse.current.lastY = e.clientY;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        mouse.current.isRightDown = false;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouse.current.isRightDown) return;

      const dx = e.clientX - mouse.current.lastX;
      const dy = e.clientY - mouse.current.lastY;
      mouse.current.lastX = e.clientX;
      mouse.current.lastY = e.clientY;

      // Ground-plane basis for the current heading — same convention as the
      // WASD block in useFrame below, reusing the same scratch vectors.
      const az = azimuth.current;
      forward.current.set(-Math.cos(az), 0, -Math.sin(az));
      right.current.set(Math.sin(az), 0, -Math.cos(az));

      // Screen-vertical covers MORE ground than screen-horizontal once the
      // camera tilts (a ground plane compresses by cos(polar) on screen), so
      // undo that to keep the board tracking the cursor in both axes. Clamped
      // because the correction runs away as the camera nears the horizon —
      // and with the pitch curve on, the close end really does get flat.
      const perPx = worldPerPixel();
      const depthScale = Math.min(
        4,
        1 / Math.max(0.25, Math.cos(currentPolar()))
      );

      // Grab-the-board: content follows the cursor, so the orbit target moves
      // against the drag horizontally, and with it into depth (pulling down
      // brings far ground toward you).
      target.addScaledVector(right.current, -dx * perPx);
      target.addScaledVector(forward.current, dy * perPx * depthScale);

      // A manual pan owns the framing from here, exactly like WASD — without
      // this the auto-follow lerp yanks the board straight back to the player.
      lerpTarget.current = null;

      updateCamera();
      invalidate(); // Request re-render for on-demand frameloop
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      // For orthographic camera, adjust zoom property
      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom = Math.max(
          minZoom,
          Math.min(maxZoom, camera.zoom - e.deltaY * 0.1)
        );
        camera.updateProjectionMatrix();
        // Ortho zoom normally leaves the camera's POSITION alone — but with a
        // pitch curve the polar angle is a function of zoom, so the rig has to
        // be re-placed on every wheel tick. Skipped entirely when no curve is
        // active, keeping the default path's work identical to before.
        if (curve) updateCamera();
        invalidate(); // Request re-render for on-demand frameloop
      } else {
        // For perspective camera, adjust distance
        distance.current = Math.max(
          minDistance,
          Math.min(maxDistance, distance.current + e.deltaY * 0.05)
        );
        updateCamera();
        invalidate(); // Request re-render for on-demand frameloop
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // Prevent context menu on right-click
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
    // target included so effect re-initializes if target reference changes
  }, [
    gl,
    camera,
    minZoom,
    maxZoom,
    target,
    polarAngle,
    updateCamera,
    invalidate,
    curve,
    minDistance,
    maxDistance,
    worldPerPixel,
    currentPolar,
  ]);

  // Update each frame based on key state
  useFrame((_, delta) => {
    const { w, a, s, d, q, e } = keys.current;

    // If user is panning, cancel any active lerp
    if ((w || a || s || d) && lerpTarget.current) {
      lerpTarget.current = null;
    }

    // Handle lerp to focus target (exponential smoothing)
    if (lerpTarget.current) {
      const factor = 1 - Math.pow(0.001, delta);
      target.lerp(lerpTarget.current, factor);
      updateCamera();
      invalidate();

      // Snap when close enough
      if (target.distanceTo(lerpTarget.current) < 0.01) {
        target.copy(lerpTarget.current);
        lerpTarget.current = null;
        updateCamera();
      }
      // Still process rotation during lerp
      if (q) {
        azimuth.current += rotateSpeed;
        updateCamera();
        invalidate();
      }
      if (e) {
        azimuth.current -= rotateSpeed;
        updateCamera();
        invalidate();
      }
      return;
    }

    // Normal WASD handling
    // Early return if no keys pressed - avoid unnecessary work
    if (!w && !a && !s && !d && !q && !e) return;

    let changed = false;

    // WASD panning - move the target point
    // Direction is relative to current camera rotation
    // Reuse vectors from refs to avoid allocations
    forward.current.set(
      -Math.cos(azimuth.current),
      0,
      -Math.sin(azimuth.current)
    );
    right.current.set(Math.sin(azimuth.current), 0, -Math.cos(azimuth.current));

    if (w) {
      target.addScaledVector(forward.current, panSpeed);
      changed = true;
    }
    if (s) {
      target.addScaledVector(forward.current, -panSpeed);
      changed = true;
    }
    if (a) {
      target.addScaledVector(right.current, -panSpeed);
      changed = true;
    }
    if (d) {
      target.addScaledVector(right.current, panSpeed);
      changed = true;
    }

    // Q/E rotation
    if (q) {
      azimuth.current += rotateSpeed;
      changed = true;
    }
    if (e) {
      azimuth.current -= rotateSpeed;
      changed = true;
    }

    if (changed) {
      updateCamera();
      invalidate(); // Request next frame while keys are held
    }
  });

  // Initialize camera position
  useEffect(() => {
    updateCamera();
  }, [updateCamera]);

  return { target, azimuth, distance };
}
