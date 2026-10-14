/**
 * What a placed creature does on each trigger, read in the COMPILER'S layers
 * (rpg-project#576, B2).
 *
 * THE LAYERS ARE THE TOOLKIT'S, mirrored here so the read-back says what the
 * engine will roll. In rpg-toolkit `rulebooks/dnd5e/encounter/dungeonspec`:
 *
 *   - `inheritedOrders` (`compile.go`) gives each faction the base
 *     `layerSpecs(rootTableOn(tables, fa.Table), fa.On)`: its own rows over
 *     the table it names;
 *   - the single-room binding (`single_room_compile.go`) is
 *     `layerSpecs(rootTableOn(spec.Tables, b.Table), b.On)`: the creature's
 *     own rows over the table it names;
 *   - `ordersOf` lays the creature's layer over its faction's, KEY BY KEY,
 *     the nearer layer winning WHOLESALE (`encounter.Layer`);
 *   - `sideOf` (`grammar.go`) puts a creature that names no faction in the
 *     reserved `monsters` side, whose declaration, when there is one, is its
 *     faction.
 *
 * So per trigger, nearest first: the creature's own rows, its named table,
 * its faction's own rows, the faction's named table, then the kind's
 * default — which is not in the document and is never listed (B3).
 *
 * IT DECIDES NOTHING the compiler does not. A table id the document does not
 * declare resolves to nothing, exactly as `rootTableOn` answers; the decoder
 * refuses that file by name, and the forms show the refusal at the field.
 */
import { ANSWER_TRIGGER_KEYS } from '@/author/answerVocabulary';
import { MONSTERS } from '@/author/factionVocabulary';
import type { AnswerEntryShape } from './answerTableShape';
import { documentPlacementNames } from './placementNames';
import type { RoomDraftDocument } from './roomDraft';
import type { SiteFaction } from './siteScope';

/** Where one trigger's rows come from. */
export type OrdersSource =
  | { kind: 'own' }
  | { kind: 'table'; id: string }
  | { kind: 'faction'; id: string }
  | { kind: 'faction-table'; faction: string; id: string }
  | { kind: 'kind-default' };

/** One trigger's resolution: the layer that wins it, that layer's rows, and
 * the other placements whose same trigger reads the same rows. */
export interface OrdersLayer {
  source: OrdersSource;
  rows: readonly AnswerEntryShape[];
  /** Other placements' shown names, in document order. */
  sharedWith: readonly string[];
}

/** The faction a binding's creature is on: its named one, else the reserved
 * `monsters` side (`sideOf`), as declared under `factions:` when it is. */
export function factionOf(
  document: Readonly<RoomDraftDocument>,
  placementId: string
): SiteFaction | undefined {
  const named =
    document.draft.room.monsterBindings?.[placementId]?.faction ?? MONSTERS;
  return (document.scope.factions ?? []).find((f) => f.id === named);
}

/** The one trigger's winning layer for one placement, nearest first. */
function resolve(
  document: Readonly<RoomDraftDocument>,
  placementId: string,
  trigger: string
): { source: OrdersSource; rows: readonly AnswerEntryShape[] } {
  const tables = document.scope.tables ?? {};
  const binding = document.draft.room.monsterBindings?.[placementId];
  const own = binding?.on?.[trigger];
  if (own !== undefined) return { source: { kind: 'own' }, rows: own };
  if (binding?.table !== undefined) {
    const rows = tables[binding.table]?.[trigger];
    if (rows !== undefined)
      return { source: { kind: 'table', id: binding.table }, rows };
  }
  const faction = factionOf(document, placementId);
  if (faction !== undefined) {
    const rows = faction.on?.[trigger];
    if (rows !== undefined)
      return { source: { kind: 'faction', id: faction.id }, rows };
    if (faction.table !== undefined) {
      const named = tables[faction.table]?.[trigger];
      if (named !== undefined)
        return {
          source: {
            kind: 'faction-table',
            faction: faction.id,
            id: faction.table,
          },
          rows: named,
        };
    }
  }
  return { source: { kind: 'kind-default' }, rows: [] };
}

/** Two placements read the same rows when both resolve to one named table,
 * or to one faction's own rows. A creature's own rows are its alone, and the
 * kind's default is not in the document to compare. */
function sameRows(a: OrdersSource, b: OrdersSource): boolean {
  const tableOf = (s: OrdersSource) =>
    s.kind === 'table' || s.kind === 'faction-table' ? s.id : undefined;
  const at = tableOf(a);
  if (at !== undefined) return at === tableOf(b);
  if (a.kind === 'faction') return b.kind === 'faction' && a.id === b.id;
  return false;
}

/** Every trigger the dialect has, resolved for one placement. */
export function layeredOrders(
  document: Readonly<RoomDraftDocument>,
  placementId: string
): Record<string, OrdersLayer> {
  const names = documentPlacementNames(document);
  const others = document.draft.room.monsterDeclarations.filter(
    (m) => m.id !== placementId
  );
  const out: Record<string, OrdersLayer> = {};
  for (const trigger of ANSWER_TRIGGER_KEYS) {
    const { source, rows } = resolve(document, placementId, trigger);
    const sharedWith = others
      .filter((m) => sameRows(source, resolve(document, m.id, trigger).source))
      .map((m) => names.get(m.id) ?? m.id);
    out[trigger] = { source, rows, sharedWith };
  }
  return out;
}

/** The layer a FACTION's members inherit on each trigger, before any member
 * lays its own over it: its own rows, else the table it names. */
export function factionLayers(
  document: Readonly<RoomDraftDocument>,
  faction: SiteFaction
): Record<
  string,
  | {
      source: Extract<OrdersSource, { kind: 'faction' | 'faction-table' }>;
      rows: readonly AnswerEntryShape[];
      /** The named table's rows on this trigger, shown under the faction's
       * own when its own win (they do not apply). */
      overridden?: readonly AnswerEntryShape[];
    }
  | undefined
> {
  const tables = document.scope.tables ?? {};
  const named = faction.table !== undefined ? tables[faction.table] : undefined;
  const out: ReturnType<typeof factionLayers> = {};
  for (const trigger of ANSWER_TRIGGER_KEYS) {
    const own = faction.on?.[trigger];
    const fromTable = named?.[trigger];
    if (own !== undefined)
      out[trigger] = {
        source: { kind: 'faction', id: faction.id },
        rows: own,
        overridden: fromTable,
      };
    else if (fromTable !== undefined && faction.table !== undefined)
      out[trigger] = {
        source: {
          kind: 'faction-table',
          faction: faction.id,
          id: faction.table,
        },
        rows: fromTable,
      };
    else out[trigger] = undefined;
  }
  return out;
}
