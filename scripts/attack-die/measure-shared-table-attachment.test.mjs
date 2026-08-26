import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(
  new URL('./measure-shared-table-attachment.mjs', import.meta.url)
);

test('harness integrity self-test rejects incomplete, rounded, and overlapping work', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--self-test'], {
    encoding: 'utf8',
    timeout: 10_000,
  });

  assert.equal(
    result.status,
    0,
    `self-test failed:\n${result.stderr || result.stdout}`
  );
  assert.match(result.stdout, /harness integrity self-test: 4\/4 passed/);
});
