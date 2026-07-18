import { describe, expect, it } from 'vitest';
import {
  getAllConditions,
  getConditionDisplay,
  isNegativeCondition,
  isPositiveCondition,
} from './conditionIcons';

describe('conditionIcons', () => {
  describe('getConditionDisplay', () => {
    describe('standard D&D conditions', () => {
      const standardConditions = [
        'blinded',
        'charmed',
        'deafened',
        'exhaustion',
        'frightened',
        'grappled',
        'incapacitated',
        'invisible',
        'paralyzed',
        'petrified',
        'poisoned',
        'prone',
        'restrained',
        'stunned',
        'unconscious',
      ];

      for (const condition of standardConditions) {
        it(`returns display info for ${condition}`, () => {
          const display = getConditionDisplay(condition);
          expect(display.icon).toBeTruthy();
          expect(display.label).toBeTruthy();
          expect(display.color).toBeTruthy();
          expect(display.description).toBeTruthy();
        });
      }
    });

    describe('buff conditions', () => {
      it('returns display info for raging', () => {
        const display = getConditionDisplay('raging');
        expect(display.icon).toBe('🔥');
        expect(display.label).toBe('Raging');
        expect(display.color).toBe('#f97316');
      });

      it('returns display info for rage (alias)', () => {
        const display = getConditionDisplay('rage');
        expect(display.icon).toBe('🔥');
      });

      it('returns display info for hasted', () => {
        const display = getConditionDisplay('hasted');
        expect(display.icon).toBe('⚡');
      });
    });

    describe('combat state conditions', () => {
      it('returns display info for dying', () => {
        const display = getConditionDisplay('dying');
        expect(display.icon).toBe('💀');
        expect(display.label).toBe('Dying');
      });

      it('returns display info for stable', () => {
        const display = getConditionDisplay('stable');
        expect(display.icon).toBe('🩹');
      });

      it('returns display info for dead', () => {
        const display = getConditionDisplay('dead');
        expect(display.icon).toBe('☠️');
      });
    });

    describe('Synty HUD icon mapping (#467)', () => {
      const SYNTY_BASE = '/models/synty/ui/status';

      it.each([
        ['raging', 'AttackUp01'],
        ['rage', 'AttackUp01'],
        ['dodging', 'Defense01'],
        ['unconscious', 'Down01'],
        ['dying', 'Down01'],
        ['dead', 'Dead01'],
        ['helped', 'Up01'],
        ['cursed', 'Cursed01'],
        ['bleeding', 'Bleeding01'],
        ['poisoned', 'Poisoned01'],
        ['entangled', 'Entangled01'],
        ['restrained', 'Entangled01'],
        ['charmed', 'Charmed01'],
      ])('maps %s to the %s PNG', (condition, iconName) => {
        const display = getConditionDisplay(condition);
        expect(display.iconUrl).toBe(
          `${SYNTY_BASE}/ICON_FantasyWarrior_Status_${iconName}_Clean.png`
        );
        // emoji fallback stays populated even when a PNG is mapped
        expect(display.icon).toBeTruthy();
      });

      it('falls back to the generic buff icon (Up01) for other positive conditions', () => {
        expect(getConditionDisplay('hasted').iconUrl).toBe(
          `${SYNTY_BASE}/ICON_FantasyWarrior_Status_Up01_Clean.png`
        );
        expect(getConditionDisplay('blessed').iconUrl).toBe(
          `${SYNTY_BASE}/ICON_FantasyWarrior_Status_Up01_Clean.png`
        );
      });

      it('falls back to the generic debuff icon (Cursed01) for other negative conditions', () => {
        expect(getConditionDisplay('blinded').iconUrl).toBe(
          `${SYNTY_BASE}/ICON_FantasyWarrior_Status_Cursed01_Clean.png`
        );
        expect(getConditionDisplay('stunned').iconUrl).toBe(
          `${SYNTY_BASE}/ICON_FantasyWarrior_Status_Cursed01_Clean.png`
        );
      });

      it('leaves iconUrl undefined for conditions that are neither buff nor debuff', () => {
        // 'hidden' and 'concentrating' are action-state/neutral, not mapped
        // directly and not classified positive/negative — emoji-only.
        expect(getConditionDisplay('hidden').iconUrl).toBeUndefined();
        expect(getConditionDisplay('concentrating').iconUrl).toBeUndefined();
      });

      it('leaves iconUrl undefined for completely unknown conditions', () => {
        expect(getConditionDisplay('something_weird').iconUrl).toBeUndefined();
        expect(getConditionDisplay('').iconUrl).toBeUndefined();
      });
    });

    describe('case insensitivity', () => {
      it('handles uppercase', () => {
        const display = getConditionDisplay('POISONED');
        expect(display.icon).toBe('☠️');
        expect(display.label).toBe('Poisoned');
      });

      it('handles mixed case', () => {
        const display = getConditionDisplay('Frightened');
        expect(display.icon).toBe('😱');
      });

      it('trims whitespace', () => {
        const display = getConditionDisplay('  raging  ');
        expect(display.icon).toBe('🔥');
      });
    });

    describe('unknown conditions', () => {
      it('returns default display with capitalized label', () => {
        const display = getConditionDisplay('something_weird');
        expect(display.icon).toBe('❓');
        expect(display.label).toBe('Something_weird');
      });

      it('handles empty string', () => {
        const display = getConditionDisplay('');
        expect(display.icon).toBe('❓');
      });
    });
  });

  describe('isNegativeCondition', () => {
    it('returns true for standard D&D conditions', () => {
      expect(isNegativeCondition('blinded')).toBe(true);
      expect(isNegativeCondition('poisoned')).toBe(true);
      expect(isNegativeCondition('stunned')).toBe(true);
      expect(isNegativeCondition('paralyzed')).toBe(true);
    });

    it('returns true for combat state conditions', () => {
      expect(isNegativeCondition('dying')).toBe(true);
      expect(isNegativeCondition('dead')).toBe(true);
    });

    it('returns true for slowed (buff list but negative)', () => {
      expect(isNegativeCondition('slowed')).toBe(true);
    });

    it('returns false for buff conditions', () => {
      expect(isNegativeCondition('raging')).toBe(false);
      expect(isNegativeCondition('hasted')).toBe(false);
      expect(isNegativeCondition('blessed')).toBe(false);
    });

    it('returns false for unknown conditions', () => {
      expect(isNegativeCondition('custom_thing')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(isNegativeCondition('POISONED')).toBe(true);
      expect(isNegativeCondition('Blinded')).toBe(true);
    });
  });

  describe('isPositiveCondition', () => {
    it('returns true for buff conditions', () => {
      expect(isPositiveCondition('raging')).toBe(true);
      expect(isPositiveCondition('rage')).toBe(true);
      expect(isPositiveCondition('hasted')).toBe(true);
      expect(isPositiveCondition('blessed')).toBe(true);
      expect(isPositiveCondition('inspired')).toBe(true);
    });

    it('returns false for slowed (technically in buff list but negative)', () => {
      expect(isPositiveCondition('slowed')).toBe(false);
    });

    it('returns false for concentrating (neutral)', () => {
      expect(isPositiveCondition('concentrating')).toBe(false);
    });

    it('returns false for standard D&D conditions', () => {
      expect(isPositiveCondition('poisoned')).toBe(false);
      expect(isPositiveCondition('blinded')).toBe(false);
    });

    it('returns false for unknown conditions', () => {
      expect(isPositiveCondition('custom_thing')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(isPositiveCondition('RAGING')).toBe(true);
      expect(isPositiveCondition('Hasted')).toBe(true);
    });
  });

  describe('getAllConditions', () => {
    it('returns non-empty array', () => {
      const conditions = getAllConditions();
      expect(conditions.length).toBeGreaterThan(0);
    });

    it('includes standard, buff, and combat conditions', () => {
      const conditions = getAllConditions();
      const labels = conditions.map((c) => c.label);
      // Standard
      expect(labels).toContain('Poisoned');
      expect(labels).toContain('Blinded');
      // Buff
      expect(labels).toContain('Raging');
      expect(labels).toContain('Hasted');
      // Combat state
      expect(labels).toContain('Dying');
      expect(labels).toContain('Dead');
    });

    it('all conditions have required fields', () => {
      const conditions = getAllConditions();
      for (const condition of conditions) {
        expect(condition.icon).toBeTruthy();
        expect(condition.label).toBeTruthy();
      }
    });
  });
});
