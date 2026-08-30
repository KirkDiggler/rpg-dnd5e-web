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

export type CharacterRigFamily = 'townfolk-v1' | 'modular-fantasy-hero-v1';

type PlayerCharacterModelSource = 'race-class' | 'class';

interface ClassCharacterModelEntry {
  model: string;
  downed: string;
}

interface RaceClassCharacterModelEntry {
  model: string;
  rigFamily: CharacterRigFamily;
}

/** Keyed by PublicMemberInfo.classRef (lowercase, e.g. "rogue") — matches
 * the server's public class ref convention verified live in
 * rpg-dnd5e-web#493/#497 (devseed's "rogue level 2", "barbarian level 1",
 * etc.). */
const CLASS_CHARACTER_MODELS: Record<string, ClassCharacterModelEntry> = {
  fighter: { model: 'fighter.glb', downed: 'fighter-downed.glb' },
  barbarian: { model: 'barbarian.glb', downed: 'barbarian-downed.glb' },
  monk: { model: 'monk.glb', downed: 'monk-downed.glb' },
  rogue: { model: 'rogue.glb', downed: 'rogue-downed.glb' },
};

const RACE_CLASS_CHARACTER_MODELS: Record<
  string,
  RaceClassCharacterModelEntry
> = {
  'dwarf:barbarian': {
    model: 'race-class/dwarf-barbarian.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'dwarf:fighter': {
    model: 'race-class/dwarf-fighter.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'dwarf:monk': {
    model: 'race-class/dwarf-monk.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'dwarf:rogue': {
    model: 'race-class/dwarf-rogue.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'elf:barbarian': {
    model: 'race-class/elf-barbarian.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'elf:fighter': {
    model: 'race-class/elf-fighter.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'elf:monk': {
    model: 'race-class/elf-monk.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'elf:rogue': {
    model: 'race-class/elf-rogue.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'half-elf:barbarian': {
    model: 'race-class/half-elf-barbarian.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'half-elf:fighter': {
    model: 'race-class/half-elf-fighter.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'half-elf:monk': {
    model: 'race-class/half-elf-monk.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'half-elf:rogue': {
    model: 'race-class/half-elf-rogue.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'tiefling:barbarian': {
    model: 'race-class/tiefling-barbarian.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'tiefling:fighter': {
    model: 'race-class/tiefling-fighter.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'tiefling:monk': {
    model: 'race-class/tiefling-monk.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
  'tiefling:rogue': {
    model: 'race-class/tiefling-rogue.glb',
    rigFamily: 'modular-fantasy-hero-v1',
  },
};

function normalizeRefId(refId: string | undefined): string | undefined {
  return refId?.trim().toLowerCase();
}

function resolveClassCharacterModelResolutionFromNormalizedClassRefId(
  normalizedClassRefId: string,
  isDowned: boolean
): PlayerCharacterModelResolution | undefined {
  const entry = CLASS_CHARACTER_MODELS[normalizedClassRefId];
  if (!entry) return undefined;
  return {
    url: CLASS_CHARACTER_MODEL_BASE + (isDowned ? entry.downed : entry.model),
    rigFamily: 'townfolk-v1',
    source: 'class',
  };
}

function resolveRaceClassCharacterModelResolution(
  normalizedRaceRefId: string | undefined,
  normalizedClassRefId: string
): PlayerCharacterModelResolution | undefined {
  if (!normalizedRaceRefId) return undefined;
  const entry =
    RACE_CLASS_CHARACTER_MODELS[
      `${normalizedRaceRefId}:${normalizedClassRefId}`
    ];
  if (!entry) return undefined;
  return {
    url: CLASS_CHARACTER_MODEL_BASE + entry.model,
    rigFamily: entry.rigFamily,
    source: 'race-class',
  };
}

export interface PlayerCharacterModelResolution {
  url: string;
  rigFamily: CharacterRigFamily;
  source: PlayerCharacterModelSource;
}

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
  const normalizedClassRefId = normalizeRefId(classRefId);
  if (!normalizedClassRefId) return undefined;
  return resolveClassCharacterModelResolutionFromNormalizedClassRefId(
    normalizedClassRefId,
    isDowned
  )?.url;
}

export function resolvePlayerCharacterModel(
  raceRefId: string | undefined,
  classRefId: string | undefined,
  isDowned: boolean
): PlayerCharacterModelResolution | undefined {
  const normalizedClassRefId = normalizeRefId(classRefId);
  if (!normalizedClassRefId) return undefined;

  if (!isDowned) {
    const raceClassResolution = resolveRaceClassCharacterModelResolution(
      normalizeRefId(raceRefId),
      normalizedClassRefId
    );
    if (raceClassResolution) return raceClassResolution;
  }

  return resolveClassCharacterModelResolutionFromNormalizedClassRefId(
    normalizedClassRefId,
    isDowned
  );
}

/**
 * Pick which baked clip to play on loop as the idle animation
 * (rpg-dnd5e-web#506). Prefers a clip whose name actually contains "idle"
 * (case-insensitive), falling back to the first available clip; undefined
 * for a downed variant or any model with no baked animation at all —
 * callers treat that as "leave the static pose alone", never a crash.
 *
 * The merged Townfolk provider contract (provider PR #61, merge commit
 * 4fac080) gives every standing Fighter/Monk/Rogue/Barbarian class alias
 * exactly two clips in this order: `Idle_Relaxed`, then `Walk_Forward`.
 * This resolver therefore returns `Idle_Relaxed` for every standing file.
 * Every downed variant is static with zero clips, so it returns undefined.
 *
 * @example
 * ```typescript
 * resolveIdleClipName(['Idle_Relaxed', 'Walk_Forward']);
 * // 'Idle_Relaxed' — exact merged standing Townfolk release shape
 * resolveIdleClipName(['Walk', 'Idle_Loop']); // 'Idle_Loop'
 * resolveIdleClipName([]); // undefined — static downed Townfolk variant
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
 * if that's undefined — e.g. a future model without a Walk_* clip, or a
 * static downed variant with no clips).
 *
 * @example
 * ```typescript
 * resolveWalkClipName(['Idle_Relaxed', 'Walk_Forward']);
 * // 'Walk_Forward' — exact merged standing Townfolk release shape
 * resolveWalkClipName(['Idle_Relaxed']);
 * // undefined — no Walk_* clip; caller falls back to resolveIdleClipName
 * ```
 */
export function resolveWalkClipName(names: string[]): string | undefined {
  return names.find((name) => /walk/i.test(name));
}
