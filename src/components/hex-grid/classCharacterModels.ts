import {
  BARD_APPEARANCE_CATALOG,
  type BardAppearanceRaceRef,
} from '@/generated/bardAppearanceCatalog';
import {
  CHARACTER_CUSTOMIZATION_CATALOG,
  type CustomizationRaceRef,
  type CustomizationStarterClass,
} from '@/generated/characterCustomizationCatalog';

/**
 * Class-named character model lookup (rpg-dnd5e-web#501). rpg-game-assets
 * (closes rpg-dnd5e-web#488) shipped class-aliased GLBs at
 * harness/models/synty/characters/<class>.glb (+ -downed.glb), synced here
 * to public/models/synty/characters/. Hardcoded here rather than fetched at
 * runtime, matching this codebase's established convention for
 * manifest-derived constants (see syntyHexWallHelpers.ts's WALL_VARIANTS,
 * SyntyHexWall.tsx's DOOR_FRAME_RAW_WIDTH — both copied from their source
 * manifest/inspection data, not read from JSON at runtime).
 *
 * The eight Bard appearances are deliberately separate from the generated
 * four-starter-class customization profiles. Their generated catalog projects
 * only the additive provider race/class rows: a complete standing body, exact
 * rig/clip contract, and no implied hair/outfit profile or downed sibling.
 */

const CLASS_CHARACTER_MODEL_BASE = '/models/synty/characters/';

export type CharacterRigFamily = 'townfolk-v1' | 'modular-fantasy-hero-v1';

type PlayerCharacterModelSource = 'race-class' | 'class';

interface ClassCharacterModelEntry {
  model: string;
  downed: string;
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

function normalizeRefId(refId: string | undefined): string | undefined {
  return refId
    ?.trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function normalizeDnd5eRefId(
  refId: string | undefined,
  kind: 'classes' | 'races'
): string | undefined {
  const normalized = normalizeRefId(refId);
  if (!normalized) return undefined;
  const canonicalPrefix = `dnd5e:${kind}:`;
  return normalized.startsWith(canonicalPrefix)
    ? normalized.slice(canonicalPrefix.length)
    : normalized;
}

function resolveClassCharacterModelResolutionFromNormalizedClassRefId(
  normalizedClassRefId: string,
  isDowned: boolean
): PlayerCharacterModelResolution | undefined {
  if (!Object.hasOwn(CLASS_CHARACTER_MODELS, normalizedClassRefId)) {
    return undefined;
  }
  const entry = CLASS_CHARACTER_MODELS[normalizedClassRefId]!;
  return {
    url: CLASS_CHARACTER_MODEL_BASE + (isDowned ? entry.downed : entry.model),
    rigFamily: 'townfolk-v1',
    source: 'class',
  };
}

function resolveBardCharacterModelResolution(
  normalizedRaceRefId: string | undefined,
  normalizedClassRefId: string
): PlayerCharacterModelResolution | undefined {
  if (normalizedClassRefId !== 'bard' || !normalizedRaceRefId) {
    return undefined;
  }
  if (
    !Object.hasOwn(BARD_APPEARANCE_CATALOG.appearances, normalizedRaceRefId)
  ) {
    return undefined;
  }
  const appearance =
    BARD_APPEARANCE_CATALOG.appearances[
      normalizedRaceRefId as BardAppearanceRaceRef
    ];
  return {
    url: appearance.url,
    rigFamily: appearance.rigFamily,
    source: 'race-class',
    animations: appearance.animations,
  };
}

function resolveRaceClassCharacterModelResolution(
  normalizedRaceRefId: string | undefined,
  normalizedClassRefId: string
): PlayerCharacterModelResolution | undefined {
  if (!normalizedRaceRefId) return undefined;
  if (
    Object.hasOwn(CHARACTER_CUSTOMIZATION_CATALOG.profiles, normalizedRaceRefId)
  ) {
    const profile =
      CHARACTER_CUSTOMIZATION_CATALOG.profiles[
        normalizedRaceRefId as CustomizationRaceRef
      ];
    if (!Object.hasOwn(profile.bodies, normalizedClassRefId)) return undefined;
    const body =
      profile.bodies[normalizedClassRefId as CustomizationStarterClass];
    return {
      url: body.url,
      rigFamily: profile.rigFamily,
      source: 'race-class',
      customizationProfileRef: profile.profileRef,
      fallbackUrl: body.fallbackUrl,
      fallbackSha256: body.fallbackSha256,
    };
  }
  return undefined;
}

export interface PlayerCharacterModelResolution {
  url: string;
  rigFamily: CharacterRigFamily;
  source: PlayerCharacterModelSource;
  animations?: readonly ['Idle_Relaxed', 'Walk_Forward'];
  customizationProfileRef?: string;
  fallbackUrl?: string;
  fallbackSha256?: string;
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
  const normalizedClassRefId = normalizeDnd5eRefId(classRefId, 'classes');
  if (!normalizedClassRefId) return undefined;
  return resolveClassCharacterModelResolutionFromNormalizedClassRefId(
    normalizedClassRefId,
    isDowned
  )?.url;
}

/**
 * Resolve the exact standing race/class body before the established class or
 * MediumHumanoid fallbacks. Bard is a basic supplied appearance: it resolves
 * only for the eight provider-authorized race pairs while standing and carries
 * no customization profile/fallback URL. A downed Bard therefore returns
 * undefined and HexEntity retains its visible MediumHumanoid corpse fallback.
 */
export function resolvePlayerCharacterModel(
  raceRefId: string | undefined,
  classRefId: string | undefined,
  isDowned: boolean
): PlayerCharacterModelResolution | undefined {
  const normalizedClassRefId = normalizeDnd5eRefId(classRefId, 'classes');
  if (!normalizedClassRefId) return undefined;

  if (!isDowned) {
    const normalizedRaceRefId = normalizeDnd5eRefId(raceRefId, 'races');
    const bardResolution = resolveBardCharacterModelResolution(
      normalizedRaceRefId,
      normalizedClassRefId
    );
    if (bardResolution) return bardResolution;

    const raceClassResolution = resolveRaceClassCharacterModelResolution(
      normalizedRaceRefId,
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
