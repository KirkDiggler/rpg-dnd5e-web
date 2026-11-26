import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MaterialImagePicker } from './MaterialImagePicker';
import type { InventoryImage } from './materialRecipe';

const images: InventoryImage[] = [
  {
    path: 'Atlas/01_A.png',
    sha256: 'a'.repeat(64),
    bytes: 10,
    format: 'png',
    url: '/original-a.png',
  },
  {
    path: 'Other/Roof_Normal.tga',
    sha256: 'b'.repeat(64),
    bytes: 20,
    format: 'tga',
    preview: { url: '/browser-b.png', sha256: 'c'.repeat(64), format: 'png' },
  },
];
afterEach(cleanup);
function setup() {
  const change = vi.fn();
  render(
    <MaterialImagePicker
      ariaLabel="Base color image"
      value="Atlas/01_A.png"
      images={images}
      allowNone
      noneLabel="Neutral solid"
      onChange={change}
    />
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Browse base color image' })
  );
  return change;
}
describe('experimental source image browser', () => {
  it('offers unrelated map roles and returns source identity, not its derivative URL', () => {
    const change = setup();
    const other = screen.getByRole('button', {
      name: 'Choose Other/Roof_Normal.tga',
    });
    expect(other.querySelector('img')).toHaveAttribute('src', '/browser-b.png');
    fireEvent.click(other);
    expect(change).toHaveBeenCalledExactlyOnceWith('Other/Roof_Normal.tga');
  });
  it('filters filename and folder without altering the current choice', () => {
    const change = setup();
    fireEvent.change(screen.getByLabelText('Search base color image'), {
      target: { value: 'other/' },
    });
    expect(
      screen.queryByRole('button', { name: 'Choose Atlas/01_A.png' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Choose Other/Roof_Normal.tga' })
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Folder for base color image'), {
      target: { value: 'Atlas' },
    });
    expect(screen.getByText(/No images match/)).toBeVisible();
    expect(screen.getByLabelText('Base color image')).toHaveValue(
      'Atlas/01_A.png'
    );
    expect(change).not.toHaveBeenCalled();
  });
  it('shows thumbnail failure honestly without forbidding experimentation', () => {
    const change = setup();
    const other = screen.getByRole('button', {
      name: 'Choose Other/Roof_Normal.tga',
    });
    fireEvent.error(other.querySelector('img')!);
    expect(within(other).getByText('Thumbnail unavailable')).toBeVisible();
    fireEvent.click(other);
    expect(change).toHaveBeenCalledWith('Other/Roof_Normal.tga');
  });
  it('retains the independent explicit None choice', () => {
    const change = setup();
    fireEvent.change(screen.getByLabelText('Base color image'), {
      target: { value: '' },
    });
    expect(change).toHaveBeenCalledExactlyOnceWith('');
  });
});
