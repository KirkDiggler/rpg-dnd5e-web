/**
 * THE CAPTAIN GOES IN; A STRAGGLER IS VOUCHED FOR (rpg-project#929). The
 * served castle carries a line whose success row grants a recognition
 * (`recognize:` on the row, `about: speaker` for a straggler's own case), a
 * line that `requires` a recognition's absence, and the captain's machine
 * woken by `on: topic` and guarded by `topic:admitted` into an `in-hall`
 * state with its own table row. The studio loads each, writes each back
 * byte for byte, and says a line's grant in the read-back. No control edits
 * them: the operator ruled studio editing onto the needs list (2026-11-12).
 */
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readBackOf } from '../world-building/readBack';
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

type Row = { say?: string; recognize?: Record<string, unknown> };
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

const STRAGGLER_GRANT = `                recognize:
                  topic: admitted
                  holder: spoken_to
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
      expect(byId.vouch.success![0].recognize).toEqual({
        topic: 'admitted',
        holder: 'spoken_to',
        about: 'party_in_sight',
        heard_by: 'carriers_who_witnessed',
      });
      expect(byId.straggler.success![0].recognize).toMatchObject({
        about: 'speaker',
      });
      expect(byId.straggler.requires).toContainEqual({
        not: { recognized: 'admitted' },
      });
      // ONE TRY (rpg-project#932): a missed case turns the speaker away,
      // and the case asks that the guard not hold it.
      expect(byId.straggler.failure![0].recognize).toEqual({
        topic: 'turned-away',
        holder: 'spoken_to',
        about: 'speaker',
        heard_by: 'carriers_who_witnessed',
      });
      expect(byId.straggler.requires).toContainEqual({
        not: { recognized: 'turned-away' },
      });
      expect(Object.keys(byId)).toContain('friends-inside');
      expect(byId['friends-inside'].success![0].recognize).toBeUndefined();
    }
    const captain = doc.behaviorDefinitions['captain-policy'];
    const wake = Object.values(captain.recipe.states)
      .flatMap((s) => s.transitions ?? [])
      .find((t) => t.on === 'topic');
    expect(wake).toEqual({
      on: 'topic',
      when: { fact: { name: 'topic:admitted', op: 'eq', value: true } },
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
      'a line that requires recognition, not its absence',
      '              - not:\n                  recognized: admitted\n',
      '              - recognized: admitted\n',
    ],
    [
      'the captain woken on another topic',
      '                  name: topic:admitted\n',
      '                  name: topic:welcome\n',
    ],
    [
      'the captain’s wake with no guard',
      `              when:
                fact:
                  name: topic:admitted
                  op: eq
                  value: true
              to: in-hall
`,
      '              to: in-hall\n',
    ],
  ])('%s loads and writes back byte for byte', (_name, from, to) => {
    roundTrips(editedFirst(served, from, to));
  });

  it('the read-back says what a winning line grants, and to whom', () => {
    const result = read(served);
    const text = JSON.stringify(
      readBackOf(result, { kind: 'creature', id: 'gate-1' })
    );
    expect(text).toContain(
      'it recognises the speaker’s party he sees as admitted, and every other carrier who saw it said does too'
    );
    expect(text).toContain(
      'it recognises the speaker as admitted, and every other carrier who saw it said does too'
    );
  });

  it('the read-back says what a missed line grants, and the line asking after friends (rpg-project#932)', () => {
    const result = read(served);
    const text = JSON.stringify(
      readBackOf(result, { kind: 'creature', id: 'gate-1' })
    );
    expect(text).toContain(
      'Failure: “Never seen you before. Unless one of that lot will speak for you.”, and it recognises the speaker as turned-away, and every other carrier who saw it said does too'
    );
    expect(text).toContain(
      '“Our friends must have just gone in. Did you see a funny man and let them in?”'
    );
  });

  it('the read-back names a grant it cannot say, and keeps it', () => {
    const text = editedFirst(
      served,
      '                  about: speaker\n',
      '                  about: speaker\n                  until: dawn\n'
    );
    const result = roundTrips(text);
    expect(
      JSON.stringify(readBackOf(result, { kind: 'creature', id: 'gate-1' }))
    ).toContain('a recognition this build cannot say, kept as written');
  });
});
