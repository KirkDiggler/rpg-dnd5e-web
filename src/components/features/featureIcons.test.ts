import { describe, expect, it } from 'vitest';
import {
  getConditionCategory,
  getConditionIcon,
  getFeatureIcon,
  parseSourceCategory,
} from './featureIcons';

describe('featureIcons', () => {
  describe('getFeatureIcon', () => {
    it('returns correct icon for known features', () => {
      expect(getFeatureIcon('Rage')).toBe('🔥');
      expect(getFeatureIcon('Second Wind')).toBe('💚');
      expect(getFeatureIcon('Sneak Attack')).toBe('🗡️');
      expect(getFeatureIcon('Flurry of Blows')).toBe('👊');
      expect(getFeatureIcon('Patient Defense')).toBe('🛡️');
      expect(getFeatureIcon('Step of the Wind')).toBe('💨');
    });

    it('handles case-insensitive lookup', () => {
      expect(getFeatureIcon('rage')).toBe('🔥');
      expect(getFeatureIcon('RAGE')).toBe('🔥');
      expect(getFeatureIcon('Rage')).toBe('🔥');
    });

    it('converts spaces to underscores for lookup', () => {
      expect(getFeatureIcon('Reckless Attack')).toBe('💥');
      expect(getFeatureIcon('Action Surge')).toBe('⚡');
      expect(getFeatureIcon('Danger Sense')).toBe('⚠️');
      expect(getFeatureIcon('Cunning Action')).toBe('🎭');
    });

    it('returns default icon for unknown features', () => {
      expect(getFeatureIcon('Unknown Feature')).toBe('✨');
      expect(getFeatureIcon('')).toBe('✨');
    });
  });

  describe('getConditionIcon', () => {
    it('returns correct icon for known conditions', () => {
      expect(getConditionIcon('raging')).toBe('🔥');
      expect(getConditionIcon('dueling')).toBe('⚔️');
      expect(getConditionIcon('defense')).toBe('🛡️');
      expect(getConditionIcon('blinded')).toBe('👁️');
      expect(getConditionIcon('poisoned')).toBe('☠️');
    });

    it('handles case-insensitive lookup', () => {
      expect(getConditionIcon('Raging')).toBe('🔥');
      expect(getConditionIcon('BLINDED')).toBe('👁️');
    });

    it('returns default icon for unknown conditions', () => {
      expect(getConditionIcon('unknown_condition')).toBe('⭐');
      expect(getConditionIcon('')).toBe('⭐');
    });
  });

  describe('parseSourceCategory', () => {
    it('parses classes category from source ref', () => {
      expect(parseSourceCategory('dnd5e:classes:barbarian')).toBe('classes');
    });

    it('parses conditions category', () => {
      expect(parseSourceCategory('dnd5e:conditions:frightened')).toBe(
        'conditions'
      );
    });

    it('parses features category', () => {
      expect(parseSourceCategory('dnd5e:features:rage')).toBe('features');
    });

    it('parses fighting-styles category', () => {
      expect(parseSourceCategory('dnd5e:fighting-styles:dueling')).toBe(
        'fighting-styles'
      );
    });

    it('parses races category', () => {
      expect(parseSourceCategory('dnd5e:races:halfling')).toBe('races');
    });

    it('returns null for single-part string', () => {
      expect(parseSourceCategory('nocolon')).toBeNull();
    });

    it('handles two-part strings', () => {
      expect(parseSourceCategory('dnd5e:classes')).toBe('classes');
    });
  });

  describe('getConditionCategory', () => {
    it('returns class for classes source', () => {
      expect(getConditionCategory('dnd5e:classes:barbarian')).toBe('class');
    });

    it('returns fighting-style for fighting-styles source', () => {
      expect(getConditionCategory('dnd5e:fighting-styles:dueling')).toBe(
        'fighting-style'
      );
    });

    it('returns racial for races source', () => {
      expect(getConditionCategory('dnd5e:races:halfling')).toBe('racial');
    });

    it('returns debuff for conditions source', () => {
      expect(getConditionCategory('dnd5e:conditions:poisoned')).toBe('debuff');
    });

    it('returns unknown for unrecognized source', () => {
      expect(getConditionCategory('dnd5e:spells:fireball')).toBe('unknown');
      expect(getConditionCategory('unknown')).toBe('unknown');
    });
  });
});
