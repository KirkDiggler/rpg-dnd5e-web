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

import {
  GENERATED_EXACT_PROP_PALETTE_REFS,
  GENERATED_EXACT_PROP_REFS,
  GENERATED_PROP_FAMILY_DEFAULTS,
} from './generatedPropCatalog';

export type PropRole = 'obstacle' | 'cover' | 'decor';

/** A companion mesh rendered alongside its parent piece at the SAME local
 * origin (no separate offset in the source manifest — "at the parent's
 * anchor" per the wave-1 catalog note), e.g. a candle cluster's flame
 * particle mesh. Not itself a `PropVariant` — a companion has no
 * independent role/footprint/blocksLoS of its own; it's dressing on top
 * of whichever variant lists it. */
export interface PropCompanion {
  /** Companion piece name, e.g. "SM_Prop_Candles_01_Particle" — for
   * debugging/logging only. */
  name: string;
  /** Path relative to PROPS_MODEL_BASE, same convention as
   * `PropVariant.file`. */
  file: string;
}

export interface PropVariant {
  /** Piece name, e.g. "SM_Prop_Barrel_01" — for debugging/logging only. */
  name: string;
  /** Human-facing name supplied by generated exact-ref recipes. */
  displayName?: string;
  /** Path relative to PROPS_MODEL_BASE, e.g. "props/SM_Prop_Barrel_01.glb". */
  file: string;
  role: PropRole;
  /** Hex footprint from the manifest's measured geometry. Not consumed as
   * a render-time scale multiplier (see PropModel.tsx) — reserved for
   * placement-sanity checks/asserts and future multi-hex layout logic. */
  footprintHexes: number;
  /** Explicit for generated props; legacy entries derive this from role. */
  blocksMovement?: boolean;
  blocksLoS: boolean;
  /**
   * Extra meshes to render alongside this variant at its own anchor point
   * (rpg-game-assets#36 wave-1 look-lab addition) — today only the
   * `candles` key's Candles_01..04 pieces carry one each, their flame
   * particle mesh (Candle_01/Candle_Stand_01, the pre-wave-1 pieces, have
   * none — see this file's own maintenance-history note for why the
   * originally-planned Candle_Stand_01 pairing was substituted).
   * Undefined/omitted for every variant without a companion — existing
   * consumers that don't know about this field are unaffected.
   */
  companions?: PropCompanion[];
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
 * thread, the 12 keys #559's crypt-dressing wave appended, plus the 15
 * keys rpg-game-assets#36's look-lab wave-1 appended -- 44 total).
 * Variant order matches the source manifest's piece order.
 */
const LEGACY_PROP_KEYS: Record<string, PropVariant[]> = {
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
    // rpg-game-assets#36 wave-1.
    {
      name: 'SM_Prop_Tomb_Royal_01',
      file: 'props/SM_Prop_Tomb_Royal_01.glb',
      role: 'cover',
      footprintHexes: 2,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:candles': [
    // Ordered so a companion-bearing piece is FIRST (issue #623, increment
    // 2 "kill candles have no flame") — a deliberate break from this
    // array's usual "arbitrary but stable" order convention
    // (resolvePropVariant's own doc comment), because `resolvePropVariant`
    // has no smarter selection than "always take index 0" today (variant
    // selection by context is explicitly out of scope for this wave, see
    // that function's doc comment). Without this reordering, every real
    // `candles` placement would keep resolving to the old flame-less
    // Candle_01 below and PropModel's new companion rendering would never
    // actually fire for this key in practice.
    {
      name: 'SM_Prop_Candles_01',
      file: 'props/SM_Prop_Candles_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
      companions: [
        {
          name: 'SM_Prop_Candles_01_Particle',
          file: 'props/SM_Prop_Candles_01_Particle.glb',
        },
      ],
    },
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
    {
      name: 'SM_Prop_Candles_02',
      file: 'props/SM_Prop_Candles_02.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
      companions: [
        {
          name: 'SM_Prop_Candles_02_Particle',
          file: 'props/SM_Prop_Candles_02_Particle.glb',
        },
      ],
    },
    {
      name: 'SM_Prop_Candles_03',
      file: 'props/SM_Prop_Candles_03.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
      companions: [
        {
          name: 'SM_Prop_Candles_03_Particle',
          file: 'props/SM_Prop_Candles_03_Particle.glb',
        },
      ],
    },
    {
      name: 'SM_Prop_Candles_04',
      file: 'props/SM_Prop_Candles_04.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
      companions: [
        {
          name: 'SM_Prop_Candles_04_Particle',
          file: 'props/SM_Prop_Candles_04_Particle.glb',
        },
      ],
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
      name: 'Crypt_Skeleton_Cage_01',
      file: 'props/Crypt_Skeleton_Cage_01.glb',
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
      name: 'Crypt_Skeleton_Table_01',
      file: 'props/Crypt_Skeleton_Table_01.glb',
      role: 'cover',
      footprintHexes: 3,
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
    // rpg-game-assets#36 wave-1 (Chain_03/05/06/07 join this key; 04/08
    // are under the separate `chains` key below instead, per the source
    // manifest's own keys index — mirrored here as-is, not re-derived).
    {
      name: 'SM_Prop_Chain_03',
      file: 'props/SM_Prop_Chain_03.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Chain_05',
      file: 'props/SM_Prop_Chain_05.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Chain_06',
      file: 'props/SM_Prop_Chain_06.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Chain_07',
      file: 'props/SM_Prop_Chain_07.glb',
      role: 'decor',
      footprintHexes: 2,
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
    // rpg-game-assets#36 wave-1.
    {
      name: 'SM_Prop_Torch_Ornate_02',
      file: 'props/SM_Prop_Torch_Ornate_02.glb',
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
    // rpg-game-assets#36 wave-1: narrative-scene skeleton variants
    // (throne, shackled slave, wall-sitting slave), not just the generic
    // remains pile above.
    {
      name: 'SM_Prop_Skeleton_Knight_Throne_01',
      file: 'props/SM_Prop_Skeleton_Knight_Throne_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Skeleton_Slave_Lying_01',
      file: 'props/SM_Prop_Skeleton_Slave_Lying_01.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Skeleton_Slave_Shackles_01',
      file: 'props/SM_Prop_Skeleton_Slave_Shackles_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Skeleton_Slave_Shackles_02',
      file: 'props/SM_Prop_Skeleton_Slave_Shackles_02.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Skeleton_Slave_Wall_Sitting_01',
      file: 'props/SM_Prop_Skeleton_Slave_Wall_Sitting_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],

  // --- rpg-game-assets#36 wave-1 (look-lab.yaml v3): 15 newly-minted keys
  // extending the 29-key list above -- 44 total. All themes include
  // "crypt" (rpg-game-assets manifest's own `themes` field per piece; not
  // mirrored into this file, which has never carried theme data). ---
  'dnd5e:props:candle-stand': [
    {
      name: 'SM_Prop_Candle_Stand_01',
      file: 'props/SM_Prop_Candle_Stand_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:lantern': [
    {
      name: 'SM_Prop_Lantern_01',
      file: 'props/SM_Prop_Lantern_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Lantern_02',
      file: 'props/SM_Prop_Lantern_02.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:stone-lantern': [
    {
      name: 'SM_Env_Stone_Lantern_01',
      file: 'props/SM_Env_Stone_Lantern_01.glb',
      role: 'cover',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:glowing-orb': [
    {
      name: 'SM_Env_GlowingOrb_01',
      file: 'props/SM_Env_GlowingOrb_01.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
    {
      name: 'SM_Env_GlowingOrb_02',
      file: 'props/SM_Env_GlowingOrb_02.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:rune-marker': [
    {
      name: 'SM_Env_Rune_Square_01',
      file: 'props/SM_Env_Rune_Square_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:rune-pillar': [
    {
      name: 'SM_Env_Rune_Pillar_02',
      file: 'props/SM_Env_Rune_Pillar_02.glb',
      role: 'obstacle',
      footprintHexes: 1,
      blocksLoS: true,
    },
  ],
  'dnd5e:props:torch': [
    {
      name: 'SM_Prop_TorchStick_01',
      file: 'props/SM_Prop_TorchStick_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:rug': [
    {
      name: 'Crypt_Rug_01',
      file: 'props/Crypt_Rug_01.glb',
      role: 'decor',
      footprintHexes: 5,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:wall-banner': [
    {
      name: 'SM_Prop_Wall_Banner_02',
      file: 'props/SM_Prop_Wall_Banner_02.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Wall_Banner_03',
      file: 'props/SM_Prop_Wall_Banner_03.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Wall_Banner_04',
      file: 'props/SM_Prop_Wall_Banner_04.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Wall_Banner_05',
      file: 'props/SM_Prop_Wall_Banner_05.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Wall_Banner_06',
      file: 'props/SM_Prop_Wall_Banner_06.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:chains': [
    {
      name: 'SM_Prop_Chain_04',
      file: 'props/SM_Prop_Chain_04.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Chain_08',
      file: 'props/SM_Prop_Chain_08.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:pillar-broken': [
    {
      name: 'SM_Env_Pillar_Broken_Pile_01',
      file: 'props/SM_Env_Pillar_Broken_Pile_01.glb',
      role: 'cover',
      footprintHexes: 2,
      blocksLoS: false,
    },
    {
      name: 'SM_Env_Pillar_Broken_01',
      file: 'props/SM_Env_Pillar_Broken_01.glb',
      role: 'cover',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:tomb-open': [
    {
      name: 'SM_Prop_Tomb_Lid_01',
      file: 'props/SM_Prop_Tomb_Lid_01.glb',
      role: 'cover',
      footprintHexes: 2,
      blocksLoS: false,
    },
    {
      name: 'SM_Prop_Tomb_Skeleton_01',
      file: 'props/SM_Prop_Tomb_Skeleton_01.glb',
      role: 'cover',
      footprintHexes: 2,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:torture-table': [
    {
      name: 'SM_Prop_Toture_StretchTable_01',
      file: 'props/SM_Prop_Toture_StretchTable_01.glb',
      role: 'cover',
      footprintHexes: 3,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:bone-scatter': [
    {
      name: 'SM_Env_BonePile_Small_02',
      file: 'props/SM_Env_BonePile_Small_02.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
  ],
  'dnd5e:props:rubble-scatter': [
    {
      name: 'SM_Env_Rubble_01',
      file: 'props/SM_Env_Rubble_01.glb',
      role: 'decor',
      footprintHexes: 5,
      blocksLoS: false,
    },
    {
      name: 'SM_Env_Brick_Rubble_01',
      file: 'props/SM_Env_Brick_Rubble_01.glb',
      role: 'decor',
      footprintHexes: 1,
      blocksLoS: false,
    },
    {
      name: 'SM_Env_Rubble_Pebbles_01',
      file: 'props/SM_Env_Rubble_Pebbles_01.glb',
      role: 'decor',
      footprintHexes: 2,
      blocksLoS: false,
    },
    {
      name: 'SM_Env_Rubble_Plank_01',
      file: 'props/SM_Env_Rubble_Plank_01.glb',
      role: 'decor',
      footprintHexes: 3,
      blocksLoS: false,
    },
  ],
};

const GENERATED_PROP_KEYS: Record<string, PropVariant[]> = Object.fromEntries(
  Object.entries(GENERATED_EXACT_PROP_REFS).map(([ref, variant]) => [
    ref,
    [{ ...variant }],
  ])
);

/** Legacy curated variants plus generated exact-ref entries. Family aliases
 * are resolved separately so they never become duplicate Builder tiles. */
export const PROP_KEYS: Record<string, PropVariant[]> = {
  ...LEGACY_PROP_KEYS,
  ...GENERATED_PROP_KEYS,
};

export const EXACT_PROP_PALETTE_REFS: readonly string[] =
  GENERATED_EXACT_PROP_PALETTE_REFS;

const PROP_FAMILY_DEFAULTS: Readonly<Record<string, string>> =
  GENERATED_PROP_FAMILY_DEFAULTS;

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
  // rpg-game-assets#36 wave-1 (look-lab.yaml v3) -- 15 more keys appended,
  // same convention as the #559 block above.
  'dnd5e:props:candle-stand',
  'dnd5e:props:lantern',
  'dnd5e:props:stone-lantern',
  'dnd5e:props:glowing-orb',
  'dnd5e:props:rune-marker',
  'dnd5e:props:rune-pillar',
  'dnd5e:props:torch',
  'dnd5e:props:rug',
  'dnd5e:props:wall-banner',
  'dnd5e:props:chains',
  'dnd5e:props:pillar-broken',
  'dnd5e:props:tomb-open',
  'dnd5e:props:torture-table',
  'dnd5e:props:bone-scatter',
  'dnd5e:props:rubble-scatter',
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
  const direct = PROP_KEYS[key]?.[0];
  if (direct) return direct;
  const exactRef = PROP_FAMILY_DEFAULTS[key];
  return exactRef ? PROP_KEYS[exactRef]?.[0] : undefined;
}

/** Resolve a reference key straight to a loadable GLB url, or undefined
 * for an unmapped/unknown/absent key. */
export function resolvePropModelUrl(
  key: string | undefined
): string | undefined {
  const variant = resolvePropVariant(key);
  return variant ? PROPS_MODEL_BASE + variant.file : undefined;
}
