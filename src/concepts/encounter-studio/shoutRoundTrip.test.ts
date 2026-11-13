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
 * The served castle carries all three (rpg-api `content/the-mad-king.yaml`,
 * synced into `fixtures/the-mad-king-served.yaml`). The studio loads each,
 * writes each back byte for byte, and invents nothing: a line with no
 * loudness gets none.
 */
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { normalizeBinding } from '../world-building/monsterOrderEdits';
import { patchOption, patchOptionRow } from '../world-building/optionEdits';
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

// The pedlar's shouted line, as the served castle writes it.
const HAIL = `          - id: hail-the-pedlar
            say: Oi! Pedlar! What have you got to sell?
            loudness: shout
            success:
              - say: Nothing for the likes of you at this hour. Off with you.
`;

// gate-1's post row: toward a voice only when it is a shout.
const HEARD_SHOUT = 'heard: {kind: voice, within: 1, loudness: shout}';

/** The served castle with the hail's loudness line replaced. */
const hailSaid = (line: string) =>
  editedFirst(
    served,
    HAIL,
    HAIL.replace('            loudness: shout\n', line)
  );

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
  it('the served castle carries all three shapes and writes back byte for byte, each in its place', () => {
    expect(served).toContain(HAIL);
    const doc = parse(roundTrips(served)) as Parsed;

    const pedlar = doc.room.room.monsterBindings.pedlar.options!;
    expect(pedlar.map((o) => o.id)).toEqual(['tonight', 'hail-the-pedlar']);
    expect(pedlar[1].loudness).toBe('shout');
    expect(pedlar[0]).not.toHaveProperty('loudness');

    // Each gate guard's alarm is shouted, on every trigger that says it.
    for (const guard of ['gate-1-policy', 'gate-2-policy']) {
      const alarms = Object.values(doc.behaviorDefinitions[guard].table)
        .flat()
        .filter((r) => r.say === 'To arms! Intruders at the gate!');
      expect(alarms.length).toBeGreaterThan(0);
      for (const alarm of alarms) expect(alarm.loudness).toBe('shout');
    }
    const gate1 = doc.behaviorDefinitions['gate-1-policy'];
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
  });

  it.each(['whisper', 'speak', 'shout', 'scream'])(
    'a line said at %s keeps its word',
    (word) => {
      roundTrips(hailSaid(`            loudness: ${word}\n`));
    }
  );

  it.each(['whisper', 'speak', 'shout', 'scream'])(
    'a heard condition at %s keeps its word',
    (word) => {
      roundTrips(
        editedFirst(
          served,
          `            - ${HEARD_SHOUT}\n`,
          `            - heard: {kind: voice, within: 1, loudness: ${word}}\n`
        )
      );
    }
  );

  it('a line with no loudness gets none: nothing is invented', () => {
    const doc = parse(roundTrips(hailSaid(''))) as Parsed;
    for (const option of doc.room.room.monsterBindings.pedlar.options!)
      expect(option).not.toHaveProperty('loudness');
  });

  it('the read-back says a shouted line is shouted, and leaves an unshouted one alone', () => {
    // gate-1's machine and table live under `behaviorDefinitions`, which the
    // creature read-back does not read; the row and `heard` phrasing is
    // pinned in `readBack.test.ts`.
    const result = read(served);
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
    const result = read(hailSaid('            loudness: bellow\n'));
    expect(
      JSON.stringify(readBackOf(result, { kind: 'creature', id: 'pedlar' }))
    ).toContain('“Oi! Pedlar! What have you got to sell?” (at bellow)');
  });

  it('editing a shouted line’s words keeps its loudness beside them', () => {
    const result = read(served);
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

  // rpg-project#936: the gate guards' hint, an ANSWER row, is shouted.
  const HINT =
    'The troupe? Aye, they’re inside. If one of them comes back and speaks for you, in you go.';

  it('both gate guards’ shouted hint, an answer row, loads and writes back in its place', () => {
    const doc = parse(roundTrips(served)) as Parsed;
    for (const guard of ['gate-1', 'gate-2']) {
      const line = doc.room.room.monsterBindings[guard].options!.find(
        (o) => o.id === 'friends-inside'
      )!;
      expect(line).not.toHaveProperty('loudness');
      expect((line.success as Row[])[0]).toEqual({
        say: HINT,
        loudness: 'shout',
      });
    }
  });

  it('the read-back says the hint is shouted', () => {
    const result = read(served);
    for (const guard of ['gate-1', 'gate-2'])
      expect(
        JSON.stringify(readBackOf(result, { kind: 'creature', id: guard }))
      ).toContain(`“${HINT}” (shouted)`);
  });

  it('editing the hint’s words keeps its loudness beside them', () => {
    const result = read(served);
    const room = result.draft.room;
    const gate1 = room.monsterBindings!['gate-1'];
    const options = gate1.options!.map((o) =>
      o.id === 'friends-inside'
        ? patchOptionRow(o, 'success', 0, {
            ...o.success![0],
            say: 'Inside, the lot of them.',
          })
        : o
    );
    const draft = {
      ...result.draft,
      room: {
        ...room,
        monsterBindings: {
          ...room.monsterBindings,
          'gate-1': normalizeBinding({ ...gate1, options })!,
        },
      },
    };
    const saved = parse(
      exportDraftYaml({ draft, scope: result.scope }, result.key)
    ) as Parsed;
    expect(
      saved.room.room.monsterBindings['gate-1'].options!.find(
        (o) => o.id === 'friends-inside'
      )!.success
    ).toEqual([{ say: 'Inside, the lot of them.', loudness: 'shout' }]);
  });
});
