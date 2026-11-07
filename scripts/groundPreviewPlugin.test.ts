// @vitest-environment node
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PreviewServer, ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { groundPreviewPlugin } from './groundPreviewPlugin';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function stage(): { root: string; image: Buffer; sha: string } {
  const root = mkdtempSync(join(tmpdir(), 'ground-preview-'));
  roots.push(root);
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64'
  );
  const sha = createHash('sha256').update(image).digest('hex');
  mkdirSync(join(root, 'images'));
  writeFileSync(join(root, 'images', `${sha}.png`), image);
  writeFileSync(
    join(root, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      styles: [
        {
          ref: 'dnd5e:ground:fantasy-kingdom:grass_01',
          displayName: 'Grass',
          diffuse: `ground/images/${sha}.png`,
          sha256: sha,
          width: 1,
          height: 1,
          worldUnitsPerRepeat: 6,
        },
      ],
    })
  );
  return { root, image, sha };
}
function handler(
  root: string,
  mode: 'dev' | 'bench' | 'production' = 'dev'
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  let installed: ReturnType<typeof handler> = (_req, _res, next) => next();
  const plugin = groundPreviewPlugin(root);
  const configure =
    mode === 'dev' ? plugin.configureServer : plugin.configurePreviewServer;
  if (typeof configure !== 'function')
    throw new Error('No preview server hook');
  configure.call(
    {} as never,
    {
      config: { mode },
      middlewares: {
        use: (fn: typeof installed) => {
          installed = fn;
        },
      },
    } as unknown as ViteDevServer & PreviewServer
  );
  return installed;
}

describe('private dev-only ground mount', () => {
  it.each(['bench', 'production'] as const)(
    'serves candidate resources in %s preview only when it is the explicit benchmark mode',
    async (mode) => {
      const source = stage(),
        serve = handler(source.root, mode);
      const server = createServer((req, res) =>
        serve(req, res, () => {
          res.statusCode = 404;
          res.end();
        })
      );
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
      );
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('No port');
        const response = await fetch(
          `http://127.0.0.1:${address.port}/models/synty/ground/manifest.json`
        );
        expect(response.status).toBe(mode === 'bench' ? 200 : 404);
        expect(response.headers.get('x-rpg-ground-preview')).toBe(
          mode === 'bench' ? '1' : null
        );
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  );
  it('serves only verified candidate bytes and identifies the preview without public copies', async () => {
    const source = stage();
    const serve = handler(source.root);
    // The running preview retains its verified generation, not changed source bytes.
    writeFileSync(
      join(source.root, 'images', `${source.sha}.png`),
      'changed later'
    );
    const server = createServer((req, res) =>
      serve(req, res, () => {
        res.statusCode = 404;
        res.end();
      })
    );
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No port');
      const base = `http://127.0.0.1:${address.port}/models/synty/ground`;
      const catalog = await fetch(`${base}/manifest.json`);
      expect(catalog.headers.get('x-rpg-ground-preview')).toBe('1');
      expect((await catalog.json()).styles).toHaveLength(1);
      expect(
        Buffer.from(
          await (await fetch(`${base}/images/${source.sha}.png`)).arrayBuffer()
        )
      ).toEqual(source.image);
      expect((await fetch(`${base}/private.txt`)).status).toBe(404);
      expect(
        (await fetch(`${base}/manifest.json`, { method: 'POST' })).status
      ).toBe(405);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('refuses drift and symlinked resources before mounting', () => {
    const source = stage();
    const file = join(source.root, 'images', `${source.sha}.png`);
    writeFileSync(file, 'corrupt');
    expect(() => handler(source.root)).toThrow(/hash/);
    rmSync(file);
    symlinkSync(join(source.root, 'manifest.json'), file);
    expect(() => handler(source.root)).toThrow(/symlink/);
  });
});
