import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { arrivingWalk } from './arrivingWalk';

function walk(mover: string, cells: [number, number][]) {
  return create(ActSchema, {
    id: 'id-1',
    act: 'move:id-1',
    family: Family.ACT,
    body: {
      case: 'walk',
      value: {
        mover: { kind: PartyKind.MEMBER, id: mover },
        path: cells.map(([x, y]) => ({ cell: { x, y } })),
      },
    },
  });
}

describe('arrivingWalk', () => {
  it('remote walk feeds steps in order; own walk ignored', () => {
    const remote = arrivingWalk(
      walk('gate-1', [
        [1, 0],
        [2, 0],
        [2, 1],
      ]),
      'alice'
    );
    expect(remote?.member).toBe('gate-1');
    // Cube coordinates in path order: cube.x is q, cube.z is r.
    expect(remote?.cells.map((c) => [c.x, c.z])).toEqual([
      [1, 0],
      [2, 0],
      [2, 1],
    ]);
    expect(arrivingWalk(walk('alice', [[1, 0]]), 'alice')).toBeUndefined();
  });

  it('is undefined for anything that is not a walk with cells', () => {
    expect(arrivingWalk(walk('gate-1', []), 'alice')).toBeUndefined();
    expect(
      arrivingWalk(
        create(ActSchema, {
          id: 'id-2',
          family: Family.ACT,
          body: { case: 'door', value: { door: 'gate' } },
        }),
        'alice'
      )
    ).toBeUndefined();
  });
});
