/**
 * A PLACE'S RAW PATH, ONE KEY AWAY (rpg-project#983): beside every place in
 * words, a "Copy path" control copies the path the engine wrote; where the
 * clipboard cannot be written, the path is shown selected to copy by hand.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyPath, CopyPathGroup } from './CopyPath';

const PATH = 'room.room.monsterBindings.captain.options[4].failure[0]';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CopyPath', () => {
  it('copies the raw path and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyPath path={PATH} />);
    const copy = screen.getByRole('button', { name: 'Copy path' });
    expect(copy.getAttribute('title')).toBe(PATH);
    await act(async () => fireEvent.click(copy));
    expect(writeText).toHaveBeenCalledWith(PATH);
    expect(screen.getByRole('status').textContent).toBe('Copied');
  });

  it('without a clipboard, shows the path selected to copy by hand', async () => {
    vi.stubGlobal('navigator', {});
    render(<CopyPath path={PATH} />);
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Copy path' }))
    );
    const field = screen.getByRole('textbox', { name: 'Path to copy' });
    expect((field as HTMLInputElement).value).toBe(PATH);
    expect(document.activeElement).toBe(field);
  });

  it('a refused clipboard write falls back the same way', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<CopyPath path={PATH} />);
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Copy path' }))
    );
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Path to copy',
        }) as HTMLInputElement
      ).value
    ).toBe(PATH);
  });
  it('the hand-copy field takes focus once when it opens, not on every render', async () => {
    vi.stubGlobal('navigator', {});
    const { rerender } = render(<CopyPath path={PATH} />);
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Copy path' }))
    );
    const field = screen.getByRole('textbox', {
      name: 'Path to copy',
    }) as HTMLInputElement;
    // The author narrows the selection; a re-render must not reselect.
    field.setSelectionRange(0, 4);
    const focus = vi.spyOn(field, 'focus');
    rerender(<CopyPath path={PATH} />);
    rerender(<CopyPath path={PATH} />);
    expect(focus).not.toHaveBeenCalled();
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 4]);
  });

  it('beside a focusable place it is quiet: not a Tab stop until the place has focus, then the next one', () => {
    vi.stubGlobal('navigator', {});
    render(
      <>
        <CopyPathGroup path={PATH}>
          <button type="button">captain · line `stand-aside`</button>
        </CopyPathGroup>
        <button type="button">after</button>
      </>
    );
    const copy = screen.getByRole('button', { name: 'Copy path' });
    expect(copy.tabIndex).toBe(-1);
    act(() =>
      screen
        .getByRole('button', { name: 'captain · line `stand-aside`' })
        .focus()
    );
    expect(copy.tabIndex).toBe(0);
    act(() => copy.focus());
    expect(copy.tabIndex).toBe(0);
    act(() => screen.getByRole('button', { name: 'after' }).focus());
    expect(copy.tabIndex).toBe(-1);
  });
});
