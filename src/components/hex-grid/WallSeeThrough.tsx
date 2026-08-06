/**
 * WallSeeThrough — fades whole walls that stand between the camera and the
 * action, instead of deleting whichever walls faced the camera at startup
 * (`?wallCutaway=1`). See wallSeeThrough.ts's doc comment for the full
 * rationale; this file is the per-frame driver.
 *
 * Renders nothing. Mount it INSIDE the Canvas alongside the wall subtree —
 * it finds its meshes by scene traversal (the `WALL_FADEABLE_FLAG` tag
 * `GlbInstance` stamps), not by ref, so it does not care where in the tree
 * the walls live or which of the two wall renderers produced them.
 *
 * A WALL, not a wall piece, is the unit of fading (Kirk's call: "I think the
 * whole wall can have the opacity... I am not sure we need to be so
 * precise"). The first cut faded individual GLB tiles around the exact spot
 * a mini was hidden, which read as a window cut into the brickwork. Every
 * piece of one wall now shares a single opacity — which also removes the
 * per-tile seams that made blending sort badly, so it is what lets real
 * alpha replace the dithered `alphaHash` stipple.
 *
 * That unit is discovered structurally rather than declared: each wall's
 * pieces already share a parent `<group>` (one per envelope/connector run in
 * WallRunMesh, one per cell/door in SyntyHexWall), and HexGrid wraps the
 * whole lot in a single group tagged `WALLS_ROOT_FLAG`. So the direct child
 * of that root which contains a given mesh IS its wall. No component has to
 * hand out ids, and neither wall renderer needed a new prop.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { WALL_FADEABLE_FLAG } from './GlbInstance';
import type { WorldPos } from './hexMath';
import {
  approachOpacity,
  isInFrontOfTarget,
  type WallSeeThroughDials,
} from './wallSeeThrough';

/** Marker HexGrid puts on the group enclosing every wall renderer, so the
 * driver can resolve "which wall does this mesh belong to" by walking up to
 * that group's direct child. */
export const WALLS_ROOT_FLAG = 'wallsRoot';

/**
 * How far PAST the orbit target the near/far cut sits, world units. Without
 * it, a wall a mini is standing directly against sits at almost exactly the
 * target's own depth and would flicker between faded and solid as they shift
 * within a hex. Roughly one hex.
 */
const NEAR_CUT_MARGIN = 1.5;

/** `'block'` mode: pull each occlusion ray up short of the mini itself, so a
 * wall it stands flush against does not register as blocking it. */
const RAY_EPSILON = 0.05;

/** Below this the fade has visually arrived; snap and stop asking for
 * frames. An exponential approach is asymptotic, so without a snap the
 * driver would invalidate forever, defeating `frameloop="demand"`. */
const SETTLED = 0.002;

/** Cache key for a wall piece's world-space centre, stamped on the mesh's
 * own userData. Walls are static once placed, so this is computed once. */
const CENTER_CACHE = 'wallSeeCenter';

export interface WallSeeThroughProps {
  /**
   * `'block'` mode only: the things that must stay visible — hex-centre
   * world positions of the minis on the board. Ignored in `'near'` mode,
   * which asks about the camera rather than about who is hidden.
   */
  points: ReadonlyArray<WorldPos>;
  /**
   * The camera's own orbit target — the point `useCameraControls` looks at,
   * MUTATED IN PLACE by panning and focus-follow. Held (not copied) so the
   * near/far cut tracks panning without HexGrid re-rendering per frame.
   */
  target: THREE.Vector3;
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

/**
 * The wall a piece belongs to: the ancestor that is a DIRECT child of the
 * walls root. Falls back to the mesh itself if the root is not an ancestor,
 * which degrades to per-piece fading rather than throwing.
 */
function wallUnitFor(
  mesh: THREE.Object3D,
  root: THREE.Object3D
): THREE.Object3D {
  let node: THREE.Object3D = mesh;
  while (node.parent && node.parent !== root) node = node.parent;
  return node.parent === root ? node : mesh;
}

/** Apply one opacity to a piece, toggling the transparent pass only on the
 * edges (opacity crossing 1) rather than every frame — `transparent` moves
 * the object between render lists and needs a material refresh, which is far
 * too expensive to do per frame. */
function applyOpacity(mesh: THREE.Mesh, value: number): void {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  for (const material of materials) {
    const wantsTransparent = value < 1;
    if (material.transparent !== wantsTransparent) {
      material.transparent = wantsTransparent;
      material.needsUpdate = true;
    }
    material.opacity = value;
  }
}

/** Current opacity of a piece — its first material speaks for it, since
 * every material on one wall is driven to the same value. */
function currentOpacity(mesh: THREE.Mesh): number {
  const material = Array.isArray(mesh.material)
    ? mesh.material[0]
    : mesh.material;
  return material?.opacity ?? 1;
}

export function WallSeeThrough({ points, target, dials }: WallSeeThroughProps) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  // Scratch vectors, allocated once. This runs every rendered frame; per-frame
  // `new THREE.Vector3()` here would be steady GC pressure during a drag.
  const scratch = useMemo(
    () => ({
      forward: new THREE.Vector3(),
      origin: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      aim: new THREE.Vector3(),
    }),
    []
  );
  const meshes = useRef<THREE.Mesh[]>([]);
  const units = useRef(new Map<THREE.Object3D, THREE.Mesh[]>());

  useFrame((_, delta) => {
    const { mode, minOpacity, rate, eyeHeight } = dials;

    let root: THREE.Object3D | null = null;
    const walls = meshes.current;
    walls.length = 0;
    // Traversed fresh each frame rather than cached: walls appear and
    // disappear as fog-of-war reveals rooms, and a stale list would leave a
    // newly-revealed wall permanently solid.
    scene.traverse((object) => {
      if (object.userData[WALLS_ROOT_FLAG]) root = object;
      if (
        (object as THREE.Mesh).isMesh &&
        object.userData[WALL_FADEABLE_FLAG]
      ) {
        walls.push(object as THREE.Mesh);
      }
    });
    if (walls.length === 0 || root === null) return;

    // Group the pieces into whole walls.
    const byUnit = units.current;
    byUnit.clear();
    for (const mesh of walls) {
      const unit = wallUnitFor(mesh, root);
      const bucket = byUnit.get(unit);
      if (bucket) bucket.push(mesh);
      else byUnit.set(unit, [mesh]);
    }

    camera.getWorldDirection(scratch.forward);
    const depthOf = (point: THREE.Vector3): number =>
      scratch.direction.subVectors(point, camera.position).dot(scratch.forward);

    // Which whole walls should be see-through this frame?
    const faded = new Set<THREE.Object3D>();
    if (mode === 'near') {
      const targetDepth = depthOf(target);
      for (const [unit, pieces] of byUnit) {
        // The wall's MEAN depth decides for the whole wall — a long run can
        // straddle the cut, and picking either extreme would make it flip on
        // a small camera move.
        let total = 0;
        for (const mesh of pieces) total += depthOf(wallCenter(mesh));
        if (
          isInFrontOfTarget(total / pieces.length, targetDepth, NEAR_CUT_MARGIN)
        ) {
          faded.add(unit);
        }
      }
    } else {
      const isOrthographic =
        (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
      for (const point of points) {
        scratch.aim.set(point.x, eyeHeight, point.z);
        let far: number;
        if (isOrthographic) {
          // An orthographic camera's rays are PARALLEL — the ray reaching
          // this mini is not the one from `camera.position` (that would be a
          // perspective ray, and would report the wrong occluders
          // off-centre). Start on the camera's own image plane instead.
          const along = depthOf(scratch.aim);
          if (along <= RAY_EPSILON) continue;
          far = along - RAY_EPSILON;
          scratch.origin
            .copy(scratch.aim)
            .addScaledVector(scratch.forward, -along);
          raycaster.set(scratch.origin, scratch.forward);
        } else {
          scratch.direction.subVectors(scratch.aim, camera.position);
          const distance = scratch.direction.length();
          if (distance <= RAY_EPSILON) continue;
          far = distance - RAY_EPSILON;
          scratch.direction.divideScalar(distance);
          raycaster.set(camera.position, scratch.direction);
        }
        raycaster.near = 0;
        raycaster.far = far;
        for (const hit of raycaster.intersectObjects(walls, false)) {
          faded.add(wallUnitFor(hit.object, root));
        }
      }
    }

    let animating = false;
    for (const [unit, pieces] of byUnit) {
      const wanted = faded.has(unit) ? minOpacity : 1;
      for (const mesh of pieces) {
        const now = currentOpacity(mesh);
        if (Math.abs(wanted - now) < SETTLED) {
          if (now !== wanted) applyOpacity(mesh, wanted);
          continue;
        }
        applyOpacity(mesh, approachOpacity(now, wanted, rate, delta));
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
