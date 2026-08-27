/**
 * Pure helpers for SyntyHexFloor.tsx — split out per the react-refresh
 * ESLint rule (component files may only export components; matches
 * syntyHexWallHelpers.ts's identical split).
 *
 * Unlit floor pooling (rpg-dnd5e-web#558 follow-up, look-lab lighting
 * experiment): PR #566/#585 tried making mood lights pool on the floor by
 * switching it to a lit `MeshStandardMaterial`, and PR #587 reverted that
 * — it reintroduced the #481 cross-environment tone-mapping variance on
 * the one surface covering most of the screen (see SyntyHexFloor.tsx's
 * doc comment for the full history). This is a different lever entirely:
 * keep the floor's unlit `MeshBasicMaterial` (still environment-
 * independent — no scene light or tone-mapping path involved) and instead
 * compute a deterministic per-tile color blend toward each nearby mood
 * light's own color, using the exact same position/color/distance specs
 * `buildThemeMoodLights` already produces for the real `<pointLight>`s
 * (playtestMapHelpers.ts). Because this is pure math over world
 * coordinates rather than a renderer/tone-mapping-dependent material
 * response, it reads identically on every device — no local-vs-deployed
 * risk of the kind #481/#587 hit.
 */

import * as THREE from 'three';

/** Shape-compatible with playtestMapHelpers.ts's exported `MoodPointLight`
 * — deliberately duplicated rather than imported (same reason HexGrid.tsx
 * inlines this same shape for its own `moodPointLights` prop instead of
 * importing the type): keeps hex-grid's rendering primitives free of a
 * dependency on the playtest/theme-authoring module. `intensity` isn't
 * used by the falloff math below (unlike a real point light, this pool
 * has no separate brightness knob — only reach, via `distance`, and hue,
 * via `color`) but is accepted anyway so callers can pass the exact same
 * array they already built for `moodPointLights` without remapping it. */
export interface FloorPoolLight {
  readonly position: readonly [number, number, number];
  readonly color: string;
  readonly intensity?: number;
  readonly distance: number;
  readonly floorPoolStrength?: number;
}

export interface DungeonFloorLighting {
  readonly exposureByCell: ReadonlyMap<string, number>;
  readonly poolsByCell: ReadonlyMap<string, readonly FloorPoolLight[]>;
}

export const CRYPT_DARK_FLOOR_TINT = new THREE.Color('#101318');
export const CRYPT_FLOOR_TINT = new THREE.Color(0.35, 0.38, 0.46);

export function cryptFloorBaseColor(intensity: number): THREE.Color {
  return CRYPT_DARK_FLOOR_TINT.clone().lerp(
    CRYPT_FLOOR_TINT,
    Math.max(0, Math.min(1, intensity))
  );
}

/**
 * Upper bound on how far a pool blend can push the floor tint toward a
 * light's own color, regardless of how many overlapping lights a tile
 * sits under. Keeps the floor legible as tinted STONE with a warm/green
 * glow near it, rather than ever fully replacing the tint with a flat
 * light color (which would read as a colored decal, not a pool).
 */
export const MAX_FLOOR_POOL_BLEND = 0.55;

/**
 * Deterministic per-tile color blend: each light within its own
 * `distance` of `(worldX, worldZ)` contributes a quadratic-falloff weight
 * (`(1 - dist/distance)^2`, chosen to approximate the visual falloff of
 * the real `<pointLight decay={2}>` this shares its position/distance
 * with, so the floor pool's reach matches where the point light itself
 * actually stops affecting the lit walls/props around it) toward that
 * light's color. Multiple overlapping lights blend via a weighted
 * average of their colors (nearer/stronger lights dominate the resulting
 * hue) rather than being applied one after another, so overlapping a warm
 * brazier and a green candle pool doesn't just let whichever light was
 * processed last win. The combined weight is capped at
 * `MAX_FLOOR_POOL_BLEND` before the final lerp away from `base`.
 *
 * Pure function of world position + light specs — no THREE scene/camera
 * state, no lit material, no tone mapping — so it produces the exact same
 * color on every device. `base` is never mutated; a new Color is
 * returned (or `base` itself, unchanged, when no light reaches this
 * tile).
 */
export function computeFloorPoolColor(
  base: THREE.Color,
  worldX: number,
  worldZ: number,
  lights: readonly FloorPoolLight[]
): THREE.Color {
  let weightSum = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  // Single scratch Color reused for parsing every light's color string
  // this call (Copilot review, PR #620) — `new THREE.Color(light.color)`
  // inside the loop allocated one object per light per tile per render;
  // `.set()` only ever needs to be read immediately into r/g/b below, so
  // one reused instance is equivalent and avoids that per-light churn.
  const scratch = new THREE.Color();
  for (const light of lights) {
    if (light.distance <= 0) continue;
    const dx = worldX - light.position[0];
    const dz = worldZ - light.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= light.distance) continue;
    const t = 1 - dist / light.distance;
    const weight = t * t * (light.floorPoolStrength ?? 1);
    if (weight <= 0) continue;
    scratch.set(light.color);
    r += scratch.r * weight;
    g += scratch.g * weight;
    b += scratch.b * weight;
    weightSum += weight;
  }
  if (weightSum <= 0) return base;
  const avg = new THREE.Color(r / weightSum, g / weightSum, b / weightSum);
  const blendStrength = Math.min(weightSum, MAX_FLOOR_POOL_BLEND);
  return base.clone().lerp(avg, blendStrength);
}
