// @vitest-environment node
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  ActSchema,
  ClockMark,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { buildActStory } from './actStory';
import { foldLogRows, type LogRow } from './foldLogRows';

const context = { viewerMember: 'alice' };
const member = (id: string) => ({ kind: PartyKind.MEMBER, id });
type Body = MessageInitShape<typeof ActSchema>['body'];
let n = 0;
const at = (family: Family, body: Body) =>
  create(ActSchema, { session: 's', id: `id-${++n}`, family, body });
const walk = (who: string, cells: number) =>
  at(Family.ACT, {
    case: 'walk',
    value: {
      mover: member(who),
      path: Array.from({ length: cells }, () => ({})),
    },
  });
const fight = (mark: ClockMark) =>
  at(Family.CLOCK, { case: 'clock', value: { mark } });
const loot = (who: string) =>
  at(Family.ACT, {
    case: 'loot',
    value: { by: member(who), from: member('chest') },
  });

function rows(...acts: ReturnType<typeof at>[]) {
  return foldLogRows(
    buildActStory(
      acts.map((act) => ({
        act,
        index: 0,
        seq: 1n,
        source: 'live' as const,
        visible: true,
      })),
      context
    )
  );
}
const shape = (log: readonly LogRow[]) =>
  log.map((row) =>
    row.kind === 'walks'
      ? `${row.mover} walked ${row.cells} (${row.walks.length})`
      : row.entry.headline
  );

describe('out-of-combat walks fold per creature per stretch', () => {
  it('interleaved creatures each fold into one row at their first walk', () => {
    const log = rows(
      walk('gate-1', 3),
      walk('gate-2', 2),
      walk('gate-1', 4),
      walk('gate-2', 5),
      walk('gate-1', 7)
    );
    expect(shape(log)).toEqual(['gate-1 walked 14 (3)', 'gate-2 walked 7 (2)']);
  });

  it('a creature doing anything else ends only its own stretch', () => {
    const log = rows(
      walk('gate-1', 2),
      walk('gate-2', 2),
      loot('gate-1'),
      walk('gate-1', 1),
      walk('gate-2', 3)
    );
    expect(shape(log)).toEqual([
      'gate-1 walked 2 (1)',
      'gate-2 walked 5 (2)',
      'gate-1 loots chest',
      'gate-1 walked 1 (1)',
    ]);
  });
});

describe('a fight ends the stretch', () => {
  it('walks in a fight stay a row each; after it, a new stretch folds', () => {
    const log = rows(
      walk('gate-1', 2),
      fight(ClockMark.FIGHT_FORMED),
      walk('gate-1', 1),
      walk('gate-1', 1),
      fight(ClockMark.FIGHT_DISSOLVED),
      walk('gate-1', 4),
      walk('gate-1', 4)
    );
    expect(shape(log)).toEqual([
      'gate-1 walked 2 (1)',
      'A fight begins',
      'gate-1 moves',
      'gate-1 moves',
      'The fight ends',
      'gate-1 walked 8 (2)',
    ]);
  });
});
