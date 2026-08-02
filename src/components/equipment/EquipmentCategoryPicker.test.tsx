import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  LARGE_CATEGORY_OPTIONS,
  MULTI_SELECT_CATEGORY_OPTIONS,
  SIMPLE_CATEGORY_OPTIONS,
} from '../../concepts/equipment-category-picker/fixtures';
import { EquipmentCategoryPicker } from './EquipmentCategoryPicker';

describe('EquipmentCategoryPicker', () => {
  it('renders an accessible listbox with an EquipmentCard per option', () => {
    render(
      <EquipmentCategoryPicker
        label="Choose a simple melee weapon"
        chooseCount={1}
        options={SIMPLE_CATEGORY_OPTIONS}
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );

    const listbox = screen.getByRole('listbox', {
      name: 'Choose a simple melee weapon',
    });
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(SIMPLE_CATEGORY_OPTIONS.length);

    // EquipmentCard content (weapon name + damage line) renders per option.
    within(listbox).getByText('Club');
    within(listbox).getByText('Dagger');
    within(listbox).getByText('1d4 piercing', { exact: false });
  });

  it('is not aria-multiselectable for a chooseCount=1 category', () => {
    render(
      <EquipmentCategoryPicker
        label="Choose a simple melee weapon"
        chooseCount={1}
        options={SIMPLE_CATEGORY_OPTIONS}
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );
    const listbox = screen.getByRole('listbox');
    expect(listbox.getAttribute('aria-multiselectable')).toBe('false');
  });

  it('is aria-multiselectable for a chooseCount>1 category', () => {
    render(
      <EquipmentCategoryPicker
        label="Choose two martial melee weapons"
        chooseCount={2}
        options={MULTI_SELECT_CATEGORY_OPTIONS}
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );
    const listbox = screen.getByRole('listbox');
    expect(listbox.getAttribute('aria-multiselectable')).toBe('true');
  });

  it('shows a loading state and renders no options while isLoading', () => {
    render(
      <EquipmentCategoryPicker
        label="Choose a simple melee weapon"
        chooseCount={1}
        options={SIMPLE_CATEGORY_OPTIONS}
        isLoading
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('status').textContent).toMatch(/loading/i);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows an empty state when there are no options', () => {
    render(
      <EquipmentCategoryPicker
        label="Choose a tool proficiency"
        chooseCount={1}
        options={[]}
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('status').textContent).toMatch(/no options/i);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('selects a single option on click for a chooseCount=1 category', () => {
    const onChange = vi.fn();
    render(
      <EquipmentCategoryPicker
        label="Choose a simple melee weapon"
        chooseCount={1}
        options={SIMPLE_CATEGORY_OPTIONS}
        selectedIds={[]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId('equipment-category-option-dagger'));
    expect(onChange).toHaveBeenCalledWith(['dagger']);
  });

  it('replaces the single selection when a chooseCount=1 category picks another option', () => {
    const onChange = vi.fn();
    render(
      <EquipmentCategoryPicker
        label="Choose a simple melee weapon"
        chooseCount={1}
        options={SIMPLE_CATEGORY_OPTIONS}
        selectedIds={['dagger']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId('equipment-category-option-mace'));
    expect(onChange).toHaveBeenCalledWith(['mace']);
  });

  it('respects choose_count: allows selecting up to the limit and blocks further picks', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EquipmentCategoryPicker
        label="Choose two martial melee weapons"
        chooseCount={2}
        options={MULTI_SELECT_CATEGORY_OPTIONS}
        selectedIds={[]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByTestId('equipment-category-option-longsword'));
    expect(onChange).toHaveBeenCalledWith(['longsword']);

    rerender(
      <EquipmentCategoryPicker
        label="Choose two martial melee weapons"
        chooseCount={2}
        options={MULTI_SELECT_CATEGORY_OPTIONS}
        selectedIds={['longsword']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId('equipment-category-option-rapier'));
    expect(onChange).toHaveBeenCalledWith(['longsword', 'rapier']);

    // At capacity now — a third, different option must not be added.
    onChange.mockClear();
    rerender(
      <EquipmentCategoryPicker
        label="Choose two martial melee weapons"
        chooseCount={2}
        options={MULTI_SELECT_CATEGORY_OPTIONS}
        selectedIds={['longsword', 'rapier']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId('equipment-category-option-scimitar'));
    expect(onChange).not.toHaveBeenCalled();

    // Deselecting one frees a slot.
    fireEvent.click(screen.getByTestId('equipment-category-option-longsword'));
    expect(onChange).toHaveBeenCalledWith(['rapier']);
  });

  it('marks selected options aria-selected=true', () => {
    render(
      <EquipmentCategoryPicker
        label="Choose a simple melee weapon"
        chooseCount={1}
        options={SIMPLE_CATEGORY_OPTIONS}
        selectedIds={['dagger']}
        onChange={vi.fn()}
      />
    );
    expect(
      screen
        .getByTestId('equipment-category-option-dagger')
        .getAttribute('aria-selected')
    ).toBe('true');
    expect(
      screen
        .getByTestId('equipment-category-option-club')
        .getAttribute('aria-selected')
    ).toBe('false');
  });

  it('supports ArrowDown/ArrowUp roving-tabindex keyboard navigation', () => {
    render(
      <EquipmentCategoryPicker
        label="Choose a simple melee weapon"
        chooseCount={1}
        options={SIMPLE_CATEGORY_OPTIONS}
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );
    const listbox = screen.getByRole('listbox');
    const first = screen.getByTestId('equipment-category-option-club');
    const second = screen.getByTestId('equipment-category-option-dagger');

    expect(first.getAttribute('tabindex')).toBe('0');
    expect(second.getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(second.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    expect(first.getAttribute('tabindex')).toBe('0');
  });

  it('supports Home/End to jump to the first/last option', () => {
    render(
      <EquipmentCategoryPicker
        label="Choose a simple weapon"
        chooseCount={1}
        options={LARGE_CATEGORY_OPTIONS}
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );
    const listbox = screen.getByRole('listbox');
    const last = screen.getByTestId(
      `equipment-category-option-${
        LARGE_CATEGORY_OPTIONS[LARGE_CATEGORY_OPTIONS.length - 1].selectionId
      }`
    );
    const first = screen.getByTestId(
      `equipment-category-option-${LARGE_CATEGORY_OPTIONS[0].selectionId}`
    );

    fireEvent.keyDown(listbox, { key: 'End' });
    expect(last.getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(listbox, { key: 'Home' });
    expect(first.getAttribute('tabindex')).toBe('0');
  });

  it('toggles selection with Enter/Space on the active option', () => {
    const onChange = vi.fn();
    render(
      <EquipmentCategoryPicker
        label="Choose a simple melee weapon"
        chooseCount={1}
        options={SIMPLE_CATEGORY_OPTIONS}
        selectedIds={[]}
        onChange={onChange}
      />
    );
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['club']);
  });

  it('renders every option in a Monk-shaped large category (scroll case, no truncation)', () => {
    render(
      <EquipmentCategoryPicker
        label="Choose a simple weapon"
        chooseCount={1}
        options={LARGE_CATEGORY_OPTIONS}
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getAllByRole('option')).toHaveLength(
      LARGE_CATEGORY_OPTIONS.length
    );
  });

  it('falls back to a plain row when equipmentDetail is absent (backward compat)', () => {
    render(
      <EquipmentCategoryPicker
        label="Choose an item"
        chooseCount={1}
        options={[
          {
            $typeName: 'dnd5e.api.v1alpha1.EquipmentItem',
            selectionId: 'mystery-item',
            quantity: 1,
            typeHint: { case: undefined },
          },
        ]}
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );
    screen.getByText('mystery-item');
  });
});
