/**
 * Equipment fixtures (rpg-dnd5e-web#531) — the outside-in contract bench
 * for the equip screen, same method as the combat-panel fixtures.
 *
 * Types here match the wire field-for-field (RefLike/SlotDefLike/ItemLike/
 * EquippedMap, imported from the shared production module — see
 * equipmentTypes.ts's doc comment) — the contract this fixture bench asked
 * for landed as rpg-api-protos#188/rpg-toolkit#812/rpg-api#682 and the
 * production components now live at
 * src/components/game/equipment/, promoted for rpg-dnd5e-web#571.
 * `serverStats`/`applyIntent` below remain fixture-only: they stand in for
 * the SERVER's recompute so `/concepts` can demo the interaction without a
 * running backend — the real game screen calls the actual EquipItem/
 * UnequipItem RPCs instead (see EncounterView's handleEquipIntent).
 *
 * Boundary rule, demonstrated not just asserted: equipping emits an
 * intent carrying a Reference (module/type/id) — the web never computes
 * what equipment DOES.
 */

import type {
  EquipIntent,
  EquippedMap,
  ItemLike,
  RefLike,
  SlotDefLike,
} from '../../components/game/equipment/equipmentTypes';

export {
  resolveIconUrl,
  targetSlotFor,
} from '../../components/game/equipment/equipmentTypes';
export type { EquipIntent } from '../../components/game/equipment/equipmentTypes';

/** CONTRACT GAP (resolved): items need display-ready fields (name, statLine,
 * kind, slot compatibility). The web renders these verbatim — a statLine is
 * a server-composed string like "1d8 slashing · versatile", never client
 * rules math. `twoHanded` is fixture-only (see applyIntent below) — the
 * real wire has no such field; occupancy is server-computed and simply
 * shows up as `equipped` changing. */
export interface ItemFixture extends ItemLike {
  twoHanded?: boolean;
}

/** What the SERVER would push back after an equip/unequip — the concept
 * displays these, it never derives them. Keyed by a signature of what's
 * equipped so the fixture can act like the server across interactions. */
export interface ServerStats {
  ac: number;
  acNote: string; // e.g. "16 chain mail + 2 shield" — server-composed
  damage: string; // main-hand damage display, server-composed
}

export interface EquipCastFixture {
  id: string;
  name: string;
  classLabel: string;
  slots: SlotDefLike[];
  /** slot key -> the Ref worn/wielded there (server state) — same shape as
   * CharacterData.equipped. */
  equipped: EquippedMap;
  /** everything the character owns, equipped or carried */
  items: ItemFixture[];
  /** fixture-side stand-in for the server recompute — see file header */
  serverStats: (equipped: EquippedMap) => ServerStats;
}

const item = (
  id: string,
  name: string,
  kind: string,
  statLine: string,
  iconKey: string,
  slotKeys: string[],
  twoHanded?: boolean
): ItemFixture => ({
  ref: { module: 'dnd5e', type: 'item', id },
  name,
  kind,
  statLine,
  iconKey,
  slotKeys,
  twoHanded,
});

/** Builds an EquippedMap from item ids, resolving each id's Ref against
 * `items` — lets the fixture data below stay readable as
 * `{main_hand: 'longsword'}` while still typing `equipped` as the wire's
 * Record<string, RefLike>. */
function refsFor(
  items: ItemFixture[],
  bySlot: Record<string, string>
): EquippedMap {
  const byId = new Map(
    items.map((i) => [i.ref.id, i.ref] as [string, RefLike])
  );
  const out: EquippedMap = {};
  for (const [slot, id] of Object.entries(bySlot)) {
    const ref = byId.get(id);
    if (ref) out[slot] = ref;
  }
  return out;
}

const MARTIAL_SLOTS: SlotDefLike[] = [
  { key: 'main_hand', displayLabel: 'Main hand', accepts: ['weapon'] },
  { key: 'off_hand', displayLabel: 'Off hand', accepts: ['weapon', 'shield'] },
  { key: 'armor', displayLabel: 'Armor', accepts: ['armor'] },
];

/** Fighter: the loadout-choice cast — sword+board vs two-hander. Same
 * name/id as the rpg-api devseed `equip-demo` fixture (web#571), so the
 * concept bench and the live playtest read as the same character. */
const aldricItems: ItemFixture[] = [
  item(
    'longsword',
    'Longsword',
    'weapon',
    '1d8 slashing · versatile',
    'icons/weapons/ICON_SM_Wep_Sword_02_Clean.png',
    ['main_hand', 'off_hand']
  ),
  item(
    'greatsword',
    'Greatsword',
    'weapon',
    '2d6 slashing · two-handed',
    'icons/inventory/ICON_FantasyWarrior_Inventory_Swords01_Clean.png',
    ['main_hand'],
    true
  ),
  item(
    'shield',
    'Shield',
    'shield',
    '+2 AC',
    'icons/weapons/ICON_SM_Wep_Shield_01_Clean.png',
    ['off_hand']
  ),
  item(
    'chain-mail',
    'Chain Mail',
    'armor',
    'AC 16 · heavy',
    'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    ['armor']
  ),
  item(
    'handaxe',
    'Handaxe',
    'weapon',
    '1d6 slashing · thrown 20/60',
    'icons/weapons/ICON_SM_Wep_Axe_04_Clean.png',
    ['main_hand', 'off_hand']
  ),
  item(
    'torch',
    'Torch',
    'gear',
    'light, 20 ft radius',
    'icons/resources/ICON_SM_Item_Hammer_01.png',
    []
  ),
];
const aldric: EquipCastFixture = {
  id: 'char-aldric',
  name: 'Sir Aldric',
  classLabel: 'Fighter',
  slots: MARTIAL_SLOTS,
  equipped: refsFor(aldricItems, {
    main_hand: 'longsword',
    off_hand: 'shield',
    armor: 'chain-mail',
  }),
  items: aldricItems,
  serverStats: (eq) => {
    const shield = eq.off_hand?.id === 'shield' ? 2 : 0;
    const base = eq.armor?.id === 'chain-mail' ? 16 : 10;
    const mainHand = eq.main_hand?.id;
    const dmg =
      mainHand === 'greatsword'
        ? '2d6 slashing'
        : mainHand === 'longsword'
          ? shield
            ? '1d8 slashing'
            : '1d10 slashing (versatile, two hands free)'
          : mainHand === 'handaxe'
            ? '1d6 slashing'
            : 'unarmed 1+STR';
    return {
      ac: base + shield,
      acNote: `${base}${eq.armor?.id === 'chain-mail' ? ' chain mail' : ' base'}${shield ? ' + 2 shield' : ''}`,
      damage: dmg,
    };
  },
};

/** Barbarian: Kirk — "less important for a barbarian." The sparse cast:
 * one item, most slots empty, AC from Unarmored Defense (server math). */
const standreItems: ItemFixture[] = [
  item(
    'greataxe',
    'Greataxe',
    'weapon',
    '1d12 slashing · two-handed',
    'icons/inventory/ICON_FantasyWarrior_Inventory_Axes01_Clean.png',
    ['main_hand'],
    true
  ),
];
const standre: EquipCastFixture = {
  id: 'char-standre',
  name: 'Standre',
  classLabel: 'Barbarian',
  slots: MARTIAL_SLOTS,
  equipped: refsFor(standreItems, { main_hand: 'greataxe' }),
  items: standreItems,
  serverStats: (eq) => ({
    ac: 14,
    acNote: '10 + DEX + CON (Unarmored Defense — server-computed)',
    damage: eq.main_hand?.id === 'greataxe' ? '1d12 slashing' : 'unarmed 1+STR',
  }),
};

/** Rogue: dual-wield + light armor + a no-slot flavor item. */
const remyItems: ItemFixture[] = [
  item(
    'dagger-1',
    'Dagger',
    'weapon',
    '1d4 piercing · finesse, light',
    'icons/inventory/ICON_FantasyWarrior_Inventory_Daggers01_Clean.png',
    ['main_hand', 'off_hand']
  ),
  item(
    'dagger-2',
    'Dagger',
    'weapon',
    '1d4 piercing · finesse, light',
    'icons/inventory/ICON_FantasyWarrior_Inventory_Daggers01_Clean.png',
    ['main_hand', 'off_hand']
  ),
  item(
    'shortsword',
    'Shortsword',
    'weapon',
    '1d6 piercing · finesse, light',
    'icons/weapons/ICON_SM_Wep_Sword_02_Clean.png',
    ['main_hand', 'off_hand']
  ),
  item(
    'leather',
    'Leather Armor',
    'armor',
    'AC 11 + DEX · light',
    'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    ['armor']
  ),
  item(
    'thieves-tools',
    "Thieves' Tools",
    'gear',
    'lockpicking · expertise',
    'icons/resources/ICON_SM_Item_Key_01.png',
    []
  ),
];
const remy: EquipCastFixture = {
  id: 'char-remy',
  name: 'Remy',
  classLabel: 'Rogue',
  slots: MARTIAL_SLOTS,
  equipped: refsFor(remyItems, {
    main_hand: 'dagger-1',
    off_hand: 'dagger-2',
    armor: 'leather',
  }),
  items: remyItems,
  serverStats: (eq) => ({
    ac: eq.armor?.id === 'leather' ? 14 : 13,
    acNote:
      eq.armor?.id === 'leather'
        ? '11 leather + 3 DEX (server-computed)'
        : '10 + 3 DEX',
    damage: eq.main_hand?.id?.startsWith('dagger')
      ? `1d4 piercing${eq.off_hand?.id?.startsWith('dagger') ? ' · off-hand 1d4' : ''}`
      : eq.main_hand?.id === 'shortsword'
        ? '1d6 piercing'
        : 'unarmed 1',
  }),
};

export const EQUIP_CASTS: EquipCastFixture[] = [aldric, standre, remy];

/** Fixture reducer standing in for the SERVER's handling of the intent.
 * Mirrors the semantics CONTRACT.md asked for: equip places the item in a
 * compatible slot (explicit slot from the intent), two-handed clears the
 * off hand, occupying items return to carried. The web client never
 * implements this outside the fixture bench — the live game screen calls
 * the real EquipItem/UnequipItem RPCs instead. */
export function applyIntent(
  equipped: EquippedMap,
  items: ItemFixture[],
  intent: EquipIntent
): EquippedMap {
  const next = { ...equipped };
  if (intent.kind === 'UnequipItem') {
    delete next[intent.slotKey];
    return next;
  }
  const it = items.find((i) => i.ref.id === intent.ref.id);
  if (!it || !it.slotKeys.includes(intent.slotKey)) return next;
  // a two-handed weapon occupies main hand and forces the off hand empty
  if (it.twoHanded) {
    delete next.off_hand;
    next.main_hand = it.ref;
    return next;
  }
  // equipping into a slot the same item already holds elsewhere: move it
  for (const [k, v] of Object.entries(next)) {
    if (v.id === it.ref.id) delete next[k];
  }
  // main hand holding a two-hander blocks the off hand until it's swapped
  if (intent.slotKey === 'off_hand') {
    const mainId = next.main_hand?.id;
    const main = mainId ? items.find((i) => i.ref.id === mainId) : undefined;
    if (main?.twoHanded) delete next.main_hand;
  }
  next[intent.slotKey] = it.ref;
  return next;
}
