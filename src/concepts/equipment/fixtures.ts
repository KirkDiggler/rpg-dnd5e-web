/**
 * Equipment fixtures (rpg-dnd5e-web#531) — the outside-in contract bench
 * for the equip screen, same method as the combat-panel fixtures.
 *
 * NOTHING here exists on the wire today. CharacterData carries no
 * equipment or inventory (rpg-api-protos#183), there is no Equip/Unequip
 * RPC, and no slot taxonomy. Every type below is written the way we want
 * the wire to look; the deltas are enumerated in ./CONTRACT.md and become
 * the feature request to the platform team once Kirk reviews the concept.
 *
 * Boundary rule, demonstrated not just asserted: equipping emits an
 * intent carrying a Reference (module/type/id) — the web never computes
 * what equipment DOES. The `fixtureServerStats` table below stands in for
 * the SERVER's recompute so the concept can display AC/damage the way the
 * real screen would display server-pushed values. That math lives here
 * only because the fixture is playing the server.
 */

/** The Reference an equip/unequip intent carries — same shape as the
 * encounter Ref (module/type/id). Server resolves everything from it. */
export interface ItemRef {
  module: string;
  type: string; // 'item'
  id: string;
}

/** CONTRACT GAP: slot taxonomy must arrive as DATA (server-owned), never
 * a client enum — classes/homebrew can add slots without a web release. */
export interface EquipSlotDef {
  key: string; // 'main_hand' | 'off_hand' | 'armor' — opaque to the web
  label: string; // display-ready, server-provided
  /** item kinds this socket accepts — server data, client only filters */
  accepts: string[];
}

/** CONTRACT GAP: items need display-ready fields (name, statLine, kind,
 * slot compatibility). The web renders these verbatim — a statLine is a
 * server-composed string like "1d8 slashing · versatile", never client
 * rules math. `iconKey` is a reference key into the asset-owned manifest
 * (keys-not-enums, per the web#523 props convention). */
export interface ItemFixture {
  ref: ItemRef;
  name: string;
  kind: string; // 'weapon' | 'shield' | 'armor' | 'gear'
  statLine: string;
  iconKey: string; // manifest key (CONTRACT.md §4 icon_key) — resolveIconUrl turns it into a URL
  /** CONTRACT GAP: two-handed occupancy is server semantics — on equip
   * the server clears/blocks off_hand and the snapshot reflects it. The
   * fixture reducer mimics that so the concept behaves like the wire
   * would. */
  twoHanded?: boolean;
  /** slot keys this item may occupy — server data */
  slots: string[];
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
  slots: EquipSlotDef[];
  /** slotKey -> item ref id (server state: what's worn/wielded) */
  equipped: Record<string, string>;
  /** everything the character owns, equipped or carried */
  items: ItemFixture[];
  /** fixture-side stand-in for the server recompute — see file header */
  serverStats: (equipped: Record<string, string>) => ServerStats;
}

const LIB = '/models/synty/ui/library';

/** UI-boundary resolver: manifest key -> URL. Components carry the key
 * (the wire's icon_key) and resolve only at the <img>; swapping fixtures
 * for wire data touches nothing but the data source. */
export function resolveIconUrl(iconKey: string): string {
  return `${LIB}/${iconKey}`;
}

const item = (
  id: string,
  name: string,
  kind: string,
  statLine: string,
  iconKey: string,
  slots: string[],
  twoHanded?: boolean
): ItemFixture => ({
  ref: { module: 'dnd5e', type: 'item', id },
  name,
  kind,
  statLine,
  iconKey,
  slots,
  twoHanded,
});

const MARTIAL_SLOTS: EquipSlotDef[] = [
  { key: 'main_hand', label: 'Main hand', accepts: ['weapon'] },
  { key: 'off_hand', label: 'Off hand', accepts: ['weapon', 'shield'] },
  { key: 'armor', label: 'Armor', accepts: ['armor'] },
];

/** Fighter: the loadout-choice cast — sword+board vs two-hander. */
const aldric: EquipCastFixture = {
  id: 'char-aldric',
  name: 'Sir Aldric',
  classLabel: 'Fighter',
  slots: MARTIAL_SLOTS,
  equipped: {
    main_hand: 'longsword',
    off_hand: 'shield',
    armor: 'chain-mail',
  },
  items: [
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
  ],
  serverStats: (eq) => {
    const shield = eq.off_hand === 'shield' ? 2 : 0;
    const base = eq.armor === 'chain-mail' ? 16 : 10;
    const dmg =
      eq.main_hand === 'greatsword'
        ? '2d6 slashing'
        : eq.main_hand === 'longsword'
          ? shield
            ? '1d8 slashing'
            : '1d10 slashing (versatile, two hands free)'
          : eq.main_hand === 'handaxe'
            ? '1d6 slashing'
            : 'unarmed 1+STR';
    return {
      ac: base + shield,
      acNote: `${base}${eq.armor === 'chain-mail' ? ' chain mail' : ' base'}${shield ? ' + 2 shield' : ''}`,
      damage: dmg,
    };
  },
};

/** Barbarian: Kirk — "less important for a barbarian." The sparse cast:
 * one item, most slots empty, AC from Unarmored Defense (server math). */
const standre: EquipCastFixture = {
  id: 'char-standre',
  name: 'Standre',
  classLabel: 'Barbarian',
  slots: MARTIAL_SLOTS,
  equipped: { main_hand: 'greataxe' },
  items: [
    item(
      'greataxe',
      'Greataxe',
      'weapon',
      '1d12 slashing · two-handed',
      'icons/inventory/ICON_FantasyWarrior_Inventory_Axes01_Clean.png',
      ['main_hand'],
      true
    ),
  ],
  serverStats: (eq) => ({
    ac: 14,
    acNote: '10 + DEX + CON (Unarmored Defense — server-computed)',
    damage: eq.main_hand === 'greataxe' ? '1d12 slashing' : 'unarmed 1+STR',
  }),
};

/** Rogue: dual-wield + light armor + a no-slot flavor item. */
const remy: EquipCastFixture = {
  id: 'char-remy',
  name: 'Remy',
  classLabel: 'Rogue',
  slots: MARTIAL_SLOTS,
  equipped: {
    main_hand: 'dagger-1',
    off_hand: 'dagger-2',
    armor: 'leather',
  },
  items: [
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
  ],
  serverStats: (eq) => ({
    ac: eq.armor === 'leather' ? 14 : 13,
    acNote:
      eq.armor === 'leather'
        ? '11 leather + 3 DEX (server-computed)'
        : '10 + 3 DEX',
    damage: eq.main_hand?.startsWith('dagger')
      ? `1d4 piercing${eq.off_hand?.startsWith('dagger') ? ' · off-hand 1d4' : ''}`
      : eq.main_hand === 'shortsword'
        ? '1d6 piercing'
        : 'unarmed 1',
  }),
};

export const EQUIP_CASTS: EquipCastFixture[] = [aldric, standre, remy];

/** The intent an equip click emits — exactly the RPC request shape we
 * want (see CONTRACT.md §2). The concept logs these verbatim. */
export type EquipIntent =
  | { kind: 'EquipItem'; ref: ItemRef; slotKey: string }
  | { kind: 'UnequipItem'; slotKey: string };

/** Fixture reducer standing in for the SERVER's handling of the intent.
 * Mirrors the semantics CONTRACT.md asks for: equip places the item in a
 * compatible slot (explicit slot from the intent), two-handed clears the
 * off hand, occupying items return to carried. The web client never
 * implements this outside the fixture bench. */
export function applyIntent(
  equipped: Record<string, string>,
  items: ItemFixture[],
  intent: EquipIntent
): Record<string, string> {
  const next = { ...equipped };
  if (intent.kind === 'UnequipItem') {
    delete next[intent.slotKey];
    return next;
  }
  const it = items.find((i) => i.ref.id === intent.ref.id);
  if (!it || !it.slots.includes(intent.slotKey)) return next;
  // a two-handed weapon occupies main hand and forces the off hand empty
  if (it.twoHanded) {
    delete next.off_hand;
    next.main_hand = it.ref.id;
    return next;
  }
  // equipping into a slot the same item already holds elsewhere: move it
  for (const [k, v] of Object.entries(next)) {
    if (v === it.ref.id) delete next[k];
  }
  // main hand holding a two-hander blocks the off hand until it's swapped
  if (intent.slotKey === 'off_hand') {
    const main = items.find((i) => i.ref.id === next.main_hand);
    if (main?.twoHanded) delete next.main_hand;
  }
  next[intent.slotKey] = it.ref.id;
  return next;
}

/** First compatible slot for a carried item given current occupancy —
 * prefer an empty compatible slot, else the first compatible (swap). */
export function targetSlotFor(
  item: ItemFixture,
  slots: EquipSlotDef[],
  equipped: Record<string, string>
): string | undefined {
  const compatible = slots.filter(
    (s) => item.slots.includes(s.key) && s.accepts.includes(item.kind)
  );
  return compatible.find((s) => !equipped[s.key])?.key ?? compatible[0]?.key;
}
