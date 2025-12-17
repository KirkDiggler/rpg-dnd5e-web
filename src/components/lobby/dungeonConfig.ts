import {
  DungeonDifficulty,
  DungeonLength,
  DungeonTheme,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

export interface DungeonConfig {
  theme: DungeonTheme;
  difficulty: DungeonDifficulty;
  length: DungeonLength;
}

// Default dungeon configuration
export const DEFAULT_DUNGEON_CONFIG: DungeonConfig = {
  theme: DungeonTheme.CAVE,
  difficulty: DungeonDifficulty.MEDIUM,
  length: DungeonLength.MEDIUM,
};
