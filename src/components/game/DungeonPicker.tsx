/**
 * DungeonPicker — host-only dropdown feeding LobbyFlow's dungeon choice.
 * Presentational: options come straight from `useListDungeons`
 * (LobbyService.ListDungeons, ungated — works with authoring off), the
 * selected value is a `DungeonSummary.key`, never a display name.
 * rpg-project#131.
 *
 * Wraps the repo's existing `Select` (src/components/ui/Form/Select.tsx)
 * rather than a new dropdown implementation.
 */

import type { DungeonSummary } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { Select } from '../ui/Form/Select';

export interface DungeonPickerProps {
  dungeons: DungeonSummary[];
  /** The selected dungeon's key, or '' for "use the server default". */
  value: string;
  onChange: (key: string) => void;
  loading?: boolean;
  disabled?: boolean;
}

export function DungeonPicker({
  dungeons,
  value,
  onChange,
  loading = false,
  disabled = false,
}: DungeonPickerProps) {
  const options = dungeons.map((d) => ({ value: d.key, label: d.name }));

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
