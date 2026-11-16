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
 * no marker of its own for a hub section.)
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
  /** Which presence check failed, in words; null when none did or the
   * section has no check. */
  mark: string | null;
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
      `granted by ${count(c, 'topic.grant')}, asked by ${count(c, 'topic.ask')}`,
    mark: (c) =>
      count(c, 'topic.ask') === 0 && count(c, 'topic.grant') > 0
        ? 'granted, never asked'
        : count(c, 'topic.grant') === 0 && count(c, 'topic.ask') > 0
          ? 'asked, never granted'
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
    mark: (c) =>
      count(c, 'secret.reveal') === 0 ? 'no record reveals it' : null,
  },
};

/** "hold 4", "reveal 1 · find 1 · bar 2": each entry kind's last word and
 * its count. */
function generic(counts: HubRow['counts']): string {
  return counts.length === 0
    ? 'no entries'
    : counts
        .map(({ kind, count: n }) => `${kind.split('.').pop()} ${n}`)
        .join(' · ');
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
