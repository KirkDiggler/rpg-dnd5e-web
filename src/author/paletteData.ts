/**
 * paletteData — the palette's prop AND monster vocabulary, sourced from the
 * REAL `propManifest.ts` (`PROP_KEYS`) and `monsterModels.ts`
 * (`resolveMonsterModelUrl`), not a hand-rolled color/icon table. The
 * standalone HTML concept had to invent per-key colors because it had no
 * module system to import the real manifest; this port fixes that — `role`
 * below comes straight from the shared source of truth
 * `src/components/hex-grid/PropModel.tsx` also reads.
 *
 * Prop scope (2026-08-07 "palette content sync" unit, superseding the
 * original `SHOWCASE_PROP_KEYS` restriction below): every key
 * `propManifest.ts` defines, not just the 12 keys one showcase dungeon
 * happened to use. Kirk's ask this round was explicit — "we have 2 zombies
 * and more props to use, I would like to get them added as options in our
 * builder" — i.e. the FULL authorable vocabulary (ref exists AND resolves
 * to a real, synced GLB), not one showcase's actual usage. See
 * `ALL_PROP_KEYS` below.
 */
import { resolveMonsterModelUrl } from '@/components/hex-grid/monsterModels';
import { PROP_KEYS, type PropRole } from '@/components/hex-grid/propManifest';
import { refInitials, refLabel, refSlug } from '@/utils/refs';
import { isDungeonLightSourceRef } from '../rendering/dungeonLightSources';

export interface PaletteProp {
  ref: string;
  short: string;
  label: string;
  role: PropRole;
  blocksMovement: boolean;
  blocksLoS: boolean;
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

/** Light-emitting props are categorized from the shared eight-ref manifest
 * in `src/rendering/dungeonLightSources.ts`. Plain torch and stone-lantern
 * remain ordinary props because they are not manifest sources. */
export function categoryForProp(
  ref: string
): Extract<PaletteCategory, 'obstacles-props' | 'lighting'> {
  return isDungeonLightSourceRef(ref) ? 'lighting' : 'obstacles-props';
}

/**
 * Pre-baked palette thumbnails (rpg-dnd5e-web#667, Kirk's "rich entries
 * that SHOW the assets" ask). Baked via the throwaway `?thumbGlb=` R3F
 * harness (`src/dev/ThumbHarness.tsx`) +
 * `game-dev/tools/browser/screenshot.mjs` — see that harness file's own
 * doc comment and CONTRACT.md's "Thumbnail provenance" section for the
 * exact bake process. Filename convention: `<ref's last segment>.png`
 * (e.g. `dnd5e:props:pillar` -> `thumbs/pillar.png`). `import.meta.glob`
 * rather than one static import per key so a newly-baked thumbnail is
 * picked up automatically without touching this file — a ref with no
 * baked thumbnail yet resolves to `undefined` and the palette Row falls
 * back to its colored-swatch+short-label rendering (same as before this
 * change), never a broken <img>. A multi-part id slugs to one filename
 * (`dnd5e:props:plushie:skeleton-dog` -> `thumbs/plushie-skeleton-dog.png`)
 * so two variants of different families never fight over one thumbnail.
 *
 */
const THUMB_MODULES = import.meta.glob<string>('./thumbs/*.png', {
  eager: true,
  import: 'default',
});

export function thumbForRef(ref: string): string | undefined {
  const slug = refSlug(ref);
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

/** Every key `propManifest.ts`'s `PROP_KEYS` defines — `Object.keys` rather
 * than a hand-listed array so a newly-synced manifest key appears in the
 * palette automatically, with no second place to remember to update. Safe
 * because the ref-AND-GLB test is already enforced once, upstream, by
 * `propManifest.ts`'s own `EXPECTED_PROP_KEYS` guard test (every key it
 * lists is verified to resolve to a loadable `.glb`) — this file doesn't
 * re-check that, it just trusts the manifest it imports. Verified by hand
 * for this unit too: all 90 `file:` references across all 44 current keys
 * resolve under `public/models/synty/`. */
const ALL_PROP_KEYS = Object.keys(PROP_KEYS);

/** The palette's own Title Case over the shared reading rule — see
 * `refLabel`, which is what decides where the words are. */
function displayLabel(key: string): string {
  return refLabel(key)
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** The palette's prop list — one entry per key `propManifest.ts` defines
 * (see `ALL_PROP_KEYS`), pulling `role` from the first variant
 * `propManifest` lists for that key (same "first available" convention
 * `resolvePropVariant` itself uses). A key that's somehow missing from
 * `PROP_KEYS` is dropped rather than crashing the board — the concept
 * should degrade, not blank-page, if the manifest and this list ever
 * drift (structurally impossible today since `ALL_PROP_KEYS` is derived
 * FROM `PROP_KEYS`, but kept as defensive flatMap rather than a direct
 * map for the same reason the original showcase-scoped version had it). */
export const PALETTE_PROPS: PaletteProp[] = ALL_PROP_KEYS.flatMap((ref) => {
  const variant = PROP_KEYS[ref]?.[0];
  if (!variant) return [];
  return [
    {
      ref,
      short: refInitials(ref),
      label: variant.displayName ?? displayLabel(ref),
      role: variant.role,
      blocksMovement: variant.blocksMovement ?? variant.role !== 'decor',
      blocksLoS: variant.blocksLoS,
    },
  ];
});

export const MONSTER_COLOR = '#a02020';
export const BOSS_COLOR = '#7a1414';

export interface PaletteMonster {
  /** Full dungeonspec ref, e.g. `dnd5e:monsters:zombie`. */
  ref: string;
  /** The bare rpg-toolkit ref id `monsterModels.ts` keys
   * `MONSTER_REF_MODELS`/`resolveMonsterModelUrl` by — `ref` with its
   * `dnd5e:monsters:` prefix stripped, same convention
   * `PreviewMonsterModel.tsx` documents. */
  refId: string;
  short: string;
  label: string;
  sub: string;
  /** This ref may also be placed as a room's `boss:` pin. dungeonspec
   * itself doesn't gate `boss:` to a specific ref value — it only requires
   * exactly one boss per boss-archetype room (`dungeonYaml.ts`'s
   * `isMonster` check is ref-PREFIX-general: `p.ref.startsWith(
   * 'dnd5e:monsters:')`, true for any monster). Scoped to
   * skeleton-captain only THIS round: it's the one ref whose rules
   * identity is boss-shaped (rpg-project#110 Slice 3 / rpg-toolkit#816 —
   * "NOT a wight, NOT a juvenile variant of a bigger monster," the boss's
   * OWN identity), and showcase.yaml's existing boss room already uses
   * it. Offering skeleton/zombie as boss options too is a real,
   * independent design question (should a boss room be able to feature a
   * mook-tier ref?) this task's brief didn't ask to answer — narrower,
   * honest scope beats inventing that UX unasked. */
  bossable?: boolean;
}

/**
 * The palette's monster vocabulary — every rpg-toolkit monster ref that
 * passes the ref-AND-GLB test: `monsterModels.ts`'s `MONSTER_REF_MODELS`
 * maps it to a promoted GLB (verified below via `resolveMonsterModelUrl`,
 * not asserted), same discipline `ALL_PROP_KEYS` applies on the prop side.
 * `rulebooks/dnd5e/refs/monsters.go`'s Undead set is Skeleton/Zombie/
 * SkeletonArcher/SkeletonCaptain/Ghoul — five real toolkit refs — but
 * `MONSTER_REF_MODELS` only maps three of them to art:
 *
 * - `ghoul` / `skeleton-archer`: real toolkit refs, but NEITHER has a
 *   promoted GLB (`monsterModels.ts`'s own doc comment). Excluded — ref
 *   without GLB fails the test the same way a GLB without a ref would.
 * - `ghost` / `specter` / `tormented-soul`: promoted GLBs exist
 *   (`Character_Ghost_01/02`, `Character_Tormented_Soul`), but NO
 *   rpg-toolkit ref exists for any of them yet. Excluded for the mirror
 *   reason — GLB without a ref is equally unauthorable; the palette can't
 *   place a reference that doesn't exist.
 *
 * `zombie` gets ONE palette entry, and as of 2026-09-11 it maps to ONE look
 * (`zombie-peasant-female.glb`/gaunt). rpg-dnd5e-web#673 had briefly mapped
 * two (`zombie-mutant.glb`/hulking alongside it) and let
 * `pickStableCandidateIndex` choose per entity; Kirk narrowed that to a single
 * look, so the palette entry and the rendered result now agree exactly.
 *
 * `thumbs/zombie.png` was rebaked in that same change. The committed thumbnail
 * was verified (byte-identical to a fresh bake of `zombie-mutant.glb`) to be
 * the HULKING look — so leaving it would have made the palette preview a model
 * the game no longer renders. Rebaked from `zombie-peasant-female.glb` through
 * the same `?thumbGlb=` harness at the same 128x128, which reproduces the
 * original bakes byte-for-byte.
 *
 * The author still places the REF, not the look — that has not changed, and it
 * is the reason a second look could never be an authoring choice under the
 * current dungeonspec: a `place:` line carries a ref and nothing else. If
 * per-placement appearance is ever wanted, it is a dungeonspec question first
 * and a palette question second, not another array entry.
 */
export const PALETTE_MONSTERS: PaletteMonster[] = (
  [
    {
      ref: 'dnd5e:monsters:skeleton',
      refId: 'skeleton',
      short: 'Sk',
      label: 'skeleton',
      sub: 'flags forced off — dungeonspec rejects blocks_* on monster place: entries',
    },
    {
      ref: 'dnd5e:monsters:skeleton-captain',
      refId: 'skeleton-captain',
      short: 'Sc',
      label: 'skeleton-captain',
      sub: 'flags forced off — dungeonspec rejects blocks_* on monster place: entries',
      bossable: true,
    },
    {
      ref: 'dnd5e:monsters:zombie',
      refId: 'zombie',
      short: 'Zo',
      label: 'zombie',
      sub: 'flags forced off, same as every monster place: entry · renders as the gaunt look',
    },
  ] satisfies PaletteMonster[]
).filter(
  (m) => resolveMonsterModelUrl(m.refId, undefined, false) !== undefined
);

/** Friendly palette/board copy for an ordinary authored ref. The stable ref
 * remains the lookup key; it is not forced into the author's hover text. */
export function paletteNameForRef(ref: string): string {
  return (
    PALETTE_PROPS.find((item) => item.ref === ref)?.label ??
    PALETTE_MONSTERS.find((item) => item.ref === ref)
      ?.label?.replaceAll('-', ' ')
      .replace(/^./, (first) => first.toUpperCase()) ??
    displayLabel(ref)
  );
}
