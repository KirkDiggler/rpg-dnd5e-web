// @vitest-environment node
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createStone1TerminalPublication } from './stone1TerminalPublication.mjs';

const roots = [];

async function fixture(overrides = {}) {
  const out = await mkdtemp(resolve(tmpdir(), 'stone1-terminal-publication-'));
  roots.push(out);
  const passPath = resolve(out, 'PASS');
  const failedPath = resolve(out, 'FAILED.txt');
  return {
    out,
    passPath,
    failedPath,
    publication: createStone1TerminalPublication({
      out,
      passPath,
      failedPath,
      processId: 755,
      operations: { writeFile, rename, rm, ...overrides },
    }),
  };
}

async function markers(out) {
  return (await readdir(out)).filter((name) =>
    ['PASS', 'FAILED.txt'].includes(name)
  );
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe('Stone 1 terminal publication latch', () => {
  it('latches failure synchronously before publication and never permits PASS', async () => {
    const { out, failedPath, publication } = await fixture();

    const failure = publication.fail('signal before PASS');
    expect(publication.isFailureLatched()).toBe(true);
    await expect(publication.publishPass('head\n')).rejects.toThrow(
      /failure.*latched/i
    );
    await failure;

    expect(await markers(out)).toEqual(['FAILED.txt']);
    await expect(readFile(failedPath, 'utf8')).resolves.toContain(
      'signal before PASS'
    );
  });

  it('serializes failure during PASS rename and removes every published PASS', async () => {
    let renameStarted;
    const started = new Promise((resolveStarted) => {
      renameStarted = resolveStarted;
    });
    let releaseRename;
    const released = new Promise((resolveReleased) => {
      releaseRename = resolveReleased;
    });
    const { out, failedPath, publication } = await fixture({
      async rename(source, destination) {
        await rename(source, destination);
        if (destination.endsWith('/PASS')) {
          renameStarted();
          await released;
        }
      },
    });

    const pass = publication.publishPass('head\n');
    await started;
    const failure = publication.fail('signal during PASS');
    expect(publication.isFailureLatched()).toBe(true);
    releaseRename();

    await expect(pass).rejects.toThrow(/failure.*latched/i);
    await failure;
    expect(await markers(out)).toEqual(['FAILED.txt']);
    await expect(readFile(failedPath, 'utf8')).resolves.toContain(
      'signal during PASS'
    );
    await expect(publication.publishPass('recreated\n')).rejects.toThrow(
      /failure.*latched/i
    );
    expect(await markers(out)).toEqual(['FAILED.txt']);
  });

  it('removes an already published PASS when failure arrives afterward', async () => {
    const { out, passPath, failedPath, publication } = await fixture();

    await publication.publishPass('head\n');
    expect(await markers(out)).toEqual(['PASS']);
    await expect(readFile(passPath, 'utf8')).resolves.toBe('head\n');

    const failure = publication.fail('signal after PASS');
    expect(publication.isFailureLatched()).toBe(true);
    await failure;

    expect(await markers(out)).toEqual(['FAILED.txt']);
    await expect(readFile(failedPath, 'utf8')).resolves.toContain(
      'signal after PASS'
    );
  });
});
