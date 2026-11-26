import type { ReadBack } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { readDraftYaml } from './draftFile';
import { createCastleS4Document } from './fixtures/castleS4';
import { hailSiteReadBack } from './fixtures/engineReadBack';
import site from './fixtures/hail-site.yaml?raw';
import { statusesNotMapping, statusesOf } from './statusesView';

function hailDocument(): RoomDraftDocument {
  const result = readDraftYaml(site);
  if (!result.ok) throw new Error(result.refusal);
  return { draft: result.draft, scope: result.scope };
}

/** The hail site's document with its `statuses` replaced. */
function withStatuses(statuses: unknown): RoomDraftDocument {
  const document = hailDocument();
  return {
    ...document,
    scope: {
      ...document.scope,
      unread: { ...document.scope.unread, statuses },
    },
  };
}

describe('the site’s status effects, from the file and the engine’s read-back', () => {
  const statuses = statusesOf(hailDocument(), hailSiteReadBack());

  it('lists the site’s statuses with their names', () => {
    expect(statuses.map((s) => [s.id, s.name])).toEqual([
      ['welcomed', 'Welcomed'],
    ]);
  });

  it('carries the engine’s sentence and the block as written', () => {
    expect(statuses[0]!.said[0]!.sentence).toContain(
      'is a status effect a line’s row can give'.replace('’', "'")
    );
    expect(statuses[0]!.written).toMatchObject({
      name: 'Welcomed',
      again: 'ignored',
    });
  });

  // catches: the receiver read from the wrong role (it would be empty or the
  // status's own id)
  it('the giving line comes with its owner, its path and who receives it', () => {
    expect(statuses[0]!.givenBy).toEqual([
      {
        kind: 'creature',
        id: 'porter',
        path: 'room.room.monsterBindings.porter.options[0].success[0].apply_status',
        receiver: 'speaker',
      },
    ]);
  });

  it('files in the file’s order and keeps a status nobody gives with no givers', () => {
    const two = statusesOf(
      withStatuses({
        welcomed: { name: 'Welcomed' },
        forgotten: { name: 'Forgotten' },
      }),
      hailSiteReadBack()
    );
    expect(two.map((s) => s.id)).toEqual(['welcomed', 'forgotten']);
    expect(two[0]!.givenBy).toHaveLength(1);
    expect(two[1]!.givenBy).toEqual([]);
    expect(two[1]!.said).toEqual([]);
  });

  // catches: a block that is not an object filtered out of the list
  it('a status whose block is not an object still has its row, shown as written', () => {
    const odd = statusesOf(
      withStatuses({ plain: 'just words', nothing: null, list: [1, 2] }),
      null
    );
    expect(odd.map((s) => [s.id, s.name, s.written])).toEqual([
      ['plain', 'plain', 'just words'],
      ['nothing', 'nothing', null],
      ['list', 'list', [1, 2]],
    ]);
  });

  it('with no read-back the statuses are listed, with nothing said and nothing thrown', () => {
    const bare = statusesOf(hailDocument(), null);
    expect(bare.map((s) => s.id)).toEqual(['welcomed']);
    expect(bare[0]!.said).toEqual([]);
    expect(bare[0]!.givenBy).toEqual([]);
  });

  it('a site with no statuses has none', () => {
    expect(statusesOf(createCastleS4Document(), null)).toEqual([]);
  });
});

/** The hail read-back with its giving statement changed (or copied). */
function grantEdited(
  edit: (
    statement: ReadBack['sections'][0]['groups'][0]['statements'][0]
  ) => void,
  copies = 1
): ReadBack {
  const readBack = hailSiteReadBack();
  for (const section of readBack.sections)
    for (const group of section.groups) {
      const grant = group.statements.find((s) => s.kind === 'line.grant');
      if (!grant) continue;
      for (let i = 1; i < copies; i++)
        group.statements.push(structuredClone(grant));
      edit(grant);
    }
  return readBack;
}

describe('who counts as a giver', () => {
  // catches: the role check dropped
  it('a line.grant that connects the status with a role other than gives is not a giver', () => {
    const readBack = grantEdited((s) => {
      s.connects.find((c) => c.kind === 'status')!.role = 'mentions';
    });
    expect(statusesOf(hailDocument(), readBack)[0]!.givenBy).toEqual([]);
  });

  // catches: the statement-kind check dropped
  it('a statement of another kind that connects the status with gives is not a giver', () => {
    const readBack = grantEdited((s) => {
      s.kind = 'line.say';
    });
    expect(statusesOf(hailDocument(), readBack)[0]!.givenBy).toEqual([]);
  });

  it('two lines giving the same status are both listed', () => {
    const readBack = grantEdited(() => {}, 2);
    const givers = statusesOf(hailDocument(), readBack)[0]!.givenBy;
    expect(givers).toHaveLength(2);
    expect(givers.map((g) => g.id)).toEqual(['porter', 'porter']);
  });

  it('a line.grant with no who connection is listed with an empty receiver', () => {
    const readBack = grantEdited((s) => {
      s.connects = s.connects.filter((c) => c.kind !== 'who');
    });
    expect(statusesOf(hailDocument(), readBack)[0]!.givenBy[0]!.receiver).toBe(
      ''
    );
  });
});

describe('statuses written as something that is not a mapping', () => {
  it.each([['text'], [7], [[1, 2]], [true], [null]])(
    '%j is reported as written',
    (value) => {
      expect(statusesNotMapping(withStatuses(value))).toEqual({
        written: value,
      });
      expect(statusesOf(withStatuses(value), null)).toEqual([]);
    }
  );

  it('a mapping, or no statuses at all, is not reported', () => {
    expect(statusesNotMapping(hailDocument())).toBeNull();
    expect(statusesNotMapping(createCastleS4Document())).toBeNull();
  });
});
