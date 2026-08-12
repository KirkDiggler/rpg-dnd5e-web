import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetAttackDieRuntimeForTests,
  getAttackDieRuntimeSnapshot,
  lockAttackDieRenderer,
  preloadAttackDieRuntime,
} from './attackDieRuntime';
describe('attack die runtime', () => {
  beforeEach(() => {
    __resetAttackDieRuntimeForTests();
    vi.restoreAllMocks();
  });
  it('snapshots readiness per token and excludes late readiness', () => {
    expect(lockAttackDieRenderer(1, 3).renderer).toBe('svg');
    expect(lockAttackDieRenderer(1, 3).renderer).toBe('svg');
  });
  it('makes token failure irreversible', () => {
    const lock = lockAttackDieRenderer(1, 3, {
      status: 'ready',
      sidecar: {} as never,
    });
    lock.fail('context');
    expect(lock.renderer).toBe('svg');
    expect(lock.fail('recovered').renderer).toBe('svg');
  });
  it.each(['load', 'hash', 'webgl', 'shader', 'context'])(
    'fails closed on forced %s failure',
    async (reason) => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(reason)));
      await expect(preloadAttackDieRuntime()).rejects.toThrow(reason);
      expect(getAttackDieRuntimeSnapshot().status).toBe('failed');
    }
  );
});
