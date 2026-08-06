/**
 * WallSeeThrough — fades the wall pieces that actually stand between the
 * camera and a mini, instead of deleting whichever walls faced the camera at
 * startup (`?wallCutaway=1`). See wallSeeThrough.ts's doc comment for the
 * full rationale; this file is the per-frame driver.
 *
 * Renders nothing. Mount it INSIDE the Canvas, as a sibling of the wall
 * subtree that `WallFadeContext` wraps — it finds its meshes by scene
 * traversal (the `WALL_FADEABLE_FLAG` tag `GlbInstance` stamps), not by ref,
 * so it does not care where in the tree the walls actually live or which of
 * the two wall renderers produced them.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { WALL_FADEABLE_FLAG } from './GlbInstance';
import type { WorldPos } from './hexMath';
import {
  approachOpacity,
  fadeOpacityForDistance,
  type WallSeeThroughDials,
} from './wallSeeThrough';

/**
 * Pull each occlusion ray up short of the mini itself, so a wall the mini is
 * standing flush against does not register as blocking it.
 */
const RAY_EPSILON = 0.05;

/** Below this the fade has visually arrived; snap and stop asking for
 * frames. An exponential approach is asymptotic, so without a snap the
 * driver would invalidate forever, defeating `frameloop="demand"`. */
const SETTLED = 0.002;

/** Cache key for a wall mesh's world-space centre, stamped on the mesh's own
 * userData. Walls are static once placed, so this is computed once. */
const CENTER_CACHE = 'wallSeeCenter';

export interface WallSeeThroughProps {
  /**
   * The things that must stay visible — hex-centre world positions of the
   * minis on the board. Rays are aimed at `dials.eyeHeight` above each.
   */
  points: ReadonlyArray<WorldPos>;
  dials: WallSeeThroughDials;
}

/** World-space centre of a wall piece, cached on the mesh. */
function wallCenter(mesh: THREE.Mesh): THREE.Vector3 {
  const cached = mesh.userData[CENTER_CACHE] as THREE.Vector3 | undefined;
  if (cached) return cached;
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  // `useFrame` runs BEFORE the renderer's own `scene.updateMatrixWorld()`,
  // so on the very first frame a mesh's `matrixWorld` is still stale —
  // update this one's ancestry explicitly rather than caching a wrong
  // centre forever.
  mesh.updateWorldMatrix(true, false);
  const center = new THREE.Vector3()
    .copy(mesh.geometry.boundingSphere?.center ?? new THREE.Vector3())
    .applyMatrix4(mesh.matrixWorld);
  mesh.userData[CENTER_CACHE] = center;
  return center;
}

export function WallSeeThrough({ points, dials }: WallSeeThroughProps) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  // Scratch vectors and a hit-point pool, allocated once. This runs every
  // rendered frame; per-frame `new THREE.Vector3()` here would be steady GC
  // pressure during a camera drag.
  const scratch = useMemo(
    () => ({
      forward: new THREE.Vector3(),
      origin: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      target: new THREE.Vector3(),
    }),
    []
  );
  const meshes = useRef<THREE.Mesh[]>([]);
  const hitPool = useRef<THREE.Vector3[]>([]);

  useFrame((_, delta) => {
    const { minOpacity, radius, rate, eyeHeight } = dials;

    // Collect fadeable wall meshes. Traversed fresh each frame rather than
    // cached: walls appear and disappear as fog-of-war reveals rooms, and a
    // stale list would leave a newly-revealed wall permanently solid.
    const walls = meshes.current;
    walls.length = 0;
    scene.traverse((object) => {
      if (
        (object as THREE.Mesh).isMesh &&
        object.userData[WALL_FADEABLE_FLAG]
      ) {
        walls.push(object as THREE.Mesh);
      }
    });
    if (walls.length === 0) return;

    const isOrthographic =
      (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
    camera.getWorldDirection(scratch.forward);

    let hitCount = 0;
    for (const point of points) {
      scratch.target.set(point.x, eyeHeight, point.z);

      let far: number;
      if (isOrthographic) {
        // An orthographic camera's rays are PARALLEL — the ray that reaches
        // this mini is not the one from `camera.position` (that would be a
        // perspective ray and would report the wrong occluders off-centre).
        // Start on the camera's own image plane instead: walk back from the
        // target along the view axis by exactly the target's depth.
        const along = scratch.direction
          .subVectors(scratch.target, camera.position)
          .dot(scratch.forward);
        if (along <= RAY_EPSILON) continue; // behind the camera plane
        far = along - RAY_EPSILON;
        scratch.origin
          .copy(scratch.target)
          .addScaledVector(scratch.forward, -along);
        raycaster.set(scratch.origin, scratch.forward);
      } else {
        scratch.direction.subVectors(scratch.target, camera.position);
        const distance = scratch.direction.length();
        if (distance <= RAY_EPSILON) continue;
        far = distance - RAY_EPSILON;
        scratch.direction.divideScalar(distance);
        raycaster.set(camera.position, scratch.direction);
      }
      raycaster.near = 0;
      raycaster.far = far;

      for (const hit of raycaster.intersectObjects(walls, false)) {
        const slot =
          hitPool.current[hitCount] ??
          (hitPool.current[hitCount] = new THREE.Vector3());
        slot.copy(hit.point);
        hitCount += 1;
      }
    }

    let animating = false;
    for (const mesh of walls) {
      let nearest = Infinity;
      if (hitCount > 0) {
        const center = wallCenter(mesh);
        for (let i = 0; i < hitCount; i += 1) {
          const distance = center.distanceTo(hitPool.current[i]!);
          if (distance < nearest) nearest = distance;
        }
      }
      const target =
        hitCount === 0
          ? 1
          : fadeOpacityForDistance(nearest, radius, minOpacity);

      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        if (Math.abs(target - material.opacity) < SETTLED) {
          material.opacity = target;
          continue;
        }
        material.opacity = approachOpacity(
          material.opacity,
          target,
          rate,
          delta
        );
        animating = true;
      }
    }

    // `frameloop="demand"` only renders when something asks it to, so an
    // in-progress fade has to keep asking or it would freeze part-way
    // whenever the camera stops moving.
    if (animating) invalidate();
  });

  return null;
}
