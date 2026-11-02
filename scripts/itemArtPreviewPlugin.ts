import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Local candidate gallery on the existing dev server. Staged bytes stay out
 * of public/ and production builds; only HTML, metadata and PNGs are served. */
export function itemArtPreviewPlugin(root: string): Plugin {
  return {
    name: 'item-art-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/item-art-preview', (request, response) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.statusCode = 405;
          response.end();
          return;
        }
        const pathname = (request.url ?? '').split('?')[0];
        const originalPath = (request.originalUrl ?? '').split('?')[0];
        if (pathname === '' || originalPath === '/item-art-preview') {
          response.statusCode = 302;
          response.setHeader('Location', '/item-art-preview/');
          response.end();
          return;
        }
        const file = pathname === '/' ? '/index.html' : pathname;
        if (
          !/^\/(?:index\.html|request\.json|images\/[a-z0-9-]+\.png)$/.test(
            file
          )
        ) {
          response.statusCode = 404;
          response.end();
          return;
        }
        try {
          if (realpathSync(root) !== resolve(root))
            throw new Error('Stage symlink refused');
          let target = root;
          for (const part of file.slice(1).split('/')) {
            target = resolve(target, part);
            if (lstatSync(target).isSymbolicLink())
              throw new Error('Stage symlink refused');
          }
          const bytes = readFileSync(target);
          response.setHeader(
            'Content-Type',
            file.endsWith('.png')
              ? 'image/png'
              : file.endsWith('.html')
                ? 'text/html; charset=utf-8'
                : 'application/json'
          );
          response.setHeader('Cache-Control', 'no-store');
          response.end(request.method === 'HEAD' ? undefined : bytes);
        } catch {
          response.statusCode = 404;
          response.end('Item art preview unavailable.');
        }
      });
    },
  };
}
