import { describe, expect, it } from 'vitest';
import { turnsTo } from './engineLaws';

describe('turnsTo', () => {
  it('turns hostile and neutral into each other, allied into itself', () => {
    expect(turnsTo('hostile')).toBe('neutral');
    expect(turnsTo('neutral')).toBe('hostile');
    expect(turnsTo('allied')).toBe('allied');
  });
});
