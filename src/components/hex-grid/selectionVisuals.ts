/**
 * Pure helpers deciding HOW an entity's selection state should read visually
 * on the hex grid (rpg-dnd5e-web#515).
 *
 * Root cause this fixes: both real-game callers (EncounterMap.tsx,
 * PlaytestMap.tsx) pass `selectedEntityId={myEntityId}` — there is no actual
 * click-to-target selection state in this codebase yet, so `selectedEntityId`
 * is, in practice, ALWAYS the local player's own entity id. HexGrid.tsx used
 * to feed that straight into HexEntity's `isSelected`, so the local player's
 * own model permanently rendered with the selection emissive tint (white on
 * ClassCharacterModel, brighter-color on MediumHumanoid) — reading as a
 * washed-out "ghost" (Kirk's word, #510/#509 evidence). Selection tint should
 * communicate a targeting/selection state, not permanently recolor your own
 * character.
 *
 * `resolveEntityTint` below excludes the local player (`currentEntityId`)
 * from the tint by default, so a *future* real target-selection feature
 * (selectedEntityId diverging from currentEntityId — e.g. clicking a monster
 * to target it) still works unchanged: only self-selection is suppressed.
 */

/**
 * True when `entityId` should render the selection emissive tint.
 *
 * Selected AND not the local player's own entity — see module doc comment
 * for why "selected" and "is me" used to be the same boolean.
 */
export function resolveEntityTint(
  entityId: string,
  selectedEntityId: string | undefined,
  currentEntityId: string | undefined | null
): boolean {
  if (entityId !== selectedEntityId) return false;
  if (currentEntityId != null && entityId === currentEntityId) return false;
  return true;
}

/** True when `entityId` is the local player's own entity — drives the
 * self-indicator ring (HexGrid.tsx) instead of the selection tint. */
export function isLocalPlayerEntity(
  entityId: string,
  currentEntityId: string | undefined | null
): boolean {
  return currentEntityId != null && entityId === currentEntityId;
}
