/**
 * The site's custom items, read for the Items page (rpg-project#1196): the
 * file's `customItems` as written and what the engine says of each. The
 * studio types no word of what an item does; every sentence is the engine's.
 */
import type {
  ReadBack,
  ReadBackStatement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { RoomDraftDocument } from '../world-building/roomDraft';

// The engine's own identifiers for how it says items (rpg-project#1196, F6):
// not prose.
const ITEM_KIND = 'place.item';
const EQUIPMENT_KIND = 'creature.equipment';
const PROP_ITEM_KIND = 'place.prop.item';
const ITEM = 'item';
const EQUIPS = 'equips';
const IS_ITEM = 'is-item';

export interface ItemHolder {
  kind: 'creature' | 'prop';
  id: string;
  /** The statement's group title, else the id. */
  title: string;
}

export interface ItemView {
  id: string;
  name: string;
  /** The entry as the file holds it. */
  written: unknown;
  /** The engine's statements about the item. */
  said: ReadBackStatement[];
  equippedBy: ItemHolder[];
  props: ItemHolder[];
}

export function itemsOf(
  document: Readonly<RoomDraftDocument>,
  readBack: ReadBack | null | undefined
): ItemView[] {
  const items = document.scope.unread?.customItems;
  if (items === null || typeof items !== 'object' || Array.isArray(items))
    return [];
  const statements = (readBack?.sections ?? []).flatMap((section) =>
    section.groups.flatMap((group) =>
      group.statements.map((statement) => ({
        statement,
        title: group.title || group.about?.id || '',
      }))
    )
  );
  const holders = (
    kind: string,
    holder: ItemHolder['kind'],
    role: string,
    id: string
  ): ItemHolder[] =>
    statements.flatMap(({ statement, title }) =>
      statement.kind === kind &&
      statement.connects.some(
        (c) => c.kind === ITEM && c.id === id && c.role === role
      )
        ? [
            {
              kind: holder,
              id: statement.about?.id ?? '',
              title: title || statement.about?.id || '',
            },
          ]
        : []
    );
  return Object.entries(items as Record<string, unknown>).map(
    ([id, written]) => {
      const name = (written as { name?: unknown } | null)?.name;
      return {
        id,
        name: typeof name === 'string' ? name : id,
        written,
        said: statements
          .map((s) => s.statement)
          .filter(
            (s) =>
              s.kind === ITEM_KIND &&
              s.about?.kind === ITEM &&
              s.about.id === id
          ),
        equippedBy: holders(EQUIPMENT_KIND, 'creature', EQUIPS, id),
        props: holders(PROP_ITEM_KIND, 'prop', IS_ITEM, id),
      };
    }
  );
}
