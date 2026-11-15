/**
 * THE ENGINE'S READ-BACK OF THE SERVED CASTLE (rpg-project#968), recorded
 * from rpg-toolkit `main` 4ff62fe5: `go run ./cmd/readback -json` under
 * `rulebooks/dnd5e/encounter` on rpg-api `dev`'s `content/the-mad-king.yaml`
 * (the same bytes as `the-mad-king-served.yaml`). The JSON is the engine's
 * exported shape (snake_case `not_yet_said`), which `ReadBack` mirrors field
 * for field, so it parses with the proto's own JSON reader.
 *
 * Trimmed to what the tests read: the Guard Captain's group and the routine
 * he uses (`captain-policy`), gate-1's first twelve statements, the statements
 * about the grate, the altar, the gate door and the kitchen passage from the
 * site's group, and the fact hub `guards-turned`. Every kept sentence is the
 * engine's, unedited.
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
