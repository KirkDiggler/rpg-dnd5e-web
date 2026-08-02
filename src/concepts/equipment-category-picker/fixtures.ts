/**
 * Typed fixtures for the EquipmentCategoryPicker concept
 * (rpg-dnd5e-web#668 Phase 1, rpg-project#173 / plan.md).
 *
 * These stand in for `EquipmentCategoryChoice.options` — the additive,
 * repeated, concrete+enriched `EquipmentItem[]` the toolkit will resolve and
 * the API will pass through once Phase 2 lands (design.md's 2026-08-01
 * update). Fixtures are typed against the real generated proto message
 * (`EquipmentItemSchema`/`EquipmentSchema`) so they cannot silently drift
 * from the wire shape — but they are FIXTURES, not eligibility logic: this
 * file does not compute which weapons belong to "simple" or "martial", it
 * just hand-authors a few representative, plausible resolved lists to drive
 * the picker in isolation. Real membership (including Monk's full
 * simple-melee + simple-ranged set) is the toolkit's job, deferred to
 * Phase 2.
 *
 * Three cases per plan.md:
 *  - `SIMPLE_CATEGORY_OPTIONS` — a small category, choose 1.
 *  - `LARGE_CATEGORY_OPTIONS` — the full SRD simple-weapon set (14 items,
 *    the same count Monk's simple-melee + simple-ranged proficiency spans),
 *    to exercise scrolling/layout at Monk-shaped scale.
 *  - `MULTI_SELECT_CATEGORY_OPTIONS` — choose 2, martial melee weapons.
 */

import { create } from '@bufbuild/protobuf';
import type { EquipmentItem } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { EquipmentItemSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  DamageType,
  EquipmentCategory,
  Weapon,
  WeaponCategory,
  WeaponProperty,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { EquipmentSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/equipment_types_pb';

interface WeaponSpec {
  id: string;
  name: string;
  weapon: Weapon;
  category: WeaponCategory;
  damageDice: string;
  damageType: DamageType;
  properties?: WeaponProperty[];
  range?: { normal: number; long: number };
  weightLb: number;
  costGp: number;
}

function equipmentCategoryFor(
  weaponCategory: WeaponCategory
): EquipmentCategory {
  switch (weaponCategory) {
    case WeaponCategory.MARTIAL:
      return EquipmentCategory.MARTIAL_WEAPON;
    case WeaponCategory.SIMPLE:
    default:
      return EquipmentCategory.SIMPLE_WEAPON;
  }
}

function weaponItem(spec: WeaponSpec): EquipmentItem {
  return create(EquipmentItemSchema, {
    selectionId: spec.id,
    quantity: 1,
    typeHint: { case: 'weapon', value: spec.weapon },
    equipmentDetail: create(EquipmentSchema, {
      id: spec.id,
      name: spec.name,
      category: equipmentCategoryFor(spec.category),
      cost: { quantity: spec.costGp, unit: 'gp' },
      weight: { quantity: spec.weightLb, unit: 'lb' },
      equipmentData: {
        case: 'weaponData',
        value: {
          weaponCategory: spec.category,
          damageDice: spec.damageDice,
          damageType: spec.damageType,
          properties: spec.properties ?? [],
          range: spec.range ? 'ranged' : 'melee',
          normalRange: spec.range?.normal ?? 0,
          longRange: spec.range?.long ?? 0,
        },
      },
    }),
  });
}

// --- Simple melee + simple ranged weapons (the SRD's full simple-weapon
// set — 14 items, Monk-shaped scale for the large-category fixture) ---

const CLUB = weaponItem({
  id: 'club',
  name: 'Club',
  weapon: Weapon.CLUB,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d4',
  damageType: DamageType.BLUDGEONING,
  properties: [WeaponProperty.LIGHT],
  weightLb: 2,
  costGp: 0.1,
});

const DAGGER = weaponItem({
  id: 'dagger',
  name: 'Dagger',
  weapon: Weapon.DAGGER,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d4',
  damageType: DamageType.PIERCING,
  properties: [
    WeaponProperty.FINESSE,
    WeaponProperty.LIGHT,
    WeaponProperty.THROWN,
  ],
  range: { normal: 20, long: 60 },
  weightLb: 1,
  costGp: 2,
});

const GREATCLUB = weaponItem({
  id: 'greatclub',
  name: 'Greatclub',
  weapon: Weapon.GREATCLUB,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d8',
  damageType: DamageType.BLUDGEONING,
  properties: [WeaponProperty.TWO_HANDED],
  weightLb: 10,
  costGp: 0.2,
});

const HANDAXE = weaponItem({
  id: 'handaxe',
  name: 'Handaxe',
  weapon: Weapon.HANDAXE,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d6',
  damageType: DamageType.SLASHING,
  properties: [WeaponProperty.LIGHT, WeaponProperty.THROWN],
  range: { normal: 20, long: 60 },
  weightLb: 2,
  costGp: 5,
});

const JAVELIN = weaponItem({
  id: 'javelin',
  name: 'Javelin',
  weapon: Weapon.JAVELIN,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d6',
  damageType: DamageType.PIERCING,
  properties: [WeaponProperty.THROWN],
  range: { normal: 30, long: 120 },
  weightLb: 2,
  costGp: 0.5,
});

const LIGHT_HAMMER = weaponItem({
  id: 'light-hammer',
  name: 'Light Hammer',
  weapon: Weapon.LIGHT_HAMMER,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d4',
  damageType: DamageType.BLUDGEONING,
  properties: [WeaponProperty.LIGHT, WeaponProperty.THROWN],
  range: { normal: 20, long: 60 },
  weightLb: 2,
  costGp: 2,
});

const MACE = weaponItem({
  id: 'mace',
  name: 'Mace',
  weapon: Weapon.MACE,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d6',
  damageType: DamageType.BLUDGEONING,
  weightLb: 4,
  costGp: 5,
});

const QUARTERSTAFF = weaponItem({
  id: 'quarterstaff',
  name: 'Quarterstaff',
  weapon: Weapon.QUARTERSTAFF,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d6',
  damageType: DamageType.BLUDGEONING,
  properties: [WeaponProperty.VERSATILE],
  weightLb: 4,
  costGp: 0.2,
});

const SICKLE = weaponItem({
  id: 'sickle',
  name: 'Sickle',
  weapon: Weapon.SICKLE,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d4',
  damageType: DamageType.SLASHING,
  properties: [WeaponProperty.LIGHT],
  weightLb: 2,
  costGp: 1,
});

const SPEAR = weaponItem({
  id: 'spear',
  name: 'Spear',
  weapon: Weapon.SPEAR,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d6',
  damageType: DamageType.PIERCING,
  properties: [WeaponProperty.THROWN, WeaponProperty.VERSATILE],
  range: { normal: 20, long: 60 },
  weightLb: 3,
  costGp: 1,
});

const LIGHT_CROSSBOW = weaponItem({
  id: 'light-crossbow',
  name: 'Crossbow, Light',
  weapon: Weapon.LIGHT_CROSSBOW,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d8',
  damageType: DamageType.PIERCING,
  properties: [
    WeaponProperty.AMMUNITION,
    WeaponProperty.LOADING,
    WeaponProperty.TWO_HANDED,
  ],
  range: { normal: 80, long: 320 },
  weightLb: 5,
  costGp: 25,
});

const DART = weaponItem({
  id: 'dart',
  name: 'Dart',
  weapon: Weapon.DART,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d4',
  damageType: DamageType.PIERCING,
  properties: [WeaponProperty.FINESSE, WeaponProperty.THROWN],
  range: { normal: 20, long: 60 },
  weightLb: 0.25,
  costGp: 0.05,
});

const SHORTBOW = weaponItem({
  id: 'shortbow',
  name: 'Shortbow',
  weapon: Weapon.SHORTBOW,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d6',
  damageType: DamageType.PIERCING,
  properties: [WeaponProperty.AMMUNITION, WeaponProperty.TWO_HANDED],
  range: { normal: 80, long: 320 },
  weightLb: 2,
  costGp: 25,
});

const SLING = weaponItem({
  id: 'sling',
  name: 'Sling',
  weapon: Weapon.SLING,
  category: WeaponCategory.SIMPLE,
  damageDice: '1d4',
  damageType: DamageType.BLUDGEONING,
  properties: [WeaponProperty.AMMUNITION],
  range: { normal: 30, long: 120 },
  weightLb: 0,
  costGp: 0.1,
});

/** Small category — "Choose a simple melee weapon", choose 1. */
export const SIMPLE_CATEGORY_OPTIONS: EquipmentItem[] = [
  CLUB,
  DAGGER,
  MACE,
  QUARTERSTAFF,
];

/**
 * Large category — the full SRD simple-weapon set (simple melee + simple
 * ranged, 14 items). This is the "Monk-shaped" scale plan.md calls for: not
 * a hand-picked shortlist, but the actual full-registry count a real
 * toolkit resolution would produce for a "simple weapons" category — chosen
 * here to exercise scrolling/layout, not to assert real eligibility (the
 * web fixture does not — and must not — stand in for the toolkit's
 * validator).
 */
export const LARGE_CATEGORY_OPTIONS: EquipmentItem[] = [
  CLUB,
  DAGGER,
  GREATCLUB,
  HANDAXE,
  JAVELIN,
  LIGHT_HAMMER,
  MACE,
  QUARTERSTAFF,
  SICKLE,
  SPEAR,
  LIGHT_CROSSBOW,
  DART,
  SHORTBOW,
  SLING,
];

// --- Martial weapons for the multi-select fixture ---

const LONGSWORD = weaponItem({
  id: 'longsword',
  name: 'Longsword',
  weapon: Weapon.LONGSWORD,
  category: WeaponCategory.MARTIAL,
  damageDice: '1d8',
  damageType: DamageType.SLASHING,
  properties: [WeaponProperty.VERSATILE],
  weightLb: 3,
  costGp: 15,
});

const RAPIER = weaponItem({
  id: 'rapier',
  name: 'Rapier',
  weapon: Weapon.RAPIER,
  category: WeaponCategory.MARTIAL,
  damageDice: '1d8',
  damageType: DamageType.PIERCING,
  properties: [WeaponProperty.FINESSE],
  weightLb: 2,
  costGp: 25,
});

const SCIMITAR = weaponItem({
  id: 'scimitar',
  name: 'Scimitar',
  weapon: Weapon.SCIMITAR,
  category: WeaponCategory.MARTIAL,
  damageDice: '1d6',
  damageType: DamageType.SLASHING,
  properties: [WeaponProperty.FINESSE, WeaponProperty.LIGHT],
  weightLb: 3,
  costGp: 25,
});

const WARHAMMER = weaponItem({
  id: 'warhammer',
  name: 'Warhammer',
  weapon: Weapon.WARHAMMER,
  category: WeaponCategory.MARTIAL,
  damageDice: '1d8',
  damageType: DamageType.BLUDGEONING,
  properties: [WeaponProperty.VERSATILE],
  weightLb: 2,
  costGp: 15,
});

/** Multi-select category — "Choose two martial melee weapons", choose 2. */
export const MULTI_SELECT_CATEGORY_OPTIONS: EquipmentItem[] = [
  LONGSWORD,
  RAPIER,
  SCIMITAR,
  WARHAMMER,
];

export interface CategoryChoiceFixture {
  id: string;
  label: string;
  chooseCount: number;
  options: EquipmentItem[];
}

/** The three cases plan.md's Phase 1 fixture set is required to cover. */
export const CATEGORY_CHOICE_FIXTURES: CategoryChoiceFixture[] = [
  {
    id: 'simple',
    label: 'Choose a simple melee weapon',
    chooseCount: 1,
    options: SIMPLE_CATEGORY_OPTIONS,
  },
  {
    id: 'large-monk-shaped',
    label: 'Choose a simple weapon (Monk-shaped, full simple-weapon set)',
    chooseCount: 1,
    options: LARGE_CATEGORY_OPTIONS,
  },
  {
    id: 'multi-select',
    label: 'Choose two martial melee weapons',
    chooseCount: 2,
    options: MULTI_SELECT_CATEGORY_OPTIONS,
  },
  {
    id: 'empty',
    label: 'Choose a tool proficiency (fixture: none available)',
    chooseCount: 1,
    options: [],
  },
];
