/**
 * ITEMS (rpg-project#1196): the site's custom items, each as the engine says
 * it, its words as written, and who has it equipped. It only shows: nothing
 * here declares, edits or equips an item. The studio types no word of what an
 * item does; every sentence is the engine's, the block is the file's.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { stringify } from 'yaml';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { connectionJump } from './engineReadBack';
import { itemIdFrom } from './itemEdit';
import { itemsOf, type ItemHolder } from './itemsView';
import { STALE_READ_BACK_SENTENCE } from './ReadBack';
import type { RefusalTarget } from './refusalJump';
import { StudioListDetail } from './StudioListDetail';
import type { StudioReadBack } from './studioPublishing';
import type { ItemWords } from './useItemWords';
import { firstRequiredText, setWord } from './wordsForm';
import { WordsForm } from './WordsForm';

const ITEM = 'item';
const NO_ITEMS_SENTENCE = 'The engine has not said the items yet.';

export function StudioItems({
  document,
  readBack,
  focus,
  onSelect,
  onJump,
  itemWords = null,
  itemWordsUnavailable = null,
  onCommitItem,
  onAddItem,
  onRemoveItem,
  refusals = [],
}: {
  document: Readonly<RoomDraftDocument>;
  readBack: StudioReadBack;
  /** The selected item's id. */
  focus: string | null;
  onSelect(id: string): void;
  onJump?(target: RefusalTarget, path?: string): void;
  /** The engine's item words: the form is drawn from them (rpg-project#1201). */
  itemWords?: ItemWords | null;
  /** Why there are none, when the studio knows. */
  itemWordsUnavailable?: string | null;
  /** Each change of one item, written as it is made: one undoable change. */
  onCommitItem?(
    id: string,
    edit: (item: Record<string, unknown>) => Record<string, unknown>
  ): boolean;
  /** New item: one undoable change; true when it was made. */
  onAddItem?(id: string, item: Record<string, unknown>): boolean;
  /** Delete item: one undoable change; true when it was removed. */
  onRemoveItem?(id: string): boolean;
  /** The engine's current refusals; those at the selected item show on it. */
  refusals?: readonly { path: string; message: string }[];
}): React.JSX.Element {
  const said = readBack.readBack;
  const items = itemsOf(document, said);
  const selected = items.find((item) => item.id === focus) ?? null;
  const notice = !said
    ? `${NO_ITEMS_SENTENCE}${readBack.unavailable ? ` ${readBack.unavailable}` : ''}`
    : readBack.readBackIsCurrent
      ? null
      : STALE_READ_BACK_SENTENCE;
  const holderButtons = (holders: readonly ItemHolder[]): ReactNode =>
    holders.map((holder) => {
      const jump = connectionJump(
        { kind: holder.kind, id: holder.id },
        document
      );
      return jump?.kind === 'target' && onJump ? (
        <button
          key={`${holder.kind}:${holder.id}`}
          type="button"
          className="es-link es-readback-ref"
          onClick={() => onJump(jump.target)}
        >
          {holder.title}
        </button>
      ) : (
        <span key={`${holder.kind}:${holder.id}`} className="es-readback-ref">
          {holder.title}
        </span>
      );
    });
  return (
    <section className="es-items wb-panel" aria-label="Items">
      <h2>Items</h2>
      {notice && (
        <p role="status" className="es-help es-readback-notice">
          {notice}
        </p>
      )}
      {onAddItem && itemWords && (
        <NewItem
          words={itemWords}
          taken={items.map((item) => item.id)}
          onAddItem={onAddItem}
          onSelect={onSelect}
        />
      )}
      <StudioListDetail
        id="items"
        label="Items"
        groups={[
          {
            rows: items.map((item) => ({
              key: { kind: ITEM, id: item.id },
              name: item.name,
              summary: [
                item.id,
                said && item.equippedBy.length > 0
                  ? `equipped by ${item.equippedBy.length}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · '),
              rowData: { 'data-item': item.id },
            })),
          },
        ]}
        selected={selected ? { kind: ITEM, id: selected.id } : null}
        onSelect={(key) => onSelect(key.id)}
        detailLabel="Item"
        empty="This site has no custom items."
        detail={
          selected ? (
            <div className="es-threads-thread" data-item={selected.id}>
              {said ? (
                selected.said.map((statement) => (
                  <p key={statement.path}>{statement.sentence}</p>
                ))
              ) : (
                <p className="es-help">{NO_ITEMS_SENTENCE}</p>
              )}
              {refusals
                .filter(
                  (r) =>
                    r.path === `customItems.${selected.id}` ||
                    r.path.startsWith(`customItems.${selected.id}.`)
                )
                .map((r, i) => (
                  <p key={i} className="es-help" role="alert">
                    {r.message}
                  </p>
                ))}
              <ItemChange
                key={selected.id}
                id={selected.id}
                written={selected.written}
                itemWords={itemWords}
                itemWordsUnavailable={itemWordsUnavailable}
                onCommitItem={onCommitItem}
                onRemoveItem={onRemoveItem}
                equippedBy={said ? selected.equippedBy.length : 0}
              />
              <h3>As written</h3>
              <pre>{stringify({ [selected.id]: selected.written })}</pre>
              {said && (
                <>
                  <h3>Equipped by</h3>
                  {selected.equippedBy.length > 0 ? (
                    <div className="es-readback-links">
                      {holderButtons(selected.equippedBy)}
                    </div>
                  ) : (
                    <p className="es-help">Nobody has it equipped.</p>
                  )}
                  {selected.props.length > 0 && (
                    <>
                      <h3>Props that are this item</h3>
                      <div className="es-readback-links">
                        {holderButtons(selected.props)}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ) : null
        }
      />
    </section>
  );
}

/** The new-item control: the text typed is the engine's first required text
 * word of an item (or only the id when the engine has none). */
function NewItem({
  words,
  taken,
  onAddItem,
  onSelect,
}: {
  words: ItemWords;
  taken: readonly string[];
  onAddItem: (id: string, item: Record<string, unknown>) => boolean;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const [text, setText] = useState('');
  const word = firstRequiredText(words.words, ITEM);
  const label = word?.label ?? 'id';
  const blank = text.trim() === '';
  const id = itemIdFrom(text, taken);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (blank) return;
    const block = word ? { [word.word]: text.trim() } : {};
    if (onAddItem(id, block)) {
      onSelect(id);
      setText('');
    }
  };
  return (
    <form className="es-new-item" onSubmit={submit}>
      <label>
        {label}{' '}
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>{' '}
      <button type="submit" disabled={blank}>
        New item
      </button>
      {!blank && (
        <p className="es-help">
          id <code>{id}</code>
        </p>
      )}
    </form>
  );
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const NOT_A_BLOCK_SENTENCE =
  'This item is not written as a set of words, so it cannot be changed here.';
const NO_WORDS_SENTENCE =
  'The engine has not given its item words, so an item cannot be changed here.';

/** The form of one item, drawn from the engine's words. Each change is
 * written to the site as it is made. */
function ItemChange({
  id,
  written,
  itemWords,
  itemWordsUnavailable,
  onCommitItem,
  onRemoveItem,
  equippedBy,
}: {
  id: string;
  written: unknown;
  itemWords: ItemWords | null;
  itemWordsUnavailable: string | null;
  onCommitItem?: (
    id: string,
    edit: (item: Record<string, unknown>) => Record<string, unknown>
  ) => boolean;
  onRemoveItem?: (id: string) => boolean;
  equippedBy: number;
}): React.JSX.Element {
  const block = isObject(written) ? written : null;
  const editable = Boolean(itemWords && onCommitItem && block);
  const body =
    itemWords && onCommitItem ? (
      block ? (
        <WordsForm
          words={itemWords.words}
          place="item"
          idPrefix={`item-${id}`}
          value={block}
          onChange={(next, word) =>
            onCommitItem?.(id, (item) => setWord(item, word, next[word]))
          }
        />
      ) : (
        <p className="es-help">{NOT_A_BLOCK_SENTENCE}</p>
      )
    ) : !itemWords ? (
      <p className="es-help">
        {NO_WORDS_SENTENCE}
        {itemWordsUnavailable ? ` ${itemWordsUnavailable}` : ''}
      </p>
    ) : null;
  return (
    <div className="es-item-change">
      <h3>Change</h3>
      {editable && (
        <p className="es-help">
          Each change is written as you make it. Undo takes it back.
        </p>
      )}
      {body}
      {onRemoveItem && equippedBy > 0 && (
        <p className="es-help">
          Equipped by {equippedBy}. Deleting it leaves them with an item this
          site does not have; the engine will say so.
        </p>
      )}
      {onRemoveItem && (
        <div className="es-item-actions">
          {onRemoveItem && (
            <button
              type="button"
              className="wb-danger es-item-delete"
              onClick={() => onRemoveItem(id)}
            >
              Delete item
            </button>
          )}
        </div>
      )}
    </div>
  );
}
