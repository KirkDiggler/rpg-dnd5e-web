/**
 * ITEMS (rpg-project#1196): the site's custom items, each as the engine says
 * it, its words as written, and who has it equipped. It only shows: nothing
 * here declares, edits or equips an item. The studio types no word of what an
 * item does; every sentence is the engine's, the block is the file's.
 */
import type { ReactNode } from 'react';
import { stringify } from 'yaml';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { connectionJump } from './engineReadBack';
import { itemsOf, type ItemHolder } from './itemsView';
import { STALE_READ_BACK_SENTENCE } from './ReadBack';
import type { RefusalTarget } from './refusalJump';
import { StudioListDetail } from './StudioListDetail';
import type { StudioReadBack } from './studioPublishing';

const ITEM = 'item';
const NO_ITEMS_SENTENCE = 'The engine has not said the items yet.';

export function StudioItems({
  document,
  readBack,
  focus,
  onSelect,
  onJump,
}: {
  document: Readonly<RoomDraftDocument>;
  readBack: StudioReadBack;
  /** The selected item's id. */
  focus: string | null;
  onSelect(id: string): void;
  onJump?(target: RefusalTarget, path?: string): void;
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
              <h3>As written</h3>
              <pre>{stringify({ [selected.id]: selected.written })}</pre>
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
            </div>
          ) : null
        }
      />
    </section>
  );
}
