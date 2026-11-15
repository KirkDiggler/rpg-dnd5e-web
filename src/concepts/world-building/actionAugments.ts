/**
 * ADD ACTION AND DROP ACTION (rpg-project#721): the two ordered ref lists a
 * stat block (`TemplateSpec.AddActions`/`DropActions`) and a placement
 * (`RoomMonsterBinding.AddActions`/`DropActions`) carry, as edits.
 *
 * THE ENGINE RESOLVES, THE STUDIO CARRIES. The session assembles a creature's
 * weapons at launch in one order (rpg-toolkit `rulebooks/dnd5e/session`
 * `instantiateWithActionAugments`, `augmentActions`): the base's weapons, the
 * stat block's `actions` (a replacement), its add/drop, the placement's
 * `actions` (a replacement), then its add/drop. A drop removes every copy and
 * refuses a weapon absent from the list at its layer. What that makes a
 * creature fight with is said by the engine's read-back (rpg-project#968),
 * never here.
 *
 * TYPED REFS, WEAPONS TODAY. The toolkit's grammar names an action as
 * `dnd5e:weapons:<id>` (`dungeonspec/grammar.go placeActionAugment`); a feature
 * or spell ref joins when the catalog names one. Catalog membership is the
 * engine's question, asked at launch, not this module's.
 */
import { DND5E_WEAPON_REF_RE, parseRef } from '@/utils/refs';
import { normalizeBinding } from './monsterOrderEdits';
import type { RoomMonsterBinding } from './roomDraft';

export type ActionAugmentKey = 'addActions' | 'dropActions';

/** The engine's sentence for a ref its grammar refuses (rpg-toolkit
 * `dungeonspec/grammar.go placeActionAugment`), or null when it is a weapon
 * ref. The form says it before Apply in the words PutDungeon would. */
export function actionRefRefusal(ref: string): string | null {
  const text = ref.trim();
  if (DND5E_WEAPON_REF_RE.test(text)) return null;
  if (!parseRef(text)) return `"${text}" is not a ref.`;
  return `"${text}" is not a weapon: an action names a weapon as dnd5e:weapons:<id>`;
}

/** The first staged ref the grammar refuses, with its list and index, so the
 * form can land on the field. */
export function firstActionRefRefusal(
  lists: Partial<Record<ActionAugmentKey, readonly string[]>>
): { key: ActionAugmentKey; index: number; message: string } | null {
  for (const key of ['addActions', 'dropActions'] as const) {
    const refs = lists[key] ?? [];
    for (let index = 0; index < refs.length; index += 1) {
      const message = actionRefRefusal(refs[index]);
      if (message) return { key, index, message };
    }
  }
  return null;
}

/** Replace one placement's add or drop list. An empty list is the authored
 * state "none" and drops the key, as `normalizeBinding` does for `actions`. */
export function setMonsterActionAugment(
  binding: RoomMonsterBinding | undefined,
  key: ActionAugmentKey,
  refs: readonly string[]
): RoomMonsterBinding | undefined {
  return normalizeBinding({ ...(binding ?? {}), [key]: [...refs] });
}

/** Move one entry of an ordered list; an out-of-range or no-op move returns
 * the list unchanged. */
export function moveRef(
  refs: readonly string[],
  from: number,
  to: number
): readonly string[] {
  if (from === to || from < 0 || to < 0) return refs;
  if (from >= refs.length || to >= refs.length) return refs;
  const next = [...refs];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
