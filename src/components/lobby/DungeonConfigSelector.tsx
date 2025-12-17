import {
  getDungeonDifficultyInfo,
  getDungeonLengthInfo,
  getDungeonThemeInfo,
} from '@/utils/enumRegistry';
import {
  DungeonDifficulty,
  DungeonLength,
  DungeonTheme,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { Lock } from 'lucide-react';
import type { DungeonConfig } from './dungeonConfig';

interface DungeonConfigSelectorProps {
  theme: DungeonTheme;
  difficulty: DungeonDifficulty;
  length: DungeonLength;
  onConfigChange: (config: DungeonConfig) => void;
  isHost: boolean;
  disabled?: boolean;
}

const THEME_OPTIONS = [
  DungeonTheme.CRYPT,
  DungeonTheme.CAVE,
  DungeonTheme.RUINS,
] as const;

const DIFFICULTY_OPTIONS = [
  DungeonDifficulty.EASY,
  DungeonDifficulty.MEDIUM,
  DungeonDifficulty.HARD,
] as const;

const LENGTH_OPTIONS = [
  DungeonLength.SHORT,
  DungeonLength.MEDIUM,
  DungeonLength.LONG,
] as const;

/**
 * DungeonConfigSelector - Dungeon configuration UI
 *
 * Allows players to select theme, difficulty, and length for a dungeon run.
 * Host can edit, non-hosts see a read-only view.
 */
export function DungeonConfigSelector({
  theme,
  difficulty,
  length,
  onConfigChange,
  isHost,
  disabled = false,
}: DungeonConfigSelectorProps) {
  const isDisabled = !isHost || disabled;

  const handleThemeChange = (newTheme: DungeonTheme) => {
    if (isDisabled) return;
    onConfigChange({ theme: newTheme, difficulty, length });
  };

  const handleDifficultyChange = (newDifficulty: DungeonDifficulty) => {
    if (isDisabled) return;
    onConfigChange({ theme, difficulty: newDifficulty, length });
  };

  const handleLengthChange = (newLength: DungeonLength) => {
    if (isDisabled) return;
    onConfigChange({ theme, difficulty, length: newLength });
  };

  return (
    <div
      className="p-4 rounded-lg"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          Dungeon Settings
        </h3>
        {!isHost && (
          <div
            className="flex items-center gap-1 text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <Lock size={12} />
            <span>Host only</span>
          </div>
        )}
      </div>

      {/* Theme Selection */}
      <div className="mb-4">
        <label
          className="block text-xs font-medium mb-2"
          style={{ color: 'var(--text-muted)' }}
        >
          Theme
        </label>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((option) => {
            const info = getDungeonThemeInfo(option);
            const isSelected = theme === option;
            return (
              <button
                key={option}
                onClick={() => handleThemeChange(option)}
                disabled={isDisabled}
                className="p-3 rounded-lg text-center transition-all"
                style={{
                  backgroundColor: isSelected
                    ? 'var(--accent-primary)'
                    : 'var(--bg-primary)',
                  border: isSelected
                    ? '2px solid var(--accent-primary)'
                    : '1px solid var(--border-primary)',
                  color: isSelected
                    ? 'var(--text-on-accent, white)'
                    : 'var(--text-primary)',
                  opacity: isDisabled ? 0.6 : 1,
                  cursor: isDisabled ? 'default' : 'pointer',
                  boxShadow: isSelected
                    ? '0 0 12px var(--accent-primary)'
                    : 'none',
                }}
              >
                <div className="text-2xl mb-1">{info.icon}</div>
                <div className="text-sm font-medium">{info.name}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Difficulty Selection */}
      <div className="mb-4">
        <label
          className="block text-xs font-medium mb-2"
          style={{ color: 'var(--text-muted)' }}
        >
          Difficulty
        </label>
        <div className="grid grid-cols-3 gap-2">
          {DIFFICULTY_OPTIONS.map((option) => {
            const info = getDungeonDifficultyInfo(option);
            const isSelected = difficulty === option;
            return (
              <button
                key={option}
                onClick={() => handleDifficultyChange(option)}
                disabled={isDisabled}
                className="px-3 py-2 rounded-lg text-center transition-all"
                style={{
                  backgroundColor: isSelected
                    ? 'var(--accent-primary)'
                    : 'var(--bg-primary)',
                  border: isSelected
                    ? '2px solid var(--accent-primary)'
                    : '1px solid var(--border-primary)',
                  color: isSelected
                    ? 'var(--text-on-accent, white)'
                    : 'var(--text-primary)',
                  opacity: isDisabled ? 0.6 : 1,
                  cursor: isDisabled ? 'default' : 'pointer',
                  boxShadow: isSelected
                    ? '0 0 12px var(--accent-primary)'
                    : 'none',
                }}
              >
                <div className="text-sm font-medium">{info.name}</div>
                <div className="text-xs" style={{ opacity: 0.8 }}>
                  {info.icon}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Length Selection */}
      <div>
        <label
          className="block text-xs font-medium mb-2"
          style={{ color: 'var(--text-muted)' }}
        >
          Length
        </label>
        <div className="grid grid-cols-3 gap-2">
          {LENGTH_OPTIONS.map((option) => {
            const info = getDungeonLengthInfo(option);
            const isSelected = length === option;
            return (
              <button
                key={option}
                onClick={() => handleLengthChange(option)}
                disabled={isDisabled}
                className="px-3 py-2 rounded-lg text-center transition-all"
                style={{
                  backgroundColor: isSelected
                    ? 'var(--accent-primary)'
                    : 'var(--bg-primary)',
                  border: isSelected
                    ? '2px solid var(--accent-primary)'
                    : '1px solid var(--border-primary)',
                  color: isSelected
                    ? 'var(--text-on-accent, white)'
                    : 'var(--text-primary)',
                  opacity: isDisabled ? 0.6 : 1,
                  cursor: isDisabled ? 'default' : 'pointer',
                  boxShadow: isSelected
                    ? '0 0 12px var(--accent-primary)'
                    : 'none',
                }}
              >
                <div className="text-sm font-medium">{info.name}</div>
                <div
                  className="text-xs"
                  style={{ color: 'var(--text-muted)', opacity: 0.8 }}
                >
                  {info.detail}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
