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
import { CopyPath } from './CopyPath';

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
});
