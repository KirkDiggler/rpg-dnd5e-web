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
function index(
  passage: Passage,
  remembered = false,
  kind = MemberKind.PLAYER,
  stance = ''
) {
  const sightings = [
    create(SightingSchema, {
      subject: 'occupant',
      kind,
      passage,
      stance,
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
  it('a seen, neutral blocking body is walked into only when he is the only way', () => {
    const guard = index(Passage.BLOCKED, false, MemberKind.MONSTER, 'neutral');
    expect(guard.blocked.has(coordToKey(cubes[1]))).toBe(true);
    expect(guard.walkInto.has(coordToKey(cubes[1]))).toBe(true);
    const graph = buildAtlasPathIndex(
      atlas,
      undefined,
      guard.blocked,
      guard.passThrough,
      guard.walkInto
    );
    // The strip is one cell wide: through him is the only way.
    expect(findAtlasPath(graph, cubes[0], cubes[2]).map(coordToKey)).toEqual(
      cubes.map(coordToKey)
    );
    // His cell as the goal is the approach gesture, not a walk into him.
    expect(findAtlasPath(graph, cubes[0], cubes[1])).toEqual([]);
  });
  it('a body believed hostile is never walked into', () => {
    const foe = index(Passage.BLOCKED, false, MemberKind.MONSTER, 'hostile');
    expect(foe.blocked.has(coordToKey(cubes[1]))).toBe(true);
    expect(foe.walkInto.size).toBe(0);
    const graph = buildAtlasPathIndex(
      atlas,
      undefined,
      foe.blocked,
      foe.passThrough,
      foe.walkInto
    );
    expect(findAtlasPath(graph, cubes[0], cubes[2])).toEqual([]);
    expect(findAtlasPath(graph, cubes[0], cubes[1])).toEqual([]);
  });
  it('a remembered blocking body is neither blocked nor walked into', () => {
    const memory = index(Passage.BLOCKED, true, MemberKind.MONSTER, 'neutral');
    expect(memory.walkInto.size).toBe(0);
  });
  it('a body with no stance word fails closed: never walked into', () => {
    const stranger = index(Passage.BLOCKED, false, MemberKind.MONSTER, '');
    expect(stranger.blocked.has(coordToKey(cubes[1]))).toBe(true);
    expect(stranger.walkInto.size).toBe(0);
    const graph = buildAtlasPathIndex(
      atlas,
      undefined,
      stranger.blocked,
      stranger.passThrough,
      stranger.walkInto
    );
    expect(findAtlasPath(graph, cubes[0], cubes[2])).toEqual([]);
    expect(findAtlasPath(graph, cubes[0], cubes[1])).toEqual([]);
  });
  it('an allied blocking body is walked into as a neutral one is', () => {
    const friend = index(Passage.BLOCKED, false, MemberKind.MONSTER, 'allied');
    expect(friend.walkInto.has(coordToKey(cubes[1]))).toBe(true);
  });
  it('a cell a neutral body shares with a hostile one is never walked into', () => {
    const members = sightingsToEntities(
      ['neutral', 'hostile'].map((stance) =>
        create(SightingSchema, {
          subject: `occupant-${stance}`,
          kind: MemberKind.MONSTER,
          passage: Passage.BLOCKED,
          stance,
          currentVia: ['sight'],
          seen: { position: positions[1] },
        })
      ),
      'walker'
    );
    const occupancy = indexOccupantPassages(members);
    expect(occupancy.blocked.has(coordToKey(cubes[1]))).toBe(true);
    expect(occupancy.walkInto.size).toBe(0);
    const graph = buildAtlasPathIndex(
      atlas,
      undefined,
      occupancy.blocked,
      occupancy.passThrough,
      occupancy.walkInto
    );
    expect(findAtlasPath(graph, cubes[0], cubes[2])).toEqual([]);
  });
});
