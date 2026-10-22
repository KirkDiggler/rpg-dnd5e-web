/**
 * actGeometry — a perception act's geometry, in the atlas rows the knowledge
 * cache holds (rpg-project#630, event-stream R18).
 *
 * The knowledge snapshot is GetKnowledge's (session v1alpha1), and its atlas
 * rows are v1alpha1 types. The act stream's geometry (`act_geometry.proto`)
 * redefines the same rows field for field in v1alpha2, so the two are bridged
 * here, at the cache boundary, by a JSON hop per row: every field crosses by
 * its own name, and a field one side has and the other does not THROWS
 * rather than vanishing — both a field of the act's body this module does not
 * map, and a field inside a row the v1alpha1 row lacks.
 *
 * Two names differ and are renamed on the way: a doorway's door id (`door`
 * on v2, `connection` on v1), and a revealed secret's doors, which v2
 * carries as RevealedDoor rows with their doorways nested; the doorways
 * patch the atlas here and the door rows are re-read through GetDoors.
 *
 * The bridge used to target the v1 event bodies (`CellsRevealed`,
 * `ConcealmentRevealed`); it targets the reveal reducers' own patch shapes
 * since the v1 event stream left (rpg-dnd5e-web#1305).
 */
import {
  fromJson,
  toJson,
  type DescMessage,
  type JsonObject,
  type JsonValue,
  type MessageShape,
} from '@bufbuild/protobuf';
import {
  AtlasBoundarySchema,
  AtlasDoorwaySchema,
  AtlasExitSchema,
  AtlasPlacedPropSchema,
  AtlasPropSchema,
  AtlasRegionSchema,
  AtlasSegmentSchema,
  AtlasStructuralDoorSchema,
  AtlasStructuralWallSchema,
  PositionSchema,
  PropPresentationSchema,
  StructuralWallOpeningsReplacementSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  CellsLearnedSchema,
  SecretRevealedSchema,
  type CellsLearned,
  type SecretRevealed,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { CellsPatch, SecretPatch } from './applyReveal';

type JsonRow = { [key: string]: JsonValue };

function renameDoorways(rows: readonly JsonValue[]): JsonValue[] {
  return rows.map((value) => {
    const { door, ...rest } = value as JsonRow;
    return door === undefined ? rest : { ...rest, connection: door };
  });
}

/** One repeated field of the act's JSON, read as v1alpha1 rows. */
function rows<Desc extends DescMessage>(
  json: JsonObject,
  field: string,
  schema: Desc
): MessageShape<Desc>[] {
  const value = json[field];
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new Error(`actGeometry: ${field} is not a list`);
  return value.map((row) => fromJson(schema, row));
}

/** Throw on any field of the act's body this bridge does not carry. */
function assertOnly(json: JsonObject, known: readonly string[], what: string) {
  for (const key of Object.keys(json)) {
    if (!known.includes(key))
      throw new Error(`actGeometry: ${what}.${key} has no atlas row`);
  }
}

const CELLS_FIELDS = [
  'regions',
  'props',
  'boundaries',
  'segments',
  'sealed',
  'doorways',
  'placed',
  'exits',
  'scenery',
  'structuralWalls',
  'structuralDoors',
  'structuralWallOpeningsReplacements',
  'propPresentations',
] as const;

/** CellsLearned as the patch `applyCellsRevealed` takes. */
export function cellsPatchOf(cells: CellsLearned): CellsPatch {
  return cellsPatchFromJson(toJson(CellsLearnedSchema, cells) as JsonObject);
}

/** cellsPatchOf's bridge over the act body's JSON form. Exported so a test
 * can hand it a field no CellsLearned carries yet. */
export function cellsPatchFromJson(json: JsonObject): CellsPatch {
  assertOnly(json, CELLS_FIELDS, 'CellsLearned');
  if (Array.isArray(json.doorways))
    json.doorways = renameDoorways(json.doorways);
  return {
    regions: rows(json, 'regions', AtlasRegionSchema),
    props: rows(json, 'props', AtlasPropSchema),
    boundaries: rows(json, 'boundaries', AtlasBoundarySchema),
    segments: rows(json, 'segments', AtlasSegmentSchema),
    sealed: rows(json, 'sealed', PositionSchema),
    doorways: rows(json, 'doorways', AtlasDoorwaySchema),
    placed: rows(json, 'placed', AtlasPlacedPropSchema),
    exits: rows(json, 'exits', AtlasExitSchema),
    scenery: rows(json, 'scenery', PositionSchema),
    structuralWalls: rows(json, 'structuralWalls', AtlasStructuralWallSchema),
    structuralDoors: rows(json, 'structuralDoors', AtlasStructuralDoorSchema),
    structuralWallOpeningsReplacements: rows(
      json,
      'structuralWallOpeningsReplacements',
      StructuralWallOpeningsReplacementSchema
    ),
    propPresentations: rows(json, 'propPresentations', PropPresentationSchema),
  };
}

const SECRET_FIELDS = [
  'concealment',
  'cells',
  'props',
  'doors',
  'boundaries',
  'segments',
  'sealed',
  'regions',
  'structuralWalls',
  'structuralDoors',
  'structuralWallOpeningsReplacements',
  'propPresentations',
] as const;

/** SecretRevealed as the patch `applyConcealmentRevealed` takes. The door
 * rows are left to GetDoors; their doorways patch the atlas. */
export function secretPatchOf(revealed: SecretRevealed): SecretPatch {
  return secretPatchFromJson(
    toJson(SecretRevealedSchema, revealed) as JsonObject
  );
}

/** secretPatchOf's bridge over the act body's JSON form. Exported so a test
 * can hand it a field no SecretRevealed carries yet. */
export function secretPatchFromJson(json: JsonObject): SecretPatch {
  assertOnly(json, SECRET_FIELDS, 'SecretRevealed');
  const doors = Array.isArray(json.doors) ? (json.doors as JsonRow[]) : [];
  const doorways = renameDoorways(
    doors.flatMap((d) => (Array.isArray(d.doorways) ? d.doorways : []))
  );
  return {
    concealment: typeof json.concealment === 'string' ? json.concealment : '',
    cells: rows(json, 'cells', PositionSchema),
    props: rows(json, 'props', AtlasPropSchema),
    doorways: doorways.map((row) => fromJson(AtlasDoorwaySchema, row)),
    boundaries: rows(json, 'boundaries', AtlasBoundarySchema),
    segments: rows(json, 'segments', AtlasSegmentSchema),
    sealed: rows(json, 'sealed', PositionSchema),
    regions: rows(json, 'regions', AtlasRegionSchema),
    structuralWalls: rows(json, 'structuralWalls', AtlasStructuralWallSchema),
    structuralDoors: rows(json, 'structuralDoors', AtlasStructuralDoorSchema),
    structuralWallOpeningsReplacements: rows(
      json,
      'structuralWallOpeningsReplacements',
      StructuralWallOpeningsReplacementSchema
    ),
    propPresentations: rows(json, 'propPresentations', PropPresentationSchema),
  };
}
