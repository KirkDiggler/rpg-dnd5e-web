import { ConditionId } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  conditionIdToString,
  getMartialArtsDie,
  getUnarmoredMovementBonus,
  isBrutalCriticalData,
  isImprovedCriticalData,
  isMartialArtsData,
  isRagingData,
  isSneakAttackData,
  isUnarmoredDefenseData,
  isUnarmoredMovementData,
  parseConditionData,
} from './conditionData';

describe('conditionData', () => {
  describe('parseConditionData', () => {
    it('returns undefined for undefined input', () => {
      expect(parseConditionData(undefined)).toBeUndefined();
    });

    it('returns undefined for empty Uint8Array', () => {
      expect(parseConditionData(new Uint8Array(0))).toBeUndefined();
    });

    it('returns undefined for invalid JSON', () => {
      const bytes = new TextEncoder().encode('{not valid');
      expect(parseConditionData(bytes)).toBeUndefined();
    });

    it('parses raging condition data', () => {
      const json = JSON.stringify({
        character_id: 'char-123',
        damage_bonus: 2,
        level: 1,
        source: 'dnd5e:features:rage',
        turns_active: 3,
        was_hit_this_turn: true,
        did_attack_this_turn: false,
      });
      const bytes = new TextEncoder().encode(json);
      const result = parseConditionData(bytes);

      expect(result).toBeDefined();
      expect(result!.character_id).toBe('char-123');
    });

    it('parses sneak attack condition data', () => {
      const json = JSON.stringify({
        character_id: 'char-456',
        level: 3,
        damage_dice: 2,
      });
      const bytes = new TextEncoder().encode(json);
      const result = parseConditionData(bytes);

      expect(result).toBeDefined();
    });

    it('parses minimal base condition data', () => {
      const json = JSON.stringify({
        character_id: 'char-789',
      });
      const bytes = new TextEncoder().encode(json);
      const result = parseConditionData(bytes);

      expect(result).toBeDefined();
      expect(result!.character_id).toBe('char-789');
    });
  });

  describe('type guards', () => {
    it('isRagingData detects raging by damage_bonus + turns_active', () => {
      const data = {
        character_id: 'c1',
        damage_bonus: 2,
        level: 1,
        source: 'dnd5e:features:rage',
        turns_active: 0,
        was_hit_this_turn: false,
        did_attack_this_turn: false,
      };
      expect(isRagingData(data)).toBe(true);
    });

    it('isRagingData returns false for non-raging data', () => {
      const data = { character_id: 'c1' };
      expect(isRagingData(data)).toBe(false);
    });

    it('isUnarmoredDefenseData detects barbarian type', () => {
      const data = {
        character_id: 'c1',
        type: 'barbarian' as const,
        source: 'dnd5e:classes:barbarian',
      };
      expect(isUnarmoredDefenseData(data)).toBe(true);
    });

    it('isUnarmoredDefenseData detects monk type', () => {
      const data = {
        character_id: 'c1',
        type: 'monk' as const,
        source: 'dnd5e:classes:monk',
      };
      expect(isUnarmoredDefenseData(data)).toBe(true);
    });

    it('isUnarmoredDefenseData returns false for non-matching type', () => {
      const data = { character_id: 'c1', type: 'fighter' };
      expect(isUnarmoredDefenseData(data)).toBe(false);
    });

    it('isBrutalCriticalData detects by extra_dice', () => {
      const data = { character_id: 'c1', level: 9, extra_dice: 1 };
      expect(isBrutalCriticalData(data)).toBe(true);
    });

    it('isBrutalCriticalData returns false without extra_dice', () => {
      const data = { character_id: 'c1', level: 9 };
      expect(isBrutalCriticalData(data)).toBe(false);
    });

    it('isSneakAttackData detects by damage_dice', () => {
      const data = { character_id: 'c1', level: 3, damage_dice: 2 };
      expect(isSneakAttackData(data)).toBe(true);
    });

    it('isSneakAttackData returns false without damage_dice', () => {
      const data = { character_id: 'c1', level: 3 };
      expect(isSneakAttackData(data)).toBe(false);
    });

    it('isMartialArtsData detects by monk_level', () => {
      const data = { character_id: 'c1', monk_level: 5 };
      expect(isMartialArtsData(data)).toBe(true);
    });

    it('isMartialArtsData returns false with threshold (improved critical)', () => {
      // Both MartialArts and ImprovedCritical could have monk_level
      // But ImprovedCritical has threshold - guard uses this distinction
      const data = { character_id: 'c1', monk_level: 5, threshold: 19 };
      expect(isMartialArtsData(data)).toBe(false);
    });

    it('isImprovedCriticalData detects by threshold', () => {
      const data = { character_id: 'c1', threshold: 19 };
      expect(isImprovedCriticalData(data)).toBe(true);
    });

    it('isImprovedCriticalData returns false without threshold', () => {
      const data = { character_id: 'c1', monk_level: 5 };
      expect(isImprovedCriticalData(data)).toBe(false);
    });

    it('isUnarmoredMovementData detects by monk_level', () => {
      const data = { character_id: 'c1', monk_level: 6 };
      expect(isUnarmoredMovementData(data)).toBe(true);
    });

    it('isUnarmoredMovementData returns false with threshold', () => {
      const data = { character_id: 'c1', monk_level: 6, threshold: 19 };
      expect(isUnarmoredMovementData(data)).toBe(false);
    });

    it('isUnarmoredMovementData returns false without monk_level', () => {
      const data = { character_id: 'c1' };
      expect(isUnarmoredMovementData(data)).toBe(false);
    });
  });

  describe('conditionIdToString', () => {
    it('maps RAGING to raging', () => {
      expect(conditionIdToString(ConditionId.RAGING)).toBe('raging');
    });

    it('maps BRUTAL_CRITICAL to brutal_critical', () => {
      expect(conditionIdToString(ConditionId.BRUTAL_CRITICAL)).toBe(
        'brutal_critical'
      );
    });

    it('maps SNEAK_ATTACK to sneak_attack', () => {
      expect(conditionIdToString(ConditionId.SNEAK_ATTACK)).toBe(
        'sneak_attack'
      );
    });

    it('maps MARTIAL_ARTS to martial_arts', () => {
      expect(conditionIdToString(ConditionId.MARTIAL_ARTS)).toBe(
        'martial_arts'
      );
    });

    it('maps UNARMORED_DEFENSE to unarmored_defense', () => {
      expect(conditionIdToString(ConditionId.UNARMORED_DEFENSE)).toBe(
        'unarmored_defense'
      );
    });

    it('maps IMPROVED_CRITICAL to improved_critical', () => {
      expect(conditionIdToString(ConditionId.IMPROVED_CRITICAL)).toBe(
        'improved_critical'
      );
    });

    it('maps UNARMORED_MOVEMENT to unarmored_movement', () => {
      expect(conditionIdToString(ConditionId.UNARMORED_MOVEMENT)).toBe(
        'unarmored_movement'
      );
    });

    it('maps all fighting styles', () => {
      expect(conditionIdToString(ConditionId.FIGHTING_STYLE_DUELING)).toBe(
        'fighting_style_dueling'
      );
      expect(
        conditionIdToString(ConditionId.FIGHTING_STYLE_TWO_WEAPON_FIGHTING)
      ).toBe('fighting_style_two_weapon_fighting');
      expect(
        conditionIdToString(ConditionId.FIGHTING_STYLE_GREAT_WEAPON_FIGHTING)
      ).toBe('fighting_style_great_weapon_fighting');
      expect(conditionIdToString(ConditionId.FIGHTING_STYLE_ARCHERY)).toBe(
        'fighting_style_archery'
      );
      expect(conditionIdToString(ConditionId.FIGHTING_STYLE_DEFENSE)).toBe(
        'fighting_style_defense'
      );
      expect(conditionIdToString(ConditionId.FIGHTING_STYLE_PROTECTION)).toBe(
        'fighting_style_protection'
      );
    });

    it('returns unknown for UNSPECIFIED', () => {
      expect(conditionIdToString(ConditionId.UNSPECIFIED)).toBe('unknown');
    });
  });

  describe('getMartialArtsDie', () => {
    it('returns 1d4 for levels 1-4', () => {
      expect(getMartialArtsDie(1)).toBe('1d4');
      expect(getMartialArtsDie(4)).toBe('1d4');
    });

    it('returns 1d6 for levels 5-10', () => {
      expect(getMartialArtsDie(5)).toBe('1d6');
      expect(getMartialArtsDie(10)).toBe('1d6');
    });

    it('returns 1d8 for levels 11-16', () => {
      expect(getMartialArtsDie(11)).toBe('1d8');
      expect(getMartialArtsDie(16)).toBe('1d8');
    });

    it('returns 1d10 for levels 17-20', () => {
      expect(getMartialArtsDie(17)).toBe('1d10');
      expect(getMartialArtsDie(20)).toBe('1d10');
    });
  });

  describe('getUnarmoredMovementBonus', () => {
    it('returns 10 for levels 2-5', () => {
      expect(getUnarmoredMovementBonus(2)).toBe(10);
      expect(getUnarmoredMovementBonus(5)).toBe(10);
    });

    it('returns 15 for levels 6-9', () => {
      expect(getUnarmoredMovementBonus(6)).toBe(15);
      expect(getUnarmoredMovementBonus(9)).toBe(15);
    });

    it('returns 20 for levels 10-13', () => {
      expect(getUnarmoredMovementBonus(10)).toBe(20);
      expect(getUnarmoredMovementBonus(13)).toBe(20);
    });

    it('returns 25 for levels 14-17', () => {
      expect(getUnarmoredMovementBonus(14)).toBe(25);
      expect(getUnarmoredMovementBonus(17)).toBe(25);
    });

    it('returns 30 for levels 18-20', () => {
      expect(getUnarmoredMovementBonus(18)).toBe(30);
      expect(getUnarmoredMovementBonus(20)).toBe(30);
    });
  });
});
