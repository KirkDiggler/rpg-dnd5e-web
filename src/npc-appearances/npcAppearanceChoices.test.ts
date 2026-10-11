import { resolveNpcAppearance } from '@/generated/npcAppearanceCatalog';
import { describe, expect, it } from 'vitest';
import {
  buildNpcAppearanceFamilies,
  chooseNpcAppearance,
  NPC_APPEARANCE_FAMILIES,
} from './npcAppearanceChoices';

const merchant = 'dnd5e:npcs:kingdom:merchant-01';

describe('published NPC look choices', () => {
  it('offers families, not hundreds of variants in the appearance selector', () => {
    expect(NPC_APPEARANCE_FAMILIES).toHaveLength(30);
    const kingdom = NPC_APPEARANCE_FAMILIES.filter(
      (family) => family.defaultLook.look
    );
    expect(kingdom).toHaveLength(17);
    for (const family of kingdom) {
      expect(family.looks).toHaveLength(12);
      expect(new Set(family.looks.map((look) => look.look!.style))).toEqual(
        new Set(['01', '02', '03', '04'])
      );
      expect(
        new Set(family.looks.map((look) => look.look!.skinPalette))
      ).toEqual(new Set(['A', 'B', 'C']));
    }
  });

  it('resolves style and skin edits to one exact ref and preserves an available combination across families', () => {
    const style = chooseNpcAppearance({
      currentRef: merchant,
      control: 'style',
      value: '03',
    });
    const skin = chooseNpcAppearance({
      currentRef: style,
      control: 'skinPalette',
      value: 'B',
    });
    expect(resolveNpcAppearance(skin)?.look).toEqual({
      familyRef: merchant,
      style: '03',
      skinPalette: 'B',
    });
    const soldier = chooseNpcAppearance({
      currentRef: skin,
      control: 'family',
      value: 'dnd5e:npcs:kingdom:soldier-female-01',
    });
    expect(resolveNpcAppearance(soldier)?.look).toEqual({
      familyRef: 'dnd5e:npcs:kingdom:soldier-female-01',
      style: '03',
      skinPalette: 'B',
    });
    expect(
      chooseNpcAppearance({ currentRef: skin, control: 'family', value: '' })
    ).toBe('');
  });

  it('uses explicit metadata rather than reconstructing ref suffixes', () => {
    const base = {
      ...resolveNpcAppearance(merchant)!,
      assetRef: 'custom:npcs:pack:base',
      look: {
        familyRef: 'custom:npcs:pack:base',
        style: 'plain',
        skinPalette: 'light',
      },
    };
    const variant = {
      ...base,
      assetRef: 'custom:npcs:pack:unrelated-name',
      look: { ...base.look, skinPalette: 'deep' },
    };
    const families = buildNpcAppearanceFamilies([base, variant]);
    expect(
      chooseNpcAppearance(
        { currentRef: base.assetRef, control: 'skinPalette', value: 'deep' },
        families
      )
    ).toBe(variant.assetRef);
    expect(() =>
      chooseNpcAppearance(
        { currentRef: base.assetRef, control: 'style', value: 'missing' },
        families
      )
    ).toThrow(/unavailable/);
  });

  it('does not invent palettes for single-look or unknown appearances', () => {
    expect(() =>
      chooseNpcAppearance({
        currentRef: 'dnd5e:npcs:goblin:king-01',
        control: 'style',
        value: '03',
      })
    ).toThrow(/no published/);
    expect(() =>
      chooseNpcAppearance({
        currentRef: 'dnd5e:npcs:kingdom:missing',
        control: 'skinPalette',
        value: 'B',
      })
    ).toThrow(/available appearance/);
    expect(
      chooseNpcAppearance({
        currentRef: 'dnd5e:npcs:kingdom:missing',
        control: 'family',
        value: merchant,
      })
    ).toBe(merchant);
  });
});
