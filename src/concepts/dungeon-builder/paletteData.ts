/**
 * paletteData — the palette's prop vocabulary, sourced from the REAL
 * `propManifest.ts` (`PROP_KEYS`), not a hand-rolled color/icon table.
 * The standalone HTML concept had to invent per-key colors because it had
 * no module system to import the real manifest; this port fixes that —
 * `role` below comes straight from the shared source of truth
 * `src/components/hex-grid/PropModel.tsx` also reads.
 *
 * Filtered to exactly the keys showcase.yaml's own `place:`/`boss:`
 * entries reference (task requirement: no invented refs) — see
 * `SHOWCASE_PROP_KEYS` below for the exact list.
 */
import { PROP_KEYS, type PropRole } from '@/components/hex-grid/propManifest';

export interface PaletteProp {
  ref: string;
  short: string;
  role: PropRole;
}

/**
 * Palette category taxonomy (Kirk's 2026-08-01 ask, see CONTRACT.md's
 * "Palette taxonomy" section). This is a PROPOSED grouping — nothing on
 * the wire carries a category today; `role` (obstacle/cover/decor, from
 * the real propManifest.ts) already exists for a different purpose
 * (board-swatch coloring) and doesn't map 1:1 onto these four buckets. If
 * this taxonomy becomes real, it's the toolkit's refs that would need to
 * grow a category, not this file re-deriving one from `role` forever.
 */
export type PaletteCategory =
  | 'monsters'
  | 'obstacles-props'
  | 'lighting'
  | 'structural'
  | 'markers';

/** Light-emitting props, called out into their own category per Kirk's
 * ask ("Lighting = light-emitting props (brazier, candles, glowing-orb)")
 * — a hand-picked subset of PALETTE_PROPS, not derivable from `role`
 * (brazier/candles/glowing-orb are all `role: 'decor'`, same as
 * non-light-emitting decor like books or banners). */
const LIGHTING_PROP_KEYS = new Set<string>([
  'dnd5e:props:brazier',
  'dnd5e:props:candles',
  'dnd5e:props:glowing-orb',
]);

export function categoryForProp(
  ref: string
): Extract<PaletteCategory, 'obstacles-props' | 'lighting'> {
  return LIGHTING_PROP_KEYS.has(ref) ? 'lighting' : 'obstacles-props';
}

/**
 * Pre-baked palette thumbnails (rpg-dnd5e-web#667, Kirk's "rich entries
 * that SHOW the assets" ask). Baked via the throwaway `?thumbGlb=` R3F
 * harness (`src/concepts/dungeon-builder/thumbs/ThumbHarness.tsx`) +
 * `game-dev/tools/browser/screenshot.mjs` — see that harness file's own
 * doc comment and CONTRACT.md's "Thumbnail provenance" section for the
 * exact bake process. Filename convention: `<ref's last segment>.png`
 * (e.g. `dnd5e:props:pillar` -> `thumbs/pillar.png`). `import.meta.glob`
 * rather than one static import per key so a newly-baked thumbnail is
 * picked up automatically without touching this file — a ref with no
 * baked thumbnail yet resolves to `undefined` and the palette Row falls
 * back to its colored-swatch+short-label rendering (same as before this
 * change), never a broken <img>.
 */
const THUMB_MODULES = import.meta.glob<string>('./thumbs/*.png', {
  eager: true,
  import: 'default',
});

export function thumbForRef(ref: string): string | undefined {
  const slug = ref.split(':').pop();
  return slug ? THUMB_MODULES[`./thumbs/${slug}.png`] : undefined;
}

/** Role -> board swatch color. Not itself wire data (propManifest.ts's
 * `role` is a client-only rendering concept — see CONTRACT.md's "prop
 * visual metadata" finding) — this mapping is this concept's own choice,
 * invented once here rather than per-key like the standalone version. */
export const ROLE_COLOR: Record<PropRole, string> = {
  obstacle: '#8a4a3a',
  cover: '#4a6a8a',
  decor: '#b8922a',
};

const SHOWCASE_PROP_KEYS = [
  'dnd5e:props:pillar',
  'dnd5e:props:brazier',
  'dnd5e:props:bone-pile',
  'dnd5e:props:statue-reaper',
  'dnd5e:props:statue-knight-hooded',
  'dnd5e:props:wall-banner',
  'dnd5e:props:altar',
  'dnd5e:props:glowing-orb',
  'dnd5e:props:candles',
  'dnd5e:props:tomb-open',
  'dnd5e:props:chains',
  'dnd5e:props:skeleton-remains',
] as const;

function shortLabel(key: string): string {
  const name = key.split(':').pop() ?? key;
  const parts = name.split('-');
  if (parts.length === 1) return name.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** The palette's prop list — one entry per key showcase.yaml references,
 * pulling `role` from the first variant `propManifest` lists for that key
 * (same "first available" convention `resolvePropVariant` itself uses). A
 * key that's somehow missing from `PROP_KEYS` is dropped rather than
 * crashing the board — the concept should degrade, not blank-page, if the
 * manifest and showcase.yaml ever drift. */
export const PALETTE_PROPS: PaletteProp[] = SHOWCASE_PROP_KEYS.flatMap(
  (ref) => {
    const variant = PROP_KEYS[ref]?.[0];
    if (!variant) return [];
    return [{ ref, short: shortLabel(ref), role: variant.role }];
  }
);

/** showcase.yaml's only monster ref, placeable both as the boss pin
 * (`boss:`, the one field-level exception) and via a general `place:`
 * entry — the latter verified real against `monster-place-check.json`,
 * see `fixtures.ts`. */
export const MONSTER_REF = 'dnd5e:monsters:skeleton-captain';
export const MONSTER_COLOR = '#a02020';
export const BOSS_COLOR = '#7a1414';
