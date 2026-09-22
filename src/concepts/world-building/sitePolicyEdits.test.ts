/**
 * The pure policy-edit helpers (rpg-dnd5e-web#1160). These are MECHANICS, not
 * grammar: what they must get right is that an edit writes the bytes the
 * author asked for and does not quietly rewrite anything else — a rename
 * changes the id and leaves the references alone, a removal removes the
 * declaration, and an added answer entry is a document the decoder reads.
 */
import { describe, expect, it } from 'vitest';
import { validateAnswerTable } from './answerTableShape';
import { decodeWorldBuilderV4Site } from './fixtures/worldBuilderV4Site';
import {
  addSiteAnswerEntry,
  addSiteDisposition,
  addSiteFaction,
  defaultAnswerEntry,
  entryWord,
  patchSiteAnswerEntry,
  patchSiteFaction,
  removeSiteAnswerEntry,
  removeSiteDisposition,
  removeSiteFaction,
  renameSiteFaction,
  setAnswerEntryWord,
  updateSiteDisposition,
} from './sitePolicyEdits';

const fixture = decodeWorldBuilderV4Site();
const baseScope = {
  factions: fixture.factions,
  dispositions: fixture.dispositions,
};

describe('site policy edits — mechanics', () => {
  it('adds a faction with a fresh id', () => {
    const next = addSiteFaction({ factions: [{ id: 'faction-1' }] });
    expect(next.factions?.map((faction) => faction.id)).toEqual([
      'faction-1',
      'faction-2',
    ]);
  });

  it('renames only the declaration, leaving references as written', () => {
    const renamed = renameSiteFaction(baseScope, 'goblins', 'orcs');
    expect(renamed.factions?.[0]?.id).toBe('orcs');
    // The disposition still names the OLD id: resolving it is the engine's
    // job, and its refusal is the sentence to surface.
    expect(renamed.dispositions?.[0]?.between).toEqual(['goblins', 'party']);
  });

  it('removes only the declaration', () => {
    const removed = removeSiteFaction(baseScope, 'goblins');
    expect(removed.factions).toEqual([]);
    expect(removed.dispositions?.length).toBe(1);
  });

  it('patches mind, temper and the shared table, deleting cleared keys', () => {
    const patched = patchSiteFaction(baseScope, 'goblins', {
      mind: 'goblin-1',
      temper: 'soldier',
    });
    const faction = patched.factions?.[0];
    expect(faction?.mind).toBe('goblin-1');
    expect(faction?.temper).toBe('soldier');

    const cleared = patchSiteFaction(patched, 'goblins', {
      mind: undefined,
      temper: undefined,
      on: undefined,
    });
    const emptied = cleared.factions?.[0];
    expect(Object.hasOwn(emptied!, 'mind')).toBe(false);
    expect(Object.hasOwn(emptied!, 'temper')).toBe(false);
    expect(Object.hasOwn(emptied!, 'on')).toBe(false);
  });

  it('adds the first faction against the party, and patches by index', () => {
    const added = addSiteDisposition({ factions: [{ id: 'goblins' }] });
    expect(added.dispositions).toEqual([
      { between: ['goblins', 'party'], stance: 'hostile' },
    ]);
    // No faction, nothing to declare a stance about.
    expect(addSiteDisposition({ factions: [] }).dispositions).toBeUndefined();

    const changed = updateSiteDisposition(added, 0, { stance: 'neutral' });
    expect(changed.dispositions?.[0]?.stance).toBe('neutral');
    // `until` is kept as written whatever the stance becomes.
    const withUntil = updateSiteDisposition(
      {
        dispositions: [
          { between: ['a', 'party'], stance: 'hostile', until: { round: 2 } },
        ],
      },
      0,
      { stance: 'neutral' }
    );
    expect(withUntil.dispositions?.[0]?.until).toEqual({ round: 2 });
    expect(removeSiteDisposition(added, 0).dispositions).toEqual([]);
  });

  it('adds, patches and removes an answer entry on a trigger', () => {
    const withEntry = addSiteAnswerEntry(baseScope, 'goblins', 'persuaded');
    const entries = withEntry.factions?.[0]?.on?.persuaded;
    expect(entries).toHaveLength(1);
    // A new entry is a document the decoder reads: the default word carries
    // nothing, so it needs no id.
    expect(() =>
      validateAnswerTable(withEntry.factions?.[0]?.on, 'Site faction on')
    ).not.toThrow();

    const patched = patchSiteAnswerEntry(withEntry, 'goblins', 'persuaded', 0, {
      weight: 5,
      say: 'Fine.',
      flee: {},
    });
    expect(patched.factions?.[0]?.on?.persuaded?.[0]).toEqual({
      weight: 5,
      say: 'Fine.',
      flee: {},
    });

    const removed = removeSiteAnswerEntry(patched, 'goblins', 'persuaded', 0);
    expect(removed.factions?.[0]?.on?.persuaded).toBeUndefined();
  });

  it('reads the one word off an entry and replaces it with its own shape', () => {
    expect(entryWord({ say: 'x', flee: {} })).toBe('flee');
    // `fact` carries a string, so a fresh one is an empty string the author
    // fills in — not an invented id.
    expect(setAnswerEntryWord({ flee: {} }, 'fact')).toEqual({ fact: '' });
    // A selector word takes a sealed selector.
    expect(setAnswerEntryWord({ fact: 'x' }, 'attack')).toEqual({
      attack: 'enemy',
    });
    expect(entryWord(defaultAnswerEntry('intimidated'))).toBe('flee');
    expect(entryWord(defaultAnswerEntry('time'))).toBe('hold');
  });
});
