/**
 * ONE LIST-AND-DETAIL PIECE (rpg-project#984): two panes that scroll on
 * their own, the chosen row kept visible and revealable by key, the detail
 * in view beside it; stacked below a width, the detail follows the list.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevealProvider } from './reveal';
import { StudioListDetail, type ListDetailRow } from './StudioListDetail';
import { useReveal, type RevealKey } from './useReveal';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const rows: ListDetailRow[] = ['alpha', 'bravo', 'charlie'].map((id) => ({
  key: { kind: 'fact', id },
  name: id,
  summary: `${id} summary`,
}));

let revealNow: (key: RevealKey) => void = () => {};
function Harness({ onSelect = vi.fn() }: { onSelect?: (id: string) => void }) {
  const [selected, setSelected] = useState<string | null>('alpha');
  revealNow = useReveal();
  return (
    <StudioListDetail
      label="Facts"
      groups={[{ title: 'Facts', rows }]}
      selected={selected ? { kind: 'fact', id: selected } : null}
      onSelect={(key) => {
        setSelected(key.id);
        onSelect(key.id);
      }}
      detailLabel="Thread"
      detail={selected ? <p>{`detail of ${selected}`}</p> : null}
    />
  );
}

const list = () => screen.getByRole('list', { name: 'Facts' });
const row = (name: string) =>
  within(list()).getByRole('button', { name: new RegExp(`^${name}`) });

describe('StudioListDetail', () => {
  it('rows are name and one line of summary; choosing one shows its detail beside the list', () => {
    render(
      <RevealProvider>
        <Harness />
      </RevealProvider>
    );
    expect(row('alpha').textContent).toBe('alpha · alpha summary');
    expect(row('alpha').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(row('charlie'));
    expect(row('charlie').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('region', { name: 'Thread' }).textContent).toBe(
      'detail of charlie'
    );
  });

  it('Up and Down move the selection; Enter and Right go to the detail', () => {
    const onSelect = vi.fn();
    render(
      <RevealProvider>
        <Harness onSelect={onSelect} />
      </RevealProvider>
    );
    row('alpha').focus();
    fireEvent.keyDown(row('alpha'), { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith('bravo');
    expect(document.activeElement).toBe(row('bravo'));
    fireEvent.keyDown(row('bravo'), { key: 'ArrowUp' });
    expect(onSelect).toHaveBeenLastCalledWith('alpha');
    fireEvent.keyDown(row('alpha'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(
      screen.getByRole('region', { name: 'Thread' })
    );
  });

  it('each row is revealable by its key, and the two panes scroll on their own', () => {
    render(
      <RevealProvider>
        <Harness />
      </RevealProvider>
    );
    const listPane = list().closest('.es-ld-list-pane') as HTMLElement;
    listPane.scrollTo = vi.fn();
    act(() => revealNow({ kind: 'fact', id: 'charlie' }));
    expect(listPane.scrollTo).toHaveBeenCalled();
    expect(row('charlie').closest('li')!.hasAttribute('data-revealed')).toBe(
      true
    );
    expect(
      screen
        .getByRole('region', { name: 'Thread' })
        .classList.contains('es-ld-detail-pane')
    ).toBe(true);
  });

  it('below a width the panes stack, and choosing a row reveals the detail after the list', () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('max-width'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    );
    render(
      <RevealProvider>
        <Harness />
      </RevealProvider>
    );
    expect(
      list().closest('.es-list-detail')!.hasAttribute('data-stacked')
    ).toBe(true);
    fireEvent.click(row('bravo'));
    expect(
      screen
        .getByRole('region', { name: 'Thread' })
        .hasAttribute('data-revealed')
    ).toBe(true);
  });
});
