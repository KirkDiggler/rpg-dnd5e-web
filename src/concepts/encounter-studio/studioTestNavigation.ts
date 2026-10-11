import { fireEvent, screen } from '@testing-library/react';

/** Legacy gesture fixtures name an action, not its old toolbar position.
 * Navigate the real new home/options controls before returning that action. */
export function studioButton(name: string): HTMLElement {
  const button = (label: string): HTMLElement =>
    screen.getByRole('button', { name: label });
  const options = (): void => {
    if (button('Options (N)').getAttribute('aria-expanded') !== 'true')
      fireEvent.click(button('Options (N)'));
  };
  if (name === 'Tables') return button('Encounter');
  if (name === 'Wall' || name === 'Door' || name === 'Label') {
    fireEvent.click(button('Build'));
    options();
    if (name === 'Label') return button('Notes');
    fireEvent.click(button(name === 'Wall' ? 'Walls' : 'Doors'));
    return button(name === 'Wall' ? 'Draw walls' : 'Place door');
  }
  if (name === 'Arrange') {
    options();
    return button(
      button('Regions').getAttribute('aria-pressed') === 'true'
        ? 'Regions & lighting'
        : 'Arrange'
    );
  }
  return button(name);
}
