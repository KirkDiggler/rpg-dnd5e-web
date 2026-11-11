import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './copyText';

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
  });
}

describe('copyText', () => {
  afterEach(() => {
    setClipboard(undefined);
    vi.restoreAllMocks();
    // jsdom has no execCommand; each test that needs it defines its own.
    delete (document as { execCommand?: unknown }).execCommand;
  });

  it('uses the clipboard API when the page has one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await expect(copyText('ABC123')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('ABC123');
  });

  it('copies through a selection when the page has no clipboard API', async () => {
    // An insecure origin (a LAN address on plain HTTP): no navigator.clipboard.
    setClipboard(undefined);
    let selected = '';
    const execCommand = vi.fn(() => {
      const area = document.querySelector('textarea');
      selected = area?.value ?? '';
      return true;
    });
    (document as { execCommand?: unknown }).execCommand = execCommand;

    await expect(copyText('ABC123')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(selected).toBe('ABC123');
    // The helper leaves nothing behind on the page.
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back when the clipboard API refuses', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    const execCommand = vi.fn(() => true);
    (document as { execCommand?: unknown }).execCommand = execCommand;

    await expect(copyText('ABC123')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('reports false, and does not throw, when nothing can copy', async () => {
    setClipboard(undefined);

    await expect(copyText('ABC123')).resolves.toBe(false);
  });
});
