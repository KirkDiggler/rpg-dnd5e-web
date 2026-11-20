/**
 * THE CONVERSATIONS WRITTEN ONCE, AS THE ENGINE SAYS THEM (rpg-project#1027).
 *
 * The engine is the only voice here: which conversations the file writes,
 * who carries each, which lines belong to it and where each carrier's
 * `use:` stands all come from the read-back's statements and connections,
 * never from walking the file:
 *
 * - kind `shared-lines` at `conversations.<id>`, about `{shared-lines, id}`,
 *   with a `carries` connection per carrier (`{creature|prop|faction, id}`);
 * - kind `line` at `conversations.<id>.lines[k]`, connected
 *   `{shared-lines, id, said-to}`: the conversation's lines, said once;
 * - kind `shared-lines.use` at a carrier's entry (`…options[i]`), about the
 *   carrier, connected `{shared-lines, id, speaks-lines-of}`;
 * - kind `line` about a carrier at its own path: a line it says on its own,
 *   beside the conversation's.
 *
 * Nothing here reads a sentence for meaning. Paths are kept as the engine
 * wrote them; what stands at one is read from the draft by the caller.
 */
import type {
  ReadBack,
  ReadBackStatement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { SharedLinesInForm } from '../world-building/sharedLinesContext';
import type { LinesCarrier } from '../world-building/sharedLinesEdits';

export const SHARED_LINES_KIND = 'shared-lines';
export const SHARED_LINES_USE_KIND = 'shared-lines.use';
export const LINE_KIND = 'line';
export const CARRIES_ROLE = 'carries';
export const SPEAKS_LINES_OF_ROLE = 'speaks-lines-of';
export const SAID_TO_ROLE = 'said-to';

const CARRIER_KINDS: ReadonlySet<string> = new Set([
  'creature',
  'prop',
  'faction',
]);

export interface CarrierUse {
  carrier: LinesCarrier;
  /** The carrier's `use:` entry, as the engine names it
   * (`room.room.monsterBindings.gate-1.options[0]`). */
  path: string;
}

export interface CarrierOwnLine {
  carrier: LinesCarrier;
  /** The line's path in the carrier, as the engine names it. */
  path: string;
}

export interface SharedConversation {
  id: string;
  /** `conversations.<id>`, as the engine names it. */
  path: string;
  /** Who carries it, in the engine's order. */
  carriers: LinesCarrier[];
  /** Each carrier's `use:` entry. */
  uses: CarrierUse[];
  /** The conversation's lines, each said once at its own path. */
  linePaths: string[];
  /** The lines each carrier says on its own, beside this conversation's. */
  ownLines: CarrierOwnLine[];
}

const carrierOf = (
  subject: { kind: string; id: string } | undefined
): LinesCarrier | null =>
  subject && CARRIER_KINDS.has(subject.kind)
    ? { kind: subject.kind as LinesCarrier['kind'], id: subject.id }
    : null;

const sameCarrier = (a: LinesCarrier, b: LinesCarrier): boolean =>
  a.kind === b.kind && a.id === b.id;

function statementsOf(readBack: ReadBack): ReadBackStatement[] {
  return readBack.sections.flatMap((section) =>
    section.groups.flatMap((group) => group.statements)
  );
}

/** Every conversation written once, in the engine's order. */
export function sharedConversationsOf(
  readBack: ReadBack | null | undefined
): SharedConversation[] {
  if (!readBack) return [];
  const statements = statementsOf(readBack);
  const conversations: SharedConversation[] = [];
  for (const statement of statements) {
    if (
      statement.kind !== SHARED_LINES_KIND ||
      statement.about?.kind !== SHARED_LINES_KIND
    )
      continue;
    const id = statement.about.id;
    if (conversations.some((conversation) => conversation.id === id)) continue;
    const carriers: LinesCarrier[] = [];
    for (const connection of statement.connects) {
      if (connection.role !== CARRIES_ROLE) continue;
      const carrier = carrierOf(connection);
      if (carrier && !carriers.some((c) => sameCarrier(c, carrier)))
        carriers.push(carrier);
    }
    conversations.push({
      id,
      path: statement.path,
      carriers,
      uses: [],
      linePaths: [],
      ownLines: [],
    });
  }
  const named = (id: string) =>
    conversations.find((conversation) => conversation.id === id);
  for (const statement of statements) {
    if (statement.kind === SHARED_LINES_USE_KIND) {
      const carrier = carrierOf(statement.about);
      if (!carrier) continue;
      for (const connection of statement.connects) {
        if (
          connection.kind !== SHARED_LINES_KIND ||
          connection.role !== SPEAKS_LINES_OF_ROLE
        )
          continue;
        named(connection.id)?.uses.push({ carrier, path: statement.path });
      }
      continue;
    }
    if (statement.kind !== LINE_KIND) continue;
    const saidTo = statement.connects.find(
      (connection) =>
        connection.kind === SHARED_LINES_KIND &&
        connection.role === SAID_TO_ROLE
    );
    if (saidTo) {
      const conversation = named(saidTo.id);
      if (conversation && !conversation.linePaths.includes(statement.path))
        conversation.linePaths.push(statement.path);
      continue;
    }
    // A line a carrier says on its own: it stands beside every conversation
    // that carrier carries.
    const carrier = carrierOf(statement.about);
    if (!carrier) continue;
    for (const conversation of conversations)
      if (conversation.carriers.some((c) => sameCarrier(c, carrier)))
        conversation.ownLines.push({ carrier, path: statement.path });
  }
  return conversations;
}

/** How many lines the engine says each conversation holds. */
export function lineCounts(
  conversations: readonly SharedConversation[]
): ReadonlyMap<string, number> {
  return new Map(
    conversations.map((conversation) => [
      conversation.id,
      conversation.linePaths.length,
    ])
  );
}

/** What a carrier's line list is told of the conversations it uses: how
 * many lines the engine says each holds, and the way to it. */
export function sharedLinesInForm(
  readBack: ReadBack | null | undefined,
  open: (conversation: string) => void
): SharedLinesInForm {
  const counts = lineCounts(sharedConversationsOf(readBack));
  return { lineCount: (id) => counts.get(id), open };
}

/** What the engine says of one line of a conversation, sorted by WHERE each
 * statement stands under the line's path, never by reading its sentence:
 * the line itself, what it requires, its check, its step, and the rows on
 * a pass and on a miss (with whatever stands under them, a row's grant). */
export interface LineReadBack {
  /** The statement at the line's own path. */
  line: ReadBackStatement[];
  /** `<line>.requires…` */
  offered: ReadBackStatement[];
  /** `<line>.check…` */
  check: ReadBackStatement[];
  /** `<line>.advance…` */
  advance: ReadBackStatement[];
  /** `<line>.success…` */
  pass: ReadBackStatement[];
  /** `<line>.failure…` */
  miss: ReadBackStatement[];
  /** Anything else under the line, in the engine's order. */
  more: ReadBackStatement[];
}

const LINE_PARTS = [
  ['requires', 'offered'],
  ['check', 'check'],
  ['advance', 'advance'],
  ['success', 'pass'],
  ['failure', 'miss'],
] as const;

/** Under `path`, the next key is `key`: `<path>.key` then the end, `.` or
 * `[`. A `lines[1]` never takes `lines[10]`'s statements. */
function under(statementPath: string, path: string, key: string): boolean {
  const head = `${path}.${key}`;
  if (!statementPath.startsWith(head)) return false;
  const next = statementPath.charAt(head.length);
  return next === '' || next === '.' || next === '[';
}

/** The engine's statements at and under one line's path (as the engine
 * names it, `conversations.<id>.lines[k]`), in the engine's order, that are
 * ABOUT the line's owner. The engine sets other subjects' statements at the
 * same paths — a way through a door the line opens, a hub's ask, the same
 * requirement once per carrier — and those are the other subject's to say,
 * not this line's. */
export function lineReadBackOf(
  readBack: ReadBack | null | undefined,
  linePath: string,
  /** Whose line it is: `{shared-lines, <id>}` for a conversation's, the
   * carrier for its own. */
  owner: { kind: string; id: string }
): LineReadBack {
  const out: LineReadBack = {
    line: [],
    offered: [],
    check: [],
    advance: [],
    pass: [],
    miss: [],
    more: [],
  };
  if (!readBack) return out;
  for (const statement of statementsOf(readBack)) {
    if (statement.about?.kind !== owner.kind || statement.about.id !== owner.id)
      continue;
    if (statement.path === linePath) {
      out.line.push(statement);
      continue;
    }
    if (!statement.path.startsWith(`${linePath}.`)) continue;
    const part = LINE_PARTS.find(([key]) =>
      under(statement.path, linePath, key)
    );
    out[part ? part[1] : 'more'].push(statement);
  }
  return out;
}
