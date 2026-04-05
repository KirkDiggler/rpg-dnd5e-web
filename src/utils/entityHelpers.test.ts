import { create } from '@bufbuild/protobuf';
import { ConditionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { EntityStateSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  ConditionId,
  EntityType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  getEntityName,
  getHealthCategory,
  hasCondition,
  isDead,
  isUnconscious,
} from './entityHelpers';

// Helper to create a basic monster entity
function makeMonster(overrides: Partial<Parameters<typeof create>[1]> = {}) {
  return create(EntityStateSchema, {
    entityId: 'monster-1',
    entityType: EntityType.MONSTER,
    currentHitPoints: 20,
    maxHitPoints: 20,
    activeConditions: [],
    details: {
      case: 'monsterDetails',
      value: { name: 'Goblin', monsterType: 24, armorClass: 13 },
    },
    ...overrides,
  });
}

// Helper to create a basic character entity
function makeCharacter(overrides: Partial<Parameters<typeof create>[1]> = {}) {
  return create(EntityStateSchema, {
    entityId: 'char-1',
    entityType: EntityType.CHARACTER,
    currentHitPoints: 30,
    maxHitPoints: 30,
    activeConditions: [],
    details: {
      case: 'characterDetails',
      value: {
        name: 'Thorin',
        race: 1,
        characterClass: 1,
        level: 1,
        armorClass: 15,
      },
    },
    ...overrides,
  });
}

describe('entityHelpers', () => {
  describe('hasCondition', () => {
    it('returns false when activeConditions is empty', () => {
      const entity = makeMonster();
      expect(hasCondition(entity, ConditionId.UNCONSCIOUS)).toBe(false);
    });

    it('returns true when entity has the condition', () => {
      const entity = makeMonster({
        activeConditions: [
          create(ConditionSchema, { id: ConditionId.UNCONSCIOUS }),
        ],
      });
      expect(hasCondition(entity, ConditionId.UNCONSCIOUS)).toBe(true);
    });

    it('returns false when entity has a different condition', () => {
      const entity = makeMonster({
        activeConditions: [create(ConditionSchema, { id: ConditionId.RAGING })],
      });
      expect(hasCondition(entity, ConditionId.UNCONSCIOUS)).toBe(false);
    });

    it('returns true when entity has multiple conditions including the target', () => {
      const entity = makeMonster({
        activeConditions: [
          create(ConditionSchema, { id: ConditionId.RAGING }),
          create(ConditionSchema, { id: ConditionId.UNCONSCIOUS }),
        ],
      });
      expect(hasCondition(entity, ConditionId.UNCONSCIOUS)).toBe(true);
    });
  });

  describe('isDead', () => {
    it('returns false for monster with HP > 0', () => {
      const entity = makeMonster({ currentHitPoints: 5 });
      expect(isDead(entity)).toBe(false);
    });

    it('returns true for monster with HP === 0', () => {
      const entity = makeMonster({ currentHitPoints: 0 });
      expect(isDead(entity)).toBe(true);
    });

    it('returns true for monster with HP < 0', () => {
      const entity = makeMonster({ currentHitPoints: -5 });
      expect(isDead(entity)).toBe(true);
    });

    it('returns false for character with HP === 0 (characters go unconscious, not dead)', () => {
      const entity = makeCharacter({ currentHitPoints: 0 });
      expect(isDead(entity)).toBe(false);
    });

    it('returns false for character with HP > 0', () => {
      const entity = makeCharacter({ currentHitPoints: 15 });
      expect(isDead(entity)).toBe(false);
    });
  });

  describe('isUnconscious', () => {
    it('returns false when entity has no conditions', () => {
      const entity = makeMonster();
      expect(isUnconscious(entity)).toBe(false);
    });

    it('returns true when entity has UNCONSCIOUS condition', () => {
      const entity = makeCharacter({
        currentHitPoints: 0,
        activeConditions: [
          create(ConditionSchema, { id: ConditionId.UNCONSCIOUS }),
        ],
      });
      expect(isUnconscious(entity)).toBe(true);
    });

    it('returns false when entity has other conditions but not UNCONSCIOUS', () => {
      const entity = makeCharacter({
        activeConditions: [create(ConditionSchema, { id: ConditionId.RAGING })],
      });
      expect(isUnconscious(entity)).toBe(false);
    });
  });

  describe('getHealthCategory', () => {
    it('returns dead category for dead monster (0 HP)', () => {
      const entity = makeMonster({ currentHitPoints: 0 });
      const category = getHealthCategory(entity);
      expect(category.label).toBe('Dead');
      expect(category.color).toBe('#666');
    });

    it('returns dead category for monster with negative HP', () => {
      const entity = makeMonster({ currentHitPoints: -10 });
      const category = getHealthCategory(entity);
      expect(category.label).toBe('Dead');
      expect(category.color).toBe('#666');
    });

    it('returns uninjured for entity at full HP', () => {
      const entity = makeMonster({ currentHitPoints: 20, maxHitPoints: 20 });
      const category = getHealthCategory(entity);
      expect(category.label).toBe('Uninjured');
      expect(category.color).toBe('#4CAF50');
    });

    it('returns injured for entity at 75% HP', () => {
      const entity = makeMonster({ currentHitPoints: 15, maxHitPoints: 20 });
      const category = getHealthCategory(entity);
      expect(category.label).toBe('Injured');
      expect(category.color).toBe('#FFC107');
    });

    it('returns bloodied for entity at 50% HP', () => {
      const entity = makeMonster({ currentHitPoints: 10, maxHitPoints: 20 });
      const category = getHealthCategory(entity);
      expect(category.label).toBe('Bloodied');
      expect(category.color).toBe('#FF9800');
    });

    it('returns near-death for entity at 25% HP', () => {
      const entity = makeMonster({ currentHitPoints: 5, maxHitPoints: 20 });
      const category = getHealthCategory(entity);
      expect(category.label).toBe('Near Death');
      expect(category.color).toBe('#F44336');
    });

    it('returns uninjured for character at full HP', () => {
      const entity = makeCharacter({ currentHitPoints: 30, maxHitPoints: 30 });
      const category = getHealthCategory(entity);
      expect(category.label).toBe('Uninjured');
      expect(category.color).toBe('#4CAF50');
    });

    it('does NOT return dead for character at 0 HP', () => {
      const entity = makeCharacter({ currentHitPoints: 0 });
      const category = getHealthCategory(entity);
      expect(category.label).not.toBe('Dead');
    });

    it('handles maxHitPoints of 0 gracefully (no divide-by-zero)', () => {
      const entity = makeMonster({ currentHitPoints: 0, maxHitPoints: 0 });
      // Should not throw
      expect(() => getHealthCategory(entity)).not.toThrow();
    });
  });

  describe('getEntityName', () => {
    it('returns name from monsterDetails', () => {
      const entity = makeMonster();
      expect(getEntityName(entity)).toBe('Goblin');
    });

    it('returns name from characterDetails', () => {
      const entity = makeCharacter();
      expect(getEntityName(entity)).toBe('Thorin');
    });

    it('falls back to entityId when details case is undefined', () => {
      const entity = create(EntityStateSchema, {
        entityId: 'fallback-id',
        entityType: EntityType.OBSTACLE,
        currentHitPoints: 0,
        maxHitPoints: 0,
        activeConditions: [],
        details: { case: undefined },
      });
      expect(getEntityName(entity)).toBe('fallback-id');
    });

    it('falls back to entityId when details case is obstacleDetails', () => {
      const entity = create(EntityStateSchema, {
        entityId: 'obstacle-1',
        entityType: EntityType.OBSTACLE,
        currentHitPoints: 0,
        maxHitPoints: 0,
        blocksMovement: true,
        blocksLineOfSight: true,
        activeConditions: [],
        details: {
          case: 'obstacleDetails',
          value: {
            obstacleType: 1,
          },
        },
      });
      expect(getEntityName(entity)).toBe('obstacle-1');
    });
  });
});
