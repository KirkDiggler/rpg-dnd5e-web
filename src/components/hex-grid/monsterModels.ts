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
 * asset source names remain stable when a rules mapping changes. The private
 * NPC manifest is the seam that carries the rules mapping; this table
 * is this repo's hand-kept mirror of that mapping, same discipline as
 * classCharacterModels.ts's CLASS_CHARACTER_MODELS.
 *
 * Phase 1 had one deterministic candidate per mapped reference: Soldier01
 * for skeleton, Knight for skeleton-captain. rpg-dnd5e-web#673 added a
 * second shape — `zombie` mapping to TWO candidates picked per-entity — and
 * on 2026-09-11 that was narrowed back to one look (gaunt), so every mapped
 * reference has exactly one candidate again. The list-valued table and
 * `pickStableCandidateIndex` below remain, because the SHAPE is still right:
 * one ref may legitimately have several looks. Every mapped reference's standing
 * asset exports `Idle_Relaxed` or a same-shaped idle clip plus an in-place
 * `Walk_Forward`; only mapped assets are runtime-selectable here.
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
 *    wired the v1alpha2 meta through yet. Only mapped for the MonsterType
 *    values that actually have a promoted GLB (SKELETON, SKELETON_CAPTAIN,
 *    ZOMBIE as of rpg-dnd5e-web#673) — every other value (GHOUL,
 *    SKELETON_ARCHER, and every non-undead monster) resolves to undefined
 *    here on purpose, same as an unmapped classRefId.
 *
 * Both signals resolve into the SAME ref-id key space before the single
 * table lookup below, so "resolved model" only ever needs one table.
 *
 * "zombie" (rpg-dnd5e-web#673, then narrowed 2026-09-11): rpg-game-assets#41
 * promoted TWO genuinely distinct zombie looks — Style A/"hulking"
 * (zombieMutant) and Style B/"gaunt" (zombiePeasantFemale) — both mapped to
 * the same toolkit ref (`zombie`) because both represent the same SRD
 * monster, and #673 let `pickStableCandidateIndex` choose between them per
 * entity. Kirk narrowed that to ONE look (gaunt): a zombie should read as one
 * creature on the board, not two. `MONSTER_REF_MODELS.zombie` therefore holds
 * a single candidate again, like every other ref here.
 *
 * `pickStableCandidateIndex` is still called on every resolve and still
 * documents the multi-candidate contract — it is not dead code, it simply has
 * no multi-candidate ref to exercise today (`x % 1` is always `0`). It is kept
 * rather than inlined because `MONSTER_REF_MODELS` is genuinely a
 * ref→candidate-LIST table and the next multi-look ref would need exactly this
 * behavior back, unchanged.
 *
 * Deliberately NOT mapped (rpg-dnd5e-web#559 issue thread):
 * - "ghost" / "specter": Character_Ghost_01/02 and Character_Tormented_Soul
 *   are promoted GLBs, but no rpg-toolkit monster ref for either exists yet
 *   (rulebooks/dnd5e/refs/monsters.go's Undead set is Skeleton/Zombie/
 *   SkeletonArcher/SkeletonCaptain/Ghoul only) -- the server can never send
 *   a monsterRefId that would select them today. Wiring them is a follow-up
 *   the moment the toolkit grows those refs, not a client gap now.
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
 * asset-source-named standing-pose files — order is stable (insertion
 * order, never reshuffled) because `pickStableCandidateIndex` indexes into
 * it positionally; reordering this array would silently reassign every
 * existing entity's rendered style on next load. */
const MONSTER_REF_MODELS: Record<string, string[]> = {
  skeleton: ['skeleton-soldier-01.glb'],
  // The boss's rules identity is skeleton-captain-shaped (rpg-project#110
  // Slice 3 / rpg-toolkit#816 correction — NOT a wight, NOT a juvenile
  // variant of a bigger monster), but the promoted Character_Skeleton_Knight
  // visual remains the right model for it: only the rules identity changed,
  // not the asset. Filed under the boss's real ref id, not a "wight"
  // placeholder.
  'skeleton-captain': ['skeleton-knight.glb'],
  // One look, Style B/gaunt. rpg-dnd5e-web#673 mapped TWO promoted looks here
  // (Style A/hulking `zombie-mutant.glb` alongside this one) and let
  // `pickStableCandidateIndex` choose per-entity. Kirk's call, 2026-09-11: a
  // zombie is one thing on the board, so the hulking look is unmapped and every
  // zombie renders gaunt. `zombie-mutant.glb` remains promoted in
  // rpg-game-assets — nothing was deleted there, and remapping it is a
  // one-element edit if that call is ever revisited.
  //
  // Worth knowing before adding it back: the reason two looks were a CLIENT
  // pick is that the author cannot express "this one is hulking" — the
  // dungeonspec `place:` line carries a ref, not an appearance. Letting the
  // builder choose a look is a real design slice, not a second array entry.
  zombie: ['zombie-peasant-female.glb'],
  // rpg-game-assets#172, a human-authored open-helmet suit. Standing-only:
  // no `-downed.glb` sibling exists and none was requested — see
  // MONSTER_REFS_HIDDEN_WHEN_DOWNED below.
  'animated-armor': ['animated-armor-open-helm.glb'],
};

/**
 * Refs whose model VANISHES when the entity drops, instead of swapping to a
 * `-downed.glb`.
 *
 * `animated-armor` is the first ref promoted standing-only, which is exactly
 * the case the TODO on `withDownedSuffix` predicted: every other mapped ref
 * ships a downed sibling, so deriving one by suffix was safe until now. Left
 * alone, a dying animated armor would request a 404 and HexEntity's
 * ErrorBoundary would degrade it all the way to a generic MediumHumanoid —
 * losing the monster's identity entirely, which is worse than showing
 * nothing (rpg-dnd5e-web#595).
 *
 * Hiding is the deliberate answer, not a workaround for the missing asset.
 * rpg-game-assets asked for it explicitly when publishing the appearance
 * ("Requested disappearance when downed requires explicit consumer
 * handling"), and Kirk confirmed it on 2026-09-11: there is no downed model
 * and there is not going to be one. A suit of animated armor that stops
 * being animated is just a heap on the floor, and no heap was authored.
 *
 * This is deliberately NOT the general fix #595 proposes (a tilted-standing
 * fallback tier for any ref missing a downed sibling). That would make every
 * future standing-only ref silently fall back instead of failing loudly; this
 * set names the one ref where vanishing is the intended behavior, so a ref
 * that is standing-only by ACCIDENT still surfaces as a broken load.
 *
 * The entity itself is untouched — it still occupies its cell, still takes a
 * click, still appears in turn order. Only the body stops being drawn.
 */
const MONSTER_REFS_HIDDEN_WHEN_DOWNED: ReadonlySet<string> = new Set([
  'animated-armor',
]);

/** The MonsterType enum values with a promoted GLB, mapped into the same
 * ref-id key space MONSTER_REF_MODELS is keyed by. Every other enum value
 * (including every non-undead monster) is intentionally absent -- see this
 * module's doc comment. */
const MONSTER_TYPE_TO_REF_ID: Partial<Record<MonsterType, string>> = {
  [MonsterType.SKELETON]: 'skeleton',
  [MonsterType.SKELETON_CAPTAIN]: 'skeleton-captain',
  [MonsterType.ZOMBIE]: 'zombie',
};

/**
 * Collapse the two wire identity signals into the single ref-id key space
 * every table here is keyed by. Extracted so `resolveMonsterModelUrl` and
 * `monsterHidesWhenDowned` cannot drift apart on precedence — a
 * monsterRefId that is present but unmapped must still beat a mapped enum
 * (richer signal wins outright), and that rule now lives in one place.
 */
function resolveMonsterRefId(
  monsterRefId: string | undefined,
  monsterType: MonsterType | undefined
): string | undefined {
  const trimmedRefId = monsterRefId?.trim().toLowerCase();
  return (
    trimmedRefId ||
    (monsterType !== undefined
      ? MONSTER_TYPE_TO_REF_ID[monsterType]
      : undefined)
  );
}

/**
 * Deterministic string hash (FNV-1a, 32-bit) — used only to turn an entity
 * id into a stable index over a ref's candidate list. Not cryptographic,
 * not security-sensitive; the only property that matters is that the same
 * input string always produces the same output number, in this process and
 * every other one (no `Math.random`, no object identity, no Map insertion
 * order), so the same entity picks the same style on every render, every
 * reconnect, and every other client watching the same encounter.
 */
function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0; // unsigned
}

/**
 * Pick a stable index into a `count`-length candidate list from an entity's
 * own id — the whole point of rpg-dnd5e-web#673: a monster's rendered style
 * must be a pure function of its identity, not of render order, mount
 * order, or which client is watching, so two monsters of one ref in the same
 * encounter can show different styles at once with neither one flickering
 * between them on a rerender.
 *
 * No ref maps to more than one candidate today (the zombie pair was narrowed
 * to gaunt-only on 2026-09-11), so in practice this returns 0 for every call
 * the app makes. Kept because the table it indexes is still a candidate LIST,
 * and this is the behavior a future multi-look ref needs back verbatim.
 *
 * `count <= 1` always returns `0` without even looking at `entityId` — every
 * existing single-candidate ref (skeleton, skeleton-captain) is provably
 * unaffected by this function's introduction, not just unaffected in
 * practice.
 *
 * A missing `entityId` (defensive only — HexEntity's `entityId` prop is
 * required, every real caller has one) also resolves to `0`, the same
 * graceful degrade-to-first-candidate this file already used for every ref
 * before this function existed.
 *
 * @example
 * ```typescript
 * pickStableCandidateIndex('goblin-1', 1); // 0 -- single-candidate ref
 * pickStableCandidateIndex('zombie-1', 2); // stable 0 or 1, same every call
 * pickStableCandidateIndex(undefined, 2); // 0 -- no id to key off of
 * ```
 */
export function pickStableCandidateIndex(
  entityId: string | undefined,
  count: number
): number {
  if (count <= 1) return 0;
  if (!entityId) return 0;
  return fnv1aHash(entityId) % count;
}

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
 * `entityId` (rpg-dnd5e-web#673) selects WHICH candidate a multi-candidate
 * ref renders — see `pickStableCandidateIndex`. No ref has more than one
 * candidate today, so it currently changes nothing for any real call.
 * Single-candidate refs ignore it entirely (`x % 1 === 0` always), so every
 * pre-#673 caller/behavior is unchanged whether or not it passes one.
 *
 * @example
 * ```typescript
 * resolveMonsterModelUrl('skeleton', undefined, false, 'goblin-1');
 * // '/models/synty/npcs/skeleton-soldier-01.glb' -- only candidate look
 * resolveMonsterModelUrl(undefined, MonsterType.SKELETON_CAPTAIN, true, 'boss-1');
 * // '/models/synty/npcs/skeleton-knight-downed.glb'
 * resolveMonsterModelUrl('zombie', undefined, false, 'zombie-1');
 * // '/models/synty/npcs/zombie-peasant-female.glb' -- one look for every zombie
 * resolveMonsterModelUrl('goblin', undefined, false, 'goblin-1');
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
  isDowned: boolean,
  /** The entity's own id — keys the deterministic style pick for a
   * multi-candidate ref (rpg-dnd5e-web#673). Optional/defensive only: every
   * real HexEntity call site has one (`entityId` is a required prop there);
   * an absent id degrades to candidate 0, same as before this parameter
   * existed. MUST be the same value on every render of the same entity —
   * passing a freshly-generated id per render (e.g. a `Math.random()`
   * suffix) would defeat the whole point and reintroduce the flicker this
   * parameter exists to prevent. */
  entityId?: string
): string | undefined {
  const refId = resolveMonsterRefId(monsterRefId, monsterType);
  if (!refId) return undefined;
  // A standing-only ref never derives a downed url. Returning undefined here
  // is NOT the same as "unmapped" for the caller: HexEntity pairs this with
  // monsterHidesWhenDowned() and renders no body at all, rather than letting
  // undefined fall through to the MediumHumanoid placeholder.
  if (isDowned && MONSTER_REFS_HIDDEN_WHEN_DOWNED.has(refId)) return undefined;
  const candidates = MONSTER_REF_MODELS[refId];
  if (!candidates || candidates.length === 0) return undefined;
  const file =
    candidates[pickStableCandidateIndex(entityId, candidates.length)];
  if (!file) return undefined;
  return MONSTER_MODEL_BASE + (isDowned ? withDownedSuffix(file) : file);
}

/**
 * Does this monster ref vanish when it drops, instead of showing a downed
 * model?
 *
 * True only for refs in `MONSTER_REFS_HIDDEN_WHEN_DOWNED`. Callers MUST pair
 * this with `resolveMonsterModelUrl` rather than reading the url alone: both
 * "hidden because standing-only" and "unmapped ref" resolve to `undefined`,
 * and those two want opposite renders — nothing at all versus the generic
 * MediumHumanoid placeholder.
 *
 * @example
 * ```typescript
 * monsterHidesWhenDowned('animated-armor', undefined); // true
 * monsterHidesWhenDowned('skeleton', undefined);       // false — has a -downed.glb
 * monsterHidesWhenDowned('ghost', undefined);          // false — unmapped, not hidden
 * ```
 */
export function monsterHidesWhenDowned(
  monsterRefId: string | undefined,
  monsterType: MonsterType | undefined
): boolean {
  const refId = resolveMonsterRefId(monsterRefId, monsterType);
  return refId !== undefined && MONSTER_REFS_HIDDEN_WHEN_DOWNED.has(refId);
}
