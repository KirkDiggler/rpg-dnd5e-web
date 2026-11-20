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
