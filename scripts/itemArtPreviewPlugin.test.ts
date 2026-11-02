// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { itemArtPreviewPlugin } from './itemArtPreviewPlugin';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'item-art-preview-'));
  mkdirSync(join(root, 'images'));
  writeFileSync(join(root, 'index.html'), '<h1>Candidate art</h1>');
  writeFileSync(join(root, 'request.json'), '{}');
  writeFileSync(join(root, 'images', 'axe-full.png'), 'candidate bytes');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function request(url: string, method = 'GET', originalUrl?: string) {
  const use = vi.fn();
  const plugin = itemArtPreviewPlugin(root);
  const configure = plugin.configureServer as (server: ViteDevServer) => void;
  configure({ middlewares: { use } } as unknown as ViteDevServer);
  const response = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
  use.mock.calls[0][1]({ url, method, originalUrl }, response);
  return response;
}
describe('dev-only item art preview mount', () => {
  it('serves staged HTML, metadata and PNGs without using public assets', () => {
    expect(itemArtPreviewPlugin(root).apply).toBe('serve');
    expect(request('/').end).toHaveBeenCalledWith(
      Buffer.from('<h1>Candidate art</h1>')
    );
    const image = request('/images/axe-full.png?refresh=1');
    expect(image.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(image.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(image.end).toHaveBeenCalledWith(Buffer.from('candidate bytes'));
    expect(request('/request.json').end).toHaveBeenCalledWith(
      Buffer.from('{}')
    );
  });
  it.each([
    '/../request.json',
    '/%2e%2e/request.json',
    '/model.glb',
    '/capture.mjs',
  ])('refuses undeclared routes %s', (url) => {
    expect(request(url).statusCode).toBe(404);
  });
  it('refuses symlinked image bytes and writes', () => {
    symlinkSync(join(root, 'request.json'), join(root, 'images', 'linked.png'));
    expect(request('/images/linked.png').statusCode).toBe(404);
    expect(request('/request.json', 'POST').statusCode).toBe(405);
  });
  it('redirects the bare mount to preserve relative gallery links', () => {
    // Connect strips the mount prefix and normalizes its empty remainder to '/'.
    const response = request('/', 'GET', '/item-art-preview');
    expect(response.statusCode).toBe(302);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Location',
      '/item-art-preview/'
    );
  });
});
