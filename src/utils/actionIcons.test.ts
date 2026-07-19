import { describe, expect, it } from 'vitest';
import { getActionIconUrl } from './actionIcons';

describe('getActionIconUrl', () => {
  const shippedKeys = [
    'attack',
    'dash',
    'dodge',
    'disengage',
    'help',
    'hide',
    'rage',
    'move',
    'end-turn',
  ];

  for (const key of shippedKeys) {
    it(`resolves a URL for the shipped action key "${key}"`, () => {
      expect(getActionIconUrl(key)).toBe(`/models/synty/ui/actions/${key}.png`);
    });
  }

  it('is case-insensitive', () => {
    expect(getActionIconUrl('ATTACK')).toBe(
      '/models/synty/ui/actions/attack.png'
    );
  });

  it('returns undefined for an unmapped action ref id (e.g. a class feature with no dedicated icon)', () => {
    expect(getActionIconUrl('second-wind')).toBeUndefined();
    expect(getActionIconUrl('martial-arts')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(getActionIconUrl('')).toBeUndefined();
  });
});
