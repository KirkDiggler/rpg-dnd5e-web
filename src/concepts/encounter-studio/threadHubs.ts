/**
 * THE HUBS THE ENGINE SAYS (rpg-project#973, R32). The read-back ends with
 * its hub sections — "Topics", "Facts", "Records", "Secrets" — one group per
 * hub (about `{topic|fact|record|concealment, id}`), its first statement the
 * hub's own and the rest its entries, each of a kind the engine names. The
 * Threads list is those sections, in the engine's order, under the engine's
 * titles: nothing is stored or derived from the draft.
 *
 * WHICH SECTIONS ARE HUB SECTIONS: every section from "Topics" on. The
 * engine puts its hub sections last, after the things they connect; a hub
 * section it adds later lists the same way, with counts only. (The wire has
 * no marker of its own for a hub section; rpg-toolkit#2448 asks the engine
 * to mark them, and to give `secret.bar` entries a join connection.)
 *
 * The row's counts and its mark are a presence check over the group's own
 * entries by the engine's kinds; a section with no presence rule below
 * shows counts only.
 */
import type { ReadBackGroup } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { StudioReadBack } from './studioPublishing';

export interface ThreadHub {
  /** The hub's subject kind: `fact`, `topic`, `record`, `concealment`, or
   * one the engine adds. */
  kind: string;
  id: string;
}

export interface HubRow {
  hub: ThreadHub;
  /** The group's entries (all but its own first statement), counted by
   * kind, in the order the engine first says each kind. */
  counts: { kind: string; count: number }[];
  /** The row's one line of counts. */
  summary: string;
  /** Which presence check failed, in words, shown as a warning; null when
   * none did or the section has no check. */
  mark: string | null;
  /** A neutral note from a presence check that is normal to fail (a secret
   * found only by search has no record revealing it). */
  note: string | null;
}

export interface HubSection {
  title: string;
  rows: HubRow[];
}

export const NO_THREADS_SENTENCE = 'The engine has not said the threads yet.';
export const FIRST_HUB_SECTION = 'Topics';

const count = (row: HubRow['counts'], kind: string): number =>
  row.find((entry) => entry.kind === kind)?.count ?? 0;

/** Per hub kind: the row's line and the presence check, over the engine's
 * entry kinds. */
const RULES: Record<
  string,
  {
    summary(counts: HubRow['counts']): string;
    mark(counts: HubRow['counts']): string | null;
    note?(counts: HubRow['counts']): string | null;
  }
> = {
  fact: {
    summary: (c) =>
      `taught by ${count(c, 'fact.teach')}, asked by ${count(c, 'fact.ask')}`,
    mark: (c) =>
      count(c, 'fact.ask') === 0 && count(c, 'fact.teach') > 0
        ? 'taught, never asked'
        : count(c, 'fact.teach') === 0 && count(c, 'fact.ask') > 0
          ? 'asked, never taught'
          : null,
  },
  topic: {
    summary: (c) =>
      `given by ${count(c, 'topic.grant')}, asked by ${count(c, 'topic.ask')}`,
    mark: (c) =>
      count(c, 'topic.ask') === 0 && count(c, 'topic.grant') > 0
        ? 'given, never asked'
        : count(c, 'topic.grant') === 0 && count(c, 'topic.ask') > 0
          ? 'asked, never given'
          : null,
  },
  record: {
    summary: generic,
    mark: (c) =>
      count(c, 'record.hold') === 0 && count(c, 'record.tell') === 0
        ? 'nothing holds or tells it'
        : null,
  },
  concealment: {
    summary: generic,
    mark: () => null,
    note: (c) =>
      count(c, 'secret.reveal') === 0 ? 'no record reveals it' : null,
  },
};

/** The row's words for an entry kind, matching the engine's fold
 * headings ("Held by:", "Told by:", "Lifts the hidden bar of:", "Revealed
 * by:", "Found by:", "Bars:", "Needed by:"). */
const ENTRY_WORDS: Record<string, string> = {
  'record.hold': 'held by',
  'record.tell': 'told by',
  'record.lift': 'lifts',
  'secret.reveal': 'revealed by',
  'secret.find': 'found by',
  'secret.bar': 'bars',
  'secret.need': 'needed by',
};

/** "held by 4", "revealed by 1, found by 1, bars 2": each entry kind in
 * words and its count; an unknown kind by its last segment. */
function generic(counts: HubRow['counts']): string {
  return counts.length === 0
    ? 'no entries'
    : counts
        .map(
          ({ kind, count: n }) =>
            `${ENTRY_WORDS[kind] ?? kind.split('.').pop()} ${n}`
        )
        .join(', ');
}

function rowOf(group: ReadBackGroup): HubRow {
  const hub = { kind: group.about!.kind, id: group.about!.id };
  const counts: HubRow['counts'] = [];
  for (const statement of group.statements.slice(1)) {
    const entry = counts.find((c) => c.kind === statement.kind);
    if (entry) entry.count += 1;
    else counts.push({ kind: statement.kind, count: 1 });
  }
  const rule = RULES[hub.kind];
  return {
    hub,
    counts,
    summary: rule ? rule.summary(counts) : generic(counts),
    mark: rule ? rule.mark(counts) : null,
    note: rule?.note ? rule.note(counts) : null,
  };
}

/** Every hub section the engine says, in its order. */
export function hubSectionsOf(
  readBack: StudioReadBack['readBack']
): HubSection[] {
  const sections = readBack?.sections ?? [];
  const first = sections.findIndex(
    (section) => section.title === FIRST_HUB_SECTION
  );
  if (first < 0) return [];
  return sections
    .slice(first)
    .map((section) => ({
      title: section.title,
      rows: section.groups.filter((group) => group.about).map(rowOf),
    }))
    .filter((section) => section.rows.length > 0);
}
