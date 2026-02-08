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

    // Note: Tests with actual attack/heal results require proto message
    // construction with oneOf fields (details.case). Those are better
    // tested once we establish proto test factories.
  });
});
