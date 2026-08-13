#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { createFrozenBuildManifest } from './frozenBuildManifest.ts';

const args = process.argv.slice(2);
const readArg = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw Error(`missing ${name}`);
  return args[index + 1];
};
const dist = resolve(readArg('--dist'));
const out = resolve(readArg('--out'));
const rel = relative(dist, out);
if (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..'))
  throw Error('--out must be outside dist');
const manifest = await createFrozenBuildManifest(dist, out);
await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'w' });
console.log(`${manifest.webBuildSha256}  ${out}`);
