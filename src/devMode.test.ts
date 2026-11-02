import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDevLike } from './devMode';

describe('isDevLike', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is true for a development build', () => {
    vi.stubEnv('MODE', 'development');
    expect(isDevLike()).toBe(true);
  });

  it('is true for a bench build', () => {
    vi.stubEnv('MODE', 'bench');
    expect(isDevLike()).toBe(true);
  });

  it('is false for a production build', () => {
    vi.stubEnv('MODE', 'production');
    expect(isDevLike()).toBe(false);
  });

  it('is false for the vitest mode', () => {
    vi.stubEnv('MODE', 'test');
    expect(isDevLike()).toBe(false);
  });
});
