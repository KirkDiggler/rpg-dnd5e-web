/**
 * Custom camera controls for HexGrid
 *
 * - WASD to pan
 * - Q/E to rotate (Y-axis only)
 * - Mouse wheel to zoom
 * - Right-click drag to pan ("grab the board"). This used to rotate; Kirk
 *   moved it to panning so rotation lives on Q/E alone and the mouse does
 *   the thing a mouse on a map is expected to do.
 * - Middle-click drag to rotate azimuth only (`?dragRotate=`,
 *   cameraDials.ts — #906). Horizontal only, no tilt — same "no free-look"
 *   rule as everything else here.
 * - F brings the target to the local player's mini without changing the
 *   zoom band (#906).
 * - Home fits the revealed board on demand — never automatically (#906,
 *   rpg-dnd5e-web#457). See cameraFit.ts.
 * - Tilt is never under direct player control: it is either a fixed angle
 *   (the default, unchanged) or a function of zoom via the `curve` option
 *   (`?pitchCurve=1`, see cameraDials.ts). There is deliberately no free-look.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  bandFollowsFocus,
  DEFAULT_DRAG_ROTATE_DEG_PER_PX,
  DEFAULT_PAN_SPEED_PER_SEC,
  DEFAULT_ROTATE_SPEED_DEG_PER_SEC,
} from './cameraDials';
import { fitBandIndexForBbox } from './cameraFit';
import { rotateAboutPivot } from './orbitPivot';

/** `DEFAULT_ROTATE_SPEED_DEG_PER_SEC`, converted to this module's own
 * radian-based azimuth math. */
const DEFAULT_ROTATE_SPEED_RAD_PER_SEC =
  (DEFAULT_ROTATE_SPEED_DEG_PER_SEC * Math.PI) / 180;

/** `DEFAULT_DRAG_ROTATE_DEG_PER_PX`, converted to this module's own
 * radian-based azimuth math. */
const DEFAULT_DRAG_ROTATE_RAD_PER_PX =
  (DEFAULT_DRAG_ROTATE_DEG_PER_PX * Math.PI) / 180;

const WHEEL_BAND_STEP_INTERVAL_MS = 120;

/** Current revealed-floor bounding box, world units, XZ-plane centre +
 * extent — the `Home` key's own fit target (#906, cameraFit.ts). */
export interface RevealedBounds {
  readonly centerX: number;
  readonly centerZ: number;
  readonly width: number;
  readonly height: number;
}

interface CameraControlsOptions {
  /** Target point to orbit around */
  target: THREE.Vector3;
  /** Fixed polar angle (tilt from vertical) in radians */
  polarAngle?: number;
  /** WASD pan speed, world units PER SECOND (`?panSpeed=`, cameraDials.ts).
   * Multiplied by frame delta below — until #906 this was applied as a flat
   * per-frame step with no delta scaling. */
  panSpeed?: number;
  /** Q/E rotation speed, RADIANS per second (`?rotateSpeed=`, cameraDials.ts,
   * authored there in degrees). Same delta-scaling note as `panSpeed`. */
  rotateSpeed?: number;
  /** Minimum zoom level */
  minZoom?: number;
  /** Maximum zoom level */
  maxZoom?: number;
  /** When set, camera lerps target to this position. Cleared on manual pan.
   * Also doubles as the `orbitPivot: 'me'` pivot point below — the local
   * player's own RAW world position (both call sites build it straight from
   * the entity's live position, with no focus-lead applied). */
  focusTarget?: THREE.Vector3 | null;
  /**
   * Where Q/E (and, later, middle-drag) rotation pivots (`?orbitPivot=`,
   * cameraDials.ts). `view` (default) pivots on `target` itself — today's
   * behavior, unchanged. `me` pivots on `focusTarget` instead, so the local
   * player's mini holds its screen position and the board turns around it;
   * falls back to `view` when `focusTarget` is unset (no mini to pivot on).
   * See orbitPivot.ts.
   */
  orbitPivot?: 'view' | 'me';
  /** Middle-drag rotation speed, RADIANS per pixel (`?dragRotate=`,
   * cameraDials.ts, authored there in degrees per pixel). Horizontal only —
   * no free tilt. */
  dragRotate?: number;
  /**
   * Banded zoom/pitch (`?pitchCurve=1`, see cameraDials.ts). Each orthographic
   * wheel gesture selects one authored zoom/polar/focus band. The final detail
   * band may increase zoom while retaining the preceding shoulder pitch.
   *
   * `undefined`/`null` keeps `polarAngle` fixed: the untouched default path.
   */
  curve?: {
    polarFar: number;
    polarNear: number;
    /** World-space look-target lead for perspective and the closest bands. */
    focusLead: number;
    bands: readonly {
      zoom: number;
      polar: number;
      focusLead: number;
      /** Whether a move by the followed character re-centres the camera —
       * see CAMERA_BAND_FOLLOWS_FOCUS in cameraDials.ts. */
      follow: boolean;
    }[];
  } | null;
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
  /** Current revealed-floor bounds — the `Home` key's fit target (#906).
   * `null`/`undefined` (nothing revealed yet, or the caller doesn't track
   * this) makes `Home` a no-op. Recomputed by the caller as more floor is
   * revealed; only READ on an actual `Home` keypress, never acted on by
   * itself — see rpg-dnd5e-web#457, the auto-reframing regression this
   * guards against. */
  revealedBounds?: RevealedBounds | null;
}

export function useCameraControls({
  target,
  polarAngle = Math.PI / 4, // 45 degrees from vertical by default
  panSpeed = DEFAULT_PAN_SPEED_PER_SEC,
  rotateSpeed = DEFAULT_ROTATE_SPEED_RAD_PER_SEC,
  minZoom = 20,
  maxZoom = 200,
  focusTarget,
  orbitPivot = 'view',
  dragRotate = DEFAULT_DRAG_ROTATE_RAD_PER_PX,
  curve = null,
  perspective = false,
  minDistance = 5,
  maxDistance = 100,
  revealedBounds,
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

  // F/Home (#906): one-shot actions, not held state like WASD/QE above —
  // set true on keydown, consumed (and cleared back to false) the next
  // useFrame tick, so each physical press fires exactly once regardless of
  // how long the key stays down. Handled in useFrame (not the keydown
  // handler itself) so they always run with THIS render's fresh `curve`/
  // `target`/`updateCamera`/`focusTarget` closures, matching how Q/E rotation
  // and WASD pan already defer their real work to useFrame.
  const oneShotKeys = useRef({ focus: false, fit: false });

  // Latest `revealedBounds` prop, mirrored into a ref every render so the
  // `Home` handling above (which only runs inside useFrame, not on every
  // prop change) always reads the CURRENT bounds without needing to
  // reinitialize anything when more floor is revealed mid-exploration.
  const revealedBoundsRef = useRef(revealedBounds);
  revealedBoundsRef.current = revealedBounds;

  // Track mouse state for right-click drag (pans the board — rotation is
  // Q/E only, per Kirk: "use Q and E to rotate and rt click could move the
  // board"). Y is tracked too now that the drag moves in both axes.
  const mouse = useRef({
    isRightDown: false,
    lastX: 0,
    lastY: 0,
  });

  // Middle-button drag: azimuth rotation only, no tilt (`?dragRotate=`,
  // cameraDials.ts — the module header doc comment's own "no free-look"
  // rule). Deliberately its own ref, independent of `mouse` above — right-
  // drag pan and middle-drag rotate are unrelated gestures.
  const middleDrag = useRef({
    active: false,
    lastX: 0,
  });

  // Reusable vectors for camera movement (avoid allocations in useFrame)
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  // Current azimuthal angle (rotation around Y axis)
  const azimuth = useRef(Math.PI / 4); // Start at 45 degrees

  // Current distance from target
  const distance = useRef(20);

  // The selected orthographic camera band. Null means resolve the nearest
  // authored band from the Canvas's initial zoom on first use.
  const orthoBandIndex = useRef<number | null>(null);
  const lastOrthoBandStep = useRef({
    at: Number.NEGATIVE_INFINITY,
    direction: 0,
  });

  // Track lerp target for auto-center
  const lerpTarget = useRef<THREE.Vector3 | null>(null);

  // The last focus position actually acted on. Compared BY VALUE, so the
  // auto-centre decision is made once per real move — not again whenever this
  // effect's dependencies happen to change identity, which would re-centre a
  // camera the player had deliberately left parked.
  const lastFocus = useRef<THREE.Vector3 | null>(null);

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

  const currentOrthoBand = useCallback(() => {
    const bands = curve?.bands ?? [];
    if (bands.length === 0) return null;
    if (
      orthoBandIndex.current === null ||
      orthoBandIndex.current >= bands.length
    ) {
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      bands.forEach((band, index) => {
        const bandDistance = Math.abs(band.zoom - camera.zoom);
        if (bandDistance < nearestDistance) {
          nearest = index;
          nearestDistance = bandDistance;
        }
      });
      orthoBandIndex.current = nearest;
    }
    return bands[orthoBandIndex.current] ?? null;
  }, [curve, camera]);

  // Auto-centre on the followed character — but only from the bands that want
  // it. Pulled back, the camera is a planning view the player framed on
  // purpose; see CAMERA_BAND_FOLLOWS_FOCUS in cameraDials.ts.
  useEffect(() => {
    if (!focusTarget) return;
    if (lastFocus.current?.equals(focusTarget)) return;
    lastFocus.current = focusTarget.clone();
    if (!bandFollowsFocus(currentOrthoBand(), perspective)) return;
    lerpTarget.current = focusTarget.clone();
  }, [focusTarget, currentOrthoBand, perspective]);

  /** Smooth perspective close progress; orthographic cameras use exact bands. */
  const easedPerspectiveCloseT = useCallback((): number => {
    if (!curve || !perspective) return 0;
    const closeT = zoomT();
    return closeT * closeT * (3 - 2 * closeT);
  }, [curve, perspective, zoomT]);

  /** Polar angle for the current zoom — constant unless a curve is supplied. */
  const currentPolar = useCallback((): number => {
    if (!curve) return polarAngle;
    if (!perspective) return currentOrthoBand()?.polar ?? curve.polarFar;
    return THREE.MathUtils.lerp(
      curve.polarFar,
      curve.polarNear,
      easedPerspectiveCloseT()
    );
  }, [
    curve,
    perspective,
    polarAngle,
    currentOrthoBand,
    easedPerspectiveCloseT,
  ]);

  const currentFocusLead = useCallback((): number => {
    if (!curve) return 0;
    if (!perspective) return currentOrthoBand()?.focusLead ?? 0;
    return curve.focusLead * easedPerspectiveCloseT();
  }, [curve, perspective, currentOrthoBand, easedPerspectiveCloseT]);

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
    const az = azimuth.current;
    const focusLead = currentFocusLead();
    const focusX = target.x - focusLead * Math.cos(az);
    const focusZ = target.z - focusLead * Math.sin(az);
    const x = focusX + distance.current * Math.sin(polar) * Math.cos(az);
    const y = target.y + distance.current * Math.cos(polar);
    const z = focusZ + distance.current * Math.sin(polar) * Math.sin(az);

    camera.position.set(x, y, z);
    camera.lookAt(focusX, target.y, focusZ);
  }, [target, currentPolar, camera, currentFocusLead]);

  /**
   * Apply one azimuth change of `deltaTheta` radians (positive = Q's
   * direction, negative = E's — see orbitPivot.ts's own doc comment on the
   * shared sign convention). `orbitPivot: 'view'` (default) is exactly
   * today's behavior: only azimuth changes, so `target` — the camera's own
   * look-at point — never leaves screen center. `orbitPivot: 'me'` also
   * carries `target` through the SAME rotation around `focusTarget` (the
   * mini's raw position), so the mini's screen position stays fixed and the
   * board turns around it instead. Does NOT touch `lerpTarget.current` —
   * rotating is not "manually reframing away from the character" the way
   * WASD/right-drag pan are, so it never cancels an active follow.
   */
  const applyAzimuthDelta = useCallback(
    (deltaTheta: number) => {
      if (orbitPivot === 'me' && focusTarget) {
        const rotated = rotateAboutPivot(target, focusTarget, deltaTheta);
        target.set(rotated.x, rotated.y, rotated.z);
      }
      azimuth.current += deltaTheta;
    },
    [orbitPivot, focusTarget, target]
  );

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys.current) {
        keys.current[key as keyof typeof keys.current] = true;
        return;
      }
      // F/Home are one-shot (#906) — ignore OS auto-repeat while held so a
      // long press fires once, not on every repeat interval.
      if (e.repeat) return;
      if (key === 'f') oneShotKeys.current.focus = true;
      else if (key === 'home') oneShotKeys.current.fit = true;
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

    // Middle-button rotate. Tracked with WINDOW-level listeners (added only
    // for the duration of the drag), unlike right-drag pan's canvas-scoped
    // ones above/below — a fast horizontal swing easily carries the cursor
    // off the canvas, and losing the drag there would read as broken rather
    // than as an edge case.
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!middleDrag.current.active) return;
      const dx = e.clientX - middleDrag.current.lastX;
      middleDrag.current.lastX = e.clientX;
      // Vertical ignored — no free tilt (module header doc comment).
      applyAzimuthDelta(dx * dragRotate);
      updateCamera();
      invalidate();
    };
    const endMiddleDrag = () => {
      if (!middleDrag.current.active) return;
      middleDrag.current.active = false;
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', endMiddleDrag);
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        // Right click
        mouse.current.isRightDown = true;
        mouse.current.lastX = e.clientX;
        mouse.current.lastY = e.clientY;
      } else if (e.button === 1) {
        // Middle click — prevent the browser's autoscroll affordance, then
        // rotate on drag instead. Right+left chord is NOT a camera gesture
        // (Kirk: it already means "lift the die" on the die tile), so this
        // is scoped to the middle button alone.
        e.preventDefault();
        middleDrag.current = { active: true, lastX: e.clientX };
        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', endMiddleDrag);
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
      // Orthographic cameras with authored bands move one deliberate stop per
      // wheel gesture. The fixed-angle escape hatch keeps continuous zoom.
      if (camera instanceof THREE.OrthographicCamera) {
        if (curve && curve.bands.length > 0 && e.deltaY !== 0) {
          const direction = e.deltaY < 0 ? 1 : -1;
          const previousStep = lastOrthoBandStep.current;
          const sameBurst =
            previousStep.direction === direction &&
            e.timeStamp >= previousStep.at &&
            e.timeStamp - previousStep.at < WHEEL_BAND_STEP_INTERVAL_MS;
          if (sameBurst) return;
          lastOrthoBandStep.current = { at: e.timeStamp, direction };
          currentOrthoBand();
          const nextIndex = THREE.MathUtils.clamp(
            (orthoBandIndex.current ?? 0) + direction,
            0,
            curve.bands.length - 1
          );
          orthoBandIndex.current = nextIndex;
          camera.zoom = curve.bands[nextIndex]!.zoom;
        } else {
          camera.zoom = THREE.MathUtils.clamp(
            camera.zoom - e.deltaY * 0.1,
            minZoom,
            maxZoom
          );
        }
        camera.updateProjectionMatrix();
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
      endMiddleDrag();
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
    applyAzimuthDelta,
    dragRotate,
  ]);

  // Update each frame based on key state
  useFrame((_, delta) => {
    // F (#906): bring the target to the local player's mini, band
    // unchanged. Reuses the SAME lerp mechanism the auto-follow bands
    // already drive (see `lerpTarget` above) — a manual request for exactly
    // what those bands do automatically.
    if (oneShotKeys.current.focus) {
      oneShotKeys.current.focus = false;
      if (focusTarget) {
        lerpTarget.current = focusTarget.clone();
        invalidate();
      }
    }

    // Home (#906): fit the revealed board ON THIS KEYPRESS ONLY — never
    // automatic (rpg-dnd5e-web#457's own regression). No-op without both an
    // orthographic band ladder and a revealed bbox to fit.
    if (oneShotKeys.current.fit) {
      oneShotKeys.current.fit = false;
      const bounds = revealedBoundsRef.current;
      if (
        bounds &&
        curve &&
        curve.bands.length > 0 &&
        camera instanceof THREE.OrthographicCamera
      ) {
        const widthPx = gl.domElement.clientWidth || 1;
        const heightPx = gl.domElement.clientHeight || 1;
        const fitIndex = fitBandIndexForBbox(
          { width: bounds.width, height: bounds.height },
          { widthPx, heightPx },
          curve.bands
        );
        if (fitIndex >= 0) {
          orthoBandIndex.current = fitIndex;
          camera.zoom = curve.bands[fitIndex]!.zoom;
          camera.updateProjectionMatrix();
          target.set(bounds.centerX, target.y, bounds.centerZ);
          // A deliberate reframe, exactly like WASD/right-drag pan — without
          // this the auto-follow lerp would yank the board straight back.
          lerpTarget.current = null;
          updateCamera();
        }
      }
      invalidate();
    }

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
        applyAzimuthDelta(rotateSpeed * delta);
        updateCamera();
        invalidate();
      }
      if (e) {
        applyAzimuthDelta(-rotateSpeed * delta);
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

    const panStep = panSpeed * delta;
    const rotateStep = rotateSpeed * delta;

    if (w) {
      target.addScaledVector(forward.current, panStep);
      changed = true;
    }
    if (s) {
      target.addScaledVector(forward.current, -panStep);
      changed = true;
    }
    if (a) {
      target.addScaledVector(right.current, -panStep);
      changed = true;
    }
    if (d) {
      target.addScaledVector(right.current, panStep);
      changed = true;
    }

    // Q/E rotation
    if (q) {
      applyAzimuthDelta(rotateStep);
      changed = true;
    }
    if (e) {
      applyAzimuthDelta(-rotateStep);
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
