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

let carrying = 0;

/**
 * THE STUDIO LOADS WHATEVER THE ENGINE RUNS (rpg-project#857, Kirk: "if it
 * runs, we should load it"): the dungeonspec compiler is the validator;
 * fields the studio does not author are preserved, never refused.
 *
 * Inside `carryUnknownFields`, the dungeon file's decode, an unknown key is
 * set aside from the freshly parsed value instead of refused: the decoded
 * model holds only what the studio authors, and the export splices the
 * studio's changes into the file as it was read (`yamlSplice.ts`), so the
 * set-aside bytes are written back untouched. Outside it, the studio's own
 * workspace and storage formats stay exact.
 */
export function carryUnknownFields<T>(read: () => T): T {
  carrying++;
  try {
    return read();
  } finally {
    carrying--;
  }
}

/** Whether a dungeon file is being read, where unknown keys are carried. */
export function carriesUnknownFields(): boolean {
  return carrying > 0;
}

/** Structurally exact records only: outside a dungeon file's decode an
 * unknown field is refused, not dropped or reinterpreted as valid data.
 * Inside one it is set aside for the export to keep (`carryUnknownFields`).
 * Arrays are never mapping shapes. */
export function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void {
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;
    if (carrying) delete value[key];
    else throw new Error(`${label} has an unsupported field: ${key}.`);
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
