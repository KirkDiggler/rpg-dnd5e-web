/**
 * Monster-ref-keyed NPC model lookup (rpg-dnd5e-web#559 client half),
 * mirroring classCharacterModels.ts's resolveClassCharacterModelUrl for the
 * monster side of HexEntity. rpg-game-assets promotes converted POLYGON
 * Dungeon undead as harness/models/synty/npcs/<asset-name>.glb (+
 * -downed.glb), synced here to public/models/synty/npcs/, hardcoded here
 * rather than fetched at runtime (see that file's doc comment for the
 * established reasoning).
 *
 * Filenames are ASSET-source-named (e.g. "skeleton-soldier-01.glb"), NOT
 * ref-id-named — a deliberate call (director sync, rpg-dnd5e-web#559,
 * 2026-07-25), for two reasons neither classCharacterModels.ts's 1:1
 * class:file convention nor an earlier draft of this file hit:
 * (1) there is no toolkit ref for "ghost"/"specter" at all (see below), so a
 * ref-id-only naming scheme can't even name half the promoted roster; (2)
 * the SRD mapping isn't 1:1 — Skeleton maps to TWO promoted looks
 * (Soldier_01/02) — a ref-id filename would force an arbitrary pick and
 * then lie about it. rpg-game-assets' npcs/manifest.json is the seam that
 * carries the rules mapping (which ref -> which asset file(s)); this table
 * is this repo's hand-kept mirror of that mapping, same discipline as
 * classCharacterModels.ts's CLASS_CHARACTER_MODELS.
 *
 * MONSTER_REF_MODELS is ref -> ORDERED CANDIDATE LIST (not ref -> single
 * file), matching propManifest.ts's `PROP_KEYS: Record<string,
 * PropVariant[]>` shape exactly, because Skeleton already has two looks.
 * resolveMonsterModelUrl below picks candidates[0] — no per-instance
 * variant selection yet (same "first available" convention as
 * resolvePropVariant's `PROP_KEYS[key]?.[0]` and
 * classCharacterModels.ts's resolveIdleClipName fallback). Choosing a
 * SPECIFIC look per monster instance (so a room of skeletons doesn't look
 * cloned) is a real future improvement, out of scope here.
 *
 * This hardcoded table is a stopgap for this slice, not the intended end
 * state. propManifest.ts / rpg-game-assets' prop-role-map.json is the
 * precedent for where this should eventually live: a generated
 * manifest-driven `keys` index synced from rpg-game-assets, not a hand-kept
 * TS literal. Re-derive this table by hand against
 * rpg-game-assets:harness/models/synty/npcs/manifest.json after any change
 * there, same discipline as propManifest.ts's own doc comment describes,
 * until a manifest-driven monster resolver replaces it outright.
 *
 * Two identity signals exist on the wire, same dual-signal shape as
 * obstaclePropKeys.ts's resolvePropKeyForEntity:
 *
 * 1. v1alpha2 `MonsterData.monster_ref.id` (e.g. "skeleton",
 *    "skeleton-captain") — a direct rpg-toolkit ref id
 *    (rulebooks/dnd5e/refs/monsters.go), not an enum needing a
 *    hand-authored name table. Unlike obstacle_ref/prop_ref (verified
 *    unpopulated by any server code path as of rpg-dnd5e-web#528), monster
 *    identity is fundamental to spawning a monster at all — every MONSTER
 *    entity on the real route carries this today (see EncounterView.tsx's
 *    onSnapshotDelivered/onEntityAppeared, which have populated
 *    `entityMeta.monsterRefId` since before this file existed). Preferred
 *    whenever present, matching resolvePropKeyForEntity's precedence rule.
 *
 * 2. v1alpha1 `MonsterCombatState.monster_type` (`MonsterType` enum,
 *    @kirkdiggler/rpg-api-protos' enums_pb.ts) — the harness/dev-injected
 *    shape (HexGrid's `monsters` prop) and any older caller that hasn't
 *    wired the v1alpha2 meta through yet. Only mapped for the two
 *    MonsterType values that actually have a promoted GLB this wave
 *    (SKELETON, SKELETON_CAPTAIN) — every other value (ZOMBIE, GHOUL,
 *    SKELETON_ARCHER, and every non-undead monster) resolves to undefined
 *    here on purpose, same as an unmapped classRefId.
 *
 * Both signals resolve into the SAME ref-id key space before the single
 * table lookup below, so "resolved model" only ever needs one table.
 *
 * Deliberately NOT mapped this wave (rpg-dnd5e-web#559 issue thread):
 * - "ghost" / "specter": Character_Ghost_01/02 and Character_Tormented_Soul
 *   are promoted GLBs, but no rpg-toolkit monster ref for either exists yet
 *   (rulebooks/dnd5e/refs/monsters.go's Undead set is Skeleton/Zombie/
 *   SkeletonArcher/SkeletonCaptain/Ghoul only) -- the server can never send
 *   a monsterRefId that would select them today. Wiring them is a follow-up
 *   the moment the toolkit grows those refs, not a client gap now.
 * - "zombie": no zombie GLB is promoted this wave — issue #559 tracks a
 *   green-tinted material reuse of the barbarian CLASS model instead (no
 *   zombie model exists in any owned Synty pack), a materially different
 *   mechanism (a tint on an existing rig, not an npc GLB) that this
 *   resolver doesn't attempt. Falls through to MediumHumanoid until that
 *   lands.
 * - "ghoul" / "skeleton-archer": refs exist in the toolkit but neither has
 *   a promoted GLB in this issue's asset list.
 */

import { MonsterType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

const MONSTER_MODEL_BASE = '/models/synty/npcs/';

/** Keyed by the rpg-toolkit monster ref id (rulebooks/dnd5e/refs/monsters.go
 * — e.g. `refs.Monsters.Skeleton().ID == "skeleton"`), verified directly
 * against that file rather than guessed from the proto's MonsterType enum
 * names (which use a different casing convention and, for GHOST/SPECTER,
 * have no equivalent at all). Each value is an ORDERED candidate list of
 * asset-source-named standing-pose files (see this module's doc comment for
 * why); resolveMonsterModelUrl picks candidates[0] and derives the downed
 * filename by suffix. */
const MONSTER_REF_MODELS: Record<string, string[]> = {
  skeleton: ['skeleton-soldier-01.glb', 'skeleton-soldier-02.glb'],
  // The boss's rules identity is skeleton-captain-shaped (rpg-project#110
  // Slice 3 / rpg-toolkit#816 correction — NOT a wight, NOT a juvenile
  // variant of a bigger monster), but the promoted Character_Skeleton_Knight
  // visual remains the right model for it: only the rules identity changed,
  // not the asset. Filed under the boss's real ref id, not a "wight"
  // placeholder.
  'skeleton-captain': ['skeleton-knight.glb'],
};

/** The only MonsterType enum values with a promoted GLB this wave, mapped
 * into the same ref-id key space MONSTER_REF_MODELS is keyed by. Every
 * other enum value (including every non-undead monster) is intentionally
 * absent -- see this module's doc comment. */
const MONSTER_TYPE_TO_REF_ID: Partial<Record<MonsterType, string>> = {
  [MonsterType.SKELETON]: 'skeleton',
  [MonsterType.SKELETON_CAPTAIN]: 'skeleton-captain',
};

/** Insert the `-downed` suffix before the extension, matching
 * characters/manifest.json's `<name>-downed.glb` convention.
 *
 * TODO(rpg-dnd5e-web#595): this derivation assumes every promoted standing
 * candidate has a `-downed.glb` sibling. True for all 7 GLBs promoted this
 * wave, but nothing enforces it — the first future ref promoted with only a
 * standing look gets a 404 here, which HexEntity's single ErrorBoundary
 * currently degrades all the way to a generic MediumHumanoid (losing the
 * monster's identity, not just its pose). #595 proposes a second fallback
 * tier (standing GLB, tilted) between this and MediumHumanoid; deliberately
 * not attempted in this PR. */
function withDownedSuffix(file: string): string {
  return file.replace(/\.glb$/, '-downed.glb');
}

/**
 * Resolve a monster GLB URL for a server monster identity, if one is
 * mapped. Prefers the v1alpha2 `monsterRefId` when present (even if it
 * fails to resolve -- richer signal wins outright, not just when it
 * happens to succeed) and falls back to the v1alpha1 `monsterType` enum
 * otherwise. Returns undefined for an unmapped/unknown identity or when
 * both signals are absent — callers MUST fall back to the existing
 * MediumHumanoid path in that case, never a broken model reference
 * (rpg-dnd5e-web#479 boundary lineage, same as resolveClassCharacterModelUrl).
 *
 * @example
 * ```typescript
 * resolveMonsterModelUrl('skeleton', undefined, false);
 * // '/models/synty/npcs/skeleton-soldier-01.glb' -- first candidate look
 * resolveMonsterModelUrl(undefined, MonsterType.SKELETON_CAPTAIN, true);
 * // '/models/synty/npcs/skeleton-knight-downed.glb'
 * resolveMonsterModelUrl('goblin', undefined, false);
 * // undefined — no crypt-roster GLB mapped for goblin
 * ```
 */
export function resolveMonsterModelUrl(
  monsterRefId: string | undefined,
  monsterType: MonsterType | undefined,
  /** Named `isDowned` to mirror resolveClassCharacterModelUrl's parameter
   * (same "pick the downed variant file" meaning), but monsters don't have
   * a CHARACTER-only "unconscious" concept to feed it with — HexEntity.tsx's
   * only call site passes `isDead` here instead (monsters die at 0 HP
   * rather than going unconscious; see buildRenderableEntities). */
  isDowned: boolean
): string | undefined {
  const trimmedRefId = monsterRefId?.trim().toLowerCase();
  const refId =
    trimmedRefId ||
    (monsterType !== undefined
      ? MONSTER_TYPE_TO_REF_ID[monsterType]
      : undefined);
  if (!refId) return undefined;
  const candidates = MONSTER_REF_MODELS[refId];
  const file = candidates?.[0];
  if (!file) return undefined;
  return MONSTER_MODEL_BASE + (isDowned ? withDownedSuffix(file) : file);
}
