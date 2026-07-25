import { describe, expect, it, vi } from 'vitest';
import { rollD20 } from './rollD20';

describe('rollD20', () => {
  it('maps the lowest rng() value to 1', () => {
    expect(rollD20(() => 0)).toBe(1);
  });

  it('maps a value just under 1 to 20', () => {
    expect(rollD20(() => 0.999999)).toBe(20);
  });

  it('maps a mid-range value to the corresponding face', () => {
    // Math.floor(0.65 * 20) + 1 = 14
    expect(rollD20(() => 0.65)).toBe(14);
  });

  it('stays within [1, 20] across the full rng() input range', () => {
    for (let i = 0; i < 100; i++) {
      const value = rollD20(() => i / 100);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(20);
    }
  });

  it('defaults to Math.random when no rng is supplied', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      expect(rollD20()).toBe(11);
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });
});
