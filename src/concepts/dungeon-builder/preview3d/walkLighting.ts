/**
 * walkLighting — derives R3F point-light configs from placed light-family
 * props (`paletteData.ts`'s Lighting category: brazier/candles/
 * glowing-orb) plus the doc's own `lighting: {ambient}` dialect knob
 * (TARGET-YAML.md), for the author-walkthrough's Walk mode (rpg-project
 * #169, Kirk's day-one ask: "a 3d view from the player perspective that
 * has the lighting loaded"). Pure — no Three.js/R3F import — the same
 * "pure derivation, component just maps it to JSX" shape this file's
 * neighbor `DungeonPreview3D.tsx` already uses throughout (`buildWalls`,
 * `buildPlacements`, etc.).
 *
 * **Color/intensity/distance provenance — game-derived, not guessed.**
 * The three specs below are a LOCAL COPY of the real game's own
 * `MOOD_LIGHT_SPEC_BY_PROP_REF` entries for these exact three refs
 * (`src/components/playtest/playtestMapHelpers.ts`, Kirk's original
 * POLYGON Dark Fortress reference — "near-dark ambient with sickly green
 * pools of light around light-source props, warm orange around
 * braziers/torches"), read as of 2026-08-05, not re-derived from first
 * principles — so this concept's lighting reads like the game's own mood
 * lighting instead of an independently-guessed palette. Deliberately a
 * COPY, not an import: `playtestMapHelpers.ts` is game-route-coupled (its
 * own functions take `RenderableEntity`/proto `Wall` shapes this concept
 * doesn't have and never will — TARGET-YAML.md's whole "dialect runs
 * ahead" discipline keeps this concept's own rendering self-contained
 * rather than reaching into game rendering code for values that happen to
 * be reusable). `decay: 2` (not itself part of a `MoodLightSpec`, since
 * the game hardcodes it identically on every `<pointLight>`) matches
 * `HexGrid.tsx`'s own convention exactly, same reasoning.
 */
import type { DungeonDoc } from '../dungeonYaml';

export interface WalkPointLight {
  key: string;
  position: [number, number, number];
  color: string;
  intensity: number;
  distance: number;
}

/** Structural subset of `DungeonPreview3D.tsx`'s own (unexported)
 * `PlacedProp` — every field this module actually reads. Kept as a local
 * duck-type rather than importing/exporting `PlacedProp` itself so this
 * module stays a one-directional consumer of already-resolved render
 * data, not a second thing `DungeonPreview3D.tsx` has to keep in sync. */
export interface LightableProp {
  key: string;
  position: [number, number, number];
  variantRef: string;
}

interface LightSpec {
  color: string;
  intensity: number;
  distance: number;
}

/** Warm-orange glow — shared by brazier here, same as the game's own
 * palette (`WARM_LIGHT_COLOR`, shared there by 5 fixtures) — kept as one
 * named constant rather than a repeated literal for the same "one warm
 * family" reasoning, even though only one entry uses it in this
 * concept's smaller 3-key palette. */
const WARM_LIGHT_COLOR = '#ff9d52';
/** Saturated rune-blue — the game's own `RUNE_BLUE_COLOR`, reused here
 * for `glowing-orb` exactly as the game uses it for that same ref. */
const RUNE_BLUE_COLOR = '#3d84dc';

/** propRef (last `:`-separated segment, matching `paletteData.ts`'s
 * `LIGHTING_PROP_KEYS` membership) -> light spec. Exactly the three keys
 * this concept's own Lighting palette category offers — a prop ref this
 * concept can't even place never needs an entry here. */
const LIGHT_SPEC_BY_PROP_REF: Record<string, LightSpec> = {
  candles: { color: '#3ddc84', intensity: 2, distance: 4.5 },
  'glowing-orb': { color: RUNE_BLUE_COLOR, intensity: 2, distance: 4.5 },
  brazier: { color: WARM_LIGHT_COLOR, intensity: 2.8, distance: 5.5 },
};

/** Every `<pointLight>` renders at `decay={2}` — `HexGrid.tsx`'s own
 * fixed convention for every mood point light, reused verbatim rather
 * than re-tuned. */
export const WALK_LIGHT_DECAY = 2;

/**
 * One light per placed prop whose ref matches the Lighting category —
 * position is the prop's OWN already-resolved render position
 * (`DungeonPreview3D.tsx`'s `buildOnePlacement`, which already applies
 * `resolvePlacement(...).height`), so a floating candle's light floats
 * with it and a floor-standing brazier's light sits at the floor —
 * literally "at its position (+height if set)," no separate flame-height
 * offset invented on top. A prop whose ref isn't a known light source is
 * skipped, matching the game's own `buildCryptMoodLights`'s "adding
 * non-light dressing never produces a light" behavior.
 */
export function deriveWalkLights(
  props: readonly LightableProp[]
): WalkPointLight[] {
  const lights: WalkPointLight[] = [];
  for (const p of props) {
    const refKey = p.variantRef.split(':').pop();
    const spec = refKey ? LIGHT_SPEC_BY_PROP_REF[refKey] : undefined;
    if (!spec) continue;
    lights.push({ key: `light:${p.key}`, position: p.position, ...spec });
  }
  return lights;
}

/** Upper bound on simultaneous point lights — mirrors the game's own
 * `MOOD_LIGHT_BUDGET` headroom reasoning (a densely-dressed room can
 * legitimately place more light-family props than is free to light
 * individually; "performance is a standing requirement" per that file's
 * own doc comment) at this concept's own, much smaller authoring scale —
 * 12 comfortably exceeds any hand-authored showcase content today while
 * still bounding a hypothetical dense one. */
export const WALK_LIGHT_BUDGET = 12;

/**
 * Cap `lights` at `maxCount`, keeping the ones nearest `referenceXZ` when
 * given — the SAME shape as the game's own `capMoodLights`
 * (`playtestMapHelpers.ts`): a no-op under budget, a plain positional
 * slice with no reference (Orbit mode, or before Walk mode has resolved a
 * player cell), else nearest-first selection with the ORIGINAL relative
 * order preserved in the return value (not sorted by distance) — so a
 * `<pointLight key={i}>`-style consumer never has a light's identity
 * silently reassigned to a different array slot between renders as the
 * reference moves. This concept's own local copy rather than an import
 * for the same "game-route-coupled module" reason `LIGHT_SPEC_BY_PROP_REF`
 * above is a copy, not a shared import.
 */
export function capWalkLights(
  lights: readonly WalkPointLight[],
  maxCount: number,
  referenceXZ?: readonly [number, number]
): WalkPointLight[] {
  if (lights.length <= maxCount) return [...lights];
  if (!referenceXZ) return lights.slice(0, maxCount);
  const [refX, refZ] = referenceXZ;
  const sqDistance = (light: WalkPointLight) =>
    (light.position[0] - refX) ** 2 + (light.position[2] - refZ) ** 2;
  const nearest = [...lights]
    .sort((a, b) => sqDistance(a) - sqDistance(b))
    .slice(0, maxCount);
  const kept = new Set(nearest);
  return lights.filter((light) => kept.has(light));
}

/** This preview's own pre-existing hardcoded `<ambientLight
 * intensity={0.8}>` — the fallback `resolveAmbientIntensity` returns for
 * every document with no `lighting:` block, so a document authored before
 * this field existed (the overwhelming majority) renders byte-identical
 * ambient to before this unit. Also the reference baseline
 * `resolveDirectionalScale` measures against — see that function's own
 * doc comment for why. */
const DEFAULT_AMBIENT = 0.8;

/** The doc's `lighting.ambient` dialect field (TARGET-YAML.md: "an
 * intensity knob now... 0..1, dungeon-wide multiplier. The only knob
 * today"), read as a DIRECT intensity value for the scene's
 * `<ambientLight>` — not a secondary multiplier layered on top of
 * `DEFAULT_AMBIENT`, so the annotated example's own `ambient: 0.8` (the
 * exact current default) renders as a genuine no-op, matching "default =
 * current preview ambient." target-dialect-only: real today only in this
 * concept's own render, never sent to `PutDungeon` (`stripToV1Subset`
 * drops `lighting:` entirely, unchanged by this unit). */
export function resolveAmbientIntensity(
  doc: Pick<DungeonDoc, 'lighting'>
): number {
  return doc.lighting?.ambient ?? DEFAULT_AMBIENT;
}

/**
 * Scale factor for the preview's two `<directionalLight>` fixtures,
 * relative to `DEFAULT_AMBIENT` — so lowering `lighting.ambient` actually
 * darkens the WHOLE scene, not just the flat ambient term. Without this,
 * a `lighting: {ambient: 0.1}` document would still render nearly as
 * bright as today under the fixed key/fill directional lights, defeating
 * "a dark room with low ambient" as a renderable target (this unit's own
 * verification goal) — the point-light pools would barely read against
 * an otherwise fully "of-course-it's-lit" room. A document with no
 * `lighting:`, or an explicit `ambient: 0.8` (the annotated example's own
 * value), scales by exactly 1 — byte-identical directional intensities
 * to every render before this unit.
 */
export function resolveDirectionalScale(
  doc: Pick<DungeonDoc, 'lighting'>
): number {
  return resolveAmbientIntensity(doc) / DEFAULT_AMBIENT;
}
