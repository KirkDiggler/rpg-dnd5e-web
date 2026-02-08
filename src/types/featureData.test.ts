import { describe, expect, it } from 'vitest';
import {
  hasUsageData,
  isActionSurgeData,
  isRageData,
  isSecondWindData,
  parseFeatureData,
} from './featureData';

describe('featureData', () => {
  describe('parseFeatureData', () => {
    it('returns undefined for undefined input', () => {
      expect(parseFeatureData(undefined)).toBeUndefined();
    });

    it('returns undefined for empty Uint8Array', () => {
      expect(parseFeatureData(new Uint8Array(0))).toBeUndefined();
    });

    it('returns undefined for invalid JSON', () => {
      const bytes = new TextEncoder().encode('not json');
      expect(parseFeatureData(bytes)).toBeUndefined();
    });

    it('parses valid rage data', () => {
      const rageJson = JSON.stringify({
        id: 'rage',
        name: 'Rage',
        uses: 2,
        max_uses: 3,
        character_id: 'char-123',
      });
      const bytes = new TextEncoder().encode(rageJson);
      const result = parseFeatureData(bytes);

      expect(result).toBeDefined();
      expect(result!.id).toBe('rage');
      expect(result!.name).toBe('Rage');
    });

    it('parses valid second wind data', () => {
      const json = JSON.stringify({
        id: 'second_wind',
        name: 'Second Wind',
        uses: 1,
        max_uses: 1,
      });
      const bytes = new TextEncoder().encode(json);
      const result = parseFeatureData(bytes);

      expect(result).toBeDefined();
      expect(result!.id).toBe('second_wind');
    });

    it('parses minimal base feature data', () => {
      const json = JSON.stringify({
        id: 'some_feature',
        name: 'Some Feature',
      });
      const bytes = new TextEncoder().encode(json);
      const result = parseFeatureData(bytes);

      expect(result).toBeDefined();
      expect(result!.id).toBe('some_feature');
      expect(result!.name).toBe('Some Feature');
    });

    it('preserves ref field when present', () => {
      const json = JSON.stringify({
        id: 'rage',
        name: 'Rage',
        ref: { module: 'dnd5e', type: 'features', value: 'rage' },
        uses: 2,
        max_uses: 3,
      });
      const bytes = new TextEncoder().encode(json);
      const result = parseFeatureData(bytes);

      expect(result).toBeDefined();
      expect(result!.ref).toEqual({
        module: 'dnd5e',
        type: 'features',
        value: 'rage',
      });
    });

    it('preserves level field when present', () => {
      const json = JSON.stringify({
        id: 'rage',
        name: 'Rage',
        level: 5,
        uses: 3,
        max_uses: 4,
      });
      const bytes = new TextEncoder().encode(json);
      const result = parseFeatureData(bytes);

      expect(result).toBeDefined();
      expect(result!.level).toBe(5);
    });
  });

  describe('type guards', () => {
    it('isRageData returns true for rage', () => {
      const data = { id: 'rage' as const, name: 'Rage', uses: 2, max_uses: 3 };
      expect(isRageData(data)).toBe(true);
    });

    it('isRageData returns false for non-rage', () => {
      const data = {
        id: 'second_wind',
        name: 'Second Wind',
        uses: 1,
        max_uses: 1,
      };
      expect(isRageData(data)).toBe(false);
    });

    it('isSecondWindData returns true for second wind', () => {
      const data = {
        id: 'second_wind' as const,
        name: 'Second Wind',
        uses: 1,
        max_uses: 1,
      };
      expect(isSecondWindData(data)).toBe(true);
    });

    it('isSecondWindData returns false for non-second-wind', () => {
      const data = { id: 'rage', name: 'Rage', uses: 2, max_uses: 3 };
      expect(isSecondWindData(data)).toBe(false);
    });

    it('isActionSurgeData returns true for action surge', () => {
      const data = {
        id: 'action_surge' as const,
        name: 'Action Surge',
        uses: 1,
        max_uses: 1,
      };
      expect(isActionSurgeData(data)).toBe(true);
    });

    it('isActionSurgeData returns false for non-action-surge', () => {
      const data = { id: 'rage', name: 'Rage', uses: 2, max_uses: 3 };
      expect(isActionSurgeData(data)).toBe(false);
    });
  });

  describe('hasUsageData', () => {
    it('returns true when uses and max_uses present', () => {
      const data = { id: 'rage', name: 'Rage', uses: 2, max_uses: 3 };
      expect(hasUsageData(data)).toBe(true);
    });

    it('returns true for zero uses', () => {
      const data = { id: 'rage', name: 'Rage', uses: 0, max_uses: 3 };
      expect(hasUsageData(data)).toBe(true);
    });

    it('returns false when uses/max_uses missing', () => {
      const data = { id: 'some_feature', name: 'Some Feature' };
      expect(hasUsageData(data)).toBe(false);
    });

    it('returns false for base feature data', () => {
      const data = { id: 'passive', name: 'Passive Feature', level: 1 };
      expect(hasUsageData(data)).toBe(false);
    });
  });
});
