import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  AtlasRegionSchema,
  AtlasSegmentSchema,
  PositionSchema,
  type AtlasStructuralDoor,
  type AtlasStructuralWall,
  type PropPresentation,
  type StructuralWallOpeningsReplacement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { CellsPatch, SecretPatch } from './applyReveal';

interface PatchRows {
  regions?: MessageInitShape<typeof AtlasRegionSchema>[];
  segments?: MessageInitShape<typeof AtlasSegmentSchema>[];
  sealed?: MessageInitShape<typeof PositionSchema>[];
  structuralWalls?: AtlasStructuralWall[];
  structuralDoors?: AtlasStructuralDoor[];
  structuralWallOpeningsReplacements?: StructuralWallOpeningsReplacement[];
  propPresentations?: PropPresentation[];
}

/** A cells patch with only the given rows; every other row list empty. */
export function cellsPatch(init: PatchRows = {}): CellsPatch {
  return {
    regions: (init.regions ?? []).map((r) => create(AtlasRegionSchema, r)),
    props: [],
    boundaries: [],
    segments: (init.segments ?? []).map((s) => create(AtlasSegmentSchema, s)),
    sealed: (init.sealed ?? []).map((p) => create(PositionSchema, p)),
    doorways: [],
    placed: [],
    exits: [],
    scenery: [],
    structuralWalls: init.structuralWalls ?? [],
    structuralDoors: init.structuralDoors ?? [],
    structuralWallOpeningsReplacements:
      init.structuralWallOpeningsReplacements ?? [],
    propPresentations: init.propPresentations ?? [],
  };
}

/** A secret patch with only the given rows; every other row list empty. */
export function secretPatch(
  init: PatchRows & { concealment?: string } = {}
): SecretPatch {
  const cells = cellsPatch(init);
  return {
    concealment: init.concealment ?? '',
    cells: [],
    props: [],
    doorways: [],
    boundaries: [],
    segments: cells.segments,
    sealed: cells.sealed,
    regions: cells.regions,
    structuralWalls: cells.structuralWalls,
    structuralDoors: cells.structuralDoors,
    structuralWallOpeningsReplacements:
      cells.structuralWallOpeningsReplacements,
    propPresentations: cells.propPresentations,
  };
}
