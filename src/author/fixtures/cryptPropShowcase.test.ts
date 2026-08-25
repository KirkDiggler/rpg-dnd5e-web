import { describe, expect, it } from 'vitest';
import { sandboxDocForSearch } from '../DungeonBuilderSandbox';
import { emitDungeon, parseDungeon } from '../dungeonYaml';
import { cryptPropShowcaseDoc } from './cryptPropShowcase';
import { fixtureAtlasOf } from './fixtureAtlas';

describe('cryptPropShowcaseDoc', () => {
  it('contains exactly the three first-wave refs with authored facing and offset', () => {
    const doc = cryptPropShowcaseDoc();
    expect(doc.place.map((p) => p.ref)).toEqual([
      'dnd5e:props:skeleton-cage',
      'dnd5e:props:skeleton-table',
      'dnd5e:props:rug',
    ]);
    expect(doc.place.map((p) => [p.facing, p.offset])).toEqual([
      ['se', [0, 0]],
      ['e', [0, 0]],
      ['e', [0, 0]],
    ]);
  });

  it('round-trips byte-for-byte and projects the same three atlas refs', () => {
    const doc = cryptPropShowcaseDoc();
    const yaml = emitDungeon(doc);
    expect(emitDungeon(parseDungeon(yaml))).toBe(yaml);
    expect(fixtureAtlasOf(doc).props.map((p) => p.ref)).toEqual(
      doc.place.map((p) => p.ref)
    );
  });

  it('returns the reference tomb for an empty search', () => {
    expect(sandboxDocForSearch('').key).toBe('reference-tomb');
  });

  it('returns the crypt prop showcase for the crypt-props fixture query', () => {
    expect(sandboxDocForSearch('?authorFixture=crypt-props').key).toBe(
      'crypt-prop-showcase'
    );
  });
});
