/**
 * A SERVER REFUSAL LANDS AT THE THING (rpg-project#545 R17). The server's
 * `FieldError{path, message}` addresses the file as written: the draft under
 * `room.room.*`, the root policies at the root, `line N` for a parse failure
 * and an empty path for a whole-file failure. This maps a path to the studio
 * noun that holds it, by prefix: the longest known head wins and any tail
 * after it is ignored, so a deeper path still lands on its noun. A path with
 * no studio noun, or one naming an id the document no longer holds, is a
 * sentence (`target: null`).
 */
import type { FieldError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type {
  RoomDraftDocument,
  RoomHexCell,
} from '../world-building/roomDraft';
import { rowOfPath } from '../world-building/rowRefusals';
import type { StudioDoorTarget } from '../world-building/studioDoorEditing';
import { locate } from './locatePath';

/** The Encounter home sections a refusal opens when the noun has no focus of
 * its own there yet (S6-Q4). */
export type RefusalHomeSection =
  /** A behaviour the file defines (rpg-project#970). */
  | 'behaviours'
  | 'bundles'
  /** A custom item the file declares (rpg-project#1196). */
  | 'items'
  /** A status effect the file declares (rpg-project#1215). */
  | 'statuses'
  | 'factions'
  | 'dispositions'
  | 'intel'
  | 'concealments'
  /** A root interaction (rpg-project#928): its recipe, approach or
   * outcomes. */
  | 'interactions';

export type RefusalTarget =
  | { kind: 'creature'; id: string }
  | { kind: 'prop'; id: string }
  | { kind: 'door'; target: StudioDoorTarget }
  | { kind: 'hex'; cell: RoomHexCell }
  /** An authored region (rpg-project#725): any path under
   * `room.room.regions[i]`, its cells included. */
  | { kind: 'region'; id: string }
  | { kind: 'castMember'; ref: string }
  | {
      kind: 'home';
      section: RefusalHomeSection;
      id?: string;
      /** The table or bundle row the refusal names, by its path
       * (`tables.<id>.on.time[9]`), which the section opens and scrolls to
       * (rpg-project#720). Absent for a refusal of the whole noun. */
      row?: string;
    }
  | { kind: 'ending'; id: string }
  /** The draft's key, refused by the server (R16): Save opens at the key
   * field. Never produced from a field path here; the surface adds it from
   * `keyRefusalOf`. */
  | { kind: 'key' };

export interface RefusalJump {
  path: string;
  message: string;
  target: RefusalTarget | null;
}

const MONSTER_PREFIX = 'dnd5e:monsters:';

export { segmentsOf } from './locatePath';

function doorTarget(
  document: Readonly<RoomDraftDocument>,
  doorId: string
): StudioDoorTarget | null {
  for (const wall of document.draft.room.walls ?? [])
    for (const opening of wall.openings)
      if (opening.door?.id === doorId)
        return { kind: 'door', wallId: wall.id, openingId: opening.id, doorId };
  return null;
}

/** THE ONE MAP FROM A FILE PATH TO A STUDIO SELECTION (R25): a refusal's
 * path and a read-back statement's path are the compiler's one coordinate
 * system, so both land through here. Null for a path with no studio noun,
 * one naming an id the document no longer holds, or one that is not a field
 * path at all (the read-back's "(engine rule)"). */
export function targetOfPath(
  path: string,
  document: Readonly<RoomDraftDocument>
): RefusalTarget | null {
  const located = locate(path, document);
  if (!located) return null;
  const { kind, id } = located;
  switch (kind) {
    case 'creature':
    case 'prop':
    case 'region':
    case 'ending':
      return { kind, id };
    case 'door': {
      const target = doorTarget(document, id);
      return target ? { kind: 'door', target } : null;
    }
    case 'exit': {
      const exit = located.entry as { cell: RoomHexCell };
      return { kind: 'hex', cell: { ...exit.cell } };
    }
    case 'template':
      return { kind: 'castMember', ref: `${MONSTER_PREFIX}${id}` };
    case 'routine':
      return { kind: 'home', section: 'behaviours', id };
    case 'item':
      return { kind: 'home', section: 'items', id };
    case 'status':
      return { kind: 'home', section: 'statuses', id };
    case 'concealment':
      return { kind: 'home', section: 'concealments', id };
    case 'bundle': {
      const row = rowOfPath(path);
      return row
        ? { kind: 'home', section: 'bundles', id, row }
        : { kind: 'home', section: 'bundles', id };
    }
    case 'faction':
      return { kind: 'home', section: 'factions', id };
    case 'disposition':
      // A disposition has no id; the section opens and the sentence names it.
      return { kind: 'home', section: 'dispositions' };
    case 'record':
      return { kind: 'home', section: 'intel', id };
    case 'conversation':
      // A root interaction rides the scope's unread map (rpg-project#922); a
      // refusal of its recipe, approach or outcomes opens the Interactions
      // section, which shows each (rpg-project#928).
      return { kind: 'home', section: 'interactions', id };
    case 'shared-lines':
      // A conversation's lines written once (rpg-project#1027) are on the
      // same page; the reveal of the path lands on the conversation.
      return { kind: 'home', section: 'interactions' };
    // Root `tables` have no section (rpg-project#970), a wall no studio noun
    // of its own, the key its own refusal (`keyRefusalOf`): a sentence.
    default:
      return null;
  }
}

/** Every refusal, in the server's order, with the noun it lands on or null. */
export function refusalJumps(
  errors: readonly Pick<FieldError, 'path' | 'message'>[],
  document: Readonly<RoomDraftDocument>
): RefusalJump[] {
  return errors.map((error) => ({
    path: error.path,
    message: error.message,
    target: targetOfPath(error.path, document),
  }));
}
