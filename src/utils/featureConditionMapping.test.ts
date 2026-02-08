import { create } from '@bufbuild/protobuf';
import { ConditionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import {
  ConditionId,
  FeatureId,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  getActiveConditionIds,
  getConditionIdForFeature,
  isFeatureActiveByCondition,
} from './featureConditionMapping';

/** Helper to create a Condition proto message */
function makeCondition(id: ConditionId, name?: string) {
  return create(ConditionSchema, {
    id,
    name: name ?? '',
    source: '',
    duration: -1,
    notes: '',
  });
}

describe('featureConditionMapping', () => {
  describe('getConditionIdForFeature', () => {
    it('maps RAGE to RAGING', () => {
      expect(getConditionIdForFeature(FeatureId.RAGE)).toBe(ConditionId.RAGING);
    });

    it('returns undefined for unmapped features', () => {
      expect(getConditionIdForFeature(FeatureId.SECOND_WIND)).toBeUndefined();
      expect(getConditionIdForFeature(FeatureId.ACTION_SURGE)).toBeUndefined();
      expect(
        getConditionIdForFeature(FeatureId.FLURRY_OF_BLOWS)
      ).toBeUndefined();
      expect(getConditionIdForFeature(FeatureId.SNEAK_ATTACK)).toBeUndefined();
    });

    it('returns undefined for UNSPECIFIED', () => {
      expect(getConditionIdForFeature(FeatureId.UNSPECIFIED)).toBeUndefined();
    });
  });

  describe('isFeatureActiveByCondition', () => {
    it('returns true when rage feature has active raging condition', () => {
      const conditions = [makeCondition(ConditionId.RAGING, 'raging')];
      expect(isFeatureActiveByCondition(FeatureId.RAGE, conditions)).toBe(true);
    });

    it('returns false when rage feature has no matching condition', () => {
      const conditions = [
        makeCondition(ConditionId.SNEAK_ATTACK, 'sneak_attack'),
      ];
      expect(isFeatureActiveByCondition(FeatureId.RAGE, conditions)).toBe(
        false
      );
    });

    it('returns false for empty conditions array', () => {
      expect(isFeatureActiveByCondition(FeatureId.RAGE, [])).toBe(false);
    });

    it('returns false for features with no condition mapping', () => {
      const conditions = [
        makeCondition(ConditionId.RAGING, 'raging'),
        makeCondition(ConditionId.SNEAK_ATTACK, 'sneak_attack'),
      ];
      // Second Wind has no condition mapping
      expect(
        isFeatureActiveByCondition(FeatureId.SECOND_WIND, conditions)
      ).toBe(false);
    });

    it('finds condition among multiple active conditions', () => {
      const conditions = [
        makeCondition(ConditionId.SNEAK_ATTACK, 'sneak_attack'),
        makeCondition(ConditionId.MARTIAL_ARTS, 'martial_arts'),
        makeCondition(ConditionId.RAGING, 'raging'),
      ];
      expect(isFeatureActiveByCondition(FeatureId.RAGE, conditions)).toBe(true);
    });
  });

  describe('getActiveConditionIds', () => {
    it('returns empty set for no conditions', () => {
      const result = getActiveConditionIds([]);
      expect(result.size).toBe(0);
    });

    it('returns set of all condition IDs', () => {
      const conditions = [
        makeCondition(ConditionId.RAGING),
        makeCondition(ConditionId.SNEAK_ATTACK),
        makeCondition(ConditionId.MARTIAL_ARTS),
      ];
      const result = getActiveConditionIds(conditions);
      expect(result.size).toBe(3);
      expect(result.has(ConditionId.RAGING)).toBe(true);
      expect(result.has(ConditionId.SNEAK_ATTACK)).toBe(true);
      expect(result.has(ConditionId.MARTIAL_ARTS)).toBe(true);
    });

    it('excludes UNSPECIFIED conditions', () => {
      const conditions = [
        makeCondition(ConditionId.UNSPECIFIED),
        makeCondition(ConditionId.RAGING),
      ];
      const result = getActiveConditionIds(conditions);
      expect(result.size).toBe(1);
      expect(result.has(ConditionId.RAGING)).toBe(true);
      expect(result.has(ConditionId.UNSPECIFIED)).toBe(false);
    });

    it('deduplicates same condition ID', () => {
      const conditions = [
        makeCondition(ConditionId.RAGING),
        makeCondition(ConditionId.RAGING),
      ];
      const result = getActiveConditionIds(conditions);
      expect(result.size).toBe(1);
    });
  });
});
