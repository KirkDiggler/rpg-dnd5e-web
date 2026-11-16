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

// jsdom has no layout: give the scroll a body to spy on.
HTMLElement.prototype.scrollIntoView ??= function () {};

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
      id="facts"
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

  it('below a width the panes stack; choosing a row brings the rendered detail into view and marks nothing', () => {
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
    const scrolled: string[] = [];
    const into = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(function (this: HTMLElement) {
        scrolled.push(this.textContent ?? '');
      });
    render(
      <RevealProvider>
        <Harness />
      </RevealProvider>
    );
    expect(
      list().closest('.es-list-detail')!.hasAttribute('data-stacked')
    ).toBe(true);
    fireEvent.click(row('bravo'));
    // Scrolled after the detail rendered: it already says bravo.
    expect(scrolled).toEqual(['detail of bravo']);
    expect(
      screen
        .getByRole('region', { name: 'Thread' })
        .hasAttribute('data-revealed')
    ).toBe(false);
    into.mockRestore();
  });

  it('beside each other, choosing a row scrolls nothing and marks nothing', () => {
    const into = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    render(
      <RevealProvider>
        <Harness />
      </RevealProvider>
    );
    fireEvent.click(row('bravo'));
    expect(into).not.toHaveBeenCalled();
    expect(document.querySelector('[data-revealed]')).toBeNull();
    into.mockRestore();
  });

  it('a jump to a row chooses it, so its detail shows', () => {
    const onSelect = vi.fn();
    render(
      <RevealProvider>
        <Harness onSelect={onSelect} />
      </RevealProvider>
    );
    act(() => revealNow({ kind: 'fact', id: 'charlie' }));
    expect(onSelect).toHaveBeenCalledWith('charlie');
    expect(screen.getByRole('region', { name: 'Thread' }).textContent).toBe(
      'detail of charlie'
    );
  });

  it('the list is one Tab stop: only the chosen row is tabbable; Home and End go to the ends', () => {
    const onSelect = vi.fn();
    render(
      <RevealProvider>
        <Harness onSelect={onSelect} />
      </RevealProvider>
    );
    expect(row('alpha').tabIndex).toBe(0);
    expect(row('bravo').tabIndex).toBe(-1);
    expect(row('charlie').tabIndex).toBe(-1);
    row('alpha').focus();
    fireEvent.keyDown(row('alpha'), { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('charlie');
    expect(document.activeElement).toBe(row('charlie'));
    expect(row('charlie').tabIndex).toBe(0);
    expect(row('alpha').tabIndex).toBe(-1);
    fireEvent.keyDown(row('charlie'), { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith('alpha');
    expect(document.activeElement).toBe(row('alpha'));
  });

  it('Escape, or Left at the detail itself, returns focus to the chosen row', () => {
    render(
      <RevealProvider>
        <Harness />
      </RevealProvider>
    );
    const detail = screen.getByRole('region', { name: 'Thread' });
    fireEvent.keyDown(row('alpha'), { key: 'Enter' });
    expect(document.activeElement).toBe(detail);
    fireEvent.keyDown(detail, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(row('alpha'));
    fireEvent.keyDown(row('alpha'), { key: 'ArrowRight' });
    fireEvent.keyDown(detail, { key: 'Escape' });
    expect(document.activeElement).toBe(row('alpha'));
  });

  it('two pieces with the same label keep their own ids', () => {
    render(
      <RevealProvider>
        <StudioListDetail
          id="one"
          label="Same"
          groups={[{ rows }]}
          selected={null}
          onSelect={() => {}}
          detailLabel="One"
          detail={null}
        />
        <StudioListDetail
          id="two"
          label="Same"
          groups={[{ rows: [] }]}
          selected={null}
          onSelect={() => {}}
          detailLabel="Two"
          detail={null}
        />
      </RevealProvider>
    );
    const one = screen.getByRole('region', { name: 'One' });
    const two = screen.getByRole('region', { name: 'Two' });
    expect(one.id).not.toBe(two.id);
    expect(one.id).toContain('one');
  });
});
