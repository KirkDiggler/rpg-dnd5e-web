/**
 * Class-named character model lookup (rpg-dnd5e-web#501). rpg-game-assets
 * (closes rpg-dnd5e-web#488) shipped class-aliased GLBs at
 * harness/models/synty/characters/<class>.glb (+ -downed.glb), synced here
 * to public/models/synty/characters/. Hardcoded here rather than fetched at
 * runtime, matching this codebase's established convention for
 * manifest-derived constants (see syntyHexWallHelpers.ts's WALL_VARIANTS,
 * SyntyHexWall.tsx's DOOR_FRAME_RAW_WIDTH — both copied from their source
 * manifest/inspection data, not read from JSON at runtime).
 */

const CLASS_CHARACTER_MODEL_BASE = '/models/synty/characters/';

interface ClassCharacterModelEntry {
  model: string;
  downed: string;
}

/** Keyed by CharacterData.class_ref.id (lowercase, e.g. "rogue") — matches
 * the server's class ref convention verified live in rpg-dnd5e-web#493/#497
 * (devseed's "rogue level 2", "barbarian level 1", etc.). */
const CLASS_CHARACTER_MODELS: Record<string, ClassCharacterModelEntry> = {
  fighter: { model: 'fighter.glb', downed: 'fighter-downed.glb' },
  barbarian: { model: 'barbarian.glb', downed: 'barbarian-downed.glb' },
  monk: { model: 'monk.glb', downed: 'monk-downed.glb' },
  rogue: { model: 'rogue.glb', downed: 'rogue-downed.glb' },
};

/**
 * Resolve a class GLB URL for a server class ref id, if one is mapped.
 * Returns undefined for an unmapped/unknown class or a missing ref id —
 * callers MUST fall back to the existing MediumHumanoid path in that case,
 * never a broken model reference (rpg-dnd5e-web#479 boundary lineage: a
 * data gap degrades to the known-working placeholder, not a crash).
 *
 * @example
 * ```typescript
 * resolveClassCharacterModelUrl('rogue', false);
 * // '/models/synty/characters/rogue.glb'
 * resolveClassCharacterModelUrl('rogue', true);
 * // '/models/synty/characters/rogue-downed.glb'
 * resolveClassCharacterModelUrl('wizard', false);
 * // undefined — no class GLB shipped for wizard yet
 * ```
 */
export function resolveClassCharacterModelUrl(
  classRefId: string | undefined,
  isDowned: boolean
): string | undefined {
  if (!classRefId) return undefined;
  const entry = CLASS_CHARACTER_MODELS[classRefId.trim().toLowerCase()];
  if (!entry) return undefined;
  return CLASS_CHARACTER_MODEL_BASE + (isDowned ? entry.downed : entry.model);
}

/**
 * Pick which baked clip to play on loop as the idle animation
 * (rpg-dnd5e-web#506). Prefers a clip whose name actually contains "idle"
 * (case-insensitive), falling back to the first available clip; undefined
 * for a downed variant or any model with no baked animation at all —
 * callers treat that as "leave the static pose alone", never a crash.
 *
 * Re-verified against current asset reality (rebased post assets#4-#10,
 * then re-checked again post rpg-game-assets#11): on `main` today,
 * fighter/barbarian.glb ship 0 animation clips (junk stripped during the
 * asset cleanup; a Big-Rig retarget is pending) — `resolveIdleClipName`
 * returns undefined for both, which is the correct, expected,
 * no-op-the-animation behavior for clip-less models, not a gap.
 * monk.glb/rogue.glb, following the merge of rpg-game-assets#11 (idle
 * retarget for rpg-dnd5e-web#522), now ship 3 clips each — monk:
 * `Idle_Drinking`/`Idle_Meditative`/`Idle_Relaxed`; rogue:
 * `Idle_CheckWatch`/`Idle_Drinking`/`Idle_Relaxed`. Every clip in that set
 * matches the `/idle/i` filter, so this function picks whichever comes
 * first in the GLB's animation array — an arbitrary but always-correct
 * choice among interchangeable idle variants. Naming a *specific*
 * preferred variant (e.g. always "Relaxed") is out of scope for this PR;
 * that's the char-creation animation-picker slice's job.
 *
 * @example
 * ```typescript
 * resolveIdleClipName(['Idle_Drinking', 'Idle_Meditative', 'Idle_Relaxed']);
 * // 'Idle_Drinking' — first idle-matching clip, current monk/rogue reality
 * resolveIdleClipName(['Walk', 'Idle_Loop']); // 'Idle_Loop'
 * resolveIdleClipName([]); // undefined — today's fighter/barbarian on
 *                          // `main` (0 clips), and every downed variant
 * ```
 */
export function resolveIdleClipName(names: string[]): string | undefined {
  const idleMatch = names.find((name) => /idle/i.test(name));
  return idleMatch ?? names[0];
}

/**
 * Pick which baked clip to play on loop while an entity's board position is
 * interpolating between hexes (rpg-dnd5e-web#542 — the "characters glide in
 * their idle pose" fix). Prefers a clip whose name contains "walk"
 * (case-insensitive), matching the `Walk_*` naming contract
 * `retarget_walk_multi.py` enforces on the asset side. Unlike
 * `resolveIdleClipName`, this does NOT fall back to the first available
 * clip when no walk-named clip exists — an arbitrary idle/other clip playing
 * fast-forward while the character visibly slides across the board is worse
 * than just staying on the resolved idle clip, which is what callers should
 * fall back to instead (see `ClassCharacterModel.tsx`'s usage: `isMoving`
 * prefers `resolveWalkClipName`, falling back to `resolveIdleClipName` only
 * if that's undefined — e.g. fighter/barbarian before a Walk_* clip ships
 * for them, or any future clip-less model).
 *
 * @example
 * ```typescript
 * resolveWalkClipName(['Idle_Relaxed', 'Idle_Drinking', 'Walk_Forward']);
 * // 'Walk_Forward'
 * resolveWalkClipName(['Idle_Relaxed', 'Idle_Drinking']);
 * // undefined — no Walk_* clip shipped for this model yet; caller falls
 * //             back to resolveIdleClipName instead of guessing
 * ```
 */
export function resolveWalkClipName(names: string[]): string | undefined {
  return names.find((name) => /walk/i.test(name));
}
