import { describe, expect, it } from 'vitest';
import { ENGINE_LAWS, turnsTo } from './engineLaws';

describe('ENGINE_LAWS', () => {
  it('every law has a nonblank source naming an rpg-toolkit path', () => {
    for (const law of Object.values(ENGINE_LAWS)) {
      expect(law.source).toMatch(/^rpg-toolkit [\w/.-]+\.go \S+$/);
      expect(law.sentence.trim()).not.toBe('');
    }
  });

  it('no law sentence contains a digit', () => {
    for (const law of Object.values(ENGINE_LAWS))
      expect(law.sentence).not.toMatch(/\d/);
  });

  it('each law is keyed by its own id', () => {
    for (const [key, law] of Object.entries(ENGINE_LAWS))
      expect(law.id).toBe(key);
  });

  it('turns hostile and neutral into each other, allied into itself', () => {
    expect(turnsTo('hostile')).toBe('neutral');
    expect(turnsTo('neutral')).toBe('hostile');
    expect(turnsTo('allied')).toBe('allied');
  });
});
