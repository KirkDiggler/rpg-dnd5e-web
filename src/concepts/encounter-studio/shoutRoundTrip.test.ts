/**
 * A SHOUT LOADS AND WRITES BACK (rpg-project#933). The engine reads
 * authored loudness (rpg-toolkit encounter v0.203.0) in three places, and
 * the toolkit's castle (`dungeonspec/testdata/world-builder-v4-castle.yaml`)
 * carries each:
 *
 *   1. a spoken line's `loudness: whisper | speak | shout | scream` (speak
 *      when absent): the stranger's `hail-the-pedlar`, and the alarm rows'
 *      `say:` shouted to the next room;
 *   2. a routine row's `heard: { kind: voice, within: N, loudness: shout }`,
 *      a sound at or above that loudness: gate-1 walks toward a shout, not
 *      toward talk;
 *   3. a state change guarded by the fact `heard.loudness:shout`: gate-1 is
 *      alerted by any sound but a voice, and by a voice only when shouted.
 *
 * The served castle does not carry them yet (rpg-api content, synced into
 * `fixtures/the-mad-king-served.yaml`), so each case writes the toolkit's
 * exact shape into the served castle at the toolkit's own place. The studio
 * loads each, writes each back byte for byte, and invents nothing: a line
 * with no loudness gets none.
 */
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { normalizeBinding } from '../world-building/monsterOrderEdits';
import { patchOption } from '../world-building/optionEdits';
import { readBackOf } from '../world-building/readBack';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

/** Loads the text and writes it back; the download must be the same bytes. */
const roundTrips = (text: string) => {
  const result = read(text);
  const written = exportDraftYaml(result, result.key);
  expect(written).toBe(text);
  return written;
};

/** The text with the first occurrence of a fragment replaced; the fragment
 * must be there. */
function editedFirst(text: string, from: string, to: string): string {
  expect(text).toContain(from);
  return text.replace(from, to);
}

// 1. The toolkit's stranger line, shouted, placed after his first line.
const PEDLAR_TONIGHT_END = `              - say: Feast, tonight. Now leave me be.
                fact: feast-tonight
    doorBindings:
`;
const HAIL = `          - id: hail-the-pedlar
            say: Oi! Pedlar! What have you got to sell?
            loudness: shout
            success:
              - say: Nothing for the likes of you at this hour. Off with you.
`;
const withHail = (text: string) =>
  editedFirst(
    text,
    PEDLAR_TONIGHT_END,
    PEDLAR_TONIGHT_END.replace(
      '    doorBindings:\n',
      `${HAIL}    doorBindings:\n`
    )
  );

// 1b. The toolkit's alarm row: a routine row's line, shouted.
const ALARM = `        - say: To arms! Intruders at the gate!
          when:
`;
const SHOUTED_ALARM = `        - say: To arms! Intruders at the gate!
          loudness: shout
          when:
`;

// 2. gate-1's post rows: toward a voice only when it is a shout.
const HEARD_VOICE = 'heard: {kind: voice, within: 1}';
const HEARD_SHOUT = 'heard: {kind: voice, within: 1, loudness: shout}';

// 3. gate-1's `on: heard` change, guarded by the loudness fact.
const HEARD_WAKE = `            - on: heard
              when:
                scope:
                  within: 6
              to: alert
`;
const SHOUT_WAKE = `            - on: heard
              when:
                all:
                  - scope:
                      within: 6
                  - any:
                      - not:
                          fact:
                            name: heard.kind
                            op: eq
                            value: voice
                      - fact:
                          name: heard.loudness:shout
                          op: eq
                          value: true
              to: alert
`;

/** All three shapes, at the toolkit castle's places in gate-1 and the
 * pedlar. */
function shouted(): string {
  let text = withHail(served);
  text = editedFirst(text, ALARM, SHOUTED_ALARM);
  text = text.replace(
    `            - ${HEARD_VOICE}\n`,
    `            - ${HEARD_SHOUT}\n`
  );
  text = text.replace(
    `                ${HEARD_VOICE}\n`,
    `                ${HEARD_SHOUT}\n`
  );
  return editedFirst(text, HEARD_WAKE, SHOUT_WAKE);
}

type Row = Record<string, unknown>;
type Parsed = {
  room: {
    room: {
      monsterBindings: Record<string, { options?: Row[] }>;
    };
  };
  behaviorDefinitions: Record<
    string,
    {
      recipe: { states: Record<string, { transitions?: Row[] }> };
      table: Record<string, Row[]>;
    }
  >;
};

describe('authored loudness loads and writes back (rpg-project#933)', () => {
  it('the served castle with all three shapes writes back byte for byte, each in its place', () => {
    const text = shouted();
    const doc = parse(roundTrips(text)) as Parsed;

    const pedlar = doc.room.room.monsterBindings.pedlar.options!;
    expect(pedlar.map((o) => o.id)).toEqual(['tonight', 'hail-the-pedlar']);
    expect(pedlar[1].loudness).toBe('shout');
    expect(pedlar[0]).not.toHaveProperty('loudness');

    const gate1 = doc.behaviorDefinitions['gate-1-policy'];
    const alarm = gate1.table.time.find((r) => typeof r.say === 'string')!;
    expect(alarm.loudness).toBe('shout');
    expect(gate1.table.post).toContainEqual({
      when: [
        { enemy: 'none' },
        { heard: { kind: 'voice', within: 1, loudness: 'shout' } },
      ],
      toward: 'sound',
    });
    expect(gate1.table.post).toContainEqual({
      when: [
        { enemy: 'none' },
        {
          not: { heard: { kind: 'voice', within: 1, loudness: 'shout' } },
        },
      ],
      toward: { at: { q: -3, r: 7 } },
    });
    const wake = Object.values(gate1.recipe.states)
      .flatMap((s) => s.transitions ?? [])
      .find((t) => t.on === 'heard');
    expect(wake).toEqual({
      on: 'heard',
      when: {
        all: [
          { scope: { within: 6 } },
          {
            any: [
              {
                not: {
                  fact: { name: 'heard.kind', op: 'eq', value: 'voice' },
                },
              },
              {
                fact: { name: 'heard.loudness:shout', op: 'eq', value: true },
              },
            ],
          },
        ],
      },
      to: 'alert',
      do: [{ anchor: true }],
      reason: 'heard something',
    });
    // Only gate-1 was edited: gate-2 keeps its unshouted alarm.
    const gate2 = doc.behaviorDefinitions['gate-2-policy'];
    expect(
      gate2.table.time.find((r) => typeof r.say === 'string')
    ).not.toHaveProperty('loudness');
  });

  it.each(['whisper', 'speak', 'shout', 'scream'])(
    'a line said at %s keeps its word',
    (word) => {
      roundTrips(
        editedFirst(withHail(served), 'loudness: shout', `loudness: ${word}`)
      );
    }
  );

  it.each(['whisper', 'speak', 'shout', 'scream'])(
    'a heard condition at %s keeps its word',
    (word) => {
      roundTrips(
        editedFirst(
          served,
          `            - ${HEARD_VOICE}\n`,
          `            - heard: {kind: voice, within: 1, loudness: ${word}}\n`
        )
      );
    }
  );

  it('a line with no loudness gets none: nothing is invented', () => {
    const text = editedFirst(
      withHail(served),
      '            loudness: shout\n',
      ''
    );
    const written = roundTrips(text);
    expect(written).not.toContain('loudness');
    const doc = parse(written) as Parsed;
    expect(
      doc.room.room.monsterBindings.pedlar.options!.find(
        (o) => o.id === 'hail-the-pedlar'
      )
    ).not.toHaveProperty('loudness');
  });

  it('the served castle, which says no loudness, still writes back with none', () => {
    expect(served).not.toContain('loudness');
    expect(roundTrips(served)).not.toContain('loudness');
  });

  it('the read-back says a shouted line is shouted, and leaves an unshouted one alone', () => {
    // gate-1's machine and table live under `behaviorDefinitions`, which the
    // creature read-back does not read; the row and `heard` phrasing is
    // pinned in `readBack.test.ts`.
    const result = read(shouted());
    const pedlar = JSON.stringify(
      readBackOf(result, { kind: 'creature', id: 'pedlar' })
    );
    expect(pedlar).toContain(
      '“Oi! Pedlar! What have you got to sell?” (shouted)'
    );
    // The line with no loudness says nothing of one.
    expect(pedlar).toContain('“What’s all the bustle?” Persuasion');
  });

  it('the read-back names a loudness word it cannot say, as written', () => {
    const result = read(
      editedFirst(withHail(served), 'loudness: shout', 'loudness: bellow')
    );
    expect(
      JSON.stringify(readBackOf(result, { kind: 'creature', id: 'pedlar' }))
    ).toContain('“Oi! Pedlar! What have you got to sell?” (at bellow)');
  });

  it('editing a shouted line’s words keeps its loudness beside them', () => {
    const result = read(withHail(served));
    const room = result.draft.room;
    const pedlar = room.monsterBindings!.pedlar;
    const options = pedlar.options!.map((o) =>
      o.id === 'hail-the-pedlar' ? patchOption(o, { say: 'Oi! You there!' }) : o
    );
    const draft = {
      ...result.draft,
      room: {
        ...room,
        monsterBindings: {
          ...room.monsterBindings,
          pedlar: normalizeBinding({ ...pedlar, options })!,
        },
      },
    };
    const written = exportDraftYaml({ draft, scope: result.scope }, result.key);
    expect(written).toContain(
      HAIL.replace('Oi! Pedlar! What have you got to sell?', 'Oi! You there!')
    );
  });
});
