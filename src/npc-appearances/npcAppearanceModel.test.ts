import { describe, expect, it } from 'vitest';
import { resolveNpcAppearanceModel } from './npcAppearanceModel';

describe('explicit NPC appearance model resolution', () => {
  it('leaves absent and proto-empty choices on the legacy path', () => {
    expect(resolveNpcAppearanceModel({})).toEqual({ kind: 'legacy' });
    expect(resolveNpcAppearanceModel({ appearanceRef: '' })).toEqual({
      kind: 'legacy',
    });
  });

  it('resolves standing and downed from the exact catalog, not the ref spelling', () => {
    const appearanceRef = 'dnd5e:npcs:kingdom:merchant-01';
    expect(resolveNpcAppearanceModel({ appearanceRef })).toEqual({
      kind: 'resolved',
      appearanceRef,
      url: '/models/synty/npcs/castle-merchant-01.glb',
      forwardOffset: 0,
    });
    expect(resolveNpcAppearanceModel({ appearanceRef, downed: true })).toEqual({
      kind: 'resolved',
      appearanceRef,
      url: '/models/synty/npcs/castle-merchant-01-downed.glb',
      forwardOffset: 0,
    });
  });

  it('refuses explicit unknowns and retired aliases without selecting another body', () => {
    for (const appearanceRef of [
      'dnd5e:npcs:kingdom:missing',
      'dnd5e:npcs:castle:merchant-01',
      '__proto__',
      ' ',
    ]) {
      expect(resolveNpcAppearanceModel({ appearanceRef })).toEqual({
        kind: 'unavailable',
        appearanceRef,
      });
    }
  });
});
