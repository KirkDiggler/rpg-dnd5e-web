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
  ReadBackStatement,
  ReadBackSubject,
  ReadBackUnsaid,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { targetOfPath, type RefusalTarget } from './refusalJump';

/** The selections the inspector reads back. */
export interface ReadBackSelection {
  kind: 'creature' | 'prop';
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
  const groups = readBack.sections.flatMap((section) => section.groups);
  const own = groups.map((group) => ({
    group,
    statements: group.statements.filter((statement) =>
      same(statement.about, selection.kind, selection.id)
    ),
  }));
  const used = new Set<string>();
  for (const { statements } of own)
    for (const statement of statements)
      for (const connection of statement.connects)
        if (connection.role === USES_ROLE)
          used.add(`${connection.kind}\u0000${connection.id}`);
  const out: SelectedReadBackGroup[] = [];
  own.forEach(({ group, statements }) => {
    const about = group.about;
    const isUsed =
      about !== undefined && used.has(`${about.kind}\u0000${about.id}`);
    const shown = isUsed ? group.statements : statements;
    if (shown.length > 0)
      out.push({ title: group.title, about, statements: shown });
  });
  const notYetSaid = readBack.notYetSaid.filter((unsaid) =>
    landsOn(targetOfPath(unsaid.path, document), selection)
  );
  return { groups: out, notYetSaid };
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
  | { kind: 'fact'; id: string };

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
    case 'fact':
    case 'topic':
      return { kind: 'fact', id };
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
    case 'faction':
      return indexed('factions', scope.factions);
    case 'record':
      return indexed('intel', scope.intel);
    case 'bundle':
      return through(`bundles.${id}`);
    case 'exit':
      return indexed('exits', scope.exits);
    // `routine` has no studio home yet (rpg-project#970): it stays text.
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
