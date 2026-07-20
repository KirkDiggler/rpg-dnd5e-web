/**
 * useTheme cache-busting (web#553): /themes/*.css live in public/ and are not
 * fingerprinted by Vite, so every runtime-injected stylesheet link must carry
 * a ?v=<build id> query — otherwise CDN/browser caches serve stale theme CSS
 * after deploys and the combat HUD renders unstyled.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTheme } from './useTheme';

function themeLinks(): HTMLLinkElement[] {
  return Array.from(document.querySelectorAll('link[data-theme]'));
}

describe('useTheme stylesheet cache-busting', () => {
  afterEach(() => {
    themeLinks().forEach((l) => l.remove());
    localStorage.clear();
  });

  it('appends a ?v= build version to base and theme stylesheet links', async () => {
    renderHook(() => useTheme());

    await waitFor(() => {
      expect(themeLinks().length).toBeGreaterThanOrEqual(2);
    });

    for (const link of themeLinks()) {
      const url = new URL(link.href, 'http://localhost');
      expect(url.pathname).toMatch(/^\/themes\/[\w-]+\.css$/);
      const v = url.searchParams.get('v');
      expect(v, `${url.pathname} must carry a ?v= build id`).toBeTruthy();
      expect(v!.length).toBeGreaterThan(0);
    }
  });

  it('keeps the version query when switching themes at runtime', async () => {
    const { result } = renderHook(() => useTheme());

    await waitFor(() => {
      expect(themeLinks().length).toBeGreaterThanOrEqual(2);
    });

    // Not awaited: loadTheme blocks on link.onload, which jsdom never fires.
    // The link element itself is appended synchronously before that await.
    act(() => {
      void result.current.changeTheme('arcane');
    });

    await waitFor(() => {
      expect(
        themeLinks().some((l) => l.href.includes('/themes/arcane.css'))
      ).toBe(true);
    });

    const arcane = themeLinks().find((l) =>
      l.href.includes('/themes/arcane.css')
    );
    expect(
      new URL(arcane!.href, 'http://localhost').searchParams.get('v')
    ).toBeTruthy();
  });
});
