/**
 * EquipmentBundleChoice tests (rpg-dnd5e-web#670). Exercises the actual
 * production category-choice path: `EquipmentBundleChoice` ->
 * `useListEquipmentByType` -> `characterClient.listEquipmentByType` (the
 * live API path this component has always used — `EquipmentCategoryChoice.
 * options` is not consumed here). `characterClient` is mocked at the
 * transport boundary; everything above it, including the new
 * `EquipmentCategoryDropdown`, runs for real.
 */
import { create } from '@bufbuild/protobuf';
import type { ListEquipmentByTypeRequest } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ListEquipmentByTypeResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceCategory,
  ChoiceSchema,
  EquipmentBundleSchema,
  EquipmentCategoryChoiceSchema,
  EquipmentOptionsSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  ArmorCategory,
  DamageType,
  WeaponCategory,
  WeaponProperty,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { EquipmentSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/equipment_types_pb';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EquipmentBundleChoice } from './EquipmentBundleChoice';

const CLUB = create(EquipmentSchema, {
  id: 'club',
  name: 'Club',
  equipmentData: {
    case: 'weaponData',
    value: {
      weaponCategory: WeaponCategory.SIMPLE,
      damageDice: '1d4',
      damageType: DamageType.BLUDGEONING,
      properties: [WeaponProperty.LIGHT],
    },
  },
});

const DAGGER = create(EquipmentSchema, {
  id: 'dagger',
  name: 'Dagger',
  equipmentData: {
    case: 'weaponData',
    value: {
      weaponCategory: WeaponCategory.SIMPLE,
      damageDice: '1d4',
      damageType: DamageType.PIERCING,
      properties: [WeaponProperty.FINESSE, WeaponProperty.LIGHT],
      normalRange: 20,
      longRange: 60,
    },
  },
});

const LEATHER_ARMOR = create(EquipmentSchema, {
  id: 'leather',
  name: 'Leather Armor',
  equipmentData: {
    case: 'armorData',
    value: {
      armorCategory: ArmorCategory.LIGHT,
      baseAc: 11,
      dexBonus: true,
      hasDexLimit: false,
    },
  },
});

const hoisted = vi.hoisted(() => ({
  listEquipmentByTypeFn:
    vi.fn<(req: ListEquipmentByTypeRequest) => Promise<unknown>>(),
}));

vi.mock('../../api/client', () => ({
  characterClient: {
    listEquipmentByType: hoisted.listEquipmentByTypeFn,
  },
}));

function equipmentResponse(equipment: (typeof CLUB)[]) {
  return create(ListEquipmentByTypeResponseSchema, {
    equipment,
    nextPageToken: '',
    totalSize: equipment.length,
  });
}

function martialMeleeChoice() {
  return create(ChoiceSchema, {
    id: 'fighter-equipment',
    description: 'Choose your equipment',
    choiceType: ChoiceCategory.EQUIPMENT,
    options: {
      case: 'equipmentOptions',
      value: create(EquipmentOptionsSchema, {
        bundles: [
          create(EquipmentBundleSchema, {
            id: 'bundle-a',
            label: 'A weapon',
            items: [],
            categoryChoices: [
              create(EquipmentCategoryChoiceSchema, {
                choose: 1,
                weaponCategories: [WeaponCategory.SIMPLE],
                label: 'Choose a simple weapon',
              }),
            ],
          }),
        ],
      }),
    },
  });
}

function armorChoice() {
  return create(ChoiceSchema, {
    id: 'fighter-armor',
    description: 'Choose your armor',
    choiceType: ChoiceCategory.EQUIPMENT,
    options: {
      case: 'equipmentOptions',
      value: create(EquipmentOptionsSchema, {
        bundles: [
          create(EquipmentBundleSchema, {
            id: 'bundle-armor',
            label: 'Armor',
            items: [],
            categoryChoices: [
              create(EquipmentCategoryChoiceSchema, {
                choose: 1,
                armorCategories: [ArmorCategory.LIGHT],
                label: 'Choose armor',
              }),
            ],
          }),
        ],
      }),
    },
  });
}

describe('EquipmentBundleChoice — production rich dropdown (#670)', () => {
  beforeEach(() => {
    hoisted.listEquipmentByTypeFn.mockReset();
  });

  it('fetches live equipment via useListEquipmentByType (not EquipmentCategoryChoice.options) and shows a compact closed dropdown', async () => {
    hoisted.listEquipmentByTypeFn.mockResolvedValue(
      equipmentResponse([CLUB, DAGGER])
    );

    render(
      <EquipmentBundleChoice
        choice={martialMeleeChoice()}
        onSelectionChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('A weapon'));

    // The category dropdown appears, closed by default — no rich content
    // visible yet, proving "closed" is compact.
    const trigger = await screen.findByRole('combobox');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByText('1d4 piercing', { exact: false })).toBeNull();
    expect(trigger).toBeTruthy();

    expect(hoisted.listEquipmentByTypeFn).toHaveBeenCalled();
  });

  it('shows rich EquipmentCard content (damage dice/type/properties) inside the OPEN dropdown', async () => {
    hoisted.listEquipmentByTypeFn.mockResolvedValue(
      equipmentResponse([CLUB, DAGGER])
    );

    render(
      <EquipmentBundleChoice
        choice={martialMeleeChoice()}
        onSelectionChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('A weapon'));

    const trigger = await screen.findByRole('combobox');
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    within(listbox).getByText('Club');
    within(listbox).getByText('Dagger');
    within(listbox).getByText('1d4 bludgeoning', { exact: false });
    within(listbox).getByText('1d4 piercing', { exact: false });
    within(listbox).getByText('Range: 20/60 ft');
  });

  it('shows rich armor detail (AC/dex/category) inside the OPEN dropdown for an armor category', async () => {
    hoisted.listEquipmentByTypeFn.mockResolvedValue(
      equipmentResponse([LEATHER_ARMOR])
    );

    render(
      <EquipmentBundleChoice
        choice={armorChoice()}
        onSelectionChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Armor'));

    const trigger = await screen.findByRole('combobox');
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    within(listbox).getByText('AC 11 + Dex', { exact: false });
    within(listbox).getByText('Light', { exact: false });
  });

  it('reports the selected Equipment back through onSelectionChange after picking from the open dropdown', async () => {
    hoisted.listEquipmentByTypeFn.mockResolvedValue(
      equipmentResponse([CLUB, DAGGER])
    );
    const onSelectionChange = vi.fn();

    render(
      <EquipmentBundleChoice
        choice={martialMeleeChoice()}
        onSelectionChange={onSelectionChange}
      />
    );
    fireEvent.click(screen.getByText('A weapon'));

    const trigger = await screen.findByRole('combobox');
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Dagger'));

    // Popup closes after selection, and the compact trigger now reflects it.
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox').textContent).toMatch(/Dagger/);

    expect(onSelectionChange).toHaveBeenLastCalledWith(
      'bundle-a',
      new Map([[0, [DAGGER]]])
    );
  });

  it('shows a loading dropdown state while equipment is being fetched', async () => {
    let resolve: (v: unknown) => void = () => {};
    hoisted.listEquipmentByTypeFn.mockImplementation(
      () => new Promise((r) => (resolve = r))
    );

    render(
      <EquipmentBundleChoice
        choice={martialMeleeChoice()}
        onSelectionChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('A weapon'));

    const trigger = await screen.findByRole('combobox');
    expect(trigger.textContent).toMatch(/loading/i);

    resolve(equipmentResponse([CLUB]));
    await screen.findByText(/-- Select item --|Club/);
  });

  it('shows an error state with retry if the equipment fetch fails', async () => {
    hoisted.listEquipmentByTypeFn.mockRejectedValueOnce(
      new Error('unavailable')
    );
    hoisted.listEquipmentByTypeFn.mockResolvedValueOnce(
      equipmentResponse([CLUB])
    );

    render(
      <EquipmentBundleChoice
        choice={martialMeleeChoice()}
        onSelectionChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('A weapon'));

    await screen.findByRole('alert');
    fireEvent.click(screen.getByText('Retry'));

    await screen.findByRole('combobox');
    expect(hoisted.listEquipmentByTypeFn).toHaveBeenCalledTimes(2);
  });
});
