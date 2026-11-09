// @vitest-environment node
import { createHash } from 'node:crypto';
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

const catalogSha256 = createHash('sha256')
  .update(JSON.stringify(fixture()))
  .digest('hex');

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
  it('refuses valid but different manifest bytes rather than following a floating provider', async () => {
    const changed = fixture();
    changed.styles[0].worldUnitsPerRepeat = 7;
    const store = createGroundCatalogStore({
      catalogSha256,
      fetcher: async () => new Response(JSON.stringify(changed)),
    });
    await store.load();
    expect(store.getSnapshot()).toMatchObject({
      status: 'error',
      message: expect.stringMatching(/pin|adopted|digest/i),
    });
  });
  it('refuses an unadopted catalog instead of implicitly adopting server HEAD', async () => {
    const store = createGroundCatalogStore({
      catalogSha256: null,
      fetcher: async () => new Response(JSON.stringify(fixture())),
    });
    await store.load();
    expect(store.getSnapshot()).toMatchObject({ status: 'error' });
  });
  it('does not accept a preview header without explicit development permission', async () => {
    const store = createGroundCatalogStore({
      catalogSha256,
      fetcher: async () =>
        new Response(JSON.stringify(fixture()), {
          headers: { 'X-RPG-Ground-Preview': '1' },
        }),
    });
    await store.load();
    expect(store.getSnapshot()).toMatchObject({
      status: 'error',
      message: expect.stringMatching(/preview/i),
    });
  });
  it('identifies an explicitly mounted private preview rather than implying publication', async () => {
    const store = createGroundCatalogStore({
      catalogSha256: 'b'.repeat(64),
      allowPreview: true,
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
    const store = createGroundCatalogStore({ fetcher, catalogSha256 });
    const seen: string[] = [];
    const unsubscribe = store.subscribe(() =>
      seen.push(store.getSnapshot().status)
    );
    const first = store.load();
    expect(store.load()).toBe(first);
    await first;
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      `/models/synty/ground/manifest.json?v=${catalogSha256}`
    );
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
      const reply = response();
      const expected = createHash('sha256')
        .update(await reply.clone().text())
        .digest('hex');
      const store = createGroundCatalogStore({
        catalogSha256: expected,
        fetcher: async () => reply,
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
