/**
 * EquipmentCategoryDropdown tests. Test-only fixtures model the enriched
 * authoritative `EquipmentCategoryChoice.options` entries consumed by the
 * production category slot.
 */
import { create } from '@bufbuild/protobuf';
import {
  EquipmentItemSchema,
  type EquipmentItem,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  ArmorCategory,
  DamageType,
  WeaponCategory,
  WeaponProperty,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import type { Equipment } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/equipment_types_pb';
import { EquipmentSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/equipment_types_pb';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EquipmentCategoryDropdown } from './EquipmentCategoryDropdown';

const CLUB: Equipment = create(EquipmentSchema, {
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

const DAGGER: Equipment = create(EquipmentSchema, {
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

const LEATHER_ARMOR: Equipment = create(EquipmentSchema, {
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

const item = (selectionId: string, equipmentDetail: Equipment): EquipmentItem =>
  create(EquipmentItemSchema, { selectionId, quantity: 1, equipmentDetail });

const OPTIONS = [item('club', CLUB), item('dagger', DAGGER)];
const LEATHER_OPTION = item('leather', LEATHER_ARMOR);

describe('EquipmentCategoryDropdown', () => {
  it('renders a compact closed trigger, not a full options list, before opening', () => {
    render(
      <EquipmentCategoryDropdown
        id="test-dropdown"
        ariaLabel="Choose item"
        options={OPTIONS}
        selectedId={null}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(screen.queryByRole('listbox')).toBeNull();
    // The rich content (damage line) must not be visible while closed.
    expect(screen.queryByText('1d4 piercing', { exact: false })).toBeNull();
  });

  it('reveals rich EquipmentCard content for every weapon option once opened', () => {
    render(
      <EquipmentCategoryDropdown
        id="test-dropdown"
        ariaLabel="Choose item"
        options={OPTIONS}
        selectedId={null}
        onChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));

    const listbox = screen.getByRole('listbox');
    within(listbox).getByText('Club');
    within(listbox).getByText('Dagger');
    // Rich weapon detail (damage dice/type), not just the name — this is
    // the discriminating assertion: a plain <select> could never render
    // this inside its (native, unstylable) option list.
    within(listbox).getByText('1d4 bludgeoning', { exact: false });
    within(listbox).getByText('1d4 piercing', { exact: false });
    within(listbox).getByText('Range: 20/60 ft');
    expect(within(listbox).getAllByRole('option')).toHaveLength(2);
  });

  it('reveals rich armor detail (AC/dex/category) once opened', () => {
    render(
      <EquipmentCategoryDropdown
        id="test-dropdown"
        ariaLabel="Choose armor"
        options={[LEATHER_OPTION]}
        selectedId={null}
        onChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));
    const listbox = screen.getByRole('listbox');
    within(listbox).getByText('AC 11 + Dex', { exact: false });
    within(listbox).getByText('Light', { exact: false });
  });

  it('selects an option on click, reports it, and closes the popup', () => {
    const onChange = vi.fn();
    render(
      <EquipmentCategoryDropdown
        id="test-dropdown"
        ariaLabel="Choose item"
        options={OPTIONS}
        selectedId={null}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByTestId('test-dropdown-option-dagger'));

    expect(onChange).toHaveBeenCalledWith('dagger');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows the selected item name in the closed trigger', () => {
    render(
      <EquipmentCategoryDropdown
        id="test-dropdown"
        ariaLabel="Choose item"
        options={OPTIONS}
        selectedId="dagger"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox').textContent).toMatch(/Dagger/);
  });

  it('opens the listbox from a closed trigger on ArrowUp with its accessible name intact', () => {
    render(
      <EquipmentCategoryDropdown
        id="test-dropdown"
        ariaLabel="Choose item"
        options={OPTIONS}
        selectedId={null}
        onChange={vi.fn()}
      />
    );

    const trigger = screen.getByRole('combobox', { name: 'Choose item' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox', { name: 'Choose item' })).toBeTruthy();
    // APG select-only combobox behavior: ArrowUp opens at the last option.
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      'test-dropdown-option-dagger'
    );
  });

  it('supports ArrowDown/Enter keyboard selection without a mouse', () => {
    const onChange = vi.fn();
    render(
      <EquipmentCategoryDropdown
        id="test-dropdown"
        ariaLabel="Choose item"
        options={OPTIONS}
        selectedId={null}
        onChange={onChange}
      />
    );

    const trigger = screen.getByRole('combobox');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // opens, activates first
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // move to dagger
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('dagger');
  });

  it('closes on Escape without changing the selection', () => {
    const onChange = vi.fn();
    render(
      <EquipmentCategoryDropdown
        id="test-dropdown"
        ariaLabel="Choose item"
        options={OPTIONS}
        selectedId={null}
        onChange={onChange}
      />
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a loading state and does not open when isLoading', () => {
    render(
      <EquipmentCategoryDropdown
        id="test-dropdown"
        ariaLabel="Choose item"
        options={[]}
        isLoading
        selectedId={null}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox').textContent).toMatch(/loading/i);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows an empty state when there are no options', () => {
    render(
      <EquipmentCategoryDropdown
        id="test-dropdown"
        ariaLabel="Choose item"
        options={[]}
        selectedId={null}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox').textContent).toMatch(
      /no options available/i
    );
  });

  it('surfaces an error state with a retry action', () => {
    const onRetry = vi.fn();
    render(
      <EquipmentCategoryDropdown
        id="test-dropdown"
        ariaLabel="Choose item"
        options={[]}
        error={new Error('network down')}
        onRetry={onRetry}
        selectedId={null}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('alert').textContent).toMatch(/network down/);
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });
});
