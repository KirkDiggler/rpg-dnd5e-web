import { RevealDiv } from '../encounter-studio/RevealDiv';
import { withDoorOpened } from './doorBindingEdits';
import type { RoomDoorBinding } from './roomDraft';

/** A door's `opened: { fact }` field (rpg-project#975 D); the edit is
 * `withDoorOpened`. */
export function DoorOpenedField({
  doorId,
  binding,
  onChange,
}: {
  doorId: string;
  binding: RoomDoorBinding | undefined;
  onChange(next: RoomDoorBinding): void;
}): React.JSX.Element {
  const opened = (binding as { opened?: { fact?: unknown } } | undefined)
    ?.opened;
  const fact = typeof opened?.fact === 'string' ? opened.fact : '';
  return (
    <RevealDiv path={`room.room.doorBindings.${doorId}.opened`}>
      <label className="es-field">
        <span>Fact when it opens</span>
        <input
          aria-label={`Fact when it opens for ${doorId}`}
          placeholder="a fact id, or none"
          value={fact}
          onChange={(event) =>
            onChange(withDoorOpened(binding, event.target.value))
          }
        />
      </label>
    </RevealDiv>
  );
}
