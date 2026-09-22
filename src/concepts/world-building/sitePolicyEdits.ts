/**
 * Editing the site's `factions` and `dispositions` (rpg-dnd5e-web#1160, design
 * slice 3/4).
 *
 * THE BUILDER IS A FORM BUILDER, AND THESE ARE ITS MECHANICS, NOT ITS
 * OPINIONS. Every function here moves bytes the toolkit already accepts: it
 * never decides which entry fires, never sums a weight, and never reads a
 * `when`. It also does not protect the author from a reference it cannot
 * resolve: renaming a faction id changes the declaration and nothing else, and
 * removing one removes the declaration — if a placement, a disposition or a
 * predicate still names it, the ENGINE refuses that, by name and with the fix
 * (`dungeonspec/factions.go:93`), and that sentence is the one to surface.
 * Semantic authority is the server's, not the form's.
 *
 * WORDS AND SHAPES COME FROM THE DECLARATIONS. The entry defaults are read
 * from `answerVocabulary.ts` (`answerWordsForTrigger`, the word's `value`
 * shape), the trigger list from `ANSWER_TRIGGERS`, the reserved names from
 * `factionVocabulary.ts`. Nothing restates a word.
 */
import {
  ANSWER_SELECTOR_WORDS,
  answerWord,
  answerWordsForTrigger,
  type AnswerWordSpec,
} from '@/author/answerVocabulary';
import { PARTY } from '@/author/factionVocabulary';
import type { AnswerEntryShape, AnswerTableShape } from './answerTableShape';
import type { SiteDisposition, SiteFaction, SiteScope } from './siteScope';

/** A fresh faction id nobody has taken. */
export function nextFactionId(scope: SiteScope): string {
  const taken = new Set((scope.factions ?? []).map((faction) => faction.id));
  let n = (scope.factions?.length ?? 0) + 1;
  while (taken.has(`faction-${n}`)) n += 1;
  return `faction-${n}`;
}

export function addSiteFaction(scope: SiteScope): SiteScope {
  return {
    ...scope,
    factions: [...(scope.factions ?? []), { id: nextFactionId(scope) }],
  };
}

/** Rename a faction's id. REFERENCES ARE NOT REWRITTEN: a placement's
 * `faction`, a disposition's `between` and a `stance` predicate keep the old
 * name, and if one no longer resolves the engine says so — that is the
 * server's judgement, not the form's. */
export function renameSiteFaction(
  scope: SiteScope,
  from: string,
  to: string
): SiteScope {
  return {
    ...scope,
    factions: (scope.factions ?? []).map((faction) =>
      faction.id === from ? { ...faction, id: to } : faction
    ),
  };
}

/** Remove a faction declaration. References to it are left as written; the
 * engine names the dangling one and its fix. */
export function removeSiteFaction(scope: SiteScope, id: string): SiteScope {
  return {
    ...scope,
    factions: (scope.factions ?? []).filter((faction) => faction.id !== id),
  };
}

/** Patch a faction's `mind`, `temper` or shared `on:` table. The id is NOT
 * patchable here: a rename has its own function. A cleared field is DELETED,
 * never written as an `undefined` or empty key. */
export function patchSiteFaction(
  scope: SiteScope,
  id: string,
  patch: Partial<Omit<SiteFaction, 'id'>>
): SiteScope {
  return {
    ...scope,
    factions: (scope.factions ?? []).map((faction) => {
      if (faction.id !== id) return faction;
      const next: SiteFaction = { ...faction, ...patch };
      if (next.mind === undefined || next.mind === '') delete next.mind;
      if (next.temper === undefined) delete next.temper;
      if (next.on === undefined || Object.keys(next.on).length === 0)
        delete next.on;
      return next;
    }),
  };
}

/** Declare a new disposition: the first declared faction against the party,
 * hostile, no `until`. There is nothing to declare one about until a faction
 * exists, so with none the scope is returned unchanged and the verb is
 * disabled. */
export function addSiteDisposition(scope: SiteScope): SiteScope {
  const first = (scope.factions ?? [])[0];
  if (!first) return scope;
  return {
    ...scope,
    dispositions: [
      ...(scope.dispositions ?? []),
      { between: [first.id, PARTY], stance: 'hostile' },
    ],
  };
}

/** Patch one disposition. The `until` is kept as written whatever the stance
 * becomes — whether a predicate belongs on this pair is the engine's call. */
export function updateSiteDisposition(
  scope: SiteScope,
  index: number,
  patch: Partial<SiteDisposition>
): SiteScope {
  return {
    ...scope,
    dispositions: (scope.dispositions ?? []).map((disposition, i) => {
      if (i !== index) return disposition;
      const next: SiteDisposition = { ...disposition, ...patch };
      if (next.until === undefined) delete next.until;
      return next;
    }),
  };
}

export function removeSiteDisposition(
  scope: SiteScope,
  index: number
): SiteScope {
  return {
    ...scope,
    dispositions: (scope.dispositions ?? []).filter((_, i) => i !== index),
  };
}

/** The one word an entry carries, by ASKING the vocabulary rather than by
 * listing keys: `ANSWER_ENTRY_RULES.maximumWords` guarantees at most one. */
export function entryWord(entry: AnswerEntryShape): string | undefined {
  return (Object.keys(entry) as string[]).find(
    (key) => answerWord(key) !== undefined
  );
}

/** A NEW entry: the first word legal on the trigger THAT CARRIES NOTHING
 * (`flee` on a social key, `hold` on `time`). A `fact` needs an id and there
 * is none to invent; the author writes it. */
export function defaultAnswerEntry(trigger: string): AnswerEntryShape {
  const words = answerWordsForTrigger(trigger);
  const word =
    words.find((spec: AnswerWordSpec) => spec.value === 'none') ?? words[0];
  const entry = {} as Record<string, unknown>;
  if (!word) return entry as AnswerEntryShape;
  if (word.value === 'string') entry[word.key] = '';
  else if (word.value === 'selector')
    entry[word.key] = ANSWER_SELECTOR_WORDS[0]?.key ?? 'enemy';
  else entry[word.key] = {};
  return entry as AnswerEntryShape;
}

/** Replace an entry's one word, carrying a value of the SHAPE that word has.
 * Any previous word is dropped — an entry does one thing. */
export function setAnswerEntryWord(
  entry: AnswerEntryShape,
  word: string
): AnswerEntryShape {
  const next = { ...entry } as Record<string, unknown>;
  for (const key of Object.keys(next)) {
    if (answerWord(key)) delete next[key];
  }
  const spec = answerWord(word);
  if (spec?.value === 'string') next[word] = '';
  else if (spec?.value === 'selector')
    next[word] = ANSWER_SELECTOR_WORDS[0]?.key ?? 'enemy';
  else next[word] = {};
  return next as AnswerEntryShape;
}

export function addSiteAnswerEntry(
  scope: SiteScope,
  factionId: string,
  trigger: string
): SiteScope {
  const faction = (scope.factions ?? []).find(
    (entry) => entry.id === factionId
  );
  const table = faction?.on ?? {};
  return patchSiteFaction(scope, factionId, {
    on: {
      ...table,
      [trigger]: [...(table[trigger] ?? []), defaultAnswerEntry(trigger)],
    },
  });
}

/** Patch one entry by index. An empty trigger or an empty table drops its key
 * so the document never carries a list the engine reads as "nothing happens
 * here" — but a trigger is never dropped for having no entries, because an
 * empty list is what the toggle-off produces and the author removes it
 * deliberately. */
export function patchSiteAnswerEntry(
  scope: SiteScope,
  factionId: string,
  trigger: string,
  index: number,
  entry: AnswerEntryShape
): SiteScope {
  const faction = (scope.factions ?? []).find((item) => item.id === factionId);
  const table: AnswerTableShape = { ...(faction?.on ?? {}) };
  const entries = [...(table[trigger] ?? [])];
  if (index < 0 || index >= entries.length) return scope;
  entries[index] = entry;
  table[trigger] = entries;
  return patchSiteFaction(scope, factionId, { on: table });
}

export function removeSiteAnswerEntry(
  scope: SiteScope,
  factionId: string,
  trigger: string,
  index: number
): SiteScope {
  const faction = (scope.factions ?? []).find((item) => item.id === factionId);
  const table: AnswerTableShape = { ...(faction?.on ?? {}) };
  const entries = (table[trigger] ?? []).filter((_, i) => i !== index);
  if (entries.length === 0) delete table[trigger];
  else table[trigger] = entries;
  return patchSiteFaction(scope, factionId, { on: table });
}
