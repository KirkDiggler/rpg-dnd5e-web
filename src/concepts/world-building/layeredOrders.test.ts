import { describe, expect, it } from 'vitest';
import { createGuardCastDocument } from '../encounter-studio/fixtures/castDocument';
import { factionLayers, layeredOrders } from './layeredOrders';
import type { RoomDraftDocument } from './roomDraft';

const PATROL = {
  time: [
    { when: { enemy: 'reach' }, attack: 'enemy' },
    { when: { enemy: 'none' }, hold: {} },
  ],
};
const DRILL = { time: [{ when: { enemy: 'seen' }, toward: 'enemy' }] };

/** gate-1 and gate-2, both Guards; `tables`, factions and bindings as given.
 * Mirrors the toolkit's layering cases: `compile.go` `inheritedOrders` and
 * `ordersOf`, `single_room_compile.go`'s binding `layerSpecs`. */
function guards(
  patch: (document: RoomDraftDocument) => void
): RoomDraftDocument {
  const document = createGuardCastDocument();
  document.scope.tables = { 'gate-patrol': PATROL, drill: DRILL };
  patch(document);
  return document;
}

describe('layeredOrders', () => {
  it('own rows beat the named table key by key', () => {
    const own = { time: [{ say: 'Mine.' }] };
    const document = guards((d) => {
      d.draft.room.monsterBindings = {
        'gate-1': { table: 'gate-patrol', on: own },
      };
    });
    const time = layeredOrders(document, 'gate-1').time;
    expect(time.source).toEqual({ kind: 'own' });
    expect(time.rows).toEqual(own.time);
    expect(time.sharedWith).toEqual([]);
    expect(time.shadowed).toEqual([{ kind: 'table', id: 'gate-patrol' }]);
  });

  it("the binding's named table beats the faction's rows", () => {
    const document = guards((d) => {
      d.scope.factions = [{ id: 'garrison', on: DRILL }];
      d.draft.room.monsterBindings = {
        'gate-1': { faction: 'garrison', table: 'gate-patrol' },
      };
    });
    const time = layeredOrders(document, 'gate-1').time;
    expect(time.source).toEqual({ kind: 'table', id: 'gate-patrol' });
    expect(time.rows).toEqual(PATROL.time);
  });

  it("the faction's own rows beat the faction's named table", () => {
    const document = guards((d) => {
      d.scope.factions = [{ id: 'garrison', table: 'gate-patrol', on: DRILL }];
      d.draft.room.monsterBindings = { 'gate-1': { faction: 'garrison' } };
    });
    expect(layeredOrders(document, 'gate-1').time.source).toEqual({
      kind: 'faction',
      id: 'garrison',
    });
    const named = guards((d) => {
      d.scope.factions = [{ id: 'garrison', table: 'gate-patrol' }];
      d.draft.room.monsterBindings = { 'gate-1': { faction: 'garrison' } };
    });
    expect(layeredOrders(named, 'gate-1').time).toMatchObject({
      source: { kind: 'faction-table', faction: 'garrison', id: 'gate-patrol' },
      rows: PATROL.time,
    });
  });

  it('a trigger no layer names is the kind default', () => {
    const document = guards((d) => {
      d.scope.factions = [{ id: 'garrison' }];
      d.draft.room.monsterBindings = { 'gate-1': { faction: 'garrison' } };
    });
    const time = layeredOrders(document, 'gate-1').time;
    expect(time.source).toEqual({ kind: 'kind-default' });
    expect(time.rows).toEqual([]);
    expect(time.sharedWith).toEqual([]);
  });

  it('a creature naming no faction reads the declared monsters side', () => {
    const document = guards((d) => {
      d.scope.factions = [{ id: 'monsters', table: 'drill' }];
      d.draft.room.monsterBindings = {};
    });
    expect(layeredOrders(document, 'gate-1').time.source).toEqual({
      kind: 'faction-table',
      faction: 'monsters',
      id: 'drill',
    });
  });

  it('an undeclared table resolves to nothing, as rootTableOn answers', () => {
    const document = guards((d) => {
      d.draft.room.monsterBindings = { 'gate-1': { table: 'missing' } };
    });
    expect(layeredOrders(document, 'gate-1').time.source).toEqual({
      kind: 'kind-default',
    });
  });

  it('sharedWith lists gate-2 for gate-patrol', () => {
    const document = guards((d) => {
      d.draft.scene.actorNames = { 'gate-1': 'gate-1', 'gate-2': 'gate-2' };
      d.draft.room.monsterBindings = {
        'gate-1': { table: 'gate-patrol' },
        'gate-2': { table: 'gate-patrol' },
      };
    });
    expect(layeredOrders(document, 'gate-1').time.sharedWith).toEqual([
      'gate-2',
    ]);
  });
});

describe('factionLayers', () => {
  it("labels the faction's own time rows as overriding its table's", () => {
    const document = guards(() => {});
    const layers = factionLayers(document.scope, {
      id: 'garrison',
      table: 'gate-patrol',
      on: DRILL,
    });
    expect(layers.time).toEqual({
      source: { kind: 'faction', id: 'garrison' },
      rows: DRILL.time,
      overridden: PATROL.time,
    });
  });
});
