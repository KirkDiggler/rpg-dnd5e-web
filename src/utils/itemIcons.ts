/**
 * Canonical weapon/armor icon lookup for the equipment popover
 * (`EquipmentSlots.tsx`/`InventoryLight.tsx`, rpg-dnd5e-web#576), following
 * the same web-owned-map + text-fallback precedent as
 * `src/utils/actionIcons.ts` (#497) and `src/utils/conditionIcons.ts`
 * (#473). Server-authored `Item.iconKey` is always empty today
 * (rpg-api#680 scope-decision) — this registry closes that gap for the
 * 38 `Weapon` + 13 `Armor` enum ids without any server/toolkit change.
 * See rpg-project's `ideas/equipment/item-icons/design.md` for the full
 * design (coverage boundary, resolution precedence, tier rationale).
 *
 * Resolution precedence, implemented by `getItemIconUrl`:
 *   1. Wire wins — a non-empty `iconKey` resolves via the existing
 *      `resolveIconUrl` (equipmentTypes.ts), unconditionally.
 *   2. Canonical — `ref.id` looked up in `ITEM_ICONS` (exhaustive over
 *      the 38 weapon + 13 armor canonical ids).
 *   3. Supplemental — `ref.id` looked up in `SUPPLEMENTAL_ITEM_ICONS`
 *      (non-exhaustive extra map for ammo/pack ids with no wire enum).
 *   4. Text-only — `undefined`. Callers already render text-only for an
 *      `undefined` icon URL (see `resolveIconUrl`'s empty-key case) —
 *      never a broken `<img>`.
 *
 * `ref.id` is used verbatim, no normalization — the wire's canonical ids
 * are exact lowercase kebab-case (`types.proto`'s `Ref` doc comment gives
 * `{module:"dnd5e", type:"item", id:"longsword"}`).
 */

import { resolveIconUrl } from '../components/game/equipment/equipmentTypes';

/** Icon-tier metadata — recorded for a future asset-batch pass, not
 *  consumed by rendering logic in v1 (design doc "Tier assignments"). */
export type IconQuality = 'dedicated' | 'approximate' | 'generic';

export interface ItemIconEntry {
  /** Manifest-relative path under the Synty UI library base, e.g.
   *  "icons/weapons/ICON_SM_Wep_Sword_02_Clean.png" — the same base
   *  `resolveIconUrl` resolves an `iconKey` against. */
  path: string;
  quality: IconQuality;
}

/** The 38 canonical `Weapon` enum ids (dnd5e/api/v1alpha2/weapons/
 *  weapons.proto), excluding WEAPON_UNSPECIFIED and the simple/martial/
 *  any-weapon category placeholders (not concrete weapons — excluded from
 *  the generated enum too). Alphabetical; this exact literal array is what
 *  the exhaustiveness test iterates — NOT `Object.keys(ITEM_ICONS)` — so a
 *  silently-missing key fails loudly instead of the test just seeing a
 *  smaller-but-still-"complete" map. */
export const CANONICAL_WEAPON_IDS = [
  'battleaxe',
  'blowgun',
  'club',
  'dagger',
  'dart',
  'flail',
  'glaive',
  'greataxe',
  'greatclub',
  'greatsword',
  'halberd',
  'hand-crossbow',
  'handaxe',
  'heavy-crossbow',
  'javelin',
  'lance',
  'light-crossbow',
  'light-hammer',
  'longbow',
  'longsword',
  'mace',
  'maul',
  'morningstar',
  'net',
  'pike',
  'quarterstaff',
  'rapier',
  'scimitar',
  'shortbow',
  'shortsword',
  'sickle',
  'sling',
  'spear',
  'trident',
  'unarmed-strike',
  'war-pick',
  'warhammer',
  'whip',
] as const;

/** The 13 canonical `Armor` enum ids (dnd5e/api/v1alpha2/armor/armor.proto),
 *  excluding ARMOR_UNSPECIFIED. Alphabetical, same exhaustiveness-test role
 *  as `CANONICAL_WEAPON_IDS`. */
export const CANONICAL_ARMOR_IDS = [
  'breastplate',
  'chain-mail',
  'chain-shirt',
  'half-plate',
  'hide',
  'leather',
  'padded',
  'plate',
  'ring-mail',
  'scale-mail',
  'shield',
  'splint',
  'studded-leather',
] as const;

/** Union of every canonical weapon + armor id. `CANONICAL_ITEM_ICONS`
 *  below is `satisfies`-checked against `Record<CanonicalItemId,
 *  ItemIconEntry>`, so adding a new proto enum value here without a
 *  registry entry (or misspelling one) is a compile error, not a silent
 *  gap. */
export type CanonicalItemId =
  | (typeof CANONICAL_WEAPON_IDS)[number]
  | (typeof CANONICAL_ARMOR_IDS)[number];

/** Internal literal, `satisfies`-checked against `Record<CanonicalItemId,
 *  ItemIconEntry>` so TypeScript rejects a missing OR misspelled canonical
 *  key at compile time (an extra key not in `CanonicalItemId` is also
 *  rejected — this must be exactly the 38+13 ids, no more, no less).
 *  Exported below widened to `Record<string, ItemIconEntry>` so callers
 *  can safely index by an arbitrary `ref.id` without a TS error; the
 *  runtime lookup in `getItemIconUrl` still guards with a truthiness
 *  check rather than trusting the widened type. */
const CANONICAL_ITEM_ICONS = {
  battleaxe: {
    path: 'icons/weapons/ICON_SM_Wep_Axe_03_Clean.png',
    quality: 'dedicated',
  },
  blowgun: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Items01_Clean.png',
    quality: 'generic',
  },
  club: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Items01_Clean.png',
    quality: 'generic',
  },
  dagger: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Daggers01_Clean.png',
    quality: 'dedicated',
  },
  dart: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Arrows01_Clean.png',
    quality: 'approximate',
  },
  flail: {
    path: 'icons/weapons/ICON_SM_Wep_Mace_05_Clean.png',
    quality: 'approximate',
  },
  glaive: {
    path: 'icons/weapons/ICON_SM_Wep_Spear_06_Clean.png',
    quality: 'dedicated',
  },
  greataxe: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Axes01_Clean.png',
    quality: 'dedicated',
  },
  greatclub: {
    path: 'icons/weapons/ICON_SM_Wep_Staff_02_Clean.png',
    quality: 'approximate',
  },
  greatsword: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Swords01_Clean.png',
    quality: 'dedicated',
  },
  halberd: {
    path: 'icons/weapons/ICON_SM_Wep_Spear_08_Clean.png',
    quality: 'dedicated',
  },
  'hand-crossbow': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Bows01_Clean.png',
    quality: 'approximate',
  },
  handaxe: {
    path: 'icons/weapons/ICON_SM_Wep_Axe_04_Clean.png',
    quality: 'dedicated',
  },
  'heavy-crossbow': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Bows01_Clean.png',
    quality: 'approximate',
  },
  javelin: {
    path: 'icons/weapons/ICON_SM_Wep_Spear_02_Clean.png',
    quality: 'dedicated',
  },
  lance: {
    path: 'icons/weapons/ICON_SM_Wep_Spear_09_Clean.png',
    quality: 'dedicated',
  },
  'light-crossbow': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Bows01_Clean.png',
    quality: 'approximate',
  },
  'light-hammer': {
    path: 'icons/weapons/ICON_SM_Wep_Hammer_01_Clean.png',
    quality: 'dedicated',
  },
  longbow: {
    path: 'icons/weapons/ICON_SM_Prop_Bow_02_Clean.png',
    quality: 'dedicated',
  },
  longsword: {
    path: 'icons/weapons/ICON_SM_Wep_Sword_02_Clean.png',
    quality: 'dedicated',
  },
  mace: {
    path: 'icons/weapons/ICON_SM_Wep_Mace_01_Clean.png',
    quality: 'dedicated',
  },
  maul: {
    path: 'icons/weapons/ICON_SM_Wep_Hammer_04_Clean.png',
    quality: 'dedicated',
  },
  morningstar: {
    path: 'icons/weapons/ICON_SM_Wep_Mace_03_Clean.png',
    quality: 'dedicated',
  },
  net: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Items01_Clean.png',
    quality: 'generic',
  },
  pike: {
    path: 'icons/weapons/ICON_SM_Wep_Spear_04_Clean.png',
    quality: 'dedicated',
  },
  quarterstaff: {
    path: 'icons/weapons/ICON_SM_Wep_Staff_01_Clean.png',
    quality: 'dedicated',
  },
  rapier: {
    path: 'icons/weapons/ICON_SM_Wep_Sword_01_Clean.png',
    quality: 'dedicated',
  },
  scimitar: {
    path: 'icons/weapons/ICON_SM_Wep_Sword_03_Clean.png',
    quality: 'dedicated',
  },
  shortbow: {
    path: 'icons/weapons/ICON_SM_Prop_Bow_01_Clean.png',
    quality: 'dedicated',
  },
  shortsword: {
    path: 'icons/weapons/ICON_SM_Wep_Sword_02_Clean.png',
    quality: 'dedicated',
  },
  sickle: {
    path: 'icons/weapons/ICON_SM_Wep_Knife_03_Clean.png',
    quality: 'approximate',
  },
  sling: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Items01_Clean.png',
    quality: 'generic',
  },
  spear: {
    path: 'icons/weapons/ICON_SM_Wep_Spear_01_Clean.png',
    quality: 'dedicated',
  },
  trident: {
    path: 'icons/weapons/ICON_SM_Wep_Spear_11_Clean.png',
    quality: 'dedicated',
  },
  'unarmed-strike': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Items01_Clean.png',
    quality: 'generic',
  },
  'war-pick': {
    path: 'icons/weapons/ICON_SM_Wep_IcePick_01_Clean.png',
    quality: 'dedicated',
  },
  warhammer: {
    path: 'icons/weapons/ICON_SM_Wep_Hammer_02_Clean.png',
    quality: 'dedicated',
  },
  whip: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Items01_Clean.png',
    quality: 'generic',
  },
  breastplate: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    quality: 'generic',
  },
  'chain-mail': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    quality: 'generic',
  },
  'chain-shirt': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    quality: 'generic',
  },
  'half-plate': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    quality: 'generic',
  },
  hide: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    quality: 'generic',
  },
  leather: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    quality: 'generic',
  },
  padded: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    quality: 'generic',
  },
  plate: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    quality: 'generic',
  },
  'ring-mail': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    quality: 'generic',
  },
  'scale-mail': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    quality: 'generic',
  },
  shield: {
    path: 'icons/weapons/ICON_SM_Wep_Shield_01_Clean.png',
    quality: 'dedicated',
  },
  splint: {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    quality: 'generic',
  },
  'studded-leather': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png',
    quality: 'generic',
  },
} satisfies Record<CanonicalItemId, ItemIconEntry>;

/** Exhaustive over the 38 weapon + 13 armor canonical ids (51 total) — see
 *  `CANONICAL_ITEM_ICONS`'s `satisfies` check above for the compile-time
 *  guarantee. Widened to `Record<string, ItemIconEntry>` so
 *  `getItemIconUrl` can index by an arbitrary `ref.id` string. */
export const ITEM_ICONS: Record<string, ItemIconEntry> = CANONICAL_ITEM_ICONS;

/** Small, intentionally non-exhaustive. Non-enum gear (ammo, packs, tools)
 *  that happens to have a reasonable icon and a real toolkit id — never
 *  checked for completeness, absence here is normal and expected. Do not
 *  add fixture-only ids here (e.g. `dagger-1`/`dagger-2`/`torch` from
 *  `src/concepts/equipment/fixtures.ts`) — those already carry a
 *  non-empty `iconKey` in their fixture data, so step 1 of the precedence
 *  (wire wins) already resolves them; they are not live wire canonical
 *  ids. */
export const SUPPLEMENTAL_ITEM_ICONS: Record<string, ItemIconEntry> = {
  'bolts-20': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Arrows01_Clean.png',
    quality: 'generic',
  },
  'bolts-50': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Arrows01_Clean.png',
    quality: 'generic',
  },
  'dungeoneer-pack': {
    path: 'icons/inventory/ICON_FantasyWarrior_Inventory_Backpack01_Clean.png',
    quality: 'generic',
  },
};

/**
 * Resolve the icon URL for an owned item, implementing the 3-step
 * precedence (wire -> canonical -> supplemental -> text-only). `ref`
 * carries `id` only (module/type unused here — id is unique within the
 * weapon/armor/item id space this registry covers). `ref.id` is used
 * verbatim, no normalization.
 *
 * @example
 * ```typescript
 * getItemIconUrl({ id: 'longsword' }, '');
 * // '/models/synty/ui/library/icons/weapons/ICON_SM_Wep_Sword_02_Clean.png'
 * getItemIconUrl({ id: 'longsword' }, 'icons/weapons/custom.png');
 * // '/models/synty/ui/library/icons/weapons/custom.png' — wire wins
 * getItemIconUrl({ id: 'homebrew-relic' }, '');
 * // undefined — unknown id, caller falls back to text-only
 * ```
 */
export function getItemIconUrl(
  ref: { id: string },
  iconKey: string
): string | undefined {
  const wireUrl = resolveIconUrl(iconKey);
  if (wireUrl) return wireUrl;

  const canonicalEntry = ITEM_ICONS[ref.id];
  if (canonicalEntry) return resolveIconUrl(canonicalEntry.path);

  const supplementalEntry = SUPPLEMENTAL_ITEM_ICONS[ref.id];
  if (supplementalEntry) return resolveIconUrl(supplementalEntry.path);

  return undefined;
}
