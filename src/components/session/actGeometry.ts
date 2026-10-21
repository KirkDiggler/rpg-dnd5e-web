/**
 * actGeometry — a perception act's geometry, in the atlas shapes the
 * knowledge cache holds (rpg-project#630, event-stream R18).
 *
 * The knowledge snapshot is GetKnowledge's (session v1alpha1), and its
 * reducers (`applyReveal.ts`) take v1alpha1 reveal messages. The act stream's
 * geometry (`act_geometry.proto`) redefines the same messages field for field
 * in v1alpha2, so the two are bridged here, at the cache boundary, by a JSON
 * hop between the two schemas: every field crosses by its own name, and a
 * field one side has and the other does not THROWS rather than vanishing.
 *
 * Two names differ and are renamed on the way: a doorway's door id
 * (`door` on v2, `connection` on v1), and a revealed secret's doors, which v2
 * carries as RevealedDoor rows with their doorways nested and v1 splits into
 * doorways (here) and door rows (re-read through GetDoors, as v1 always did).
 */
import { fromJson, toJson, type JsonObject } from '@bufbuild/protobuf';
import {
  CellsRevealedSchema,
  ConcealmentRevealedSchema,
  type CellsRevealed,
  type ConcealmentRevealed,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  CellsLearnedSchema,
  SecretRevealedSchema,
  type CellsLearned,
  type SecretRevealed,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';

type JsonRow = { [key: string]: unknown };

function renameDoorways(rows: unknown): JsonRow[] | undefined {
  if (!Array.isArray(rows)) return undefined;
  return rows.map((row: JsonRow) => {
    const { door, ...rest } = row;
    return door === undefined ? rest : { ...rest, connection: door };
  });
}

/** CellsLearned as the CELLS_REVEALED body `applyCellsRevealed` takes. */
export function cellsRevealedOf(cells: CellsLearned): CellsRevealed {
  const json = toJson(CellsLearnedSchema, cells) as JsonObject;
  const doorways = renameDoorways(json.doorways);
  if (doorways) json.doorways = doorways as JsonObject[];
  return fromJson(CellsRevealedSchema, json);
}

/** SecretRevealed as the CONCEALMENT_REVEALED body
 * `applyConcealmentRevealed` takes. The door rows are left to GetDoors. */
export function concealmentRevealedOf(
  revealed: SecretRevealed
): ConcealmentRevealed {
  const json = toJson(SecretRevealedSchema, revealed) as JsonObject;
  const doors = Array.isArray(json.doors) ? (json.doors as JsonRow[]) : [];
  delete json.doors;
  const doorways = renameDoorways(
    doors.flatMap((d) => (Array.isArray(d.doorways) ? d.doorways : []))
  );
  if (doorways?.length) json.doorways = doorways as JsonObject[];
  return fromJson(ConcealmentRevealedSchema, json);
}
