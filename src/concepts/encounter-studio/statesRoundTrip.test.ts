import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { entryText } from '../world-building/entryText';
import { factionLayers, layeredOrders } from '../world-building/layeredOrders';
import {
  setMonsterFaction,
  setMonsterTemper,
} from '../world-building/monsterOrderEdits';
import { readBackOf } from '../world-building/readBack';
import {
  parseRoomDocumentJson,
  stringifyRoomDraft,
} from '../world-building/roomDraft';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-posts.yaml?raw';
import castle from './fixtures/the-mad-king-states.yaml?raw';

function read(source = castle) {
  const result = readDraftYaml(source);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

// Copied from rpg-api/content/the-mad-king.yaml at 67fd13b, not the pre-S4
// Studio fixture. Removing states support or sealing table keys to time
// must break this real import/export path.
describe('S6b: the server castle is a Studio document', () => {
  it('imports and round-trips every recipe and the march rows', () => {
    const original = parse(castle);
    const result = read();
    const exported = parse(exportDraftYaml(result, result.key));
    for (const id of ['gate-1', 'reserve-1', 'reserve-2']) {
      expect(exported.room.room.monsterBindings[id].states).toEqual(
        original.room.room.monsterBindings[id].states
      );
    }
    expect(exported.tables['answer-the-gate'].march).toEqual(
      original.tables['answer-the-gate'].march
    );
    const again = read(stringify(exported));
    expect(again.draft.room.monsterBindings).toEqual(
      result.draft.room.monsterBindings
    );
    const stored = parseRoomDocumentJson(
      stringifyRoomDraft(result.draft, result.scope)
    );
    expect(stored).toEqual({ draft: result.draft, scope: result.scope });
  });

  it('preserves the captain’s plain greeting and refuses a failure on a line with no check', () => {
    const result = read();
    const file = parse(exportDraftYaml(result, result.key));
    const greeting = file.room.room.monsterBindings.captain.options.find(
      (o: { id: string }) => o.id === 'greet'
    );
    expect(greeting).toBeDefined();
    expect(greeting).not.toHaveProperty('check');
    greeting.failure = [{ say: 'No.' }];
    expect(readDraftYaml(stringify(file))).toMatchObject({
      ok: false,
      refusal: expect.stringContaining('this line rolls no check'),
    });
    delete greeting.failure;
    greeting.check = [];
    expect(readDraftYaml(stringify(file))).toMatchObject({
      ok: false,
      refusal: expect.stringContaining('at least one way'),
    });
  });

  it('keeps recipes when unrelated orders change', () => {
    const binding = read().draft.room.monsterBindings!['reserve-1'];
    const next = setMonsterFaction(
      setMonsterTemper(binding, 'soldier'),
      'loyalists'
    );
    expect(next).toMatchObject({
      states: binding.states,
      table: 'answer-the-gate',
      faction: 'loyalists',
      temper: 'soldier',
    });
  });

  it('inherits a faction recipe, but a placement replaces it wholesale', () => {
    const file = parse(castle);
    const recipe = file.room.room.monsterBindings['reserve-1'].states;
    file.factions.find((f: { id: string }) => f.id === 'garrison').states =
      recipe;
    delete file.room.room.monsterBindings['reserve-1'].states;
    const inherited = read(stringify(file));
    expect(
      inherited.scope.factions?.find((f) => f.id === 'garrison')?.states
    ).toEqual(recipe);
    file.room.room.monsterBindings['reserve-1'].states = {
      initial: 'watch',
      watch: { transitions: [{ on: 'time', do: [{ pick: 'time' }] }] },
    };
    expect(readDraftYaml(stringify(file))).toMatchObject({
      ok: false,
      refusal: expect.stringMatching(/reserve-1.*march.*never pick/),
    });
  });

  it('reads custom rows back for the creature and the faction, not only time', () => {
    const result = read();
    expect(layeredOrders(result, 'reserve-1').march?.rows).toEqual(
      result.scope.tables!['answer-the-gate'].march
    );
    expect(
      factionLayers(result.scope, { id: 'garrison', table: 'answer-the-gate' })
        .march?.rows
    ).toEqual(result.scope.tables!['answer-the-gate'].march);
    expect(
      JSON.stringify(readBackOf(result, { kind: 'creature', id: 'reserve-1' }))
    ).toContain('march');
    const row = result.scope.tables!['answer-the-gate'].march[1];
    expect(entryText(row, 'march')).toBe(entryText(row, 'time'));
  });

  it('checks inherited custom keys even on a placement with no binding', () => {
    const file = parse(castle);
    delete file.room.room.monsterBindings['reserve-1'];
    file.factions.push({ id: 'monsters', table: 'answer-the-gate' });
    expect(readDraftYaml(stringify(file))).toMatchObject({
      ok: false,
      refusal: expect.stringMatching(/reserve-1.*march.*default/),
    });
  });

  it('does not admit arbitrary table keys without a recipe pick', () => {
    const file = parse(castle);
    file.tables['answer-the-gate'].typo = [{ hold: {} }];
    expect(readDraftYaml(stringify(file))).toMatchObject({
      ok: false,
      refusal: expect.stringContaining('"typo" is not a trigger'),
    });
  });

  it('refuses a custom key on a creature running the default even if another recipe picks it', () => {
    const file = parse(castle);
    delete file.room.room.monsterBindings['reserve-1'].states;
    expect(readDraftYaml(stringify(file))).toMatchObject({
      ok: false,
      refusal: expect.stringMatching(/reserve-1.*march.*default/),
    });
  });
});

// Copied from rpg-api content/the-mad-king.yaml at be7e83f (the S1c api
// branch, rpg-project#857): gate-1's posted and alert states carry the post,
// `blocks` and `holds` with `against` and `pass`. Before #1389 the Studio
// refused this file at `states.posted has an unsupported field: blocks`.
describe('the served castle’s posts are a Studio document (rpg-project#857)', () => {
  it('imports gate-1’s post and writes it back exactly, in its key order', () => {
    const original = parse(served).room.room.monsterBindings['gate-1'].states;
    expect(original.posted).toMatchObject({
      blocks: true,
      holds: { door: 'gate-wall-door', against: 'entering' },
    });
    const result = read(served);
    const exported = parse(exportDraftYaml(result, result.key));
    const states = exported.room.room.monsterBindings['gate-1'].states;
    expect(JSON.stringify(states)).toBe(JSON.stringify(original));
    expect(stringify(states)).toBe(stringify(original));
    const again = read(stringify(exported));
    expect(again.draft.room.monsterBindings).toEqual(
      result.draft.room.monsterBindings
    );
    const stored = parseRoomDocumentJson(
      stringifyRoomDraft(result.draft, result.scope)
    );
    expect(stored).toEqual({ draft: result.draft, scope: result.scope });
  });

  it('carries a state field a newer server adds, through import, export and storage', () => {
    const file = parse(served);
    const posted = file.room.room.monsterBindings['gate-1'].states.posted;
    posted.challenges = { after: 2, say: 'Last warning.' };
    posted.holds.escort = 'gate-2';
    const result = read(stringify(file));
    const exported = parse(exportDraftYaml(result, result.key));
    expect(exported.room.room.monsterBindings['gate-1'].states.posted).toEqual(
      posted
    );
    expect(
      parseRoomDocumentJson(stringifyRoomDraft(result.draft, result.scope))
        .draft.room.monsterBindings!['gate-1'].states
    ).toEqual(file.room.room.monsterBindings['gate-1'].states);
  });
});

// Plan Task 6's content (rpg-project#842), laid on the served castle by hand
// until rpg-api T9 serves it: gate-1 answers a bump on its post with
// `pick: barred` and moves to `challenged`, which answers a second bump with
// `pick: challenged`; gate-patrol says each line. The shorter line is this
// test's stand-in, not the content's.
describe('the bump is a Studio word (rpg-project#842)', () => {
  function withTheBump() {
    const file = parse(served);
    const states = file.room.room.monsterBindings['gate-1'].states;
    states.posted.transitions.push({
      on: 'barred',
      to: 'challenged',
      do: [{ pick: 'barred' }, { anchor: true }],
    });
    states.challenged = {
      blocks: true,
      holds: { ...states.posted.holds },
      transitions: [
        { on: 'barred', do: [{ pick: 'challenged' }] },
        { on: 'time', rounds: 3, to: 'posted', reason: 'nothing came of it' },
      ],
    };
    file.tables['gate-patrol'].barred = [
      { say: 'Whoa there, buddy. Can I help you?' },
    ];
    file.tables['gate-patrol'].challenged = [{ say: 'Move along.' }];
    return file;
  }

  it('imports on: barred and its table keys, and writes them back exactly', () => {
    const file = withTheBump();
    const result = read(stringify(file));
    const exported = parse(exportDraftYaml(result, result.key));
    expect(
      JSON.stringify(exported.room.room.monsterBindings['gate-1'].states)
    ).toBe(JSON.stringify(file.room.room.monsterBindings['gate-1'].states));
    expect(exported.tables['gate-patrol'].barred).toEqual([
      { say: 'Whoa there, buddy. Can I help you?' },
    ]);
    expect(exported.tables['gate-patrol'].challenged).toEqual([
      { say: 'Move along.' },
    ]);
    const again = read(stringify(exported));
    expect(again.draft.room.monsterBindings).toEqual(
      result.draft.room.monsterBindings
    );
  });

  it('the studio offers barred among the beats a state listens for', () => {
    const file = withTheBump();
    file.room.room.monsterBindings['gate-1'].states.posted.transitions.push({
      on: 'bared',
    });
    expect(readDraftYaml(stringify(file))).toMatchObject({
      ok: false,
      refusal: expect.stringContaining('barred'),
    });
  });
});
