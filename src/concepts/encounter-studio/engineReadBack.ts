/**
 * THE ENGINE'S READ-BACK, FILTERED TO ONE SELECTION (rpg-project#968, R25).
 *
 * The sentences are the engine's (`dungeonspec/readback`, carried on
 * `PutDungeonResponse.read_back`). Nothing here writes or alters a sentence:
 * this only chooses which of the engine's statements a selection shows, in
 * the engine's order under the engine's group titles, and which of their
 * connections and paths the studio can land on.
 *
 * WHICH STATEMENTS BELONG TO A SELECTION:
 * 1. every statement whose `about` is the selection, under the title of the
 *    group it sits in (a creature's own group; a prop's statements sit in the
 *    site's group, "The place", since a prop has no group of its own);
 * 2. every group about a thing one of those statements connects to with the
 *    role `uses` — the routine a creature runs (`creature.routine` →
 *    `{routine, captain-policy, uses}`) — whole, in the engine's order. One
 *    hop only: a routine's own `uses` of a bundle is not followed.
 */
import type {
  ReadBack,
  ReadBackConnection,
  ReadBackFoldedItem,
  ReadBackGroup,
  ReadBackSection,
  ReadBackStatement,
  ReadBackSubject,
  ReadBackUnsaid,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { targetOfPath, type RefusalTarget } from './refusalJump';

/** The selections the inspector reads back. */
export interface ReadBackSelection {
  /** A placed thing, or a hub (rpg-project#973): a fact, a topic, a
   * record or a concealment — any subject kind the engine groups a hub by. */
  kind: string;
  id: string;
}

/** The connection role that brings a whole group into a selection's
 * read-back: the engine's word for a creature running a routine. */
export const USES_ROLE = 'uses';

export interface SelectedReadBackGroup {
  /** The engine's group title. */
  title: string;
  about: ReadBackSubject | undefined;
  statements: ReadBackStatement[];
}

export interface SelectedReadBack {
  groups: SelectedReadBackGroup[];
  /** What the engine says it cannot yet say, whose path lands on the
   * selection. */
  notYetSaid: ReadBackUnsaid[];
}

const same = (
  subject: ReadBackSubject | undefined,
  kind: string,
  id: string
): boolean => subject?.kind === kind && subject.id === id;

/** The selection's statements and the groups it uses, in the engine's
 * order. Empty groups when the read-back says nothing about it. */
export function readBackOfSelection(
  readBack: ReadBack,
  selection: ReadBackSelection,
  document: Readonly<RoomDraftDocument>
): SelectedReadBack {
  const groups = selectedGroups(readBack, selection).map(
    ({ group, statements }) => ({
      title: group.title,
      about: group.about,
      statements,
    })
  );
  const notYetSaid = readBack.notYetSaid.filter((unsaid) =>
    landsOn(targetOfPath(unsaid.path, document), selection)
  );
  return { groups, notYetSaid };
}

/** The selection's statements with the full section and group each sits
 * in: rule 1 and rule 2 above, in the engine's order. */
function selectedGroups(
  readBack: ReadBack,
  selection: ReadBackSelection
): {
  section: ReadBackSection;
  group: ReadBackGroup;
  statements: ReadBackStatement[];
}[] {
  // A thing with a group of its own (a creature, a routine, a hub) is said
  // by that group alone: a hub's site statement (`place.intel`,
  // `place.concealment`) is the place's, not the hub's thread. A thing with
  // no group (a prop) is said wherever its statements are.
  const hasOwnGroup = readBack.sections.some((section) =>
    section.groups.some((group) =>
      same(group.about, selection.kind, selection.id)
    )
  );
  const own = readBack.sections.flatMap((section) =>
    section.groups.map((group) => ({
      section,
      group,
      statements:
        hasOwnGroup && !same(group.about, selection.kind, selection.id)
          ? []
          : group.statements.filter((statement) =>
              same(statement.about, selection.kind, selection.id)
            ),
    }))
  );
  const used = new Set<string>();
  for (const { statements } of own)
    for (const statement of statements)
      for (const connection of statement.connects)
        if (connection.role === USES_ROLE)
          used.add(`${connection.kind}\u0000${connection.id}`);
  return own
    .map((entry) => {
      const about = entry.group.about;
      const isUsed =
        about !== undefined && used.has(`${about.kind}\u0000${about.id}`);
      return isUsed ? { ...entry, statements: entry.group.statements } : entry;
    })
    .filter((entry) => entry.statements.length > 0);
}

/** One folded entry shown for the selection: the engine's text, the full
 * statements it stands for that the selection chose (those of its own
 * section set at one of its own `paths`, in the engine's order), and its
 * entries, each the same. */
export interface ShownFoldedItem {
  item: ReadBackFoldedItem;
  statements: ReadBackStatement[];
  items: ShownFoldedItem[];
}

export interface SelectedFoldedReadBack {
  /** The engine's folded sections that hold the selection's entries, in the
   * engine's order, under the engine's titles. */
  sections: { title: string; items: ShownFoldedItem[] }[];
  /** A selected statement behind no shown entry: listed in full under the
   * folded view so nothing the Full view shows is lost. */
  unreached: ReadBackStatement[];
}

/**
 * THE ENGINE'S FOLDED READ-BACK, FILTERED TO ONE SELECTION (rpg-project#978).
 *
 * A folded entry carries no subject, only the whole path of every statement
 * it stands for, and one path can be set by statements about several things
 * (a grate's relocate row is also the path of the join it makes). So:
 * - the selection's statements are chosen by the rule above;
 * - in the folded section titled as the full section they sit in (the engine
 *   folds each full section into the folded one of the same title), a path
 *   is the selection's own when every statement of that section set at it is
 *   a selected one;
 * - an entry is shown, whole and with every entry under it, when one of its
 *   own `paths` is the selection's own; otherwise its entries are tried the
 *   same way. The shallowest match wins.
 * An entry the engine folded across things ("has the same 3 lines as Guard
 * (gate-1)") is shown as the engine wrote it. The studio folds, joins and
 * rewords nothing.
 */
export function foldedOfSelection(
  readBack: ReadBack,
  selection: ReadBackSelection
): SelectedFoldedReadBack {
  const selected = selectedGroups(readBack, selection);
  const chosen = new Set(selected.flatMap(({ statements }) => statements));
  const sections: SelectedFoldedReadBack['sections'] = [];
  const reached = new Set<ReadBackStatement>();
  for (const folded of readBack.folded) {
    const full = readBack.sections.find(
      (section) => section.title === folded.title
    );
    if (!full || !selected.some(({ section }) => section === full)) continue;
    const everyStatement = full.groups.flatMap((group) => group.statements);
    const atPath = new Map<string, ReadBackStatement[]>();
    for (const statement of everyStatement)
      atPath.set(statement.path, [
        ...(atPath.get(statement.path) ?? []),
        statement,
      ]);
    const own = new Set(
      [...atPath]
        .filter(([, statements]) => statements.every((st) => chosen.has(st)))
        .map(([path]) => path)
    );
    const shown = (item: ReadBackFoldedItem): ShownFoldedItem => {
      const paths = new Set(item.paths);
      // Only the selection's own: a path shared with another thing (three
      // creatures speaking one faction's lines) never opens to its
      // statements.
      const statements = everyStatement.filter(
        (st) => paths.has(st.path) && chosen.has(st)
      );
      for (const statement of statements) reached.add(statement);
      return { item, statements, items: item.items.map(shown) };
    };
    const pick = (items: readonly ReadBackFoldedItem[]): ShownFoldedItem[] =>
      items.flatMap((item) =>
        item.paths.some((path) => own.has(path))
          ? [shown(item)]
          : pick(item.items)
      );
    const items = pick(folded.items);
    if (items.length > 0) sections.push({ title: folded.title, items });
  }
  const unreached = selected
    .flatMap(({ statements }) => statements)
    .filter((statement) => !reached.has(statement));
  return { sections, unreached };
}

/** Whether a path's target is the selection itself. */
export function landsOn(
  target: RefusalTarget | null,
  selection: ReadBackSelection
): boolean {
  return (
    target !== null &&
    target.kind === selection.kind &&
    'id' in target &&
    target.id === selection.id
  );
}

/** Where a connection lands: a selection or Encounter section through the
 * one path map, or the Facts section on a fact or topic. Null for a kind
 * the studio has no place for, or an id the document does not hold. */
export type ReadBackJump =
  | { kind: 'target'; target: RefusalTarget }
  /** A hub: opens its thread (rpg-project#973). */
  | { kind: 'hub'; id: string; hub: string }
  /** A way pointer (`{way, id, is}`, on a record's or a secret's entry):
   * opens the way's join. It is never itself a way. */
  | { kind: 'way'; id: string };

export function connectionJump(
  connection: Pick<ReadBackConnection, 'kind' | 'id'>,
  document: Readonly<RoomDraftDocument>
): ReadBackJump | null {
  const through = (path: string): ReadBackJump | null => {
    const target = targetOfPath(path, document);
    return target ? { kind: 'target', target } : null;
  };
  const { kind, id } = connection;
  /** `<list>[i]` for the entry with this id, or null when none has it. */
  const indexed = (
    list: string,
    entries: readonly { id: string }[] | undefined
  ): ReadBackJump | null => {
    const index = entries?.findIndex((entry) => entry.id === id) ?? -1;
    return index < 0 ? null : through(`${list}[${index}]`);
  };
  const scope = document.scope;
  switch (kind) {
    // A hub opens its thread; a routine opens Behaviours on it
    // (rpg-project#970).
    case 'fact':
    case 'topic':
    case 'record':
    case 'concealment':
    case 'routine':
      return { kind: 'hub', id, hub: kind };
    case 'way':
      return { kind: 'way', id };
    case 'creature':
      return through(`room.room.monsterBindings.${id}`);
    case 'prop':
      return through(`room.room.propBindings.${id}`);
    case 'door':
      return through(`room.room.doorBindings.${id}`);
    case 'region':
      return indexed('room.room.regions', document.draft.room.regions);
    case 'conversation':
      return through(`interactions.${id}`);
    // A conversation's lines written once (rpg-project#1027) open on the
    // Conversations page.
    case 'shared-lines':
      return through(`conversations.${id}`);
    case 'faction':
      return indexed('factions', scope.factions);
    case 'bundle':
      return through(`bundles.${id}`);
    case 'exit':
      return indexed('exits', scope.exits);
    default:
      return null;
  }
}

/** A statement's own path, when it lands somewhere other than the
 * selection. */
export function statementPathJump(
  statement: Pick<ReadBackStatement, 'path'>,
  selection: ReadBackSelection,
  document: Readonly<RoomDraftDocument>
): RefusalTarget | null {
  const target = targetOfPath(statement.path, document);
  return target && !landsOn(target, selection) ? target : null;
}
