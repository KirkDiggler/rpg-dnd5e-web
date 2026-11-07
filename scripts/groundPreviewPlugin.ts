import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { parseGroundCatalog } from '../src/rendering/groundCatalog';

function containedFile(root: string, relative: string): Buffer {
  const path = join(root, relative);
  for (let part = path; ; part = dirname(part)) {
    if (lstatSync(part).isSymbolicLink())
      throw new Error('Ground preview symlink refused');
    if (part === dirname(part)) break;
  }
  if (!lstatSync(path).isFile())
    throw new Error('Ground preview requires regular files');
  return readFileSync(path);
}

/** Explicit development/bench mount. Nothing is copied into public or dist. */
export function groundPreviewPlugin(candidateRoot?: string): Plugin {
  const mount = (server: Pick<ViteDevServer, 'middlewares'>): void => {
    if (!candidateRoot) return;
    const root = resolve(candidateRoot);
    const manifest = containedFile(root, 'manifest.json');
    const parsed = parseGroundCatalog(JSON.parse(manifest.toString('utf8')));
    if (!parsed.ok) throw new Error(`Ground preview: ${parsed.reason}`);
    const files = new Map<string, Buffer>([['manifest.json', manifest]]);
    for (const style of parsed.catalog.styles) {
      const relative = `images/${style.sha256}.png`;
      const bytes = containedFile(root, relative);
      if (createHash('sha256').update(bytes).digest('hex') !== style.sha256)
        throw new Error('Ground preview image hash mismatch');
      if (
        bytes.length < 24 ||
        bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
        bytes.readUInt32BE(16) !== style.width ||
        bytes.readUInt32BE(20) !== style.height
      )
        throw new Error('Ground preview PNG dimensions mismatch');
      files.set(relative, bytes);
    }
    server.middlewares.use((request, response, next) => {
      const path = (request.url ?? '').split('?')[0];
      const prefix = '/models/synty/ground/';
      if (!path.startsWith(prefix)) {
        next();
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.statusCode = 405;
        response.end();
        return;
      }
      const relative = path.slice(prefix.length);
      const bytes = files.get(relative);
      if (!bytes) {
        response.statusCode = 404;
        response.end('Ground preview resource unavailable');
        return;
      }
      response.setHeader(
        'Content-Type',
        relative.endsWith('.png') ? 'image/png' : 'application/json'
      );
      response.setHeader('Content-Length', bytes.length);
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-RPG-Ground-Preview', '1');
      response.end(request.method === 'HEAD' ? undefined : bytes);
    });
  };
  return {
    name: 'studio-ground-preview',
    apply: 'serve',
    configureServer: mount,
    configurePreviewServer(server) {
      // Minified benchmark bundles may use the same verified candidate.
      // Ordinary production preview must never expose private staging.
      if (server.config.mode === 'bench') mount(server);
    },
  };
}
