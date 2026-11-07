import { describe, expect, it, vi } from 'vitest';
import {
  createGroundCatalogStore,
  parseGroundCatalog,
  requireGroundStyle,
} from './groundCatalog';

const SHA = 'a'.repeat(64);
const REF = 'dnd5e:ground:fantasy-kingdom:grass_01';
const fixture = () => ({
  schemaVersion: 1,
  styles: [
    {
      ref: REF,
      displayName: 'Grass',
      diffuse: `ground/images/${SHA}.png`,
      sha256: SHA,
      width: 2048,
      height: 2048,
      worldUnitsPerRepeat: 6,
    },
  ],
});

describe('ground catalog contract', () => {
  it('resolves hash-bound resources without exposing private source paths', () => {
    const source = fixture();
    const result = parseGroundCatalog(source);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(requireGroundStyle(result.catalog, REF)).toEqual(source.styles[0]);
    source.styles[0].displayName = 'changed';
    expect(requireGroundStyle(result.catalog, REF).displayName).toBe('Grass');
    expect(() => requireGroundStyle(result.catalog, 'missing')).toThrow(
      /unavailable.*missing/i
    );
  });

  it.each([
    (doc: ReturnType<typeof fixture>) => {
      doc.styles[0].diffuse = '../private.png';
    },
    (doc: ReturnType<typeof fixture>) => {
      doc.styles[0].sha256 = 'invalid';
    },
    (doc: ReturnType<typeof fixture>) => {
      doc.styles[0].worldUnitsPerRepeat = 0;
    },
    (doc: ReturnType<typeof fixture>) => {
      doc.styles[0].worldUnitsPerRepeat = Number.NaN;
    },
    (doc: ReturnType<typeof fixture>) => {
      doc.styles[0].width = -1;
    },
    (doc: ReturnType<typeof fixture>) => {
      doc.styles.push({ ...doc.styles[0] });
    },
    (doc: ReturnType<typeof fixture>) => {
      doc.styles[0].ref = '/some/file.png';
    },
    (doc: ReturnType<typeof fixture>) => {
      Object.assign(doc.styles[0], { source: '/private/source.png' });
    },
  ])('refuses malformed or source-leaking catalogs', (mutate) => {
    const doc = fixture();
    mutate(doc);
    expect(parseGroundCatalog(doc).ok).toBe(false);
  });

  it('refuses conflicting metadata for shared image bytes', () => {
    const doc = fixture();
    doc.styles.push({
      ...doc.styles[0],
      ref: 'dnd5e:ground:fantasy-kingdom:other_01',
      width: 512,
    });
    expect(parseGroundCatalog(doc).ok).toBe(false);
  });
});

describe('ground catalog loading', () => {
  it('identifies an explicitly mounted private preview rather than implying publication', async () => {
    const store = createGroundCatalogStore({
      fetcher: async () =>
        new Response(JSON.stringify(fixture()), {
          headers: { 'X-RPG-Ground-Preview': '1' },
        }),
    });
    await store.load();
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      preview: true,
    });
  });
  it('shares one request and publishes a ready immutable catalog to subscribers', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(fixture())));
    const store = createGroundCatalogStore({ fetcher });
    const seen: string[] = [];
    const unsubscribe = store.subscribe(() =>
      seen.push(store.getSnapshot().status)
    );
    const first = store.load();
    expect(store.load()).toBe(first);
    await first;
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('/models/synty/ground/manifest.json');
    expect(seen).toEqual(['loading', 'ready']);
    const state = store.getSnapshot();
    expect(state.status).toBe('ready');
    if (state.status === 'ready')
      expect(requireGroundStyle(state.catalog, REF).worldUnitsPerRepeat).toBe(
        6
      );
    unsubscribe();
  });

  it.each([
    () => new Response('not found', { status: 404 }),
    () => new Response('<html>vite fallback</html>'),
    () => new Response(JSON.stringify({ schemaVersion: 1, styles: [] })),
  ])(
    'reports unavailable/malformed resources without a stone fallback',
    async (response) => {
      const store = createGroundCatalogStore({
        fetcher: async () => response(),
      });
      await store.load();
      expect(store.getSnapshot()).toMatchObject({
        status: 'error',
        message: expect.any(String),
      });
      expect(store.getSnapshot()).not.toHaveProperty('catalog');
    }
  );
});
