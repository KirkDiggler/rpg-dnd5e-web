/**
 * Editing a binding's OPTIONS — the lines a character can say to a creature or
 * a prop (rpg-project#569). One list grammar for both owners:
 * `monsterOrderEdits.ts` and `propBindingEdits.ts` each wrap these to put the
 * list back on their binding.
 *
 * THE BUILDER IS A FORM BUILDER, AND THESE ARE ITS MECHANICS. Nothing here
 * decides whether a check can be beaten, whether a fact will ever be known, or
 * which verdict row fires. Every function moves bytes the engine's
 * `OptionSpec` accepts and drops the states it refuses by NORMALIZING:
 *
 *   `options: []`     -> the key is absent (an empty list is "none")
 *   `success: []`     -> "`success` lists nothing — omit it", so it is omitted
 *   `requires` unset  -> the line is always offered, so the key is absent
 *
 * AN INCOMPLETE OPTION IS ALLOWED WHILE IT IS BEING WRITTEN. A new line has
 * an id and a check but no words yet; the engine refuses it ("the option does
 * not say what the character says") and so does the studio's export, which is
 * the honest answer until the author types the line — the same rule an intel
 * record with no fact yet follows.
 */
import type {
  AnswerApproachShape,
  AnswerEntryShape,
  OptionRequiresShape,
  OptionShape,
  OptionVerdict,
} from './answerTableShape';
import type { RoomGameplayData } from './roomDraft';

/** A binding's options. `undefined` is the authored state "none" and the ONLY
 * empty representation — never `[]`. */
export type Options = OptionShape[] | undefined;

/** The approach a new line starts with: talking somebody round, the commonest
 * line there is. The author picks the skill; this is only a starting row so
 * the check is never empty. */
export const DEFAULT_OPTION_APPROACH: AnswerApproachShape = Object.freeze({
  ability: 'persuasion',
  dc: 10,
}) as AnswerApproachShape;

/** An id no option on this binding has taken: `line-1`, `line-2`, … The id
 * names the line on its binding, so uniqueness is per binding. */
export function nextOptionId(options: Options): string {
  const taken = new Set((options ?? []).map((option) => option.id));
  for (let n = 1; ; n += 1) {
    const id = `line-${n}`;
    if (!taken.has(id)) return id;
  }
}

/** One option with its refused-empty keys dropped. The check is kept even
 * when empty, because an option without one is refused by name and the author
 * should see that sentence rather than lose the key silently. */
export function normalizeOption(option: OptionShape): OptionShape {
  const next: OptionShape = {
    id: option.id,
    say: option.say,
    check: option.check.map((approach) => {
      const row: AnswerApproachShape = {
        ability: approach.ability,
        dc: approach.dc,
      };
      if (approach.tool) row.tool = approach.tool;
      return row;
    }),
  };
  if (option.requires !== undefined) next.requires = option.requires;
  if (option.success !== undefined && option.success.length > 0)
    next.success = option.success;
  if (option.failure !== undefined && option.failure.length > 0)
    next.failure = option.failure;
  return next;
}

/** The list with every option normalized, or `undefined` when it is empty. */
export function normalizeOptions(options: Options): Options {
  if (options === undefined || options.length === 0) return undefined;
  return options.map(normalizeOption);
}

/** Append a new line at the END. Order is authored: it is the order the
 * lines are offered in. */
export function addOption(options: Options): OptionShape[] {
  return [
    ...(options ?? []),
    {
      id: nextOptionId(options),
      say: '',
      check: [{ ...DEFAULT_OPTION_APPROACH }],
    },
  ];
}

/** Remove one line by index. Removing the last one is "none". */
export function removeOption(options: Options, index: number): Options {
  return normalizeOptions((options ?? []).filter((_, i) => i !== index));
}

/** Replace one line by index. An out-of-range index returns the list
 * unchanged. */
export function replaceOption(
  options: Options,
  index: number,
  option: OptionShape
): Options {
  const list = [...(options ?? [])];
  if (index < 0 || index >= list.length) return options;
  list[index] = option;
  return normalizeOptions(list);
}

// --- inside one option -----------------------------------------------------

/** Set the id, the line, or the gate. `requires: undefined` makes the line
 * always offered. */
export function patchOption(
  option: OptionShape,
  patch: Partial<Pick<OptionShape, 'id' | 'say'>> & {
    requires?: OptionRequiresShape | undefined;
  }
): OptionShape {
  const next: OptionShape = { ...option, ...patch };
  if ('requires' in patch && patch.requires === undefined) delete next.requires;
  return normalizeOption(next);
}

export function addOptionApproach(option: OptionShape): OptionShape {
  return normalizeOption({
    ...option,
    check: [...option.check, { ...DEFAULT_OPTION_APPROACH }],
  });
}

export function patchOptionApproach(
  option: OptionShape,
  index: number,
  patch: Partial<AnswerApproachShape>
): OptionShape {
  if (index < 0 || index >= option.check.length) return option;
  return normalizeOption({
    ...option,
    check: option.check.map((approach, i) =>
      i === index ? { ...approach, ...patch } : approach
    ),
  });
}

export function removeOptionApproach(
  option: OptionShape,
  index: number
): OptionShape {
  return normalizeOption({
    ...option,
    check: option.check.filter((_, i) => i !== index),
  });
}

/** A new verdict row: a line and nothing else. It says nothing yet, which the
 * engine refuses ("this entry does nothing and says nothing") until the author
 * writes what is answered — a row has no useful default word, since `fact`
 * needs an id there is none to invent and `flee` is the last thing an author
 * means by default. */
export function addOptionRow(
  option: OptionShape,
  verdict: OptionVerdict
): OptionShape {
  return normalizeOption({
    ...option,
    [verdict]: [...(option[verdict] ?? []), { say: '' }],
  });
}

export function patchOptionRow(
  option: OptionShape,
  verdict: OptionVerdict,
  index: number,
  row: AnswerEntryShape
): OptionShape {
  const rows = [...(option[verdict] ?? [])];
  if (index < 0 || index >= rows.length) return option;
  rows[index] = row;
  return normalizeOption({ ...option, [verdict]: rows });
}

/** Remove one verdict row. Removing the last drops the verdict: a verdict
 * written and left empty is refused, and absence is "answers nothing". */
export function removeOptionRow(
  option: OptionShape,
  verdict: OptionVerdict,
  index: number
): OptionShape {
  return normalizeOption({
    ...option,
    [verdict]: (option[verdict] ?? []).filter((_, i) => i !== index),
  });
}

/** The placed props a line may require HOLDING, by id: every declared prop
 * whose binding lets somebody pick it up — the engine's own universe
 * (`roomProps`), read here so the picker never offers a prop the engine
 * refuses ("a prop nobody can pick up, so nobody can hold it"). */
export function holdablePropIds(room: RoomGameplayData): string[] {
  return Object.keys(room.propDeclarations).filter(
    (id) => room.propBindings?.[id]?.holdable === true
  );
}
