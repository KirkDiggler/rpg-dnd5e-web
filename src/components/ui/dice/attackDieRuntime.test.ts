import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validSidecar } from './attackDieContract.test';
import {
  __resetAttackDieRuntimeForTests,
  getAttackDieRuntimeSnapshot,
  lockAttackDieRenderer,
  preloadAttackDieRuntime,
} from './attackDieRuntime';
const parse = vi.fn();
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    parse = parse;
  },
}));
describe('attack die runtime', () => {
  beforeEach(() => {
    __resetAttackDieRuntimeForTests();
    vi.restoreAllMocks();
  });
  it('snapshots readiness per token and excludes late readiness', () => {
    const pending = lockAttackDieRenderer(1, 3);
    expect(pending.renderer).toBe('svg');
    const ready = {
      status: 'ready' as const,
      sidecar: validSidecar('verified') as never,
    };
    expect(lockAttackDieRenderer(1, 3, ready).renderer).toBe('svg');
    expect(lockAttackDieRenderer(2, 3, ready).renderer).toBe('3d');
  });
  it('fetches the exact direct GLB and required provider sidecar URLs', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const digest = [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    ]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    const base = validSidecar('verified');
    const sidecar = {
      ...base,
      asset: { ...base.asset, sha256: digest },
      tuple: { ...base.tuple, glbSha256: digest },
      evidence: {
        machineRunSha256: 'e'.repeat(64),
        humanReviewSha256: 'f'.repeat(64),
        performanceSha256: '1'.repeat(64),
      },
    };
    sidecar.asset.sha256 = digest;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => bytes.buffer,
      })
      .mockResolvedValueOnce({ ok: true, json: async () => sidecar });
    vi.stubGlobal('fetch', fetchMock);
    parse.mockImplementation(
      (_b: unknown, _p: unknown, ok: (g: { scene: object }) => void) =>
        ok({ scene: {} })
    );
    await preloadAttackDieRuntime({ verifyContractDigest: false });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/models/synty/props/SM_Prop_D20_Lightning_01.glb',
      '/models/synty/dice/d20-lightning/attack-die-contract.json',
    ]);
  });
  it('distinguishes digest and parser failures after successful fetches', async () => {
    const base = validSidecar('verified');
    const sidecar = {
      ...base,
      evidence: {
        machineRunSha256: 'e'.repeat(64),
        humanReviewSha256: 'f'.repeat(64),
        performanceSha256: '1'.repeat(64),
      },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new Uint8Array([1]).buffer,
        })
        .mockResolvedValueOnce({ ok: true, json: async () => sidecar })
    );
    await expect(
      preloadAttackDieRuntime({ verifyContractDigest: false })
    ).rejects.toThrow('GLB hash mismatch');
    __resetAttackDieRuntimeForTests();
    const digest = [
      ...new Uint8Array(
        await crypto.subtle.digest('SHA-256', new Uint8Array([1]))
      ),
    ]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    const parserSidecar = {
      ...validSidecar('verified'),
      asset: { ...validSidecar('verified').asset, sha256: digest },
      tuple: { ...validSidecar('verified').tuple, glbSha256: digest },
      evidence: {
        machineRunSha256: 'e'.repeat(64),
        humanReviewSha256: 'f'.repeat(64),
        performanceSha256: '1'.repeat(64),
      },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new Uint8Array([1]).buffer,
        })
        .mockResolvedValueOnce({ ok: true, json: async () => parserSidecar })
    );
    parse.mockImplementation(
      (_b: unknown, _p: unknown, _ok: unknown, fail: (e: Error) => void) =>
        fail(new Error('parser failed'))
    );
    await expect(
      preloadAttackDieRuntime({ verifyContractDigest: false })
    ).rejects.toThrow('parser failed');
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
  it.each(['network unavailable', 'sidecar unavailable'])(
    'fails closed on fetch failure: %s',
    async (reason) => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(reason)));
      await expect(preloadAttackDieRuntime()).rejects.toThrow(reason);
      expect(getAttackDieRuntimeSnapshot().status).toBe('failed');
    }
  );
});
