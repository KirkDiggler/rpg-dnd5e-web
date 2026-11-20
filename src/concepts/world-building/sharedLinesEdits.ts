/**
 * A CONVERSATION'S LINES, WRITTEN ONCE (rpg-project#1025, #1027). The root
 * `conversations:` holds each conversation's `lines`, every entry exactly a
 * carrier's line; a creature, a prop or a faction says them by a
 * `- use: <id>` entry in its `options`. These edits write that file shape
 * and nothing else: whether a `use:` names a conversation, whether a line
 * can be won, and which carrier may say what are the engine's to judge.
 *
 * The conversations ride the scope's `unread` map, as the root
 * `interactions` do: the studio carries the key and writes it back where it
 * stood. Each edit returns a new document; one that cannot be written
 * throws its sentence, which the studio shows as the edit's notice.
 */
import {
  isOptionUse,
  type OptionEntry,
  type OptionShape,
} from './answerTableShape';
import {
  addMonsterOption,
  removeMonsterOption,
  setMonsterOption,
  withBinding,
} from './monsterOrderEdits';
import { addOption, normalizeOptions } from './optionEdits';
import {
  addPropOption,
  propBindingCandidateIds,
  removePropOption,
  setPropOption,
  withPropBinding,
} from './propBindingEdits';
import type { RoomDraftDocument } from './roomDraft';
import {
  addSiteFactionOption,
  removeSiteFactionOption,
  setSiteFactionOption,
} from './sitePolicyEdits';

/** Who says a conversation's lines: the engine's subject kinds for them. */
export interface LinesCarrier {
  kind: 'creature' | 'prop' | 'faction';
  id: string;
}

type Conversations = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function conversationsOf(document: Readonly<RoomDraftDocument>): Conversations {
  const written = document.scope.unread?.conversations;
  return isRecord(written) ? written : {};
}

/** The lines written at `conversations.<id>.lines`, as written. */
export function conversationLines(
  document: Readonly<RoomDraftDocument>,
  id: string
): unknown[] | undefined {
  const conversation = conversationsOf(document)[id];
  if (!isRecord(conversation)) return undefined;
  return Array.isArray(conversation.lines) ? conversation.lines : undefined;
}

function withConversations(
  document: Readonly<RoomDraftDocument>,
  conversations: Conversations
): RoomDraftDocument {
  const unread = { ...document.scope.unread };
  if (Object.keys(conversations).length === 0) delete unread.conversations;
  else unread.conversations = conversations;
  return { ...document, scope: { ...document.scope, unread } };
}

/** Set one conversation's lines whole: every line edit, add and remove
 * arrives here as the edited list, so a change is written once, at the
 * conversation. No lines leaves the key absent; the engine says a
 * conversation with none is refused. Other keys on the conversation ride
 * along as written. */
export function setConversationLines(
  document: Readonly<RoomDraftDocument>,
  id: string,
  lines: readonly OptionShape[] | undefined
): RoomDraftDocument {
  const conversations = conversationsOf(document);
  const conversation = conversations[id];
  if (!isRecord(conversation))
    throw new Error(
      `conversations.${id}: this site writes no such conversation`
    );
  const next: Record<string, unknown> = { ...conversation };
  const normalized = normalizeOptions(lines ? [...lines] : undefined);
  if (normalized === undefined) delete next.lines;
  else next.lines = normalized;
  return withConversations(document, { ...conversations, [id]: next });
}

/** A new line at the end of a conversation, as a carrier's new line starts. */
export function addConversationLine(
  document: Readonly<RoomDraftDocument>,
  id: string
): RoomDraftDocument {
  const lines = (conversationLines(document, id) ?? []) as OptionShape[];
  return setConversationLines(document, id, addOption(lines) as OptionShape[]);
}

/** An id that names a conversation: lowercase words joined by hyphens, as
 * the castle writes them. */
const CONVERSATION_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function conversationIdRefusal(
  document: Readonly<RoomDraftDocument>,
  id: string
): string | null {
  if (id === '') return 'Name the conversation.';
  if (!CONVERSATION_ID.test(id))
    return 'A conversation is named in lowercase words joined by hyphens, like `gate-claims`.';
  if (Object.hasOwn(conversationsOf(document), id))
    return `The conversation \`${id}\` is already written.`;
  return null;
}

/** A new conversation, written with its first line and applied to its
 * first carrier in one edit: the engine refuses a conversation nobody uses
 * and one with no lines, so a new one is born carried and saying
 * something. */
export function createConversation(
  document: Readonly<RoomDraftDocument>,
  id: string,
  carrier: LinesCarrier,
  say: string
): RoomDraftDocument {
  const refused = conversationIdRefusal(document, id);
  if (refused) throw new Error(refused);
  if (say.trim() === '')
    throw new Error('Write what the character says in its first line.');
  const first = addOption(undefined)[0] as OptionShape;
  const written = withConversations(document, {
    ...conversationsOf(document),
    [id]: { lines: [{ ...first, say: say.trim() }] },
  });
  return applyConversation(written, id, carrier);
}

/** The props a conversation can be applied to: a declared prop that is not
 * a door, or one that already carries a binding (`propBindingCandidateIds`,
 * the engine's two rules). */
export function propCarriers(document: Readonly<RoomDraftDocument>): string[] {
  const room = document.draft.room;
  return propBindingCandidateIds(
    document.draft.scene.items,
    room.propBindings,
    new Set(Object.keys(room.propDeclarations ?? {})),
    new Set(Object.keys(room.doorBindings ?? {}))
  );
}

/** `- use: <id>` at the end of the carrier's options. */
export function applyConversation(
  document: Readonly<RoomDraftDocument>,
  id: string,
  carrier: LinesCarrier
): RoomDraftDocument {
  const use = { use: id };
  const room = document.draft.room;
  switch (carrier.kind) {
    case 'creature': {
      if (!room.monsterDeclarations.some((m) => m.id === carrier.id))
        throw new Error(`No creature \`${carrier.id}\` is placed here.`);
      const added = addMonsterOption(room.monsterBindings?.[carrier.id]);
      const next = setMonsterOption(
        added,
        (added?.options?.length ?? 1) - 1,
        use
      );
      const bindings = withBinding(room.monsterBindings, carrier.id, next);
      const nextRoom = { ...room };
      if (bindings === undefined) delete nextRoom.monsterBindings;
      else nextRoom.monsterBindings = bindings;
      return {
        ...document,
        draft: { ...document.draft, room: nextRoom },
      };
    }
    case 'prop': {
      if (!propCarriers(document).includes(carrier.id))
        throw new Error(`No prop \`${carrier.id}\` can be spoken to here.`);
      const added = addPropOption(room.propBindings?.[carrier.id]);
      const next = setPropOption(added, (added?.options?.length ?? 1) - 1, use);
      const bindings = withPropBinding(room.propBindings, carrier.id, next);
      const nextRoom = { ...room };
      if (bindings === undefined) delete nextRoom.propBindings;
      else nextRoom.propBindings = bindings;
      return {
        ...document,
        draft: { ...document.draft, room: nextRoom },
      };
    }
    case 'faction': {
      if (!(document.scope.factions ?? []).some((f) => f.id === carrier.id))
        throw new Error(`No faction \`${carrier.id}\` is written here.`);
      const added = addSiteFactionOption(document.scope, carrier.id);
      const faction = added.factions!.find((f) => f.id === carrier.id)!;
      return {
        ...document,
        scope: setSiteFactionOption(
          added,
          carrier.id,
          faction.options!.length - 1,
          use
        ),
      };
    }
  }
}

/** Take a `use:` out of the carrier's options: the entry at `index`, which
 * the engine named at the carrier's path. It must still be a use of this
 * conversation; a draft that moved under the read-back is refused rather
 * than losing another line. */
export function unapplyConversation(
  document: Readonly<RoomDraftDocument>,
  id: string,
  carrier: LinesCarrier,
  index: number
): RoomDraftDocument {
  const room = document.draft.room;
  const entries =
    carrier.kind === 'creature'
      ? room.monsterBindings?.[carrier.id]?.options
      : carrier.kind === 'prop'
        ? room.propBindings?.[carrier.id]?.options
        : (document.scope.factions ?? []).find((f) => f.id === carrier.id)
            ?.options;
  const entry = entries?.[index];
  if (!entry || !isOptionUse(entry) || entry.use !== id)
    throw new Error(
      `${carrier.id} no longer says the lines of \`${id}\` at that place; the engine’s sentences are from the last draft that compiled.`
    );
  switch (carrier.kind) {
    case 'creature': {
      const next = removeMonsterOption(
        room.monsterBindings?.[carrier.id],
        index
      );
      const bindings = withBinding(room.monsterBindings, carrier.id, next);
      const nextRoom = { ...room };
      if (bindings === undefined) delete nextRoom.monsterBindings;
      else nextRoom.monsterBindings = bindings;
      return { ...document, draft: { ...document.draft, room: nextRoom } };
    }
    case 'prop': {
      const next = removePropOption(room.propBindings?.[carrier.id], index);
      const bindings = withPropBinding(room.propBindings, carrier.id, next);
      const nextRoom = { ...room };
      if (bindings === undefined) delete nextRoom.propBindings;
      else nextRoom.propBindings = bindings;
      return { ...document, draft: { ...document.draft, room: nextRoom } };
    }
    case 'faction':
      return {
        ...document,
        scope: removeSiteFactionOption(document.scope, carrier.id, index),
      };
  }
}

/** The indexes of an options list's `use:` of `id`, last first. */
function usesOf(
  entries: readonly OptionEntry[] | undefined,
  id: string
): number[] {
  const at: number[] = [];
  (entries ?? []).forEach((entry, index) => {
    if (isOptionUse(entry) && entry.use === id) at.unshift(index);
  });
  return at;
}

/** REMOVE A CONVERSATION WHOLE: its `conversations.<id>` and every `use:` of
 * it, in every creature's, prop's and faction's options, in one write. The
 * engine refuses a conversation nobody carries and one with no lines, and
 * refuses a `use:` that names no conversation, so the last carrier or the
 * last line goes with the conversation or not at all. Every carrier's own
 * lines stay as written. */
export function removeConversation(
  document: Readonly<RoomDraftDocument>,
  id: string
): RoomDraftDocument {
  const conversations = { ...conversationsOf(document) };
  if (!Object.hasOwn(conversations, id))
    throw new Error(
      `conversations.${id}: this site writes no such conversation`
    );
  delete conversations[id];
  let next = withConversations(document, conversations);
  const room = next.draft.room;
  for (const [carrier, binding] of Object.entries(room.monsterBindings ?? {}))
    for (const index of usesOf(binding.options, id))
      next = unapplyConversation(
        next,
        id,
        { kind: 'creature', id: carrier },
        index
      );
  for (const [carrier, binding] of Object.entries(room.propBindings ?? {}))
    for (const index of usesOf(binding.options, id))
      next = unapplyConversation(
        next,
        id,
        { kind: 'prop', id: carrier },
        index
      );
  for (const faction of next.scope.factions ?? [])
    for (const index of usesOf(faction.options, id))
      next = unapplyConversation(
        next,
        id,
        { kind: 'faction', id: faction.id },
        index
      );
  return next;
}
