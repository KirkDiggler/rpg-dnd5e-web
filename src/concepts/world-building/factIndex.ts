/**
 * THE FACT INDEX: every fact id the draft mentions, with who writes it and
 * who reads it (rpg-project#576, R5, B9).
 *
 * IT STORES NOTHING. The dialect declares a fact by mentioning it, so there
 * is no fact list to keep and none is invented: this is recomputed from the
 * document on every render. Only an index can show a fact that is written
 * and never read, or read and never written, and it marks both.
 *
 * WRITERS: option `success`/`failure` rows with `fact` (a creature's or a
 * prop's), table rows and `on:` rows with `fact`, an intel record that
 * reveals a fact. READERS: option `requires`, a row's `when` at any nesting,
 * a disposition's `until`, a binding's `arrives`, an ending's `when`.
 */
import type { PredicateDoc } from '@/author/factionVocabulary';
import type { AnswerTableShape, OptionShape } from './answerTableShape';
import { walkFacts } from './factWalk';
import { documentPlacementNames } from './placementNames';
import { sideName } from './predicateSentence';
import type { RoomDraftDocument } from './roomDraft';

/** Where clicking a use goes: a placed thing, or a home section on an id. */
export type FactUseTarget =
  | { kind: 'creature'; id: string }
  | { kind: 'prop'; id: string }
  | { home: 'tables' | 'factions' | 'dispositions' | 'intel'; id: string };

export interface FactUse {
  kind:
    | 'option'
    | 'table-row'
    | 'intel'
    | 'disposition'
    | 'arrives'
    | 'ending'
    | 'requires';
  label: string;
  /** Absent for a noun with no studio view yet (an ending, S4). */
  target?: FactUseTarget;
}

export interface FactIndexRow {
  fact: string;
  writers: readonly FactUse[];
  readers: readonly FactUse[];
}

const sameUse = (a: FactUse, b: FactUse) =>
  a.kind === b.kind && a.label === b.label;

/** Every mentioned fact, sorted by id, with its writers and readers each
 * named once. */
export function factIndexOf(
  document: Readonly<RoomDraftDocument>
): readonly FactIndexRow[] {
  const rows = new Map<string, { writers: FactUse[]; readers: FactUse[] }>();
  const row = (fact: string) => {
    let entry = rows.get(fact);
    if (!entry) rows.set(fact, (entry = { writers: [], readers: [] }));
    return entry;
  };
  const add = (list: FactUse[], use: FactUse) => {
    if (!list.some((u) => sameUse(u, use))) list.push(use);
  };
  const write = (fact: string, use: FactUse) => add(row(fact).writers, use);
  const read = (fact: string, use: FactUse) => add(row(fact).readers, use);

  const table = (on: AnswerTableShape | undefined, use: FactUse) => {
    for (const entries of Object.values(on ?? {}))
      for (const entry of entries) {
        if (entry.fact !== undefined) write(entry.fact, use);
        walkFacts(entry.when, (fact) => read(fact, use));
      }
  };
  const options = (
    owner: string,
    list: readonly OptionShape[] | undefined,
    target: FactUseTarget
  ) => {
    for (const option of list ?? []) {
      const use: FactUse = {
        kind: 'option',
        label: `${owner}: ${option.id}`,
        target,
      };
      if (option.requires && 'fact' in option.requires)
        read(option.requires.fact, { ...use, kind: 'requires' });
      for (const entry of [
        ...(option.success ?? []),
        ...(option.failure ?? []),
      ])
        if (entry.fact !== undefined) write(entry.fact, use);
    }
  };
  const predicate = (p: PredicateDoc | undefined, use: FactUse) => {
    if (p !== undefined && 'fact' in p) read(p.fact, use);
  };

  const scope = document.scope;
  for (const [id, on] of Object.entries(scope.tables ?? {}))
    table(on, {
      kind: 'table-row',
      label: id,
      target: { home: 'tables', id },
    });
  for (const faction of scope.factions ?? [])
    table(faction.on, {
      kind: 'table-row',
      label: faction.id,
      target: { home: 'factions', id: faction.id },
    });
  (scope.dispositions ?? []).forEach((d, index) =>
    predicate(d.until, {
      kind: 'disposition',
      label: `${sideName(d.between[0])} and ${sideName(d.between[1])}`,
      target: { home: 'dispositions', id: String(index) },
    })
  );
  for (const record of scope.intel ?? [])
    if ('fact' in record.reveals)
      write(record.reveals.fact, {
        kind: 'intel',
        label: `intel ${record.id}`,
        target: { home: 'intel', id: record.id },
      });
  for (const ending of scope.endings ?? [])
    predicate(ending.when, { kind: 'ending', label: `ending ${ending.id}` });

  const names = documentPlacementNames(document);
  const room = document.draft.room;
  for (const monster of room.monsterDeclarations) {
    const binding = room.monsterBindings?.[monster.id];
    if (binding === undefined) continue;
    const name = names.get(monster.id) ?? monster.id;
    const target: FactUseTarget = { kind: 'creature', id: monster.id };
    table(binding.on, { kind: 'table-row', label: name, target });
    options(name, binding.options, target);
    predicate(binding.arrives, {
      kind: 'arrives',
      label: `${name} arrives`,
      target,
    });
  }
  for (const [id, binding] of Object.entries(room.propBindings ?? {})) {
    const label = document.draft.scene.items.find((i) => i.id === id)?.label;
    const name = label?.trim() ? label : id;
    const target: FactUseTarget = { kind: 'prop', id };
    options(name, binding.options, target);
    predicate(binding.arrives, {
      kind: 'arrives',
      label: `${name} arrives`,
      target,
    });
  }

  return [...rows.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([fact, uses]) => ({ fact, ...uses }));
}
