import { describe, expect, it } from 'vitest';
import {
  addIntelRecord,
  intelHolders,
  intelRecordIds,
  nextIntelId,
  removeIntelRecord,
  renameIntelRecord,
  setIntelReveals,
} from './intelEdits';
import type { SiteScope } from './siteScope';

const empty = (): SiteScope => ({});

describe('editing the site’s intel records (web#1176)', () => {
  it('adds a record under a fresh id and drops the key when the last one goes', () => {
    const one = addIntelRecord(empty(), { door: 'vault' });
    expect(one.intel).toEqual([{ id: 'intel-1', reveals: { door: 'vault' } }]);
    // ABSENCE, NOT EMPTY: removing the last record drops `intel` entirely, so
    // the document stays byte-identical to one that never had any.
    expect(removeIntelRecord(one, 'intel-1')).toEqual({});
    expect(removeIntelRecord(one, 'intel-1').intel).toBeUndefined();
  });

  it('never hands out an id that is taken', () => {
    const two = addIntelRecord(addIntelRecord(empty(), { fact: 'a' }), {
      fact: 'b',
    });
    expect(intelRecordIds(two)).toEqual(['intel-1', 'intel-2']);
    // Rename the second out of the way and the next id is still unique.
    const renamed = renameIntelRecord(two, 'intel-1', 'vault-map');
    expect(nextIntelId(renamed)).toBe('intel-3');
    expect(new Set(intelRecordIds(renamed)).size).toBe(2);
  });

  it('renames an id WITHOUT rewriting a holder — the engine names the dangling one', () => {
    const scope = addIntelRecord(empty(), { fact: 'cellar-is-clear' });
    const renamed = renameIntelRecord(scope, 'intel-1', 'cellar-lie');
    expect(intelRecordIds(renamed)).toEqual(['cellar-lie']);
    // The holder is not this module's to rewrite: it is the server's judgement.
    expect(
      intelHolders({ 'goblin-1': { holds: ['intel-1'] } }, 'intel-1')
    ).toEqual(['goblin-1']);
  });

  it('replaces what a record reveals, in either target shape', () => {
    const scope = addIntelRecord(empty(), { door: 'vault' });
    const swapped = setIntelReveals(scope, 'intel-1', {
      fact: 'saved-wiseman',
    });
    expect(swapped.intel).toEqual([
      { id: 'intel-1', reveals: { fact: 'saved-wiseman' } },
    ]);
  });

  it('reports who holds a record, and nobody when there are no bindings', () => {
    const bindings = {
      'goblin-1': { holds: ['cellar-lie'] },
      'thug-1': { holds: ['cellar-lie', 'vault-map'] },
      'bandit-1': {},
    };
    expect(intelHolders(bindings, 'cellar-lie')).toEqual([
      'goblin-1',
      'thug-1',
    ]);
    expect(intelHolders(bindings, 'vault-map')).toEqual(['thug-1']);
    expect(intelHolders(bindings, 'nobody-holds-this')).toEqual([]);
    expect(intelHolders(undefined, 'cellar-lie')).toEqual([]);
  });
});
