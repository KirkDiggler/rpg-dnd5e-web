import { fireEvent, screen, within } from '@testing-library/react';

/** Legacy gesture fixtures name an action, not its old toolbar position.
 * Navigate the real new home/options controls before returning that action. */
export function studioButton(name: string): HTMLElement {
  const button = (label: string): HTMLElement =>
    screen.getByRole('button', { name: label });
  const toggle = (): HTMLElement =>
    screen.queryByRole('button', { name: 'Inspector (N)' }) ??
    button('Options (N)');
  const options = (): void => {
    if (toggle().getAttribute('aria-expanded') !== 'true')
      fireEvent.click(toggle());
  };
  // Tables is an Encounter-home section; Cast is the home's default.
  if (name === 'Tables') {
    const home = button('Encounter');
    if (home.getAttribute('aria-pressed') !== 'true') fireEvent.click(home);
    return within(
      screen.getByRole('navigation', { name: 'Encounter tools' })
    ).getByRole('button', { name: 'Tables' });
  }
  if (name === 'Options (N)' || name === 'Inspector (N)') return toggle();
  // Wall, Door and Note are Layout tools; their options show in the inspector.
  if (name === 'Wall' || name === 'Door' || name === 'Label') {
    fireEvent.click(button('Build'));
    return button(name === 'Label' ? 'Note' : name);
  }
  if (name === 'Arrange' || name === 'Size') {
    options();
    if (button('Regions').getAttribute('aria-pressed') === 'true')
      return button('Regions & lighting');
    return screen.getByRole('region', { name: 'Inspector' });
  }
  return button(name);
}
