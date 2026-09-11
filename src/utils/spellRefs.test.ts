// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spellRefId, spellRefLabel } from './spellRefs';

describe('reading a spell ref', () => {
  it('takes the id from the full catalog ref', () => {
    expect(spellRefId('dnd5e:spells:vicious-mockery')).toBe('vicious-mockery');
  });

  it('titleizes a hyphenated id', () => {
    expect(spellRefLabel('dnd5e:spells:vicious-mockery')).toBe(
      'Vicious Mockery'
    );
    expect(spellRefLabel('dnd5e:spells:true-strike')).toBe('True Strike');
    expect(spellRefLabel('dnd5e:spells:light')).toBe('Light');
  });

  it('shows an unparseable ref whole rather than inventing a name', () => {
    // UGLY ON PURPOSE. A ref the client cannot resolve must look unresolved;
    // quietly becoming a plausible spell name is how a wrong label survives
    // a walk.
    // A bare id has no colon at all, so there is nothing to strip and the
    // whole string is the id — that one does titleize.
    expect(spellRefLabel('vicious-mockery')).toBe('vicious-mockery');
    expect(spellRefLabel('dnd5e:spells:')).toBe('dnd5e:spells:');
    expect(spellRefLabel('')).toBe('');
  });
});
