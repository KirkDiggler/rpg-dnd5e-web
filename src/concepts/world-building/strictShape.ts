/**
 * The two strict-decoder primitives every authored-document decoder shares.
 *
 * EXTRACTED FROM `roomDraft.ts` UNCHANGED (rpg-dnd5e-web#1136). The
 * answer-table shape adapter (`answerTableShape.ts`) refuses an unknown field
 * in the same words these do, and `roomDraft.ts` is one of its callers — so if
 * the helpers stayed there the two modules would import each other. A cycle
 * for two sentences is not a trade worth making, and a second copy of them is
 * the "second dialect" `roomDraft.ts`'s own doc comment bans.
 *
 * `roomDraft.ts` re-exports both, so every existing caller (`roomSceneJson.ts`)
 * is untouched and the words stay in one place.
 */

/** Structurally exact records only: unknown-invalid fields are refused, not
 * dropped or reinterpreted as valid data. Arrays are never mapping shapes. */
export function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      throw new Error(`${label} has an unsupported field: ${key}.`);
  }
}

export const objectShape = (
  value: unknown,
  label: string
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
};
