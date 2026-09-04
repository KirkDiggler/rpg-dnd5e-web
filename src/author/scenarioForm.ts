/**
 * scenarioForm — the pure half of the scenario panel: what a descriptor's
 * blank offers to pick from, and which refusal belongs under it
 * (rpg-project#368 §3.2).
 *
 * # The client derives nothing about a scenario
 *
 * `ListScenarios` supplies the field key, the label, the widget type, the
 * family an `entity_ref` points at, and the guidance sentence. This module
 * turns the FAMILY into a list of the ids THIS dungeon declares, and that
 * is the whole of its knowledge. It has never heard of an artifact, an
 * exit condition, or a captain; a scenario shipped tomorrow renders
 * through here unchanged, which is the test.
 *
 * # An unknown kind is not an error
 *
 * `ScenarioField.kind` is an open string on purpose (its own doc comment:
 * "a rulebook that grows a new kind of bindable thing must not need a
 * proto release to say so"). A kind with no picker here answers `null`,
 * and the panel shows a plain id box — the author can still type the id
 * and the package still validates it. Refusing would make this client the
 * thing that decides what a rulebook may bind.
 */

import type { FieldError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  FieldType,
  type ScenarioField,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { isMonsterRef, type DungeonDoc } from './dungeonYaml';

/** One thing in this dungeon a blank may be bound to. */
export interface BindOption {
  /** The id the file writes — `place[].id` or `exits[].id`. */
  id: string;
  /** What the author sees: the id plus what it actually is, because an id
   * alone ("heirloom") is the author's word and a ref ("reliquary") is
   * the thing — a streamer wants both. */
  label: string;
}

/**
 * The ids this dungeon offers for one blank, or `null` when this build has
 * no picker for that field — a `kind` it does not know, or a widget type
 * it does not render (`FIELD_TYPE_CHECK` binds nothing today).
 *
 * `prop` LISTS ONLY HOLDABLE PROPS, which is the plan's own word: a
 * scenario that binds a prop binds one the party can pick up, and a
 * picker offering the pillars would be offering a refusal. An empty list
 * is therefore a real state with a real cause, and the panel says the
 * cause rather than showing an empty dropdown.
 */
export function bindOptions(
  doc: DungeonDoc,
  field: ScenarioField
): BindOption[] | null {
  if (field.type !== FieldType.ENTITY_REF) return null;
  switch (field.kind) {
    case 'prop':
      return doc.place
        .filter((p) => !!p.id && !isMonsterRef(p.ref) && p.holdable === true)
        .map((p) => ({
          id: p.id as string,
          label: `${p.id} — ${refWord(p.ref)}`,
        }));
    case 'monster':
      return doc.place
        .filter((p) => !!p.id && isMonsterRef(p.ref))
        .map((p) => ({
          id: p.id as string,
          label: `${p.id} — ${refWord(p.ref)}`,
        }));
    case 'exit':
      return doc.exits.map((e) => ({ id: e.id, label: e.id }));
    case 'door':
      return doc.doors.map((d) => ({ id: d.id, label: d.id }));
    default:
      return null;
  }
}

/**
 * Why a `prop` or `exit` picker is empty, in words that say what to do
 * about it — the streamer's north star: the message points at the thing.
 * `null` when the list is not empty or when emptiness needs no
 * explanation.
 */
export function emptyPickerReason(
  field: ScenarioField,
  options: BindOption[] | null
): string | null {
  if (options === null || options.length > 0) return null;
  switch (field.kind) {
    case 'prop':
      return 'nothing in this dungeon can be picked up yet — place a prop, give it an id, and tick holdable';
    case 'exit':
      return 'this dungeon has no way out yet — pick the Exit tool and click the cell the party leaves from';
    case 'door':
      return 'this dungeon has no doors yet';
    case 'monster':
      return 'no monster in this dungeon has an id yet — select one and name it';
    default:
      return null;
  }
}

/**
 * The compiler's refusals addressed to one blank, in the order it made
 * them. Matched on the path the compiler writes, `scenarios.<id>.<key>`
 * (dungeonspec `validate.go`) — the SERVER'S sentence, rendered unedited
 * under the field it names.
 */
export function fieldRefusals(
  errors: readonly FieldError[],
  scenarioId: string,
  key: string
): string[] {
  const path = `scenarios.${scenarioId}.${key}`;
  return errors.filter((e) => e.path === path).map((e) => e.message);
}

/** A ref's last segment, spaced — `dnd5e:props:reliquary` -> "reliquary".
 * Presentation only; the file always carries the whole ref. */
function refWord(ref: string): string {
  return (ref.split(':').pop() ?? ref).replace(/[-_]+/g, ' ');
}
