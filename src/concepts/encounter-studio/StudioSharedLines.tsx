/**
 * THE CONVERSATIONS WRITTEN ONCE (rpg-project#1027): People → Conversations
 * lists each conversation the file writes under `conversations:`, who
 * carries it, and its lines. A line is edited here once, at
 * `conversations.<id>.lines[k]`, and every carrier says it as written.
 *
 * WHO SAYS WHAT IS THE ENGINE'S: the list, each conversation's carriers,
 * where each carrier's `use:` stands and each carrier's own lines come from
 * the read-back (`sharedLinesView.ts`). The lines' fields are read from the
 * draft at the conversation the engine named, and edited with the one line
 * form every carrier's lines use (`OptionsEditor`), pointed at
 * `conversations.<id>.lines`.
 */
import { useState } from 'react';
import type { OptionShape } from '../world-building/answerTableShape';
import { removeOption, replaceOption } from '../world-building/optionEdits';
import { documentPlacementNames } from '../world-building/placementNames';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import {
  conversationIdRefusal,
  conversationLines,
  propCarriers,
  type LinesCarrier,
} from '../world-building/sharedLinesEdits';
import { OptionsEditor } from '../world-building/SitePolicies';
import { AboutPanel } from './FieldHelp';
import { locate, valueAt } from './locatePath';
import { placeName } from './placeName';
import type { RefusalTarget } from './refusalJump';
import {
  SHARED_LINES_KIND,
  sharedConversationsOf,
  type SharedConversation,
} from './sharedLinesView';
import { StudioListDetail } from './StudioListDetail';
import type { StudioReadBack } from './studioPublishing';
import type { EncounterStudioSession } from './studioSession';

export const NO_SHARED_LINES_SENTENCE =
  'No conversation is written once in this file yet.';
export const CHECKING_SHARED_LINES_SENTENCE =
  'Checking the latest edit. Who carries each conversation, below, is from the last draft that compiled; carriers can be changed once the check answers.';
export const REFUSED_SHARED_LINES_SENTENCE =
  'The engine refused this draft, so who carries each conversation, below, is from the last draft that compiled. Carriers can be changed once it compiles again.';
export const REMOVED_SHARED_LINES_SENTENCE =
  'This conversation is no longer in the draft. It is listed from the last draft that compiled.';

/** Where the engine's check of the draft stands, for this page: whether the
 * read-back describes the draft now, is being renewed, or the engine
 * refused the draft (with its refusals). */
export interface SharedLinesCheck {
  state: 'current' | 'checking' | 'refused';
  refusals: readonly { path: string; message: string }[];
}

/** A refusal this page shows: one in a conversation, or in a carrier's
 * lines. The rest are in the studio's header. */
const refusalHere = (path: string): boolean =>
  path.startsWith('conversations.') || /\.options\[\d+\]/.test(path);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const carrierKey = (carrier: LinesCarrier): string =>
  `${carrier.kind}/${carrier.id}`;

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** The words a carrier is shown by: a creature by its placement's name, a
 * prop and a faction by their id. */
function carrierWords(
  carrier: LinesCarrier,
  names: ReadonlyMap<string, string>
): string {
  switch (carrier.kind) {
    case 'creature':
      return names.get(carrier.id) ?? carrier.id;
    case 'prop':
      return `prop ${carrier.id}`;
    case 'faction':
      return `faction ${carrier.id}`;
  }
}

/** Everything a conversation can be applied to: the placed creatures, the
 * props a binding may name, and the factions. */
function carrierCandidates(
  document: Readonly<RoomDraftDocument>
): LinesCarrier[] {
  const room = document.draft.room;
  const props = propCarriers(document);
  return [
    ...room.monsterDeclarations.map(
      (monster): LinesCarrier => ({ kind: 'creature', id: monster.id })
    ),
    ...props.map((id): LinesCarrier => ({ kind: 'prop', id })),
    ...(document.scope.factions ?? []).map(
      (faction): LinesCarrier => ({ kind: 'faction', id: faction.id })
    ),
  ];
}

/** The `options[i]` index of a `use:` the engine named. */
function indexOfUse(
  path: string,
  document: Readonly<RoomDraftDocument>
): number | null {
  const rest = locate(path, document)?.rest;
  return rest?.length === 2 &&
    rest[0] === 'options' &&
    typeof rest[1] === 'number'
    ? rest[1]
    : null;
}

export function StudioSharedLines({
  session,
  readBack,
  check,
  onJump,
}: {
  session: Pick<EncounterStudioSession, 'document' | 'sharedLines'>;
  readBack: StudioReadBack | undefined;
  /** Where the engine's check stands; absent, it is read from whether the
   * read-back is current. */
  check?: SharedLinesCheck;
  onJump?(target: RefusalTarget, path?: string): void;
}): React.JSX.Element {
  const document = session.document;
  const conversations = sharedConversationsOf(readBack?.readBack);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected =
    conversations.find((conversation) => conversation.id === chosen) ??
    conversations[0];
  const names = documentPlacementNames(document);
  const candidates = carrierCandidates(document);
  const state: SharedLinesCheck['state'] = readBack?.readBackIsCurrent
    ? 'current'
    : (check?.state ?? 'checking');
  const refusals =
    state === 'refused'
      ? (check?.refusals ?? []).filter((refusal) => refusalHere(refusal.path))
      : [];
  const notice = !readBack?.readBack
    ? `${NO_SHARED_LINES_SENTENCE}${readBack?.unavailable ? ` ${readBack.unavailable}` : ''}`
    : state === 'current'
      ? null
      : state === 'refused'
        ? REFUSED_SHARED_LINES_SENTENCE
        : CHECKING_SHARED_LINES_SENTENCE;
  const written = (id: string): boolean =>
    conversationLines(document, id) !== undefined ||
    Object.hasOwn(
      (document.scope.unread?.conversations as object | undefined) ?? {},
      id
    );
  return (
    <section aria-label="Written once" className="es-shared-lines">
      <h3>Written once</h3>
      <AboutPanel>
        <p>
          A conversation is the lines a character can say, written once and
          applied to every creature, prop or faction that says them. A change
          here is a change for all of them.
        </p>
      </AboutPanel>
      {notice && (
        <div role="status" className="es-help es-readback-notice">
          <p>{notice}</p>
          {state === 'refused' &&
            (refusals.length > 0 ? (
              <ul aria-label="The engine’s refusals here">
                {refusals.map((refusal, at) => (
                  <li key={at}>
                    <span title={refusal.path}>
                      {placeName(refusal.path, document)}
                    </span>
                    {': '}
                    {refusal.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Its refusals are listed in the studio’s header.</p>
            ))}
        </div>
      )}
      <StudioListDetail
        id="shared-lines"
        label="Conversations written once"
        groups={[
          {
            rows: conversations.map((conversation) => ({
              key: { kind: SHARED_LINES_KIND, id: conversation.id },
              name: <span className="es-threads-id">{conversation.id}</span>,
              summary: written(conversation.id)
                ? `${
                    conversation.carriers.length === 1
                      ? '1 carries it'
                      : `${conversation.carriers.length} carry it`
                  } · ${plural(conversation.linePaths.length, 'line', 'lines')}`
                : 'removed from the draft',
              rowData: { 'data-shared-lines': conversation.id },
            })),
          },
        ]}
        selected={
          selected ? { kind: SHARED_LINES_KIND, id: selected.id } : null
        }
        onSelect={(key) => setChosen(key.id)}
        detailLabel={
          selected ? `The lines of ${selected.id}` : 'No conversation chosen'
        }
        empty={<p className="es-help">{NO_SHARED_LINES_SENTENCE}</p>}
        detail={
          selected && !written(selected.id) ? (
            <p className="es-help">{REMOVED_SHARED_LINES_SENTENCE}</p>
          ) : selected ? (
            <SharedConversationDetail
              key={selected.id}
              conversation={selected}
              session={session}
              names={names}
              candidates={candidates}
              carriersEditable={state === 'current'}
              onJump={onJump}
            />
          ) : (
            <p className="es-help">Choose a conversation.</p>
          )
        }
      />
      <NewConversation
        session={session}
        names={names}
        candidates={candidates}
        onCreated={setChosen}
      />
    </section>
  );
}

function SharedConversationDetail({
  conversation,
  session,
  names,
  candidates,
  carriersEditable,
  onJump,
}: {
  conversation: SharedConversation;
  session: Pick<EncounterStudioSession, 'document' | 'sharedLines'>;
  names: ReadonlyMap<string, string>;
  candidates: readonly LinesCarrier[];
  /** The read-back describes the draft now, so who carries it is true and
   * can be changed. */
  carriersEditable: boolean;
  onJump?(target: RefusalTarget, path?: string): void;
}): React.JSX.Element {
  const { id } = conversation;
  const document = session.document;
  const written = conversationLines(document, id);
  // No `lines:` yet is a list of none, edited like any other: the form keeps
  // its Add. Only a value that is not a list of lines is kept as written.
  const lines =
    written === undefined
      ? []
      : written.every(isRecord)
        ? (written as unknown as OptionShape[])
        : undefined;
  // THE LAST CARRIER OR THE LAST LINE (rpg-project#1027 review): the engine
  // refuses a conversation nobody carries and one with no lines, so taking
  // the last one away asks, here, whether the conversation goes with it.
  const [removing, setRemoving] = useState<'carrier' | 'line' | null>(null);
  const notEditable = carriersEditable
    ? undefined
    : 'Who carries it can be changed once the engine’s check describes this draft.';
  const carried = new Set(conversation.carriers.map(carrierKey));
  const open = candidates.filter((c) => !carried.has(carrierKey(c)));
  const [adding, setAdding] = useState('');
  const addingCarrier =
    open.find((c) => carrierKey(c) === adding) ?? open[0] ?? null;
  const ownBy = new Map<string, string[]>();
  for (const own of conversation.ownLines) {
    const key = carrierKey(own.carrier);
    ownBy.set(key, [...(ownBy.get(key) ?? []), own.path]);
  }
  return (
    <div className="es-shared-lines-detail" data-shared-lines={id}>
      <h3>
        The lines of <code>{id}</code>
      </h3>
      <section aria-label={`Applied to for ${id}`} className="es-applied-to">
        <h4>Applied to</h4>
        <ul className="es-applied-to-list">
          {conversation.carriers.map((carrier) => {
            const words = carrierWords(carrier, names);
            const use = conversation.uses.find(
              (entry) => carrierKey(entry.carrier) === carrierKey(carrier)
            );
            const index = use ? indexOfUse(use.path, document) : null;
            return (
              <li key={carrierKey(carrier)} className="es-applied-to-chip">
                {onJump && use ? (
                  <button
                    type="button"
                    className="es-link"
                    aria-label={`Open ${words}`}
                    title={carrier.id}
                    onClick={() =>
                      onJump(
                        carrier.kind === 'faction'
                          ? {
                              kind: 'home',
                              section: 'factions',
                              id: carrier.id,
                            }
                          : { kind: carrier.kind, id: carrier.id },
                        use.path
                      )
                    }
                  >
                    {words}
                  </button>
                ) : (
                  <span title={carrier.id}>{words}</span>
                )}
                <button
                  type="button"
                  className="wb-danger"
                  aria-label={`Stop ${words} saying the lines of ${id}`}
                  disabled={!carriersEditable || index === null}
                  title={notEditable}
                  onClick={() => {
                    if (index === null) return;
                    if (conversation.carriers.length <= 1)
                      setRemoving('carrier');
                    else session.sharedLines.unapply(id, carrier, index);
                  }}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
        {carriersEditable && open.length > 0 && addingCarrier && (
          <form
            className="es-applied-to-add"
            aria-label={`Apply ${id} to another`}
            onSubmit={(event) => {
              event.preventDefault();
              if (session.sharedLines.apply(id, addingCarrier)) setAdding('');
            }}
          >
            <label>
              <span>Apply to</span>
              <select
                aria-label={`Apply ${id} to`}
                value={carrierKey(addingCarrier)}
                onChange={(event) => setAdding(event.target.value)}
              >
                {open.map((carrier) => (
                  <option key={carrierKey(carrier)} value={carrierKey(carrier)}>
                    {carrierWords(carrier, names)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" aria-label={`Apply ${id}`}>
              Apply
            </button>
          </form>
        )}
      </section>
      {removing && (
        <div
          role="group"
          aria-label={`Remove the conversation ${id}?`}
          className="es-shared-lines-remove"
        >
          <p>
            Remove the conversation <code>{id}</code>?{' '}
            {removing === 'carrier'
              ? 'Nobody would carry it.'
              : 'It would have no lines.'}{' '}
            Removing it takes it out of the file with every carrier’s use of it;
            their own lines stay.
          </p>
          <div className="wb-actions">
            <button
              type="button"
              className="wb-danger"
              onClick={() => {
                if (session.sharedLines.remove(id)) setRemoving(null);
              }}
            >
              Remove the conversation
            </button>
            <button type="button" onClick={() => setRemoving(null)}>
              Keep it
            </button>
          </div>
        </div>
      )}
      <section aria-label={`Lines of ${id}`} className="es-shared-lines-lines">
        <h4>Its lines</h4>
        {lines ? (
          <OptionsEditor
            titled={false}
            owner={id}
            at={`conversations.${id}`}
            listKey="lines"
            options={lines}
            room={document.draft.room}
            isProp={false}
            onAdd={() => session.sharedLines.addLine(id)}
            onChange={(index, option) =>
              session.sharedLines.setLines(
                id,
                (replaceOption(lines, index, option) ?? []) as OptionShape[]
              )
            }
            onRemove={(index) => {
              if (lines.length <= 1) setRemoving('line');
              else
                session.sharedLines.setLines(
                  id,
                  (removeOption(lines, index) ?? []) as OptionShape[]
                );
            }}
          />
        ) : (
          <p className="es-help">
            Its lines are not written as a list of lines this form edits; they
            are kept as written.
          </p>
        )}
      </section>
      {ownBy.size > 0 && (
        <section
          aria-label={`Own lines beside ${id}`}
          className="es-shared-lines-own"
        >
          <h4>Said on their own, beside these</h4>
          {conversation.carriers
            .filter((carrier) => ownBy.has(carrierKey(carrier)))
            .map((carrier) => {
              const words = carrierWords(carrier, names);
              return (
                <div key={carrierKey(carrier)}>
                  <p className="es-help">Only {words} offers:</p>
                  <ul className="es-inspector-list">
                    {ownBy.get(carrierKey(carrier))!.map((path) => {
                      const line = valueAt(path, document);
                      const said =
                        isRecord(line) && typeof line.say === 'string'
                          ? `“${line.say}”`
                          : isRecord(line) && typeof line.do === 'string'
                            ? `does “${line.do}”`
                            : 'a line';
                      return (
                        <li key={path}>
                          {said}{' '}
                          {onJump && (
                            <button
                              type="button"
                              className="es-link"
                              aria-label={`Edit ${words}'s own line ${said}`}
                              onClick={() =>
                                onJump(
                                  carrier.kind === 'faction'
                                    ? {
                                        kind: 'home',
                                        section: 'factions',
                                        id: carrier.id,
                                      }
                                    : { kind: carrier.kind, id: carrier.id },
                                  path
                                )
                              }
                            >
                              Edit
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
        </section>
      )}
    </div>
  );
}

/** A new conversation, written with its first line and applied to its first
 * carrier in one edit: the engine refuses one nobody carries and one with
 * no lines, so it is born saying something to someone. */
function NewConversation({
  session,
  names,
  candidates,
  onCreated,
}: {
  session: Pick<EncounterStudioSession, 'document' | 'sharedLines'>;
  names: ReadonlyMap<string, string>;
  candidates: readonly LinesCarrier[];
  onCreated(id: string): void;
}): React.JSX.Element | null {
  const [id, setId] = useState('');
  const [carrier, setCarrier] = useState('');
  const [say, setSay] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  if (candidates.length === 0) return null;
  const chosen =
    candidates.find((c) => carrierKey(c) === carrier) ?? candidates[0]!;
  return (
    <form
      className="es-shared-lines-new"
      aria-label="New conversation"
      onSubmit={(event) => {
        event.preventDefault();
        const name = id.trim();
        const refused =
          conversationIdRefusal(session.document, name) ??
          (say.trim() === ''
            ? 'Write what the character says in its first line.'
            : null);
        if (refused) {
          setRefusal(refused);
          return;
        }
        if (session.sharedLines.create(name, chosen, say)) {
          setId('');
          setSay('');
          setRefusal(null);
          onCreated(name);
        }
      }}
    >
      <h4>New conversation</h4>
      <label className="es-field">
        <span>Name</span>
        <input
          aria-label="New conversation name"
          placeholder="gate-claims"
          value={id}
          onChange={(event) => {
            setId(event.target.value);
            setRefusal(null);
          }}
        />
      </label>
      <label className="es-field">
        <span>Applied to</span>
        <select
          aria-label="New conversation applied to"
          value={carrierKey(chosen)}
          onChange={(event) => setCarrier(event.target.value)}
        >
          {candidates.map((c) => (
            <option key={carrierKey(c)} value={carrierKey(c)}>
              {carrierWords(c, names)}
            </option>
          ))}
        </select>
      </label>
      <label className="es-field">
        <span>Its first line says</span>
        <input
          aria-label="New conversation first line"
          placeholder="What the character says"
          value={say}
          onChange={(event) => {
            setSay(event.target.value);
            setRefusal(null);
          }}
        />
      </label>
      {refusal && (
        <p role="alert" className="es-warning">
          {refusal}
        </p>
      )}
      <button type="submit" aria-label="Write the new conversation">
        Write conversation
      </button>
    </form>
  );
}
