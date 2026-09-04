import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { OutfitColorControls } from './OutfitColorControls';

it('shows provider defaults without manufacturing overrides, retains explicit black, and clears both on reset', () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <OutfitColorControls
      classRefId="fighter"
      outfit={undefined}
      onChange={onChange}
    />
  );

  expect(
    (screen.getByLabelText('Gear primary color') as HTMLInputElement).value
  ).toBe('#49667e');
  expect(
    (screen.getByLabelText('Gear secondary color') as HTMLInputElement).value
  ).toBe('#d1a44c');

  fireEvent.change(screen.getByLabelText('Gear primary color'), {
    target: { value: '#000000' },
  });
  expect(onChange).toHaveBeenLastCalledWith({ primaryColorSrgb: 0 });

  rerender(
    <OutfitColorControls
      classRefId="fighter"
      outfit={{ primaryColorSrgb: 0, secondaryColorSrgb: 0x123456 } as never}
      onChange={onChange}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reset gear colors' }));
  expect(onChange).toHaveBeenLastCalledWith(undefined);
});
