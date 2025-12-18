import {
  DungeonDifficulty,
  DungeonTheme,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

interface DungeonResultOverlayProps {
  result: 'victory' | 'failure';
  roomsCleared: number;
  theme: DungeonTheme;
  difficulty: DungeonDifficulty;
  onReturnToLobby: () => void;
  onRetry?: () => void;
}

function getThemeDisplay(theme: DungeonTheme): { icon: string; name: string } {
  switch (theme) {
    case DungeonTheme.CRYPT:
      return { icon: '💀', name: 'Crypt' };
    case DungeonTheme.CAVE:
      return { icon: '🐾', name: 'Cave' };
    case DungeonTheme.RUINS:
      return { icon: '🏛️', name: 'Ruins' };
    default:
      return { icon: '🏰', name: 'Dungeon' };
  }
}

function getDifficultyDisplay(difficulty: DungeonDifficulty): string {
  switch (difficulty) {
    case DungeonDifficulty.EASY:
      return 'Easy';
    case DungeonDifficulty.MEDIUM:
      return 'Medium';
    case DungeonDifficulty.HARD:
      return 'Hard';
    default:
      return 'Unknown';
  }
}

export function DungeonResultOverlay({
  result,
  roomsCleared,
  theme,
  difficulty,
  onReturnToLobby,
  onRetry,
}: DungeonResultOverlayProps) {
  const isVictory = result === 'victory';
  const themeDisplay = getThemeDisplay(theme);
  const difficultyDisplay = getDifficultyDisplay(difficulty);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dungeon-result-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
    >
      <div
        className={`mx-4 w-full max-w-md rounded-lg border-2 p-8 text-center ${
          isVictory
            ? 'border-yellow-500/50 bg-gradient-to-b from-yellow-900/30 to-green-900/30'
            : 'border-red-500/50 bg-gradient-to-b from-red-900/30 to-gray-900/30'
        }`}
      >
        {/* Header */}
        <h1
          id="dungeon-result-title"
          className={`mb-6 text-4xl font-bold ${
            isVictory ? 'text-yellow-400' : 'text-red-400'
          }`}
        >
          {isVictory ? 'Victory!' : 'Defeat'}
        </h1>

        {/* Theme and Difficulty */}
        <div className="mb-6 space-y-2">
          <div className="text-2xl">
            {themeDisplay.icon} {themeDisplay.name}
          </div>
          <div className="text-gray-400">
            {isVictory ? 'Completed' : 'Attempted'} on {difficultyDisplay}
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8 rounded-lg bg-black/30 p-4">
          <div className="text-3xl font-bold text-white">{roomsCleared}</div>
          <div className="text-gray-400">
            {roomsCleared === 1 ? 'Room' : 'Rooms'} Cleared
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {!isVictory && onRetry && (
            <button
              onClick={onRetry}
              className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-red-500"
            >
              Retry
            </button>
          )}
          <button
            onClick={onReturnToLobby}
            className={`rounded-lg px-6 py-3 font-semibold transition-colors ${
              isVictory
                ? 'bg-yellow-600 text-white hover:bg-yellow-500'
                : 'bg-gray-600 text-white hover:bg-gray-500'
            }`}
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
