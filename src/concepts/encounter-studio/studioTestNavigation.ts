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
  if (name === 'Inspector' || name === 'Size') {
    options();
    return screen.getByRole('region', { name: 'Inspector' });
  }
  // The Regions home retired (rpg-project#577): regions are on Build, listed
  // beside Layout, and a region's settings are its label's inspector view.
  if (name === 'Regions') return button('Build');
  if (name === 'Regions & lighting') return toggle();
  const room = /^Edit region (.+)$/.exec(name);
  const list = screen.queryByRole('list', { name: 'Room list' });
  if (room && list) {
    const text = room[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return within(list).getByRole('button', {
      name: new RegExp(`^Room ${text},`),
    });
  }
  return button(name);
}
