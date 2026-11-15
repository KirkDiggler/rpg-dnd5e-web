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
 * and its `troupe` line; from the place, the statements about the grate, the
 * altar, the gate door and the kitchen passage, and the two joins set at the
 * grate's relocate paths. Folded: the captain's and gate-1's entries (gate-1
 * cut to the entries over those statements), `captain-policy`, and the
 * place's entries over the kept statements. Every kept sentence and entry
 * text is the engine's, unedited.
 */
import { fromJson, type JsonValue } from '@bufbuild/protobuf';
import {
  ReadBackSchema,
  type ReadBack,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import castleJson from './engineReadBack.castle.json?raw';

export function castleEngineReadBack(): ReadBack {
  return fromJson(ReadBackSchema, JSON.parse(castleJson) as JsonValue);
}
