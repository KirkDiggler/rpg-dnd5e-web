import { GENERATED_ITEM_THUMBNAILS } from '@/generated/itemThumbnailCatalog';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { EquipmentConcept } from './EquipmentConcept';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

it('previews the real equipment panel with default published artwork and unchanged equip intent', () => {
  window.history.replaceState({}, '', '/?concept=equipment&thumbnailPreview=1');
  render(<EquipmentConcept />);
  expect(
    screen.getByRole('region', { name: 'Equipment — Sir Aldric' })
  ).toBeInTheDocument();
  expect(
    screen.getByTestId('equip-socket-main_hand').querySelector('img')
  ).toHaveAttribute(
    'src',
    GENERATED_ITEM_THUMBNAILS['dnd5e:item:longsword'].url
  );
  fireEvent.click(screen.getByTestId('inv-dnd5e:item:greatsword'));
  expect(screen.getByTestId('equip-socket-main_hand')).toHaveTextContent(
    'Greatsword'
  );
  expect(
    screen.getByTestId('equip-socket-main_hand').querySelector('img')
  ).toHaveAttribute(
    'src',
    GENERATED_ITEM_THUMBNAILS['dnd5e:item:greatsword'].url
  );
});

it('preserves the ordinary bench and its explicit fixture icons without the preview flag', () => {
  render(<EquipmentConcept />);
  expect(screen.queryByTestId('equipment-popover')).not.toBeInTheDocument();
  expect(screen.getByTestId('intent-log')).toBeInTheDocument();
  expect(
    screen
      .getByTestId('equip-socket-main_hand')
      .querySelector('img')
      ?.getAttribute('src')
  ).toContain('/ui/library/');
});
