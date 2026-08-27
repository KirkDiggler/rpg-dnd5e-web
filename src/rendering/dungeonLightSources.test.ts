import { describe, expect, it } from 'vitest';
import {
  DUNGEON_LIGHT_SOURCE_REFS,
  dungeonLightSourceSpec,
  isDungeonLightSourceRef,
} from './dungeonLightSources';

const EXPECTED = [
  'dnd5e:props:brazier',
  'dnd5e:props:candle-stand',
  'dnd5e:props:candles',
  'dnd5e:props:glowing-orb',
  'dnd5e:props:lantern',
  'dnd5e:props:rune-marker',
  'dnd5e:props:rune-pillar',
  'dnd5e:props:torch-ornate',
] as const;

describe('dungeon light source manifest', () => {
  it('contains exactly the approved eight source refs', () => {
    expect([...DUNGEON_LIGHT_SOURCE_REFS].sort()).toEqual(EXPECTED);
    expect(isDungeonLightSourceRef('dnd5e:props:torch')).toBe(false);
    expect(isDungeonLightSourceRef('dnd5e:props:stone-lantern')).toBe(false);
  });

  it('provides immutable, positive lighting facts for every source ref', () => {
    for (const ref of EXPECTED) {
      const spec = dungeonLightSourceSpec(ref);
      expect(spec).toBeDefined();
      expect(spec?.intensity).toBeGreaterThan(0);
      expect(spec?.distance).toBeGreaterThan(0);
      expect(spec?.height).toBeGreaterThanOrEqual(0);
      expect(spec?.floorPoolStrength).toBeGreaterThan(0);
      expect(spec?.floorPoolStrength).toBeLessThanOrEqual(1);
      expect(Object.isFrozen(spec)).toBe(true);
    }
  });
});
