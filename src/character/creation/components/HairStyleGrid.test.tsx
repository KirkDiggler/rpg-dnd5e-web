import { CHARACTER_CUSTOMIZATION_CATALOG } from '@/generated/characterCustomizationCatalog';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HairStyleGrid } from './HairStyleGrid';

const dwarf = CHARACTER_CUSTOMIZATION_CATALOG.profiles.dwarf;

describe('HairStyleGrid', () => {
  it.each([
    ['scalp', 'Scalp hair', 40],
    ['facialHair', 'Facial hair', 20],
  ] as const)(
    'renders Default, None, and every generated %s option as buttons',
    (slot, label, expectedCount) => {
      render(
        <HairStyleGrid
          profile={dwarf}
          slot={slot}
          selection={{ kind: 'default' }}
          onChange={vi.fn()}
        />
      );

      const group = screen.getByRole('group', { name: label });
      const buttons = within(group).getAllByRole('button');
      expect(buttons).toHaveLength(expectedCount);
      expect(buttons[0]?.textContent).toContain('Default');
      expect(buttons[1]?.textContent).toContain('None');
      expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
      expect(buttons.every((button) => button.tagName === 'BUTTON')).toBe(true);
    }
  );

  it('exposes generated labels, lazy thumbnails, selection state, and native focus', () => {
    const onChange = vi.fn();
    render(
      <HairStyleGrid
        profile={dwarf}
        slot="scalp"
        selection={{
          kind: 'style',
          styleRef: 'modular-fantasy-hero:hair:04',
        }}
        onChange={onChange}
      />
    );

    const selected = screen.getByRole('button', { name: 'Hair 04' });
    const next = screen.getByRole('button', { name: 'Hair 38' });
    const thumbnail = next.querySelector('img');

    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(next.getAttribute('aria-pressed')).toBe('false');
    expect(thumbnail?.getAttribute('loading')).toBe('lazy');
    expect(thumbnail?.getAttribute('src')).toBe(
      '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-38.png'
    );

    next.focus();
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'style',
      styleRef: 'modular-fantasy-hero:hair:38',
    });

    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'none' });
  });

  it('uses the selected profile thumbnails rather than borrowing Dwarf bytes', () => {
    render(
      <HairStyleGrid
        profile={CHARACTER_CUSTOMIZATION_CATALOG.profiles.human}
        slot="scalp"
        selection={{ kind: 'default' }}
        onChange={vi.fn()}
      />
    );

    expect(
      screen
        .getByRole('button', { name: 'Hair 38' })
        .querySelector('img')
        ?.getAttribute('src')
    ).toBe(
      '/models/synty/characters/customization/human-v1/thumbnails/scalp/hair-38.png'
    );
  });

  it('surfaces an invalid arm-less persisted selection instead of presenting Default', () => {
    render(
      <HairStyleGrid
        profile={dwarf}
        slot="scalp"
        selection={{ kind: 'invalid' }}
        onChange={vi.fn()}
      />
    );

    const group = screen.getByRole('group', { name: 'Scalp hair' });
    expect(within(group).getByRole('alert').textContent).toContain(
      'Current selection is unavailable. Choose a replacement.'
    );
    expect(
      within(group)
        .getAllByRole('button')
        .every((button) => button.getAttribute('aria-pressed') === 'false')
    ).toBe(true);
  });

  it('replaces a failed provider thumbnail with its visible label', () => {
    render(
      <HairStyleGrid
        profile={dwarf}
        slot="facialHair"
        selection={{ kind: 'default' }}
        onChange={vi.fn()}
      />
    );

    const option = screen.getByRole('button', { name: 'Facial Hair 01' });
    const thumbnail = option.querySelector('img');
    expect(thumbnail).not.toBeNull();

    fireEvent.error(thumbnail!);

    expect(option.querySelector('img')).toBeNull();
    expect(option.textContent).toContain('Facial Hair 01 preview unavailable');
  });
});
