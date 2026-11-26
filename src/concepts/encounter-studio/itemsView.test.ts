import { describe, expect, it } from 'vitest';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { readDraftYaml } from './draftFile';
import { createCastleS4Document } from './fixtures/castleS4';
import site from './fixtures/cloak-and-ring-walk.yaml?raw';
import { itemsSiteReadBack } from './fixtures/engineReadBack';
import { itemsOf } from './itemsView';

function itemsDocument(): RoomDraftDocument {
  const result = readDraftYaml(site);
  if (!result.ok) throw new Error(result.refusal);
  return { draft: result.draft, scope: result.scope };
}

describe('the site’s items, from the file and the engine’s read-back', () => {
  const items = itemsOf(itemsDocument(), itemsSiteReadBack());
  const item = (id: string) => items.find((i) => i.id === id)!;

  it('lists the site’s items in the file’s order with their names', () => {
    expect(items.map((i) => [i.id, i.name])).toEqual([
      ['lieutenants-cloak', "Lieutenant's cloak"],
      ['garrison-ring', 'Garrison ring'],
    ]);
  });

  it('each item carries the engine’s sentence', () => {
    expect(item('lieutenants-cloak').said[0]!.sentence).toContain(
      'A character owns at most one of it'
    );
    expect(item('garrison-ring').said[0]!.sentence).toContain(
      'A character can own any number of it'
    );
  });

  it('who has it equipped comes from the engine’s connections', () => {
    for (const id of ['lieutenants-cloak', 'garrison-ring'])
      expect(item(id).equippedBy).toEqual([
        { kind: 'creature', id: 'guard', title: 'Lieutenant (guard)' },
      ]);
  });

  it('with no read-back the items are still listed, with nothing said', () => {
    const bare = itemsOf(itemsDocument(), null);
    expect(bare.map((i) => i.id)).toEqual([
      'lieutenants-cloak',
      'garrison-ring',
    ]);
    for (const i of bare) {
      expect(i.said).toEqual([]);
      expect(i.equippedBy).toEqual([]);
      expect(i.props).toEqual([]);
    }
  });

  it('a site with no customItems has no items', () => {
    expect(itemsOf(createCastleS4Document(), null)).toEqual([]);
  });
});
