import { create } from '@bufbuild/protobuf';
import {
  AttackResultSchema,
  MonsterExecutedActionSchema,
  MonsterTurnResultSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { MonsterActionType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  extractDamageFromMonsterTurns,
  formatEntityId,
} from './monsterTurnUtils';

describe('monsterTurnUtils', () => {
  describe('formatEntityId', () => {
    it('formats simple entity ID with instance number', () => {
      expect(formatEntityId('skeleton-1')).toBe('Skeleton 1');
    });

    it('formats multi-word entity ID', () => {
      expect(formatEntityId('giant-spider-2')).toBe('Giant Spider 2');
    });

    it('formats three-word entity ID', () => {
      expect(formatEntityId('ice-giant-king-3')).toBe('Ice Giant King 3');
    });

    it('handles entity ID without instance number', () => {
      expect(formatEntityId('goblin')).toBe('Goblin');
    });

    it('handles single character entity ID', () => {
      const result = formatEntityId('a');
      expect(result).toBe('A');
    });

    it('handles empty string', () => {
      expect(formatEntityId('')).toBe('');
    });

    it('handles ID that looks like number only', () => {
      // "123" - last part is numeric but only one part total
      const result = formatEntityId('123');
      expect(result).toBe('123');
    });

    it('handles entity with zero instance number', () => {
      expect(formatEntityId('zombie-0')).toBe('Zombie 0');
    });
  });

  describe('extractDamageFromMonsterTurns', () => {
    it('returns empty array for empty turns', () => {
      expect(extractDamageFromMonsterTurns([])).toEqual([]);
    });

    it('extracts damage from a successful melee attack', () => {
      const turn = create(MonsterTurnResultSchema, {
        monsterId: 'skeleton-1',
        monsterName: 'Skeleton',
        actions: [
          create(MonsterExecutedActionSchema, {
            actionType: MonsterActionType.MELEE_ATTACK,
            targetId: 'char-123',
            success: true,
            details: {
              case: 'attackResult',
              value: create(AttackResultSchema, {
                hit: true,
                attackRoll: 15,
                attackTotal: 19,
                targetAc: 14,
                damage: 8,
                critical: false,
              }),
            },
          }),
        ],
      });

      const damages = extractDamageFromMonsterTurns([turn]);
      expect(damages).toHaveLength(1);
      expect(damages[0]).toEqual({
        targetId: 'char-123',
        damage: 8,
        isCritical: false,
      });
    });

    it('extracts critical hit damage', () => {
      const turn = create(MonsterTurnResultSchema, {
        monsterId: 'ogre-1',
        monsterName: 'Ogre',
        actions: [
          create(MonsterExecutedActionSchema, {
            actionType: MonsterActionType.MELEE_ATTACK,
            targetId: 'char-456',
            success: true,
            details: {
              case: 'attackResult',
              value: create(AttackResultSchema, {
                hit: true,
                attackRoll: 20,
                attackTotal: 24,
                targetAc: 15,
                damage: 16,
                critical: true,
              }),
            },
          }),
        ],
      });

      const damages = extractDamageFromMonsterTurns([turn]);
      expect(damages).toHaveLength(1);
      expect(damages[0].isCritical).toBe(true);
      expect(damages[0].damage).toBe(16);
    });

    it('ignores missed attacks', () => {
      const turn = create(MonsterTurnResultSchema, {
        monsterId: 'goblin-1',
        monsterName: 'Goblin',
        actions: [
          create(MonsterExecutedActionSchema, {
            actionType: MonsterActionType.MELEE_ATTACK,
            targetId: 'char-123',
            success: false,
            details: {
              case: 'attackResult',
              value: create(AttackResultSchema, {
                hit: false,
                attackRoll: 5,
                attackTotal: 9,
                targetAc: 14,
                damage: 0,
                critical: false,
              }),
            },
          }),
        ],
      });

      const damages = extractDamageFromMonsterTurns([turn]);
      expect(damages).toHaveLength(0);
    });

    it('ignores non-attack actions (heal)', () => {
      const turn = create(MonsterTurnResultSchema, {
        monsterId: 'cleric-1',
        monsterName: 'Acolyte',
        actions: [
          create(MonsterExecutedActionSchema, {
            actionType: MonsterActionType.HEAL,
            targetId: 'goblin-2',
            success: true,
          }),
        ],
      });

      const damages = extractDamageFromMonsterTurns([turn]);
      expect(damages).toHaveLength(0);
    });

    it('extracts from multiple turns and actions', () => {
      const turns = [
        create(MonsterTurnResultSchema, {
          monsterId: 'skeleton-1',
          monsterName: 'Skeleton',
          actions: [
            create(MonsterExecutedActionSchema, {
              actionType: MonsterActionType.MELEE_ATTACK,
              targetId: 'char-1',
              success: true,
              details: {
                case: 'attackResult',
                value: create(AttackResultSchema, {
                  hit: true,
                  damage: 5,
                  critical: false,
                }),
              },
            }),
          ],
        }),
        create(MonsterTurnResultSchema, {
          monsterId: 'skeleton-2',
          monsterName: 'Skeleton',
          actions: [
            create(MonsterExecutedActionSchema, {
              actionType: MonsterActionType.RANGED_ATTACK,
              targetId: 'char-2',
              success: true,
              details: {
                case: 'attackResult',
                value: create(AttackResultSchema, {
                  hit: true,
                  damage: 7,
                  critical: false,
                }),
              },
            }),
          ],
        }),
      ];

      const damages = extractDamageFromMonsterTurns(turns);
      expect(damages).toHaveLength(2);
      expect(damages[0].targetId).toBe('char-1');
      expect(damages[0].damage).toBe(5);
      expect(damages[1].targetId).toBe('char-2');
      expect(damages[1].damage).toBe(7);
    });
  });
});
