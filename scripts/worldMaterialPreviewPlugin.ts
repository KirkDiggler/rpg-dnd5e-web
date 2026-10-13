import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** A deliberately dev-only, narrow URL mount. Candidate bytes live outside
 * public/ so a production build cannot accidentally copy an unapproved stage. */
export function worldMaterialPreviewPlugin(root: string): Plugin {
  return {
    name: 'studio-world-material-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/world-material-preview', (request, response) => {
        const path = (request.url ?? '').split('?')[0];
        if (!/^\/(?:catalog\.json|images\/[a-f0-9]{64}\.png)$/.test(path)) {
          response.statusCode = 404;
          response.end();
          return;
        }
        try {
          let target = root;
          if (!existsSync(target) || lstatSync(target).isSymbolicLink())
            throw new Error('No candidate preview.');
          for (const part of path.slice(1).split('/')) {
            target = resolve(target, part);
            if (lstatSync(target).isSymbolicLink())
              throw new Error('Candidate symlink refused.');
          }
          const bytes = readFileSync(target);
          response.setHeader(
            'Content-Type',
            path.endsWith('.png') ? 'image/png' : 'application/json'
          );
          response.setHeader('Cache-Control', 'no-store');
          response.end(bytes);
        } catch {
          response.statusCode = 404;
          response.end('Candidate material preview unavailable.');
        }
      });
    },
  };
}
