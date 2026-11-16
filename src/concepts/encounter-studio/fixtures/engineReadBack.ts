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
 */
import { fromJson, type JsonValue } from '@bufbuild/protobuf';
import {
  ReadBackSchema,
  type ReadBack,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import castleJson from './engineReadBack.castle.json?raw';
import placesJson from './engineReadBack.places.json?raw';
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
