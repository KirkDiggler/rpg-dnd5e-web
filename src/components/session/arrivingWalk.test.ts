import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  MoveKind,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { arrivingWalk, ownWalk } from './arrivingWalk';

function walk(
  mover: string,
  cells: [number, number][],
  wire: { kind?: MoveKind; forced?: boolean } = {}
) {
  return create(ActSchema, {
    id: 'id-1',
    act: 'move:id-1',
    family: Family.ACT,
    body: {
      case: 'walk',
      value: {
        mover: { kind: PartyKind.MEMBER, id: mover },
        path: cells.map(([x, y]) => ({ cell: { x, y } })),
        ...wire,
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

  it.each([
    [MoveKind.OWN, false, 'own'],
    [MoveKind.COMPELLED, false, 'compelled'],
    [MoveKind.DISPLACED, true, 'displaced'],
  ] as const)('names the wire kind %s', (kind, forced, want) => {
    expect(
      arrivingWalk(walk('gate-1', [[1, 0]], { kind, forced }), 'alice')?.kind
    ).toBe(want);
  });

  it('falls back to forced when the kind is unspecified', () => {
    expect(
      arrivingWalk(walk('gate-1', [[1, 0]], { forced: true }), 'alice')?.kind
    ).toBe('displaced');
    expect(arrivingWalk(walk('gate-1', [[1, 0]]), 'alice')?.kind).toBe('own');
  });

  it("feeds the local member's compelled walk, never its own", () => {
    const compelled = arrivingWalk(
      walk('alice', [[1, 0]], { kind: MoveKind.COMPELLED }),
      'alice'
    );
    expect(compelled?.member).toBe('alice');
    expect(compelled?.kind).toBe('compelled');
    expect(
      arrivingWalk(walk('alice', [[1, 0]], { kind: MoveKind.OWN }), 'alice')
    ).toBeUndefined();
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

describe('ownWalk (rpg-project#890)', () => {
  const walkAct = (mover: string, kind: MoveKind) =>
    create(ActSchema, {
      id: '01J0000000C',
      act: 'move:1',
      body: {
        case: 'walk',
        value: {
          mover: { kind: PartyKind.MEMBER, id: mover },
          path: [{ cell: { x: 1, y: 0 } }],
          kind,
        },
      },
    });

  it('reads the local member own walk with its id and act', () => {
    expect(ownWalk(walkAct('me', MoveKind.OWN), 'me')).toEqual({
      id: '01J0000000C',
      act: 'move:1',
      cells: [{ x: 1, y: -1, z: 0 }],
    });
  });

  it('is nothing for someone else, or a walk the member did not choose', () => {
    expect(ownWalk(walkAct('guard', MoveKind.OWN), 'me')).toBeUndefined();
    expect(ownWalk(walkAct('me', MoveKind.COMPELLED), 'me')).toBeUndefined();
    expect(ownWalk(walkAct('me', MoveKind.DISPLACED), 'me')).toBeUndefined();
  });
});
