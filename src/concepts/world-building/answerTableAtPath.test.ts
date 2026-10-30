/**
 * A CELL AND A ROUTE IN THE SINGLE ROOM'S OWN FRAME (rpg-toolkit#2063).
 *
 * The engine's single-room dialect reads `toward: { at: { q, r } }` and
 * `toward: { path: [{ q, r }, …] }` in the axial frame its walkable hexes are
 * written in, and refuses the offset `[col, row]` with a sentence naming
 * `{ q, r }`. These tests hold the web reader to the same shape and words, and
 * the read-back to a sentence for each row.
 */
import {
  HEARING_SENTENCES,
  SINGLE_ROOM_CELL_FORMS,
  selectorShapeRefusal,
  unknownSelectorRefusal,
} from '@/author/answerVocabulary';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateAnswerTable } from './answerTableShape';
import { wordPhrase, wordShorthand } from './answerVocabulary';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';

const table = (on: unknown) => () => validateAnswerTable(on, 'on');

/** The engine's fixture (`testdata/world-builder-v4-patrols.yaml` at
 * rpg-toolkit 4e588e2d, a verbatim copy): two patrols, one on a route and
 * one walking to a cell. */
const patrols = () =>
  readFileSync(
    'src/concepts/world-building/fixtures/worldBuilderV4Patrols.yaml',
    'utf8'
  );

const PATROL = {
  when: { enemy: 'none' },
  toward: {
    path: [
      { q: -2, r: 0 },
      { q: 0, r: -2 },
      { q: 2, r: 0 },
      { q: 0, r: 2 },
    ],
  },
};
const MARCH = { when: { enemy: 'none' }, toward: { at: { q: 1, r: 1 } } };

describe('the single room reads a cell and a route as { q, r }', () => {
  it('reads both rows and carries them verbatim', () => {
    expect(validateAnswerTable({ time: [PATROL, MARCH] }, 'on')).toEqual({
      time: [PATROL, MARCH],
    });
  });

  it("round-trips the engine's fixture: emit(parse(emit(parse(t)))) is emit(parse(t))", () => {
    const once = encodeSingleRoomDungeon(decodeSingleRoomDungeon(patrols()));
    const twice = encodeSingleRoomDungeon(decodeSingleRoomDungeon(once));
    expect(twice).toBe(once);
    const bindings = decodeSingleRoomDungeon(once).draft.room.monsterBindings;
    expect(bindings?.['gate-patrol']?.on).toEqual({ time: [PATROL] });
    expect(bindings?.['keep-patrol']?.on).toEqual({ time: [MARCH] });
    // The spelling the engine's fixture uses: a cell is `q` then `r`.
    expect(once).toContain(
      'toward:\n                path:\n                  - q: -2\n                    r: 0\n'
    );
    expect(once).toContain(
      'toward:\n                at:\n                  q: 1\n                  r: 1\n'
    );
  });

  it('reads a { q, r } strictly: both keys, integers, nothing else', () => {
    expect(table({ time: [{ toward: { at: { q: 1 } } }] })).toThrow(
      'on.time[0].toward.at: a cell is { q, r }, and this one has no r'
    );
    expect(table({ time: [{ toward: { at: { q: 1, r: '2' } } }] })).toThrow(
      "on.time[0].toward.at: a cell's r must be an integer"
    );
    expect(table({ time: [{ toward: { at: { q: 1.5, r: 2 } } }] })).toThrow(
      "on.time[0].toward.at: a cell's q must be an integer"
    );
    expect(
      table({ time: [{ toward: { at: { q: 1, r: 2, s: -3 } } }] })
    ).toThrow(
      'on.time[0].toward.at: field s not found in type dungeonspec.RoomCell'
    );
    expect(
      table({ time: [{ toward: { path: [{ q: 1, r: 0 }, { r: 2 }] } }] })
    ).toThrow(
      'on.time[0].toward.path[1]: a cell is { q, r }, and this one has no q'
    );
  });

  it('decodes the keys in document order, as the engine does', () => {
    // Both keys malformed: whichever the file writes first is reported.
    expect(
      table({ time: [{ toward: { path: [{ q: 1 }], at: { r: 2 } } }] })
    ).toThrow(
      'on.time[0].toward.path[0]: a cell is { q, r }, and this one has no r'
    );
    expect(
      table({ time: [{ toward: { at: { r: 2 }, path: [{ q: 1 }] } }] })
    ).toThrow(
      'on.time[0].toward.at: a cell is { q, r }, and this one has no q'
    );
    // An unknown key is refused where it stands in that order too.
    expect(
      table({ time: [{ toward: { path: [{ q: 1 }], where: 1 } }] })
    ).toThrow(
      'on.time[0].toward.path[0]: a cell is { q, r }, and this one has no r'
    );
    expect(
      table({ time: [{ toward: { where: 1, path: [{ q: 1 }] } }] })
    ).toThrow(
      'on.time[0].toward: field where not found in type dungeonspec.SelectorSpec'
    );
  });

  it("refuses [col, row] in the engine's exact sentences", () => {
    expect(table({ time: [{ toward: { at: [1, 2] } }] })).toThrow(
      'on.time[0].toward.at: at names a cell of this room, written { q, r } as its walkable hexes are: [col, row] is an offset in a document orientation this dialect does not have'
    );
    expect(
      table({
        time: [
          {
            toward: {
              path: [
                [1, 2],
                [3, 4],
              ],
            },
          },
        ],
      })
    ).toThrow(
      "on.time[0].toward.path: path names a route of this room's cells, each written { q, r } as its walkable hexes are: [col, row] is an offset in a document orientation this dialect does not have"
    );
    // One offset waypoint is the whole route's defect, said once.
    expect(
      table({ time: [{ toward: { path: [{ q: 1, r: 0 }, [3, 4]] } }] })
    ).toThrow(`on.time[0].toward.path: ${HEARING_SENTENCES.singleRoomPath()}`);
  });

  it('refuses what mind/behavior refuses of the shape, at the row, after the frame', () => {
    // A cell is walked toward; `attack` acts on a creature.
    expect(table({ time: [{ attack: { at: { q: 1, r: 1 } } }] })).toThrow(
      'on.time[0].attack: a cell is somewhere to walk toward, and `attack` acts on a creature'
    );
    expect(table({ time: [{ away: { path: [{ q: 1, r: 1 }] } }] })).toThrow(
      'on.time[0]: `away` cannot take a `path`: a route is walked, and only `toward` and `dash` walk one'
    );
    expect(
      table({
        time: [{ toward: { at: { q: 1, r: 1 }, path: [{ q: 0, r: 0 }] } }],
      })
    ).toThrow(
      'on.time[0]: `toward` names a cell (`at`) and a route (`path`); a target is exactly one of somebody, a cell or a route'
    );
    expect(table({ time: [{ toward: { path: [] } }] })).toThrow(
      'on.time[0]: `toward` names no target; give it one of somebody, a cell (`at`) or a route (`path`)'
    );
  });

  it("gives the decoder's hints in the room's spelling; v2 reads as before", () => {
    expect(table({ time: [{ patrol: {} }] })).toThrow(
      'on.time[0].patrol: `patrol` is not a word: a patrol is a route, write toward: { path: [{ q, r }, …] }'
    );
    expect(table({ time: [{ toward: 'nobody' }] })).toThrow(
      'on.time[0].toward: "nobody" is not a selector this build resolves: they are enemy, attacker, actor, sound, ally, or { at: { q, r } }, or { path: [{ q, r }, …] }'
    );
    expect(table({ time: [{ toward: 3 }] })).toThrow(
      'on.time[0].toward: a selector is one of enemy, attacker, actor, sound, ally, or { at: { q, r } }, or { path: [{ q, r }, …] }'
    );
    // The v2 spelling is the default, word for word what it always was.
    expect(HEARING_SENTENCES.patrol()).toBe(
      '`patrol` is not a word: a patrol is a route, write toward: { path: [[col, row], …] }'
    );
    expect(unknownSelectorRefusal('nobody')).toBe(
      '"nobody" is not a selector this build resolves: they are enemy, attacker, actor, sound, or { at: [col, row] }, or { path: [[col, row], …] }'
    );
    expect(selectorShapeRefusal()).toBe(
      'a selector is one of enemy, attacker, actor, sound, ally, or { at: [col, row] }, or { path: [[col, row], …] }'
    );
    expect(unknownSelectorRefusal('x', SINGLE_ROOM_CELL_FORMS)).toContain(
      '{ at: { q, r } }'
    );
  });
});

describe('a cell and a route in words', () => {
  it('reads a route and a cell back as places', () => {
    // A route reads as the loop it walks, every waypoint named in order
    // (rpg-project#720).
    expect(wordPhrase(PATROL, 'it')).toBe(
      'walks its loop by {q: -2, r: 0}, {q: 0, r: -2}, {q: 2, r: 0} and {q: 0, r: 2}'
    );
    expect(wordPhrase(MARCH, 'it')).toBe('walks to {q: 1, r: 1}');
    expect(wordPhrase(MARCH, 'I')).toBe('walk to {q: 1, r: 1}');
    expect(wordPhrase({ toward: { path: [{ q: 0, r: 0 }] } }, 'it')).toBe(
      'walks its loop by {q: 0, r: 0}'
    );
  });

  it("the compact readout names the file's own cells", () => {
    expect(wordShorthand(MARCH, 'toward')).toBe('toward at {q: 1, r: 1}');
    expect(wordShorthand(PATROL, 'toward')).toBe(
      'toward path {q: -2, r: 0} {q: 0, r: -2} {q: 2, r: 0} {q: 0, r: 2}'
    );
  });
});

/**
 * A WAYPOINT MAY STATE THE PAUSE THERE (rpg-project#624, encounter v0.136.0,
 * rpg-dnd5e-web#1311). The engine's `decodeWaypoint` reads `{ q, r }` plus an
 * optional `wait` (whole rounds the walker stands) and `facing` (a compass
 * word taken while standing). Before this, the studio refused the shipped
 * castle: `Site table gate-patrol.time[5].toward.path[0]: field wait not
 * found in type dungeonspec.RoomCell`.
 */
describe('a route waypoint carries its pause', () => {
  const GUARD = {
    when: { enemy: 'none' },
    toward: {
      path: [
        { q: -7, r: 9, wait: 2, facing: 'se' },
        { q: -1, r: 9, wait: 2, facing: 'sw' },
        { q: -3, r: 12 },
        { q: -9, r: 12, wait: 1 },
      ],
    },
  };

  it('reads wait and facing on a waypoint and carries them verbatim', () => {
    expect(validateAnswerTable({ time: [GUARD] }, 'on')).toEqual({
      time: [GUARD],
    });
  });

  it("refuses what the engine's dialect refuses, in its sentences", () => {
    const waypoint = (extra: Record<string, unknown>) =>
      table({ time: [{ toward: { path: [{ q: 0, r: 0, ...extra }] } }] });
    expect(waypoint({ facing: 'se' })).toThrow(
      'on.time[0].toward.path[0].facing: a facing is taken while standing; give the waypoint a wait'
    );
    // A wait of 0 is no stand, so the facing is still alone (grammar.go:
    // `word != "" && route[i].wait == 0`).
    expect(waypoint({ facing: 'se', wait: 0 })).toThrow(
      'on.time[0].toward.path[0].facing: a facing is taken while standing; give the waypoint a wait'
    );
    // Stricter than the engine, deliberately: its grammar skips an empty
    // word, the studio refuses it as no compass direction.
    expect(waypoint({ facing: '', wait: 1 })).toThrow(
      'on.time[0].toward.path[0].facing: "" is not a compass direction'
    );
    expect(waypoint({ facing: 'up', wait: 1 })).toThrow(
      'on.time[0].toward.path[0].facing: "up" is not a compass direction: a facing is one of n|ne|e|se|s|sw|w|nw'
    );
    expect(waypoint({ facing: 3, wait: 1 })).toThrow(
      "on.time[0].toward.path[0]: a waypoint's facing is a word, one of n|ne|e|se|s|sw|w|nw"
    );
    expect(waypoint({ wait: 1.5 })).toThrow(
      "on.time[0].toward.path[0]: a waypoint's wait is a whole number of rounds"
    );
    expect(waypoint({ wait: -1 })).toThrow(
      'on.time[0].toward.path[0].wait: a wait is how many rounds the walker stands here, and -1 is negative'
    );
    // Only a route's waypoint pauses: a cell is still strictly { q, r }.
    expect(
      table({ time: [{ toward: { at: { q: 0, r: 0, wait: 1 } } }] })
    ).toThrow(
      'on.time[0].toward.at: field wait not found in type dungeonspec.RoomCell'
    );
  });

  it('round-trips a paused route through the encoder', () => {
    const yaml = patrols().replace(/path: \[\{ ?q: -2, r: 0 ?\}/, (m) =>
      m.replace(/\}$/, ', wait: 2, facing: se }')
    );
    expect(yaml).not.toBe(patrols());
    const once = encodeSingleRoomDungeon(decodeSingleRoomDungeon(yaml));
    const bindings = decodeSingleRoomDungeon(once).draft.room.monsterBindings;
    expect(bindings?.['gate-patrol']?.on?.time?.[0]?.toward).toEqual({
      path: [
        { q: -2, r: 0, wait: 2, facing: 'se' },
        { q: 0, r: -2 },
        { q: 2, r: 0 },
        { q: 0, r: 2 },
      ],
    });
    expect(encodeSingleRoomDungeon(decodeSingleRoomDungeon(once))).toBe(once);
  });

  it('refuses a wait written as a float, as the engine refuses !!float', () => {
    for (const written of ['2.0', '2e0', '!!float 2']) {
      const yaml = patrols().replace(/path: \[\{ ?q: -2, r: 0 ?\}/, (m) =>
        m.replace(/\}$/, `, wait: ${written} }`)
      );
      expect(() => decodeSingleRoomDungeon(yaml)).toThrow(
        "Monster binding for gate-patrol on.time[0].toward.path[0]: a waypoint's wait is a whole number of rounds"
      );
    }
  });

  it('refuses malformed YAML whole, never as a partial draft', () => {
    expect(() => decodeSingleRoomDungeon('key: [unclosed')).toThrow(
      /^Invalid single-room YAML: /
    );
  });

  it('shows each pause on the route, in words and in the shorthand', () => {
    expect(wordPhrase(GUARD, 'it')).toBe(
      'walks its loop by {q: -7, r: 9} (waits 2, faces se), {q: -1, r: 9} (waits 2, faces sw), {q: -3, r: 12} and {q: -9, r: 12} (waits 1)'
    );
    expect(wordShorthand(GUARD, 'toward')).toBe(
      'toward path {q: -7, r: 9, wait: 2, facing: se} {q: -1, r: 9, wait: 2, facing: sw} {q: -3, r: 12} {q: -9, r: 12, wait: 1}'
    );
  });
});
