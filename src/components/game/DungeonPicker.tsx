/**
 * DungeonPicker — host-only dropdown feeding LobbyFlow's dungeon choice.
 * Presentational: options come straight from `useListDungeons`
 * (LobbyService.ListDungeons, ungated — works with authoring off), the
 * selected value is a `DungeonSummary.key`, never a display name.
 * rpg-project#131.
 *
 * Each label says whose the entry is (R21, R24): "(yours)" for the
 * caller's own in their world, "({owner})" for another member's, so a host
 * can launch any member's, and "(reference)" for a shipped one. A server
 * that lists no source (one from before the world store) says nothing about
 * ownership, so its entries keep their bare names. Order is the server's.
 *
 * Wraps the repo's existing `Select` (src/components/ui/Form/Select.tsx)
 * rather than a new dropdown implementation.
 */

import {
  DungeonSource,
  type DungeonSummary,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { Select } from '../ui/Form/Select';

export interface DungeonPickerProps {
  dungeons: DungeonSummary[];
  /** The selected dungeon's key, or '' for "use the server default". */
  value: string;
  onChange: (key: string) => void;
  loading?: boolean;
  disabled?: boolean;
  /** The caller's player id, to mark their own entries. */
  playerId?: string | null;
}

function dungeonLabel(
  dungeon: DungeonSummary,
  playerId: string | null
): string {
  switch (dungeon.source) {
    case DungeonSource.WORLD:
      return playerId !== null && dungeon.owner === playerId
        ? `${dungeon.name} (yours)`
        : `${dungeon.name} (${dungeon.owner})`;
    case DungeonSource.SHIPPED:
      return `${dungeon.name} (reference)`;
    default:
      return dungeon.name;
  }
}

export function DungeonPicker({
  dungeons,
  value,
  onChange,
  loading = false,
  disabled = false,
  playerId = null,
}: DungeonPickerProps) {
  const options = dungeons.map((d) => ({
    value: d.key,
    label: dungeonLabel(d, playerId),
  }));

  return (
    <div data-testid="dungeon-picker">
      <Select
        label="Dungeon"
        options={options}
        value={value}
        onChange={onChange}
        placeholder={loading ? 'Loading dungeons…' : 'Choose a dungeon'}
        disabled={disabled || loading}
      />
    </div>
  );
}
