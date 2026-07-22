import { describe, expect, it } from 'vitest';
import type { IconQuality } from './itemIcons';
import {
  CANONICAL_ARMOR_IDS,
  CANONICAL_WEAPON_IDS,
  getItemIconUrl,
  ITEM_ICONS,
  SUPPLEMENTAL_ITEM_ICONS,
} from './itemIcons';

const VALID_QUALITIES: IconQuality[] = ['dedicated', 'approximate', 'generic'];

describe('itemIcons', () => {
  describe('canonical id lists', () => {
    it('has exactly 38 canonical weapon ids', () => {
      expect(CANONICAL_WEAPON_IDS).toHaveLength(38);
    });

    it('has exactly 13 canonical armor ids', () => {
      expect(CANONICAL_ARMOR_IDS).toHaveLength(13);
    });

    it('has no id shared between the weapon and armor lists', () => {
      const weaponSet: Set<string> = new Set(CANONICAL_WEAPON_IDS);
      const overlap = CANONICAL_ARMOR_IDS.filter((id) => weaponSet.has(id));
      expect(overlap).toEqual([]);
    });
  });

  describe('ITEM_ICONS exhaustiveness', () => {
    it('has an entry for every canonical weapon id', () => {
      for (const id of CANONICAL_WEAPON_IDS) {
        expect(
          ITEM_ICONS[id],
          `missing ITEM_ICONS entry for "${id}"`
        ).toBeDefined();
      }
    });

    it('has an entry for every canonical armor id', () => {
      for (const id of CANONICAL_ARMOR_IDS) {
        expect(
          ITEM_ICONS[id],
          `missing ITEM_ICONS entry for "${id}"`
        ).toBeDefined();
      }
    });

    it('has exactly 51 entries — no extra ids beyond the 38+13 canonical set', () => {
      expect(Object.keys(ITEM_ICONS)).toHaveLength(38 + 13);
    });
  });

  describe('entry validity', () => {
    it('every ITEM_ICONS entry has a non-empty path and a valid quality', () => {
      for (const [id, entry] of Object.entries(ITEM_ICONS)) {
        expect(entry.path.length, `${id} has an empty path`).toBeGreaterThan(0);
        expect(
          VALID_QUALITIES,
          `${id} has an invalid quality "${entry.quality}"`
        ).toContain(entry.quality);
      }
    });

    it('every SUPPLEMENTAL_ITEM_ICONS entry has a non-empty path and a valid quality', () => {
      for (const [id, entry] of Object.entries(SUPPLEMENTAL_ITEM_ICONS)) {
        expect(entry.path.length, `${id} has an empty path`).toBeGreaterThan(0);
        expect(
          VALID_QUALITIES,
          `${id} has an invalid quality "${entry.quality}"`
        ).toContain(entry.quality);
      }
    });
  });

  describe('getItemIconUrl resolution', () => {
    it('resolves a dedicated weapon (shortsword) by canonical id with an empty icon_key', () => {
      expect(getItemIconUrl({ id: 'shortsword' }, '')).toBe(
        '/models/synty/ui/library/icons/weapons/ICON_SM_Wep_Sword_02_Clean.png'
      );
    });

    it('resolves a dedicated weapon (greataxe) by canonical id with an empty icon_key', () => {
      expect(getItemIconUrl({ id: 'greataxe' }, '')).toBe(
        '/models/synty/ui/library/icons/inventory/ICON_FantasyWarrior_Inventory_Axes01_Clean.png'
      );
    });

    it('resolves a dedicated weapon (quarterstaff) by canonical id with an empty icon_key', () => {
      expect(getItemIconUrl({ id: 'quarterstaff' }, '')).toBe(
        '/models/synty/ui/library/icons/weapons/ICON_SM_Wep_Staff_01_Clean.png'
      );
    });

    it('resolves an approximate weapon (greatclub) by canonical id', () => {
      expect(getItemIconUrl({ id: 'greatclub' }, '')).toBe(
        '/models/synty/ui/library/icons/weapons/ICON_SM_Wep_Staff_02_Clean.png'
      );
    });

    it('resolves an approximate weapon (heavy-crossbow) by canonical id', () => {
      expect(getItemIconUrl({ id: 'heavy-crossbow' }, '')).toBe(
        '/models/synty/ui/library/icons/inventory/ICON_FantasyWarrior_Inventory_Bows01_Clean.png'
      );
    });

    it('resolves a generic weapon (club) by canonical id', () => {
      expect(getItemIconUrl({ id: 'club' }, '')).toBe(
        '/models/synty/ui/library/icons/inventory/ICON_FantasyWarrior_Inventory_Items01_Clean.png'
      );
    });

    it('resolves a generic weapon (unarmed-strike) by canonical id', () => {
      expect(getItemIconUrl({ id: 'unarmed-strike' }, '')).toBe(
        '/models/synty/ui/library/icons/inventory/ICON_FantasyWarrior_Inventory_Items01_Clean.png'
      );
    });

    it('resolves the dedicated armor id (shield)', () => {
      expect(getItemIconUrl({ id: 'shield' }, '')).toBe(
        '/models/synty/ui/library/icons/weapons/ICON_SM_Wep_Shield_01_Clean.png'
      );
    });

    it('resolves a generic body-armor id (leather)', () => {
      expect(getItemIconUrl({ id: 'leather' }, '')).toBe(
        '/models/synty/ui/library/icons/inventory/ICON_FantasyWarrior_Inventory_Armor01_Clean.png'
      );
    });

    it('wire icon_key wins over a canonical id match', () => {
      expect(
        getItemIconUrl({ id: 'longsword' }, 'icons/weapons/custom-override.png')
      ).toBe('/models/synty/ui/library/icons/weapons/custom-override.png');
    });

    it('resolves a supplemental id (bolts-20) not in the canonical map', () => {
      expect(getItemIconUrl({ id: 'bolts-20' }, '')).toBe(
        '/models/synty/ui/library/icons/inventory/ICON_FantasyWarrior_Inventory_Arrows01_Clean.png'
      );
    });

    it('resolves a supplemental id (dungeoneer-pack) not in the canonical map', () => {
      expect(getItemIconUrl({ id: 'dungeoneer-pack' }, '')).toBe(
        '/models/synty/ui/library/icons/inventory/ICON_FantasyWarrior_Inventory_Backpack01_Clean.png'
      );
    });

    it('returns undefined for an unknown homebrew id with an empty icon_key', () => {
      expect(getItemIconUrl({ id: 'homebrew-relic' }, '')).toBeUndefined();
    });
  });
});
