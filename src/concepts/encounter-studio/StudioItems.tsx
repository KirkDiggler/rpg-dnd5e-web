/**
 * ITEMS (rpg-project#1196): the site's custom items, each as the engine says
 * it, its words as written, and who has it equipped. It only shows: nothing
 * here declares, edits or equips an item. The studio types no word of what an
 * item does; every sentence is the engine's, the block is the file's.
 */
import { useState, type ReactNode } from 'react';
import { stringify } from 'yaml';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { connectionJump } from './engineReadBack';
import { itemsOf, type ItemHolder } from './itemsView';
import { STALE_READ_BACK_SENTENCE } from './ReadBack';
import type { RefusalTarget } from './refusalJump';
import { StudioListDetail } from './StudioListDetail';
import type { StudioReadBack } from './studioPublishing';
import type { ItemWords } from './useItemWords';
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
  /** Save: one undoable change of one item. */
  onCommitItem?(
    id: string,
    edit: (item: Record<string, unknown>) => Record<string, unknown>
  ): boolean;
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
                id={selected.id}
                written={selected.written}
                itemWords={itemWords}
                itemWordsUnavailable={itemWordsUnavailable}
                onCommitItem={onCommitItem}
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Same value, whatever the order of an object's keys. */
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a))
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => same(x, b[i]))
    );
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]))
    );
  }
  return a === b;
}

const NO_WORDS_SENTENCE =
  'The engine has not given its item words, so an item cannot be changed here.';

/** The form of one item, drawn from the engine's words, on a local draft
 * that starts as the file's block and is reset when the item or the block
 * changes. */
function ItemChange({
  id,
  written,
  itemWords,
  itemWordsUnavailable,
  onCommitItem,
}: {
  id: string;
  written: unknown;
  itemWords: ItemWords | null;
  itemWordsUnavailable: string | null;
  onCommitItem?: (
    id: string,
    edit: (item: Record<string, unknown>) => Record<string, unknown>
  ) => boolean;
}): React.JSX.Element {
  const block = isObject(written) ? written : null;
  const [seen, setSeen] = useState<{ id: string; written: unknown }>({
    id,
    written,
  });
  const [draft, setDraft] = useState<Record<string, unknown> | null>(block);
  if (seen.id !== id || seen.written !== written) {
    setSeen({ id, written });
    setDraft(block);
  }
  const body =
    itemWords && onCommitItem ? (
      block && draft ? (
        <>
          <WordsForm
            words={itemWords.words}
            place="item"
            idPrefix={`item-${id}`}
            value={draft}
            onChange={setDraft}
          />
          <button
            type="button"
            disabled={same(draft, block)}
            onClick={() => onCommitItem(id, () => draft)}
          >
            Save
          </button>{' '}
          <button
            type="button"
            disabled={same(draft, block)}
            onClick={() => setDraft(block)}
          >
            Discard
          </button>
        </>
      ) : null
    ) : !itemWords ? (
      <p className="es-help">
        {NO_WORDS_SENTENCE}
        {itemWordsUnavailable ? ` ${itemWordsUnavailable}` : ''}
      </p>
    ) : null;
  return (
    <>
      <h3>Change</h3>
      {body}
    </>
  );
}
