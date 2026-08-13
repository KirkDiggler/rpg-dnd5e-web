#!/usr/bin/env node
import { lstat, readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const dist = resolve(arg('--dist', 'dist'));
const assetRoot = resolve(arg('--asset-root', 'public/models/synty'));
const manifestPath = resolve(arg('--build-manifest'));
const host = arg('--host', '127.0.0.1');
const port = Number(arg('--port', '4173'));
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error('invalid port');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
async function safeFile(root, requested) {
  const candidate = resolve(
    root,
    `.${requested.startsWith('/') ? requested : `/${requested}`}`
  );
  const rel = relative(root, candidate);
  if (rel === '..' || rel.startsWith(`..${sep}`))
    throw Object.assign(Error('path traversal'), { status: 400 });
  const info = await lstat(candidate);
  if (info.isSymbolicLink())
    throw Object.assign(Error('symlink rejected'), { status: 403 });
  const actual = await realpath(candidate);
  const actualRel = relative(root, actual);
  if (actualRel === '..' || actualRel.startsWith(`..${sep}`))
    throw Object.assign(Error('path traversal'), { status: 400 });
  return readFile(actual);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    const rawPath = decodeURIComponent(url.pathname);
    let bytes;
    let typePath = rawPath;
    if (rawPath === '/__attack-die-build-manifest.json') {
      bytes = await readFile(manifestPath);
      typePath = '.json';
    } else if (rawPath.startsWith('/models/synty/')) {
      bytes = await safeFile(assetRoot, rawPath.slice('/models/synty'.length));
    } else {
      try {
        if (rawPath === '/') typePath = '/index.html';
        bytes = await safeFile(dist, typePath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        bytes = await safeFile(dist, '/index.html');
        typePath = '.html';
      }
    }
    response.writeHead(200, {
      'content-type': mime[extname(typePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(bytes);
  } catch (error) {
    response.writeHead(
      error?.status ?? (error?.code === 'ENOENT' ? 404 : 500),
      { 'content-type': 'text/plain; charset=utf-8' }
    );
    response.end(error instanceof Error ? error.message : 'server error');
  }
});
server.listen(port, host, () =>
  console.log(`attack-die frozen preview http://${host}:${port}`)
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
