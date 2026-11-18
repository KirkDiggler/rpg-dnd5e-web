/**
 * THE CAPTAIN GOES IN; A STRAGGLER IS VOUCHED FOR (rpg-project#929). The
 * served castle carries a line whose success row gives a topic (`give:`
 * on the row, `about: speaker` for a straggler's own case; the noted
 * words, rpg-project#1005), a line that `requires` a topic's absence, and
 * the captain's machine woken by `on: topic` and guarded by
 * `noted.anyone:admitted` into an `in-hall`
 * state with its own table row. The studio loads each, writes each back
 * byte for byte. No control edits
 * them: the operator ruled studio editing onto the needs list (2026-11-12).
 */
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

const roundTrips = (text: string) => {
  const result = read(text);
  expect(exportDraftYaml(result, result.key)).toBe(text);
  return result;
};

/** The text with the first occurrence of a fragment replaced; the fragment
 * must be there. */
function editedFirst(text: string, from: string, to: string): string {
  expect(text).toContain(from);
  return text.replace(from, to);
}

type Row = { say?: string; give?: Record<string, unknown> };
type Option = {
  id: string;
  requires?: unknown;
  success?: Row[];
  failure?: Row[];
};
type Transition = { on: string; when?: unknown; to?: string };
type Parsed = {
  room: {
    room: { monsterBindings: Record<string, { options?: Option[] }> };
  };
  behaviorDefinitions: Record<
    string,
    {
      recipe: { states: Record<string, { transitions?: Transition[] }> };
      table: Record<string, unknown[]>;
    }
  >;
};

const STRAGGLER_GRANT = `                give:
                  topic: admitted
                  to: spoken_to
                  about: speaker
                  heard_by: carriers_who_witnessed
`;

describe('a line’s grant and a topic wake load and write back (rpg-project#929)', () => {
  it('the served castle carries every new field, and an unedited download is byte-identical', () => {
    const doc = parse(served) as Parsed;
    for (const guard of ['gate-1', 'gate-2']) {
      const options = doc.room.room.monsterBindings[guard].options!;
      const byId = Object.fromEntries(options.map((o) => [o.id, o]));
      expect(Object.keys(byId)).toEqual(
        expect.arrayContaining(['vouch', 'straggler'])
      );
      expect(byId.vouch.success![0].give).toEqual({
        topic: 'admitted',
        to: 'spoken_to',
        about: 'party_in_sight',
        heard_by: 'carriers_who_witnessed',
      });
      expect(byId.straggler.success![0].give).toMatchObject({
        about: 'speaker',
      });
      expect(byId.straggler.requires).toContainEqual({
        not: { noted: 'admitted' },
      });
      // ONE TRY (rpg-project#932): a missed case turns the speaker away,
      // and the case asks that the guard not hold it.
      expect(byId.straggler.failure![0].give).toEqual({
        topic: 'turned-away',
        to: 'spoken_to',
        about: 'speaker',
        heard_by: 'carriers_who_witnessed',
      });
      expect(byId.straggler.requires).toContainEqual({
        not: { noted: 'turned-away' },
      });
      expect(Object.keys(byId)).toContain('friends-inside');
      expect(byId['friends-inside'].success![0].give).toBeUndefined();
    }
    const captain = doc.behaviorDefinitions['captain-policy'];
    const wake = Object.values(captain.recipe.states)
      .flatMap((s) => s.transitions ?? [])
      .find((t) => t.on === 'topic');
    expect(wake).toEqual({
      on: 'topic',
      when: { fact: { name: 'noted.anyone:admitted', op: 'eq', value: true } },
      to: 'in-hall',
      reason: 'admitted the party; goes in',
    });
    expect(captain.recipe.states['in-hall']).toBeDefined();
    expect(captain.table['in-hall']).toEqual([
      { when: { enemy: 'none' }, toward: { at: { q: 3, r: -9 } } },
    ]);
    roundTrips(served);
  });

  it.each([
    [
      'a grant about a word this build does not know',
      '                  about: speaker\n',
      '                  about: everyone\n',
    ],
    [
      'a grant with a key this build does not know',
      '                  about: speaker\n',
      '                  about: speaker\n                  until: dawn\n',
    ],
    ['a winning line that grants nothing', STRAGGLER_GRANT, ''],
    [
      'a losing line that grants nothing',
      `              - say: Never seen you before. Unless one of that lot will speak for you.\n${STRAGGLER_GRANT.replace('topic: admitted', 'topic: turned-away')}`,
      '              - say: Never seen you before. Unless one of that lot will speak for you.\n',
    ],
    [
      'a line that requires the topic, not its absence',
      '              - not:\n                  noted: admitted\n',
      '              - noted: admitted\n',
    ],
    [
      'the captain woken on another topic',
      '                  name: noted.anyone:admitted\n',
      '                  name: noted.anyone:welcome\n',
    ],
    [
      'the captain’s wake with no guard',
      `              when:
                fact:
                  name: noted.anyone:admitted
                  op: eq
                  value: true
              to: in-hall
`,
      '              to: in-hall\n',
    ],
  ])('%s loads and writes back byte for byte', (_name, from, to) => {
    roundTrips(editedFirst(served, from, to));
  });

  it('a grant field the studio does not know is kept as written', () => {
    const text = editedFirst(
      served,
      '                  about: speaker\n',
      '                  about: speaker\n                  until: dawn\n'
    );
    roundTrips(text);
  });
});

describe('the captain goes back to his gate (rpg-project#1000)', () => {
  const STEP = `            - on: heard
              when:
                all:
                  - fact:
                      name: heard.claim
                      op: eq
                      value: failed
                  - fact:
                      name: noted:admitted
                      op: eq
                      value: true
              to: back-to-gate
              reason: an admitted guest lied to him
`;
  const STATE = '        back-to-gate:\n          transitions:\n';
  const POST = '          back-to-gate:\n            door: gate-wall-door\n';

  it('the served castle carries the new state, its step and its post, and an unedited download is byte-identical', () => {
    for (const words of [STEP, STATE, POST])
      expect(served.split(words)).toHaveLength(2);
    const doc = parse(served) as Parsed;
    const captain = doc.behaviorDefinitions['captain-policy'];
    expect(captain.recipe.states['back-to-gate']).toBeDefined();
    expect(
      captain.recipe.states['in-hall'].transitions!.find(
        (t) => t.on === 'heard'
      )
    ).toMatchObject({ to: 'back-to-gate' });
    roundTrips(served);
  });

  it('an edit elsewhere keeps the new state, its step and its post byte for byte', () => {
    const result = read(served);
    const draft = structuredClone(result.draft);
    const greet = draft.room.monsterBindings!.captain.options!.find(
      (o) => o.id === 'greet'
    )!;
    greet.say = 'Good evening.';
    const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
    const left = served.split('\n');
    expect(saved.split('\n').filter((line, i) => line !== left[i])).toEqual([
      '            say: Good evening.',
    ]);
    for (const words of [STEP, STATE, POST])
      expect(saved.split(words)).toHaveLength(2);
    roundTrips(saved);
  });
});
