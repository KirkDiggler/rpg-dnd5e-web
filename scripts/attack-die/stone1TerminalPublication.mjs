import {
  rename as defaultRename,
  rm as defaultRm,
  writeFile as defaultWriteFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Serializes PASS/FAILED publication while exposing a synchronous failure
 * latch for signal and exception handlers.
 */
export function createStone1TerminalPublication({
  out,
  passPath,
  failedPath,
  processId = process.pid,
  operations = {},
}) {
  const writeFile = operations.writeFile ?? defaultWriteFile;
  const rename = operations.rename ?? defaultRename;
  const rm = operations.rm ?? defaultRm;
  const passTemporary = resolve(out, `.PASS-${processId}.tmp`);
  const failedTemporary = resolve(out, `.FAILED-${processId}.tmp`);
  let failureLatched = false;
  let failureReason;
  let operationTail = Promise.resolve();

  function enqueue(operation) {
    const pending = operationTail.then(operation, operation);
    operationTail = pending.catch(() => undefined);
    return pending;
  }

  function latchFailure(reason) {
    if (!failureLatched) {
      failureLatched = true;
      failureReason = String(reason);
    }
    return failureReason;
  }

  async function writeFailedMarker() {
    const reason = failureReason ?? 'Stone 1 capture failed';
    await writeFile(failedTemporary, `${reason}\n`);
    await rm(passPath, { force: true });
    await rename(failedTemporary, failedPath);
  }

  function publishFailure() {
    if (!failureLatched)
      throw Error('terminal failure must be latched before publication');
    return enqueue(writeFailedMarker);
  }

  function fail(reason) {
    latchFailure(reason);
    return publishFailure();
  }

  function publishPass(contents) {
    if (failureLatched)
      return Promise.reject(Error('terminal failure is already latched'));
    return enqueue(async () => {
      if (failureLatched) throw Error('terminal failure is already latched');
      await writeFile(passTemporary, contents);
      if (failureLatched) {
        await rm(passTemporary, { force: true });
        await writeFailedMarker();
        throw Error('terminal failure latched during PASS publication');
      }
      await rename(passTemporary, passPath);
      if (failureLatched) {
        await writeFailedMarker();
        throw Error('terminal failure latched during PASS publication');
      }
    });
  }

  return Object.freeze({
    latchFailure,
    publishFailure,
    fail,
    publishPass,
    isFailureLatched: () => failureLatched,
  });
}
