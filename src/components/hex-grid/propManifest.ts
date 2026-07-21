/**
 * Prop reference-key manifest (rpg-dnd5e-web#528, charter #523, wave 1).
 * rpg-game-assets' scripts/build_prop_manifest.py generates
 * harness/models/synty/props/manifest.json — a `roles` tree (obstacle/
 * cover/decor, per rpg-dnd5e-web#513) PLUS a derived `keys` index (key ->
 * variant pieces[]) keyed by the stable `dnd5e:props:<name>` reference key
 * rpg-game-assets#12 added per piece. This file is the game-side mirror of
 * that `keys` index — hardcoded here rather than fetched at runtime,
 * matching this codebase's established convention for manifest-derived
 * constants (see classCharacterModels.ts's CLASS_CHARACTER_MODELS,
 * syntyHexWallHelpers.ts's WALL_VARIANTS — both copied from their source
 * manifest/inspection data for the same reason: `npm run assets:sync`
 * populates public/models/synty/ from the private, gitignored asset repo,
 * so nothing in CI can rely on fetching or importing that JSON at
 * build/test time).
 *
 * ENTRY POINT for consumers: `resolvePropVariant(key)` /
 * `resolvePropModelUrl(key)`. Everything else in this file is either the
 * data these two read or the guard-test scaffolding
 * (`EXPECTED_PROP_KEYS`).
 *
 * Keep in sync with rpg-game-assets:harness/models/synty/props/manifest.json
 * by hand, same discipline as the sibling constants above — re-run
 * `python3 scripts/build_prop_manifest.py` in rpg-game-assets and diff its
 * `keys` section against this file after any prop-role-map.json change.
 */

export type PropRole = 'obstacle' | 'cover' | 'decor';

export interface PropVariant {
  /** Piece name, e.g. "SM_Prop_Barrel_01" — for debugging/logging only. */
  name: string;
  /** Path relative to PROPS_MODEL_BASE, e.g. "props/SM_Prop_Barrel_01.glb". */
  file: string;
  role: PropRole;
  /** Hex footprint from the manifest's measured geometry. Not consumed as
   * a render-time scale multiplier (see PropModel.tsx) — reserved for
   * placement-sanity checks/asserts and future multi-hex layout logic. */
  footprintHexes: number;
  blocksLoS: boolean;
}

/** Base path props are synced to under public/ (npm run assets:sync
 * mirrors rpg-game-assets:harness/models/synty/ -> public/models/synty/).
 * Note this is the SYNTY root, not .../props/ — every `file` value above
 * (mirroring the source manifest's own `file` field) already carries its
 * own `props/` prefix, so concatenating a `.../props/` base here would
 * double it up (`.../props/props/SM_....glb`, a 404). Exported so
 * PropModel.tsx (the useGLTF loader) and HexEntity.tsx (the load-failure
 * tracking key) build the identical url from the same source, never two
 * independently-typed copies of this path. */
export const PROPS_MODEL_BASE = '/models/synty/';

/**
 * key -> ordered variant list, mirroring rpg-game-assets manifest.json's
 * `keys` index exactly (the wave-1 17 keys agreed on the #523 comment
 * thread, plus the 12 keys #559's crypt-dressing wave appended -- 29
 * total). Variant order matches the source manifest's piece order.
 */
export const PROP_KEYS: Record<string, PropVariant[]> = {
  'dnd5e:props:pillar': [
    {
      name: 'SM_Env_Pillar_Round_01',
      file: 'props/SM_Env_Pillar_Round_01.glb',
      role: 'obstacle',
      footprintHexes: 1,
      blocksLoS: true,
    },
    {
      name: 'SM_Env_Pillar_Square_Simple_01',
      file: 'props/SM_Env_Pillar_Square_Simple_01.glb',
      role: 'obstacle',
      footprintHexes: 1,
      blocksLoS: true,
    },
  ],
  'dnd5e:props:rune-stone': [
    {
      name: 'SM_Env_Rune_Pillar_01',
      file: 'props/SM_Env_Rune_Pillar_01.glb',
      role: 'obstacle',
      footprintHexes: 1,
      blocksLoS: true,
    },
  ],
  'dnd5e:props:stalagmite': [
    {
      name: 'SM_Env_Stalagmite_03',
      file: 'props/SM_Env_Stalagmite_03.glb',
      role: 'obstacle',
      footprintHexes: 1,
      blocksLoS: true,
    },
    {
      name: 'SM_Env_Stalagmite_05',
      file: 'props/SM_Env_Stalagmite_05.glb',
      role: 'obstacle',
      footprintHexes: 1,
      blocksLoS: true,
    },
  ],
  // Spans two roles deliberately — same rock-pile family at different
  // scale, not different concepts (rpg-game-assets#12's role-map $keyNote).
  'dnd5e:props:rock-pile': [
    {
      name: 'SM_Env_RockPile_Square_02',
      file: 'props/SM_Env_RockPile_Square_02.glb',
      role: 'obstacle',
      footprintHexes: 2,
      blocksLoS: true,
    },
    {
      name: 'SM_Env_RockPile_Rounded_01',
      file: 'props/SM_Env_RockPile_Rounded_01.glb',
      role: 'cover',
      footprintHexes: 2,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:barricade': [
    {
      name: 'SM_Prop_Goblin_Spikes_02',
      file: 'props/SM_Prop_Goblin_Spikes_02.glb',
      role: 'obstacle',
      footprintHexes: 3,
      blocksLoS: true,
    },
  ],
  'dnd5e:props:bookcase': [
    {
      name: 'SM_Prop_Bookcase_Small_01',
      file: 'props/SM_Prop_Bookcase_Small_01.glb',
      role: 'obstacle',
      footprintHexes: 2,
      blocksLoS: true,
    },
  ],
  'dnd5e:props:barrel': [
    {
      name: 'SM_Prop_Barrel_01',
      file: 'props/SM_Prop_Barrel_01.glb',
      role: 'cover',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Barrel_Broken_01',
      file: 'props/SM_Prop_Barrel_Broken_01.glb',
      role: 'cover',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:crate': [
    {
      name: 'SM_Prop_Crate_Wood_02',
      file: 'props/SM_Prop_Crate_Wood_02.glb',
      role: 'cover',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Crate_Metal_01',
      file: 'props/SM_Prop_Crate_Metal_01.glb',
      role: 'cover',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Crate_Ornate_01',
      file: 'props/SM_Prop_Crate_Ornate_01.glb',
      role: 'cover',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:chest': [
    {
      name: 'SM_Prop_Chest_01',
      file: 'props/SM_Prop_Chest_01.glb',
      role: 'cover',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:rocks': [
    {
      name: 'SM_Prop_Crate_Rocks_01',
      file: 'props/SM_Prop_Crate_Rocks_01.glb',
      role: 'cover',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:log-spike': [
    {
      name: 'SM_Prop_Log_Spike_02',
      file: 'props/SM_Prop_Log_Spike_02.glb',
      role: 'cover',
      footprintHexes: 1,
      blocksLoS: true,
    },
  ],
  'dnd5e:props:tomb': [
    {
      name: 'SM_Prop_Tomb_01',
      file: 'props/SM_Prop_Tomb_01.glb',
      role: 'cover',
      footprintHexes: 2,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:candles': [
    {
      name: 'SM_Prop_Candle_01',
      file: 'props/SM_Prop_Candle_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Candle_Stand_01',
      file: 'props/SM_Prop_Candle_Stand_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:vase': [
    {
      name: 'SM_Prop_Vase_01',
      file: 'props/SM_Prop_Vase_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Vase_03',
      file: 'props/SM_Prop_Vase_03.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:banner': [
    {
      name: 'SM_Prop_Wall_Banner_01',
      file: 'props/SM_Prop_Wall_Banner_01.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:books': [
    {
      name: 'SM_Prop_Book_Pile_01',
      file: 'props/SM_Prop_Book_Pile_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Book_Pile_02',
      file: 'props/SM_Prop_Book_Pile_02.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:armor-stand': [
    {
      name: 'SM_Prop_KnightStand_01',
      file: 'props/SM_Prop_KnightStand_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],

  // --- rpg-dnd5e-web#559 crypt-dressing wave (rpg-game-assets#22/#23,
  // both merged) -- 12 newly-minted keys extending the wave-1 17-key list
  // per prop-role-map.json's $crypt559KeysNote. All themes: ["crypt"]. ---
  'dnd5e:props:altar': [
    {
      name: 'SM_Env_Alter_01',
      file: 'props/SM_Env_Alter_01.glb',
      role: 'obstacle',
      footprintHexes: 3,
      blocksLoS: true,
    },
  ],
  'dnd5e:props:statue-reaper': [
    {
      name: 'SM_Env_Statue_01',
      file: 'props/SM_Env_Statue_01.glb',
      role: 'obstacle',
      footprintHexes: 3,
      blocksLoS: true,
    },
  ],
  'dnd5e:props:statue-knight-hooded': [
    {
      name: 'SM_Env_Statue_03',
      file: 'props/SM_Env_Statue_03.glb',
      role: 'obstacle',
      footprintHexes: 2,
      blocksLoS: true,
    },
  ],
  'dnd5e:props:obelisk': [
    {
      name: 'SM_Env_Obelisk_01',
      file: 'props/SM_Env_Obelisk_01.glb',
      role: 'obstacle',
      footprintHexes: 3,
      blocksLoS: true,
    },
  ],
  'dnd5e:props:skeleton-cage': [
    {
      name: 'SM_Prop_Skeleton_Cage_01',
      file: 'props/SM_Prop_Skeleton_Cage_01.glb',
      role: 'obstacle',
      footprintHexes: 1,
      blocksLoS: true,
    },
  ],
  'dnd5e:props:coffin': [
    {
      name: 'SM_Prop_Coffin_01',
      file: 'props/SM_Prop_Coffin_01.glb',
      role: 'cover',
      footprintHexes: 2,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:skeleton-table': [
    {
      name: 'SM_Prop_Skeleton_Table_01',
      file: 'props/SM_Prop_Skeleton_Table_01.glb',
      role: 'cover',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  // Shares one key across 4 size/shape variants -- same bone-pile family,
  // same $keyNote convention as barrel/crate/etc above.
  'dnd5e:props:bone-pile': [
    {
      name: 'SM_Env_BonePile_01',
      file: 'props/SM_Env_BonePile_01.glb',
      role: 'decor',
      footprintHexes: 3,
      blocksLoS: false,
    },
    {
      name: 'SM_Env_BonePile_02',
      file: 'props/SM_Env_BonePile_02.glb',
      role: 'decor',
      footprintHexes: 4,
      blocksLoS: false,
    },
    {
      name: 'SM_Env_BonePile_03',
      file: 'props/SM_Env_BonePile_03.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
    {
      name: 'SM_Env_BonePile_Small_01',
      file: 'props/SM_Env_BonePile_Small_01.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
  ],
  // Shares one key across 2 length variants -- same chain family.
  'dnd5e:props:chain': [
    {
      name: 'SM_Prop_Chain_01',
      file: 'props/SM_Prop_Chain_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Chain_02',
      file: 'props/SM_Prop_Chain_02.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:brazier': [
    {
      name: 'SM_Prop_Brazier_01',
      file: 'props/SM_Prop_Brazier_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:torch-ornate': [
    {
      name: 'SM_Prop_Torch_Ornate_01',
      file: 'props/SM_Prop_Torch_Ornate_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:skeleton-remains': [
    {
      name: 'SM_Prop_Skeleton_01',
      file: 'props/SM_Prop_Skeleton_01.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
  ],
};

/**
 * The 17-key list agreed in rpg-dnd5e-web#523's comment thread — kept as
 * its own hand-authored list (deliberately NOT derived from
 * `Object.keys(PROP_KEYS)`) so the guard test below actually catches
 * drift: if a key is agreed on #523 but this file's PROP_KEYS mirror falls
 * behind (typo, forgotten variant, etc.), the two lists diverge and the
 * test fails, instead of trivially passing against itself.
 *
 * Platform extends the charter's key list by appending here — same file,
 * one array, guard test picks it up automatically (propManifest.test.ts).
 */
export const EXPECTED_PROP_KEYS: readonly string[] = [
  'dnd5e:props:barrel',
  'dnd5e:props:crate',
  'dnd5e:props:pillar',
  'dnd5e:props:rock-pile',
  'dnd5e:props:stalagmite',
  'dnd5e:props:rune-stone',
  'dnd5e:props:barricade',
  'dnd5e:props:bookcase',
  'dnd5e:props:chest',
  'dnd5e:props:tomb',
  'dnd5e:props:log-spike',
  'dnd5e:props:rocks',
  'dnd5e:props:candles',
  'dnd5e:props:vase',
  'dnd5e:props:banner',
  'dnd5e:props:books',
  'dnd5e:props:armor-stand',
  // rpg-dnd5e-web#559 crypt-dressing wave (rpg-game-assets#22/#23) -- 12
  // more keys appended per this file's own doc comment above.
  'dnd5e:props:altar',
  'dnd5e:props:statue-reaper',
  'dnd5e:props:statue-knight-hooded',
  'dnd5e:props:obelisk',
  'dnd5e:props:skeleton-cage',
  'dnd5e:props:coffin',
  'dnd5e:props:skeleton-table',
  'dnd5e:props:bone-pile',
  'dnd5e:props:chain',
  'dnd5e:props:brazier',
  'dnd5e:props:torch-ornate',
  'dnd5e:props:skeleton-remains',
];

/**
 * Resolve a reference key to its first (deterministic, arbitrary-but-
 * stable) variant — same "first available" convention as
 * classCharacterModels.ts's resolveIdleClipName. Returns undefined for an
 * unmapped/unknown key or an undefined key — callers MUST fall back to
 * the existing primitive-shape rendering in that case, never a broken
 * model reference (rpg-dnd5e-web#479 boundary lineage, same rule
 * resolveClassCharacterModelUrl follows for class models).
 *
 * Picking a specific variant by context (theme, room, random per-instance)
 * is out of scope for this wave — see rpg-dnd5e-web#523 for the variant-
 * selection follow-up.
 */
export function resolvePropVariant(
  key: string | undefined
): PropVariant | undefined {
  if (!key) return undefined;
  return PROP_KEYS[key]?.[0];
}

/** Resolve a reference key straight to a loadable GLB url, or undefined
 * for an unmapped/unknown/absent key. */
export function resolvePropModelUrl(
  key: string | undefined
): string | undefined {
  const variant = resolvePropVariant(key);
  return variant ? PROPS_MODEL_BASE + variant.file : undefined;
}
