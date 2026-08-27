export interface DungeonLightSourceSpec {
  readonly color: string;
  readonly intensity: number;
  readonly distance: number;
  readonly height: number;
  readonly floorPoolStrength: number;
}

export const DUNGEON_LIGHT_SOURCE_SPECS: ReadonlyMap<
  string,
  DungeonLightSourceSpec
> = new Map<string, DungeonLightSourceSpec>([
  [
    'dnd5e:props:brazier',
    Object.freeze({
      color: '#ff9d52',
      intensity: 2.8,
      distance: 5.5,
      height: 0.9,
      floorPoolStrength: 1.0,
    }),
  ],
  [
    'dnd5e:props:torch-ornate',
    Object.freeze({
      color: '#ff9d52',
      intensity: 1.6,
      distance: 3.6,
      height: 1.4,
      floorPoolStrength: 0.85,
    }),
  ],
  [
    'dnd5e:props:candle-stand',
    Object.freeze({
      color: '#ff9d52',
      intensity: 1.4,
      distance: 3.2,
      height: 1.0,
      floorPoolStrength: 0.7,
    }),
  ],
  [
    'dnd5e:props:lantern',
    Object.freeze({
      color: '#ff9d52',
      intensity: 1.3,
      distance: 3.0,
      height: 0.65,
      floorPoolStrength: 0.65,
    }),
  ],
  [
    'dnd5e:props:candles',
    Object.freeze({
      color: '#ff9d52',
      intensity: 1.1,
      distance: 2.6,
      height: 0.35,
      floorPoolStrength: 0.5,
    }),
  ],
  [
    'dnd5e:props:glowing-orb',
    Object.freeze({
      color: '#3d84dc',
      intensity: 2.0,
      distance: 4.5,
      height: 1.2,
      floorPoolStrength: 0.9,
    }),
  ],
  [
    'dnd5e:props:rune-pillar',
    Object.freeze({
      color: '#3d84dc',
      intensity: 0.9,
      distance: 2.6,
      height: 1.2,
      floorPoolStrength: 0.65,
    }),
  ],
  [
    'dnd5e:props:rune-marker',
    Object.freeze({
      color: '#3d84dc',
      intensity: 0.7,
      distance: 2.2,
      height: 0.15,
      floorPoolStrength: 0.45,
    }),
  ],
]);

export const DUNGEON_LIGHT_SOURCE_REFS: readonly string[] = Object.freeze([
  ...DUNGEON_LIGHT_SOURCE_SPECS.keys(),
]);

export function dungeonLightSourceSpec(
  ref: string
): DungeonLightSourceSpec | undefined {
  return DUNGEON_LIGHT_SOURCE_SPECS.get(ref);
}

export function isDungeonLightSourceRef(ref: string): boolean {
  return DUNGEON_LIGHT_SOURCE_SPECS.has(ref);
}
