/**
 * ONE REVEAL CONTRACT (rpg-project#983): an item registers under a key; a
 * reveal of that key scrolls it within its own scroll container, focuses it
 * when it can be focused, opens a closed disclosure around it and marks it.
 * A reveal of a key nothing owns yet waits for it, then falls back to the
 * nearest registered ancestor and says nothing false.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevealProvider } from './reveal';
import { useReveal, useRevealable, type RevealKey } from './useReveal';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Item({ revealKey, label }: { revealKey: RevealKey; label: string }) {
  const ref = useRevealable(revealKey);
  return (
    <button ref={ref} type="button">
      {label}
    </button>
  );
}

let revealNow: (key: RevealKey) => void = () => {};
function Trigger() {
  const reveal = useReveal();
  revealNow = reveal;
  return null;
}

describe('reveal', () => {
  it('scrolls the item within its own container, focuses it and marks it', () => {
    render(
      <RevealProvider>
        <Trigger />
        <div data-testid="pane" style={{ overflowY: 'auto' }}>
          <Item
            revealKey={{ kind: 'faction', id: 'loyalists' }}
            label="loyalists"
          />
        </div>
      </RevealProvider>
    );
    const pane = screen.getByTestId('pane');
    pane.scrollTo = vi.fn();
    const page = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    act(() => revealNow({ kind: 'faction', id: 'loyalists' }));
    const item = screen.getByRole('button', { name: 'loyalists' });
    expect(pane.scrollTo).toHaveBeenCalledTimes(1);
    expect(page).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(item);
    expect(item.hasAttribute('data-revealed')).toBe(true);
  });

  it('the mark lasts until the next jump or a click or key elsewhere, never a timer', () => {
    vi.useFakeTimers();
    render(
      <RevealProvider>
        <Trigger />
        <Item
          revealKey={{ kind: 'faction', id: 'loyalists' }}
          label="loyalists"
        />
        <Item
          revealKey={{ kind: 'faction', id: 'garrison' }}
          label="garrison"
        />
        <p data-testid="elsewhere">elsewhere</p>
      </RevealProvider>
    );
    const loyalists = screen.getByRole('button', { name: 'loyalists' });
    const garrison = screen.getByRole('button', { name: 'garrison' });
    act(() => revealNow({ kind: 'faction', id: 'loyalists' }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(loyalists.getAttribute('data-revealed')).toBe('true');
    // A click inside the marked item keeps it.
    fireEvent.pointerDown(loyalists);
    expect(loyalists.getAttribute('data-revealed')).toBe('true');
    // The next jump moves the mark.
    act(() => revealNow({ kind: 'faction', id: 'garrison' }));
    expect(loyalists.hasAttribute('data-revealed')).toBe(false);
    expect(garrison.getAttribute('data-revealed')).toBe('true');
    // A click elsewhere clears it.
    act(() => vi.advanceTimersByTime(0));
    fireEvent.pointerDown(screen.getByTestId('elsewhere'));
    expect(garrison.hasAttribute('data-revealed')).toBe(false);
    // So does a key pressed elsewhere.
    act(() => revealNow({ kind: 'faction', id: 'loyalists' }));
    act(() => vi.advanceTimersByTime(0));
    fireEvent.keyDown(screen.getByTestId('elsewhere'), { key: 'Tab' });
    expect(loyalists.hasAttribute('data-revealed')).toBe(false);
  });

  it('opens a closed disclosure around the item first', () => {
    render(
      <RevealProvider>
        <Trigger />
        <details data-testid="fold">
          <summary>Faction</summary>
          <Item
            revealKey={{ kind: 'faction', id: 'garrison', part: 'options[0]' }}
            label="line"
          />
        </details>
      </RevealProvider>
    );
    act(() =>
      revealNow({ kind: 'faction', id: 'garrison', part: 'options[0]' })
    );
    expect((screen.getByTestId('fold') as HTMLDetailsElement).open).toBe(true);
  });

  it('queues a key nothing owns until its screen mounts, then fires once', () => {
    function Switch() {
      const [shown, setShown] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setShown(true)}>
            show
          </button>
          {shown && (
            <Item
              revealKey={{ kind: 'record', id: 'kitchen-way' }}
              label="kitchen-way"
            />
          )}
        </>
      );
    }
    render(
      <RevealProvider>
        <Trigger />
        <Switch />
      </RevealProvider>
    );
    act(() => revealNow({ kind: 'record', id: 'kitchen-way' }));
    act(() => screen.getByRole('button', { name: 'show' }).click());
    const item = screen.getByRole('button', { name: 'kitchen-way' });
    expect(item.hasAttribute('data-revealed')).toBe(true);
    expect(document.activeElement).toBe(item);
  });

  it('falls back to the nearest registered ancestor: a shorter part, then the thing', () => {
    vi.useFakeTimers();
    render(
      <RevealProvider>
        <Trigger />
        <Item revealKey={{ kind: 'creature', id: 'gate-1' }} label="gate-1" />
        <Item
          revealKey={{ kind: 'creature', id: 'gate-1', part: 'options[1]' }}
          label="line 2"
        />
      </RevealProvider>
    );
    act(() =>
      revealNow({
        kind: 'creature',
        id: 'gate-1',
        part: 'options[1].failure[0].recognize',
      })
    );
    const line = screen.getByRole('button', { name: 'line 2' });
    expect(line.hasAttribute('data-revealed')).toBe(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(line.hasAttribute('data-revealed')).toBe(true);
    expect(
      screen
        .getByRole('button', { name: 'gate-1' })
        .hasAttribute('data-revealed')
    ).toBe(false);
    // The mark lasts: no timer takes it away.
    act(() => vi.advanceTimersByTime(5000));
    expect(line.getAttribute('data-revealed')).toBe('true');
  });

  it('a key whose thing nothing owns lands nowhere and marks nothing', () => {
    vi.useFakeTimers();
    render(
      <RevealProvider>
        <Trigger />
        <Item revealKey={{ kind: 'creature', id: 'gate-1' }} label="gate-1" />
      </RevealProvider>
    );
    act(() =>
      revealNow({ kind: 'creature', id: 'gate-2', part: 'options[0]' })
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(
      screen
        .getByRole('button', { name: 'gate-1' })
        .hasAttribute('data-revealed')
    ).toBe(false);
  });
});
