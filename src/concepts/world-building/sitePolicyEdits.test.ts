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
  addSiteTable,
  addSiteTableAnswerEntry,
  defaultAnswerEntry,
  entryWord,
  patchSiteAnswerEntry,
  patchSiteFaction,
  patchSiteTableAnswerEntry,
  removeSiteAnswerEntry,
  removeSiteDisposition,
  removeSiteFaction,
  removeSiteTable,
  removeSiteTableAnswerEntry,
  renameSiteFaction,
  renameSiteTable,
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

/* THE ROOT ANSWER TABLES (rpg-toolkit#1897, rpg-dnd5e-web#1201). Declared once
 * at the site root, named by a faction or a binding — so the one thing these
 * must get right is that a table's IDENTITY and a reference to it are separate
 * facts: renaming or removing the declaration NEVER rewrites a name that
 * points at it. That is `renameSiteFaction`'s law one noun over, and the reason
 * is the same: the engine's refusal, by name and with the fix, is the sentence
 * worth surfacing. */
describe('site root tables — mechanics', () => {
  const withTables = {
    ...baseScope,
    tables: {
      'goblin-drill': { time: [{ when: { enemy: 'reach' }, attack: 'enemy' }] },
      'watch-drill': {},
    },
  };

  it('declares a fresh table, born empty', () => {
    const next = addSiteTable({ tables: { 'table-1': {} } });
    expect(Object.keys(next.tables ?? {})).toEqual(['table-1', 'table-2']);
    // EMPTY IS A LEGAL AUTHORED STATE FOR A TABLE, unlike a binding: an
    // unnamed table waiting for its second creature is the point of declaring
    // one at the root, and the grammar judges it whether or not it is named.
    expect(next.tables?.['table-2']).toEqual({});
  });

  it('renames the declaration and leaves every reference as written', () => {
    const scope = {
      ...withTables,
      factions: [{ id: 'goblins', table: 'goblin-drill' }],
    };
    const renamed = renameSiteTable(scope, 'goblin-drill', 'goblin-orders');
    expect(Object.keys(renamed.tables ?? {})).toEqual([
      'goblin-orders',
      'watch-drill',
    ]);
    // The faction still names the OLD id — resolving it is the engine's job
    // (`factionTable` refuses it by name), and that sentence is the one to
    // surface. THE MUTATION: make `renameSiteTable` rewrite references and
    // this assertion fails.
    expect(renamed.factions?.[0]?.table).toBe('goblin-drill');
  });

  it('refuses a rename onto a name that already exists, rather than deleting it', () => {
    // A naive implementation assigns into an object literal and silently
    // overwrites `watch-drill`. This is the assertion that catches it.
    const collided = renameSiteTable(withTables, 'goblin-drill', 'watch-drill');
    expect(collided).toBe(withTables);
    expect(Object.keys(collided.tables ?? {}).sort()).toEqual([
      'goblin-drill',
      'watch-drill',
    ]);
  });

  it('renames nothing when the id is not declared', () => {
    expect(renameSiteTable(withTables, 'nope', 'other')).toBe(withTables);
  });

  it('removes the declaration and leaves references to it alone', () => {
    const scope = {
      ...withTables,
      factions: [{ id: 'goblins', table: 'goblin-drill' }],
    };
    const removed = removeSiteTable(scope, 'goblin-drill');
    expect(Object.keys(removed.tables ?? {})).toEqual(['watch-drill']);
    expect(removed.factions?.[0]?.table).toBe('goblin-drill');
  });

  it('removing the last table drops the key, so "none" is absence and not an empty map', () => {
    const removed = removeSiteTable(
      removeSiteTable({ tables: { 'goblin-drill': {} } }, 'goblin-drill')
    );
    expect(removed.tables).toBeUndefined();
    expect('tables' in removed).toBe(false);
  });

  it('adds, patches and removes an entry, dropping an emptied trigger but keeping the table', () => {
    const withEntry = addSiteTableAnswerEntry(
      withTables,
      'watch-drill',
      'time'
    );
    expect(withEntry.tables?.['watch-drill']?.time).toHaveLength(1);
    // A new entry is a document the decoder reads, the same claim the faction
    // test makes about the same default.
    expect(() =>
      validateAnswerTable(withEntry.tables?.['watch-drill'], 'Site table')
    ).not.toThrow();

    const patched = patchSiteTableAnswerEntry(
      withEntry,
      'watch-drill',
      'time',
      0,
      { weight: 3, say: 'Drill!', hold: {} }
    );
    expect(patched.tables?.['watch-drill']?.time?.[0]).toEqual({
      weight: 3,
      say: 'Drill!',
      hold: {},
    });

    const removed = removeSiteTableAnswerEntry(
      patched,
      'watch-drill',
      'time',
      0
    );
    // The emptied TRIGGER goes; the declared TABLE stays — clearing the last
    // entry is not the same act as removing the declaration.
    expect(removed.tables?.['watch-drill']).toEqual({});
    expect(Object.hasOwn(removed.tables ?? {}, 'watch-drill')).toBe(true);
  });

  it('an edit against a table that is not declared changes nothing', () => {
    expect(addSiteTableAnswerEntry(withTables, 'nope', 'time')).toBe(
      withTables
    );
    expect(
      patchSiteTableAnswerEntry(withTables, 'nope', 'time', 0, { hold: {} })
    ).toBe(withTables);
    expect(removeSiteTableAnswerEntry(withTables, 'nope', 'time', 0)).toBe(
      withTables
    );
  });
});
