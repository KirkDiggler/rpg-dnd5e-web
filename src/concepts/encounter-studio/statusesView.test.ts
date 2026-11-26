import { describe, expect, it } from 'vitest';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { readDraftYaml } from './draftFile';
import { createCastleS4Document } from './fixtures/castleS4';
import { hailSiteReadBack } from './fixtures/engineReadBack';
import site from './fixtures/hail-site.yaml?raw';
import { statusesOf } from './statusesView';

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
