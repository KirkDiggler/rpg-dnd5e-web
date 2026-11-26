/**
 * A person's equipment, read and written without the studio owning it
 * (rpg-project#1203). `equipment` is a key of the binding the studio does not
 * author: it rides through every edit as an unknown key, so this reads it from
 * the document as written and writes it as one key, nothing else.
 */
import type {
  RoomDraftDocument,
  RoomMonsterBinding,
} from '../world-building/roomDraft';

export type EquipmentRead =
  | { kind: 'none' }
  | { kind: 'list'; ids: string[] }
  | { kind: 'other'; written: unknown };

/** What the file says this creature has equipped: nothing, a list of ids, or
 * a value that is not a list of ids (shown as written, never changed). */
export function equipmentOf(
  document: Readonly<RoomDraftDocument>,
  creatureId: string
): EquipmentRead {
  const binding = document.draft.room.monsterBindings?.[creatureId] as
    | Record<string, unknown>
    | undefined;
  if (binding === undefined || !('equipment' in binding))
    return { kind: 'none' };
  const written = binding.equipment;
  if (Array.isArray(written) && written.every((id) => typeof id === 'string'))
    return { kind: 'list', ids: [...written] as string[] };
  return { kind: 'other', written };
}

/** The binding with `equipment` set to a copy of `ids`, or the key removed
 * when `ids` is empty. Every other key stays; the caller's `withBinding`
 * normalizes. */
export function withEquipment(
  binding: RoomMonsterBinding | undefined,
  ids: readonly string[]
): RoomMonsterBinding | undefined {
  const next = { ...(binding ?? {}) } as Record<string, unknown>;
  if (ids.length === 0) delete next.equipment;
  else next.equipment = [...ids];
  return next as RoomMonsterBinding;
}
