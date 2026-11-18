/**
 * THE ENGINE'S READ-BACK OF THE SERVED CASTLE (rpg-project#968, #978),
 * recorded from rpg-toolkit `main` cdc616bd: `readback.Of` on rpg-api
 * `dev`'s `content/the-mad-king.yaml` (the same bytes as
 * `the-mad-king-served.yaml`), marshalled with `folded` set to
 * `rb.Folded()`, as the api maps it. The JSON is the engine's exported shape
 * (snake_case `not_yet_said`), which `ReadBack` mirrors field for field, so
 * it parses with the proto's own JSON reader.
 *
 * Trimmed to what the tests read. Statements: the Guard Captain's group and
 * the routine he uses (`captain-policy`); gate-1's first twelve statements
 * and its `troupe` line; Knight keep-1, Knight keep-2 and the Mad King, whose
 * "No lines of its own" entries share one path; from the place, the statements about the grate, the
 * altar, the gate door and the kitchen passage, and the two joins set at the
 * grate's relocate paths. Folded: the captain's, gate-1's (cut to the
 * entries over those statements), keep-1's, keep-2's and the king's entries, `captain-policy`, and the
 * place's entries over the kept statements. Every kept sentence and entry
 * text is the engine's, unedited.
 *
 * THE HOLDING WORDS (rpg-project#1005). In every pinned file below, each
 * sentence, entry text and path the rename changed is re-taken from
 * `rulebooks/dnd5e/encounter` v0.221.0 (rpg-toolkit 79bcc525, the same tree;
 * `readback.Of` with `folded` as `rb.Folded()`, on the castle at the tag): the old engine's read-back and the new one's, on the castle before
 * and after the rename, align string for string, and each string that differs
 * replaced its old form here. Strings the rename did not touch are as recorded.
 *
 * THE CAPTAIN GOES BACK TO HIS GATE (rpg-project#1000), at
 * `rulebooks/dnd5e/encounter` v0.222.0 (rpg-toolkit aef9cc40), the castle that
 * adds the captain's `back-to-gate` state and his step to it on `heard`. The
 * read-backs at v0.221.0 and v0.222.0 were compared statement by statement
 * (by kind, path and subject) and entry by entry (by paths): a group or list
 * a file kept whole is the v0.222.0 one whole (machines.json's
 * `captain-policy` still without its rows); in a trimmed one each kept
 * statement or entry is its v0.222.0 form, and the captain's post entry is
 * the v0.222.0 one, which folds both his posts. Nothing here is hand-written.
 */
import { fromJson, type JsonValue } from '@bufbuild/protobuf';
import {
  ReadBackSchema,
  type ReadBack,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import castleJson from './engineReadBack.castle.json?raw';
import machinesJson from './engineReadBack.machines.json?raw';
import placesJson from './engineReadBack.places.json?raw';
import routinesJson from './engineReadBack.routines.json?raw';
import threadsJson from './engineReadBack.threads.json?raw';

export function castleEngineReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(castleJson) as JsonValue);
}

/**
 * THE CASTLE'S JOINS AND WAYS (rpg-project#972, #974), recorded the same way
 * from rpg-toolkit `main` f3deb20f (`rulebooks/dnd5e/encounter` v0.218.1:
 * the bar model, and a check's tool said as a `with` part of its approach,
 * rpg-toolkit#2444) on the same castle bytes: the site group "Where the
 * places join" whole — 12 joins and their 29 ways — and nothing else. Every
 * sentence and connection is the engine's, unedited.
 */
export function castlePlacesReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(placesJson) as JsonValue);
}

/**
 * THE CASTLE'S HUBS (rpg-project#973), recorded the same way from
 * rpg-toolkit `main` cdefe89a on the same castle bytes: the "Topics" and
 * "Facts" sections cut to the topics `admitted` and `jailed` and the facts
 * `feast-tonight`, `guards-turned`, `king-is-cultist` and
 * `party-recognized` and `throne-taken`, the scullion's group, the whole
 * "Records" and "Secrets" sections, and the site's own statements about the
 * record `kitchen-way` and the secret `kitchen-passage` (re-recorded from
 * `main` bb5806f7, encounter v0.219.0), with their folded entries. Every
 * sentence and entry is the engine's, unedited.
 */
export function castleThreadsReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(threadsJson) as JsonValue);
}

/**
 * THE CASTLE'S BEHAVIOURS (rpg-project#970), recorded the same way from
 * rpg-toolkit `main` bb5806f7 on the same castle bytes: the "Routines"
 * section, each of the ten groups cut to its first three statements (the
 * routine's own, with who runs it, and its first states), and the folded
 * Routines entries without their sub-entries. Every sentence is the
 * engine's, unedited.
 */
export function castleRoutinesReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(routinesJson) as JsonValue);
}

/**
 * THE CASTLE'S MACHINES, WITH THEIR SHAPE (rpg-project#994, #995), recorded
 * from `rulebooks/dnd5e/encounter` v0.220.0 (the tag rpg-api `dev` pins at
 * 7a5d8313): `readback.Of` on rpg-api `dev`'s `content/the-mad-king.yaml`,
 * marshalled with `folded` set to `rb.Folded()`, as the api maps it.
 * Trimmed to the "Routines" section (every routine row cut but
 * `gate-1-policy`'s), from "Creatures" each creature's `creature.routine`,
 * `creature.post` and `creature.blocking` statements, and the folded
 * "Routines" section. Every kept sentence, connection and entry is the
 * engine's, unedited.
 */
export function castleMachinesReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(machinesJson) as JsonValue);
}
