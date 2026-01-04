/**
 * Custom camera controls for HexGrid
 *
 * - WASD to pan
 * - Q/E to rotate (Y-axis only)
 * - Mouse wheel to zoom
 * - Right-click drag to rotate
 * - Fixed tilt angle (no tilting up/down)
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
}

export function useCameraControls({
  target,
  polarAngle = Math.PI / 4, // 45 degrees from vertical by default
  panSpeed = 0.5,
  rotateSpeed = 0.03,
  minZoom = 20,
  maxZoom = 200,
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

  // Track mouse state for right-click drag
  const mouse = useRef({
    isRightDown: false,
    lastX: 0,
  });

  // Reusable vectors for camera movement (avoid allocations in useFrame)
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  // Current azimuthal angle (rotation around Y axis)
  const azimuth = useRef(Math.PI / 4); // Start at 45 degrees

  // Current distance from target
  const distance = useRef(20);

  // Update camera position based on spherical coordinates
  const updateCamera = useCallback(() => {
    const x =
      target.x +
      distance.current * Math.sin(polarAngle) * Math.cos(azimuth.current);
    const y = target.y + distance.current * Math.cos(polarAngle);
    const z =
      target.z +
      distance.current * Math.sin(polarAngle) * Math.sin(azimuth.current);

    camera.position.set(x, y, z);
    camera.lookAt(target);
  }, [target, polarAngle, camera]);

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

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
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
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        mouse.current.isRightDown = false;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (mouse.current.isRightDown) {
        const deltaX = e.clientX - mouse.current.lastX;
        azimuth.current -= deltaX * 0.01;
        mouse.current.lastX = e.clientX;
        updateCamera();
        invalidate(); // Request re-render for on-demand frameloop
      }
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
        invalidate(); // Request re-render for on-demand frameloop
      } else {
        // For perspective camera, adjust distance
        distance.current = Math.max(
          5,
          Math.min(100, distance.current + e.deltaY * 0.05)
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
  ]);

  // Update each frame based on key state
  useFrame(() => {
    // Early return if no keys pressed - avoid unnecessary work
    const { w, a, s, d, q, e } = keys.current;
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
