import { describe, expect, it } from 'vitest';
import type { DungeonLightSourceSpec } from './dungeonLightSources';
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

const EXPECTED_SPECS: Readonly<
  Record<(typeof EXPECTED)[number], DungeonLightSourceSpec>
> = {
  'dnd5e:props:brazier': {
    color: '#ff9d52',
    intensity: 2.8,
    distance: 5.5,
    height: 0.9,
    floorPoolStrength: 1.0,
  },
  'dnd5e:props:torch-ornate': {
    color: '#ff9d52',
    intensity: 1.6,
    distance: 3.6,
    height: 1.4,
    floorPoolStrength: 0.85,
  },
  'dnd5e:props:candle-stand': {
    color: '#ff9d52',
    intensity: 1.4,
    distance: 3.2,
    height: 1.0,
    floorPoolStrength: 0.7,
  },
  'dnd5e:props:lantern': {
    color: '#ff9d52',
    intensity: 1.3,
    distance: 3.0,
    height: 0.65,
    floorPoolStrength: 0.65,
  },
  'dnd5e:props:candles': {
    color: '#ff9d52',
    intensity: 1.1,
    distance: 2.6,
    height: 0.35,
    floorPoolStrength: 0.5,
  },
  'dnd5e:props:glowing-orb': {
    color: '#3d84dc',
    intensity: 2.0,
    distance: 4.5,
    height: 1.2,
    floorPoolStrength: 0.9,
  },
  'dnd5e:props:rune-pillar': {
    color: '#3d84dc',
    intensity: 0.9,
    distance: 2.6,
    height: 1.2,
    floorPoolStrength: 0.65,
  },
  'dnd5e:props:rune-marker': {
    color: '#3d84dc',
    intensity: 0.7,
    distance: 2.2,
    height: 0.15,
    floorPoolStrength: 0.45,
  },
};

describe('dungeon light source manifest', () => {
  it('contains exactly the approved eight source refs', () => {
    expect([...DUNGEON_LIGHT_SOURCE_REFS].sort()).toEqual(EXPECTED);
    expect(isDungeonLightSourceRef('dnd5e:props:torch')).toBe(false);
    expect(isDungeonLightSourceRef('dnd5e:props:stone-lantern')).toBe(false);
  });

  it('provides immutable, positive lighting facts for every source ref', () => {
    for (const ref of EXPECTED) {
      const spec = dungeonLightSourceSpec(ref);
      expect(spec).toEqual(EXPECTED_SPECS[ref]);
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
