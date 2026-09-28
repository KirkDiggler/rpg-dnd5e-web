// @vitest-environment node
import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  Passage,
  PositionSchema,
  SightingSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { coordToKey } from '../hex-grid/hexMath';
import { buildAtlasPathIndex, findAtlasPath } from './atlasPath';
import { indexOccupantPassages } from './occupantPassages';
import { positionToCube } from './positionBridge';
import { sightingsToEntities } from './sightingEntities';

const positions = [0, 1, 2].map((x) => create(PositionSchema, { x, y: 0 }));
const cubes = positions.map(positionToCube);
const atlas = {
  cells: positions,
  boundaries: [],
  doorways: [],
  props: [],
} as Parameters<typeof buildAtlasPathIndex>[0];
function index(passage: Passage, remembered = false, kind = MemberKind.PLAYER) {
  const sightings = [
    create(SightingSchema, {
      subject: 'occupant',
      kind,
      passage,
      currentVia: remembered ? [] : ['sight'],
      seen: { position: positions[1] },
    }),
  ];
  return indexOccupantPassages(sightingsToEntities(sightings, 'walker'));
}

describe('provider-owned occupant passage', () => {
  it('crosses an ally in a one-cell doorway but cannot end there', () => {
    const occupancy = index(Passage.PASS_THROUGH);
    const graph = buildAtlasPathIndex(
      atlas,
      undefined,
      occupancy.blocked,
      occupancy.passThrough
    );
    expect(findAtlasPath(graph, cubes[0], cubes[2]).map(coordToKey)).toEqual(
      cubes.map(coordToKey)
    );
    expect(findAtlasPath(graph, cubes[0], cubes[1])).toEqual([]);
  });
  it('can stop on a standable body and obeys changed permission regardless of kind', () => {
    const body = index(Passage.STANDABLE, false, MemberKind.MONSTER);
    expect(
      findAtlasPath(
        buildAtlasPathIndex(atlas, undefined, body.blocked, body.passThrough),
        cubes[0],
        cubes[1]
      ).map(coordToKey)
    ).toEqual(cubes.slice(0, 2).map(coordToKey));
    const hostilePlayer = index(Passage.BLOCKED);
    expect(hostilePlayer.blocked.has(coordToKey(cubes[1]))).toBe(true);
  });
  it('a heard-only occupant is remembered and cannot block or invalidate routing', () => {
    const members = sightingsToEntities(
      [
        create(SightingSchema, {
          subject: 'heard-occupant',
          currentVia: ['hearing'],
          passage: Passage.UNSPECIFIED,
          seen: { position: positions[1] },
        }),
      ],
      'walker'
    );
    expect(members[0].remembered).toBe(true);
    const occupancy = indexOccupantPassages(members);
    expect(occupancy.error).toBeNull();
    expect(occupancy.blocked.size).toBe(0);
    expect(occupancy.passThrough.size).toBe(0);
    const graph = buildAtlasPathIndex(
      atlas,
      undefined,
      occupancy.blocked,
      occupancy.passThrough
    );
    expect(findAtlasPath(graph, cubes[0], cubes[2]).map(coordToKey)).toEqual(
      cubes.map(coordToKey)
    );
  });
  it('ignores memories and exposes a missing contract as an error', () => {
    expect(index(Passage.BLOCKED, true).blocked.size).toBe(0);
    expect(index(Passage.UNSPECIFIED).error).toBeTruthy();
  });
});
