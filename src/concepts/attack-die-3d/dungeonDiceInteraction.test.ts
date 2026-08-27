import { describe, expect, it } from 'vitest';
import type { Scene3D } from '../../components/session/atlasToScene3D';
import { buildDungeonLightingFacts } from '../../rendering/dungeonLighting';
import {
  adjustDungeonDiceHeight,
  isDungeonDiceFloorPoint,
  isDungeonDieOutOfBounds,
} from './dungeonDiceInteraction';

const scene: Scene3D = {
  floorTiles: new Map([['0,0,0', { x: 0, y: 0, z: 0, roomId: '' }]]),
  wallRuns: [],
  doorGaps: [],
  props: [],
  archetypes: [],
  lighting: buildDungeonLightingFacts([], [], []),
};

describe('dungeon dice interaction', () => {
  it('raises on upward mouse movement, lowers on downward movement, and clamps', () => {
    expect(adjustDungeonDiceHeight(1, -20, 0.5, 2)).toBeCloseTo(1.2, 12);
    expect(adjustDungeonDiceHeight(1, 20, 0.5, 2)).toBeCloseTo(0.8, 12);
    expect(adjustDungeonDiceHeight(1.95, -20, 0.5, 2)).toBe(2);
    expect(adjustDungeonDiceHeight(0.55, 20, 0.5, 2)).toBe(0.5);
  });

  it('recognizes real floor points and rejects void', () => {
    expect(isDungeonDiceFloorPoint(scene, 0, 0)).toBe(true);
    expect(isDungeonDiceFloorPoint(scene, 4, 4)).toBe(false);
  });

  it('returns dice that fall below the surface or into void', () => {
    expect(isDungeonDieOutOfBounds(scene, { x: 0, y: -0.4, z: 0 }, 0.2)).toBe(
      true
    );
    expect(isDungeonDieOutOfBounds(scene, { x: 4, y: 0.1, z: 4 }, 0.2)).toBe(
      true
    );
    expect(isDungeonDieOutOfBounds(scene, { x: 0, y: 0.3, z: 0 }, 0.2)).toBe(
      false
    );
  });
});
