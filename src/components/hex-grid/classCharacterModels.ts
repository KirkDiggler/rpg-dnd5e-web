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
 * (rpg-dnd5e-web#506). Every standing class GLB shipped so far carries
 * exactly one clip, named "Take 001" (a generic DCC-tool default, not
 * semantically "idle") — so today this always falls through to the
 * first-available-clip case. Prefers a clip whose name actually contains
 * "idle" (case-insensitive) so a future asset drop with multiple clips
 * (e.g. idle + walk) picks the right one automatically instead of
 * whichever happens to be first in the array. Returns undefined for a
 * downed variant or any model with no baked animation — callers treat
 * that as "leave the static pose alone", never a crash.
 *
 * @example
 * ```typescript
 * resolveIdleClipName(['Take 001']); // 'Take 001' — today's real case
 * resolveIdleClipName(['Walk', 'Idle_Loop']); // 'Idle_Loop'
 * resolveIdleClipName([]); // undefined — downed variants, or a model
 *                          // shipped with no animation at all
 * ```
 */
export function resolveIdleClipName(names: string[]): string | undefined {
  const idleMatch = names.find((name) => /idle/i.test(name));
  return idleMatch ?? names[0];
}
