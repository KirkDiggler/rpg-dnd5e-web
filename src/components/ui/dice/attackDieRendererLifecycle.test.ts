import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttackDieRendererInfo } from './AttackDie3D';
import { ownAttackDieRendererLifecycle } from './attackDieRendererLifecycle';
afterEach(() => vi.useRealTimers());
const fixture = () => {
  const listeners = new Map<string, EventListener>(),
    remove = vi.fn();
  const canvas = {
    addEventListener: (n: string, f: EventListener) => listeners.set(n, f),
    removeEventListener: (n: string) => {
      remove(n);
      listeners.delete(n);
    },
  };
  const renderer = {
    domElement: canvas,
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
    info: {
      render: { calls: 1, triangles: 2 },
      memory: { geometries: 3, textures: 4 },
      programs: [{}],
    },
  };
  return { listeners, remove, renderer };
};
describe('owned renderer release authority', () => {
  it('retains listener through cleanup and observes actual event on only owned renderer', () => {
    const f = fixture(),
      other = fixture(),
      events: AttackDieRendererInfo[] = [];
    const lease = ownAttackDieRendererLifecycle({
      renderer: f.renderer as never,
      contextId: 4,
      sink: (e) => events.push(e),
      onUnexpectedLoss: vi.fn(),
    });
    lease.requestRelease();
    expect(f.renderer.dispose).toHaveBeenCalledOnce();
    expect(f.renderer.forceContextLoss).toHaveBeenCalledOnce();
    expect(other.renderer.dispose).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
    f.listeners.get('webglcontextlost')?.(
      new Event('webglcontextlost', { cancelable: true })
    );
    expect(events.map((x) => x.lifecycle)).toEqual([
      'created',
      'release-requested',
      'release-observed',
    ]);
    expect(f.remove).toHaveBeenCalledOnce();
  });
  it('classifies unexpected loss and timeout and self-cleans', () => {
    vi.useFakeTimers();
    const f = fixture(),
      events: AttackDieRendererInfo[] = [];
    const lease = ownAttackDieRendererLifecycle({
      renderer: f.renderer as never,
      contextId: 5,
      sink: (e) => events.push(e),
      onUnexpectedLoss: vi.fn(),
      timeoutMs: 10,
    });
    lease.requestRelease();
    vi.advanceTimersByTime(11);
    expect(events.at(-1)?.lifecycle).toBe('release-timeout');
    expect(f.remove).toHaveBeenCalledOnce();
    const g = fixture(),
      unexpected: AttackDieRendererInfo[] = [];
    ownAttackDieRendererLifecycle({
      renderer: g.renderer as never,
      contextId: 6,
      sink: (e) => unexpected.push(e),
      onUnexpectedLoss: vi.fn(),
    });
    g.listeners.get('webglcontextlost')?.(new Event('webglcontextlost'));
    expect(unexpected.at(-1)?.lifecycle).toBe('unexpected-loss');
  });
});
