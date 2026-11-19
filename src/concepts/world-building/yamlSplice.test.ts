// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import served from '../encounter-studio/fixtures/the-mad-king-served.yaml?raw';
import {
  checkWrite,
  mergeValue,
  sameValue,
  spliceInternals,
  spliceYaml,
  UNSAFE_WRITE,
  UnsafeWriteError,
} from './yamlSplice';

/** `base` is what the studio read (the source without the keys it does not
 * author); `edit` turns it into what the studio writes now. The splice must
 * parse to the source's own value with that change applied, and leave every
 * other byte alone. */
function splice(source: string, unread: string[], edit: (v: never) => void) {
  const own = parse(source);
  const base = structuredClone(own);
  for (const path of unread) {
    const keys = path.split('.');
    const last = keys.pop()!;
    let at = base;
    for (const key of keys) at = at[key];
    delete at[last];
  }
  const current = structuredClone(base);
  edit(current as never);
  const out = spliceYaml(source, base, current);
  expect(parse(out)).toEqual(mergeValue(own, base, current));
  return out;
}

const castle = `# the castle
key: castle
room:
  # the gate guard
  gate-1:
    ref: guard
    future: 1 # a field the studio does not read
    states:
      posted:
        blocks: true
        holds: { door: gate, at: [{ q: -3, r: 7 }], against: entering }
        transitions:
          - { on: heard, within: 6, to: alert }
          - on: time
            do: [{ pick: post }]
  pedlar:
    startingCell:
      location:
        q: 0
        r: 14
      facing: sw
tables:
  t:
    - say: hi
`;

describe('spliceYaml writes back what it read (rpg-project#857)', () => {
  it('returns the source byte for byte when nothing changed', () => {
    const own = parse(castle);
    expect(spliceYaml(castle, own, structuredClone(own))).toBe(castle);
    expect(splice(castle, ['room.gate-1.future'], () => {})).toBe(castle);
  });

  it('changes one scalar on its own line, in block and in flow', () => {
    const out = splice(castle, ['room.gate-1.future'], (v: never) => {
      const c = v as { key: string; room: Record<string, never> };
      c.key = 'mine';
      (
        c.room.pedlar as { startingCell: { location: { q: number } } }
      ).startingCell.location.q = 1;
      (
        c.room['gate-1'] as {
          states: { posted: { holds: { against: string } } };
        }
      ).states.posted.holds.against = 'both';
    });
    expect(out).toBe(
      castle
        .replace('key: castle', 'key: mine')
        .replace('        q: 0\n', '        q: 1\n')
        .replace('against: entering', 'against: both')
    );
  });

  it('inserts a key before the next key the studio writes, else after the last, in block and in flow', () => {
    const out = splice(castle, ['room.gate-1.future'], (v: never) => {
      const gate = (v as { room: Record<string, Record<string, unknown>> })
        .room['gate-1'];
      const { ref, states } = gate;
      for (const key of Object.keys(gate)) delete gate[key];
      Object.assign(gate, { ref, faction: 'garrison', states });
      const posted = (states as { posted: Record<string, unknown> }).posted;
      (posted.holds as Record<string, unknown>).pass = 'troupe';
      (v as { tables: Record<string, unknown> }).tables.u = [{ say: 'yo' }];
    });
    expect(out).toBe(
      castle
        .replace('    ref: guard\n', '    ref: guard\n    faction: garrison\n')
        .replace('against: entering }', 'against: entering, pass: troupe }')
        .replace('    - say: hi\n', '    - say: hi\n  u:\n    - say: yo\n')
    );
  });

  it('a key inserted before the first key of a sequence item goes on the dash line (rpg-project#958)', () => {
    const source = `rows:
  # the passage
  - relocate:
      to: region-cells
      rounds: 1
  - say: hi
`;
    const out = splice(source, [], (v: never) => {
      const rows = (v as { rows: Record<string, unknown>[] }).rows;
      rows[0] = { say: 'Down you go.', ...rows[0] };
    });
    expect(out).toBe(
      source.replace(
        '  - relocate:\n',
        '  - say: Down you go.\n    relocate:\n'
      )
    );
  });

  it('removes a key with its lines, and an item from a flow map', () => {
    const out = splice(castle, ['room.gate-1.future'], (v: never) => {
      const posted = (
        v as {
          room: { 'gate-1': { states: { posted: Record<string, unknown> } } };
        }
      ).room['gate-1'].states.posted;
      delete posted.blocks;
      delete (posted.holds as Record<string, unknown>).against;
    });
    expect(out).toBe(
      castle
        .replace('        blocks: true\n', '')
        .replace(', against: entering }', ' }')
    );
  });

  it('appends to and drops from a sequence, block and flow', () => {
    const out = splice(castle, ['room.gate-1.future'], (v: never) => {
      const c = v as {
        room: {
          'gate-1': {
            states: {
              posted: { holds: { at: unknown[] }; transitions: unknown[] };
            };
          };
        };
        tables: { t: unknown[] };
      };
      const posted = c.room['gate-1'].states.posted;
      posted.holds.at.push({ q: -4, r: 7 });
      posted.transitions.pop();
      c.tables.t.push({ say: 'bye' });
    });
    expect(out).toBe(
      castle
        .replace('[{ q: -3, r: 7 }]', '[{ q: -3, r: 7 }, { q: -4, r: 7 }]')
        .replace('          - on: time\n            do: [{ pick: post }]\n', '')
        .replace('    - say: hi\n', '    - say: hi\n    - say: bye\n')
    );
  });

  it('a map that gains and loses keys is rewritten from its own value: the unread key survives', () => {
    const out = splice(castle, ['room.gate-1.future'], (v: never) => {
      const gate = (v as { room: Record<string, Record<string, unknown>> })
        .room['gate-1'];
      delete gate.ref;
      gate.faction = 'garrison';
    });
    expect(parse(out).room['gate-1']).toMatchObject({
      future: 1,
      faction: 'garrison',
    });
    expect(parse(out).room['gate-1']).not.toHaveProperty('ref');
    expect(out.startsWith('# the castle\nkey: castle\n')).toBe(true);
    expect(out).toContain('  pedlar:\n    startingCell:\n');
  });

  it('a changed block collection is written as a block at its own indent', () => {
    const out = splice(castle, [], (v: never) => {
      (v as { tables: { t: unknown } }).tables.t = { say: 'replaced' };
    });
    expect(out).toBe(castle.replace('    - say: hi\n', '    say: replaced\n'));
  });
});

describe('sameValue and mergeValue', () => {
  it('ignore key order, keep unread keys, and drop keys the studio removed', () => {
    expect(
      sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })
    ).toBe(true);
    expect(sameValue([1], [1, 2])).toBe(false);
    expect(
      mergeValue({ a: 1, x: 9, b: 2 }, { a: 1, b: 2 }, { a: 3, c: 4 })
    ).toEqual({ a: 3, x: 9, c: 4 });
  });
});

describe('a sequence aligns its items before it walks them (rpg-project#857 review)', () => {
  const list = `placements:
  - id: one
    q: 1
  # the second, a hand edit
  - id: two
    q: 2
  - id: three
    q: 3
    mood: three
  - id: four
    q: 4
    mood: four
`;
  /** What the studio reads: no `mood`, which it does not author. */
  const read = () =>
    (parse(list) as { placements: Record<string, unknown>[] }).placements.map(
      ({ id, q }) => ({ id, q })
    );
  const splicedTo = (placements: unknown[]) =>
    spliceYaml(list, { placements: read() }, { placements });

  it('a middle delete takes its own item and the comment above it, and no other item’s field moves', () => {
    const [one, , three, four] = read();
    expect(splicedTo([one, three, four])).toBe(
      list.replace('  # the second, a hand edit\n  - id: two\n    q: 2\n', '')
    );
  });

  it('a front insert goes before the first item, and the rest keep their fields', () => {
    const out = splicedTo([{ id: 'zero', q: 0 }, ...read()]);
    expect(out).toBe(`placements:\n  - id: zero\n    q: 0\n${list.slice(12)}`);
  });

  it('a reorder moves each item with its own fields', () => {
    const out = parse(splicedTo([...read()].reverse())) as {
      placements: Record<string, unknown>[];
    };
    expect(out.placements.map((p) => [p.id, p.mood])).toEqual([
      ['four', 'four'],
      ['three', 'three'],
      ['two', undefined],
      ['one', undefined],
    ]);
  });

  it('an edit to a moved item lands on that item', () => {
    const [one, two, three, four] = read();
    const out = parse(splicedTo([four, { ...three, q: 30 }, one, two])) as {
      placements: Record<string, unknown>[];
    };
    expect(out.placements).toEqual([
      { id: 'four', q: 4, mood: 'four' },
      { id: 'three', q: 30, mood: 'three' },
      { id: 'one', q: 1 },
      { id: 'two', q: 2 },
    ]);
  });

  it('without ids, the longest common subsequence aligns them, and an edited item between two kept ones is that item', () => {
    const rows = `rows:\n  - say: a\n  - say: b\n    tone: low\n  - say: c\n`;
    const base = { rows: [{ say: 'a' }, { say: 'b' }, { say: 'c' }] };
    expect(spliceYaml(rows, base, { rows: [{ say: 'a' }, { say: 'c' }] })).toBe(
      'rows:\n  - say: a\n  - say: c\n'
    );
    expect(
      spliceYaml(rows, base, {
        rows: [{ say: 'a' }, { say: 'B' }, { say: 'c' }],
      })
    ).toBe(rows.replace('say: b', 'say: B'));
  });

  it('mergeValue aligns the same way', () => {
    expect(
      mergeValue(
        [
          { id: 'a', x: 1 },
          { id: 'b', x: 2 },
        ],
        [{ id: 'a' }, { id: 'b' }],
        [{ id: 'b' }, { id: 'c' }]
      )
    ).toEqual([{ id: 'b', x: 2 }, { id: 'c' }]);
  });
});

describe('the splicer’s edges (rpg-project#857 review)', () => {
  it('an empty value gains its space: `b:` edited is `b: 3`', () => {
    const out = spliceYaml(
      'a: 1\nb:\nc: 2\n',
      { a: 1, b: null, c: 2 },
      { a: 5, b: 3, c: 2 }
    );
    expect(out).toBe('a: 5\nb: 3\nc: 2\n');
    expect(parse(out)).toEqual({ a: 5, b: 3, c: 2 });
  });

  it('a flow map that gains and loses keys is rewritten whole, never garbled', () => {
    const source = 'success:\n  - {say: We yield., fact: band-yielded}\n';
    const out = spliceYaml(
      source,
      { success: [{ say: 'We yield.', fact: 'band-yielded' }] },
      { success: [{ say: 'Let me think.', activity: { ref: 'thoughtful' } }] }
    );
    expect(parse(out)).toEqual({
      success: [{ say: 'Let me think.', activity: { ref: 'thoughtful' } }],
    });
  });

  it('a removed key takes the comment lines directly above it', () => {
    const source = 'a: 1\n# about b\n# more about b\nb: 2\nc: 3\n';
    expect(spliceYaml(source, { a: 1, b: 2, c: 3 }, { a: 1, c: 3 })).toBe(
      'a: 1\nc: 3\n'
    );
  });

  it('a map that gains and loses keys keeps the comments on the keys that stay', () => {
    const source = 'm:\n  # keep me\n  a: 1\n  b: 2\n  z: 9\n';
    const out = spliceYaml(
      source,
      { m: { a: 1, b: 2 } },
      { m: { a: 1, c: 3 } }
    );
    expect(out).toBe('m:\n  # keep me\n  a: 1\n  c: 3\n  z: 9\n');
  });

  it('a map whose every written key goes is rewritten from its own value: the unread key stays', () => {
    const out = spliceYaml(
      'm:\n  a: 1\n  z: 9\n',
      { m: { a: 1 } },
      {
        m: { c: 3 },
      }
    );
    expect(parse(out)).toEqual({ m: { z: 9, c: 3 } });
  });

  it('an edit inside an anchored value is not shared with its aliases', () => {
    const source = 'base: &b { hp: 1 }\nx: *b\n';
    const out = spliceYaml(
      source,
      { base: { hp: 1 }, x: { hp: 1 } },
      { base: { hp: 2 }, x: { hp: 1 } }
    );
    expect(parse(out)).toEqual({ base: { hp: 2 }, x: { hp: 1 } });
    const aliasOnly = spliceYaml(
      source,
      { base: { hp: 1 }, x: { hp: 1 } },
      { base: { hp: 1 }, x: { hp: 5 } }
    );
    expect(parse(aliasOnly)).toEqual({ base: { hp: 1 }, x: { hp: 5 } });
  });
});

describe('a row carries its own comment (rpg-project#998)', () => {
  /** A list as the castle writes one: a comment above the key (the list's),
   * a hand-edit comment over a flow-style row, a commented middle row with a
   * comment on its last line and a closing comment under it. */
  const source = `# the list's own comment
rows:
  # Hand edit (A): why the first row is here.
  - when: [{fact: a}, {enemy: none}]
    toward: {at: {q: 1, r: 2}}
  - say: "B, quoted"
  # Hand edit (C): why the third row is here,
  # in two lines.
  - {say: C, loud: true} # C's own line comment
    # C's closing note
  - say: D
after: 1
`;
  const A = {
    when: [{ fact: 'a' }, { enemy: 'none' }],
    toward: { at: { q: 1, r: 2 } },
  };
  const B = { say: 'B, quoted' };
  const C = { say: 'C', loud: true };
  const D = { say: 'D' };
  const rowsA =
    '  # Hand edit (A): why the first row is here.\n  - when: [{fact: a}, {enemy: none}]\n    toward: {at: {q: 1, r: 2}}\n';
  const rowB = '  - say: "B, quoted"\n';
  const rowsC =
    "  # Hand edit (C): why the third row is here,\n  # in two lines.\n  - {say: C, loud: true} # C's own line comment\n    # C's closing note\n";
  const rowD = '  - say: D\n';
  const head = "# the list's own comment\nrows:\n";
  const tail = 'after: 1\n';
  const to = (rows: unknown[]) =>
    spliceYaml(source, { rows: [A, B, C, D], after: 1 }, { rows, after: 1 });

  it('the castle-shaped list is the rows in order', () => {
    expect(source).toBe(head + rowsA + rowB + rowsC + rowD + tail);
  });

  it('a commented row moves down and back up as its own text', () => {
    const down = to([B, A, C, D]);
    expect(down).toBe(head + rowB + rowsA + rowsC + rowD + tail);
    expect(
      spliceYaml(
        down,
        { rows: [B, A, C, D], after: 1 },
        { rows: [A, B, C, D], after: 1 }
      )
    ).toBe(source);
  });

  it('to the top, to the bottom, and across a commented neighbour', () => {
    expect(to([C, A, B, D])).toBe(head + rowsC + rowsA + rowB + rowD + tail);
    expect(to([B, C, D, A])).toBe(head + rowB + rowsC + rowD + rowsA + tail);
    expect(to([A, B, D, C])).toBe(head + rowsA + rowB + rowD + rowsC + tail);
    expect(to([D, B, C, A])).toBe(head + rowD + rowB + rowsC + rowsA + tail);
  });

  it('removing a row takes its own comments; its neighbours keep theirs', () => {
    expect(to([A, B, D])).toBe(head + rowsA + rowB + rowD + tail);
    expect(to([B, C, D])).toBe(head + rowB + rowsC + rowD + tail);
  });

  it('adding a row leaves the comments of the rows it lands beside', () => {
    const E = { say: 'E' };
    expect(to([A, B, E, C, D])).toBe(
      head + rowsA + rowB + '  - say: E\n' + rowsC + rowD + tail
    );
    expect(to([A, B, C, E, D])).toBe(
      head + rowsA + rowB + rowsC + '  - say: E\n' + rowD + tail
    );
    expect(to([E, A, B, C, D])).toBe(
      head + '  - say: E\n' + rowsA + rowB + rowsC + rowD + tail
    );
  });

  it('editing a row in place keeps its comment and the layout of what did not change', () => {
    expect(to([A, B, { ...C, loud: false }, D])).toBe(
      head +
        rowsA +
        rowB +
        rowsC.replace('loud: true', 'loud: false') +
        rowD +
        tail
    );
  });

  it('a row moved and edited keeps its comment and layout, with the edit spliced into its own text (rows with ids)', () => {
    const withIds = `places:
  # Hand edit: the post.
  - {id: post, at: {q: 1, r: 2}} # by the gate
  - id: hall
    at: {q: 3, r: 4}
  - id: gate
    at: {q: 5, r: 6}
`;
    const [post, hall, gate] = [
      { id: 'post', at: { q: 1, r: 2 } },
      { id: 'hall', at: { q: 3, r: 4 } },
      { id: 'gate', at: { q: 5, r: 6 } },
    ];
    // `post` is the row that moves, and it is the row that changes.
    expect(
      spliceYaml(
        withIds,
        { places: [post, hall, gate] },
        { places: [hall, gate, { ...post, at: { q: 9, r: 2 } }] }
      )
    ).toBe(`places:
  - id: hall
    at: {q: 3, r: 4}
  - id: gate
    at: {q: 5, r: 6}
  # Hand edit: the post.
  - {id: post, at: {q: 9, r: 2}} # by the gate
`);
  });

  it('of two identical rows, the commented one carries its comment past another row', () => {
    const twins =
      'rows:\n  # about the first\n  - use: dasher\n  - use: pursuer\n  - use: dasher\n';
    const X = { use: 'dasher' };
    const Y = { use: 'pursuer' };
    expect(spliceYaml(twins, { rows: [X, Y, X] }, { rows: [Y, X, X] })).toBe(
      'rows:\n  - use: pursuer\n  # about the first\n  - use: dasher\n  - use: dasher\n'
    );
    const down =
      'rows:\n  - use: dasher\n  - use: pursuer\n  # about the second\n  - use: dasher\n';
    expect(spliceYaml(down, { rows: [X, Y, X] }, { rows: [X, X, Y] })).toBe(
      'rows:\n  - use: dasher\n  # about the second\n  - use: dasher\n  - use: pursuer\n'
    );
  });

  it('a comment set off from the first row by a blank line is the list’s and stays', () => {
    const listed = 'rows:\n  # about the list\n\n  - say: a\n  - say: b\n';
    expect(
      spliceYaml(
        listed,
        { rows: [{ say: 'a' }, { say: 'b' }] },
        { rows: [{ say: 'b' }, { say: 'a' }] }
      )
    ).toBe('rows:\n  # about the list\n\n  - say: b\n  - say: a\n');
    expect(
      spliceYaml(
        listed,
        { rows: [{ say: 'a' }, { say: 'b' }] },
        { rows: [{ say: 'b' }] }
      )
    ).toBe('rows:\n  # about the list\n\n  - say: b\n');
  });

  it('an unchanged list writes the source byte for byte', () => {
    expect(to([A, B, C, D])).toBe(source);
    expect(parse(to([D, C, B, A]))).toEqual({ rows: [D, C, B, A], after: 1 });
  });
});

describe('the write guard: a write must read back as the edit meant (rpg-project#1014)', () => {
  const file = `# the file
key: castle
cells:
  - r: 1
    q: [[2, 3]] # a run
  - { r: 2, q: [[0, 1]] }
note: "kept"
`;
  const own = parse(file);
  /** The guard over `out`, as written for the edit `edit`. */
  const guard = (out: string, edit: (v: never) => void = () => {}) => {
    const current = structuredClone(own);
    edit(current as never);
    return () => checkWrite(own, own, current, out);
  };
  const refused = (run: () => unknown, reason: RegExp) => {
    let error: unknown;
    try {
      run();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(UnsafeWriteError);
    const message = (error as Error).message;
    expect(message.startsWith(`${UNSAFE_WRITE} `)).toBe(true);
    expect(message.slice(UNSAFE_WRITE.length + 1)).toMatch(reason);
  };

  it('passes a write that differs only in comments, quoting, flow or block, and key order', () => {
    const restyled = `note: kept
cells:
  - q:
      - - 2
        - 3
    r: 1
  # a comment the edit did not write
  - r: 2
    q: [[0, 1]]
key: 'castle'
`;
    expect(guard(restyled)()).toBe(restyled);
  });

  it('refuses text that does not parse, naming the line', () => {
    refused(
      guard(`${file}- [ unclosed\n`),
      /^The file it would write does not parse at line \d+\.$/
    );
  });

  it('refuses a changed value, a dropped key, a reordered list and a changed type, naming where', () => {
    refused(
      guard(file.replace('[[2, 3]]', '[[2, 4]]')),
      /reads cells\[0\]\.q\[0\]\[1\] differently/
    );
    refused(
      guard(file.replace('note: "kept"\n', '')),
      /reads note differently/
    );
    refused(
      guard(file.replace('[[2, 3]]', '[[3, 2]]')),
      /reads cells\[0\]\.q\[0\]\[0\] differently/
    );
    refused(
      guard(file.replace('r: 1', 'r: "1"')),
      /reads cells\[0\]\.r differently/
    );
    refused(
      guard(file.replace('r: 1', 'r:')),
      /reads cells\[0\]\.r differently/
    );
  });

  it('refuses a write that lost the edit: the file unchanged', () => {
    refused(
      guard(file, (v: { key: string }) => {
        v.key = 'mine';
      }),
      /reads key differently/
    );
  });

  it('holds the keys the studio does not author: the intended value is the file’s own with the edit applied', () => {
    const base = structuredClone(own);
    delete base.note;
    const current = structuredClone(base);
    current.key = 'mine';
    const out = file.replace('key: castle', 'key: mine');
    expect(checkWrite(own, base, current, out)).toBe(out);
    refused(
      () => checkWrite(own, base, current, out.replace('note: "kept"\n', '')),
      /reads note differently/
    );
  });

  it('the castle round-trips byte for byte when nothing changed', () => {
    const castle = parse(served);
    expect(spliceYaml(served, castle, structuredClone(castle))).toBe(served);
  });
});

describe('a compact list, `- - a`, takes every edit (rpg-project#1014)', () => {
  // The castle's ground paint: each row of `q` is a run written as a list
  // that starts on the row's own dash.
  const file = `paint:
  - r: -5
    q:
      - - 2
        - 3
  - r: -4
    q:
      - - 1
        - 2
      - - 5
        - 6
after: 1
`;
  const own = parse(file);
  const to = (edit: (q: number[][][]) => void) => {
    const current = structuredClone(own);
    edit(current.paint.map((row: { q: number[][] }) => row.q));
    return spliceYaml(file, own, current);
  };

  it('a row moved within the run keeps the run’s style', () => {
    expect(to((q) => q[0][0].reverse())).toBe(
      file.replace('      - - 2\n        - 3\n', '      - - 3\n        - 2\n')
    );
  });

  it('an edited first value', () => {
    expect(
      to((q) => {
        q[0][0][0] = 3;
      })
    ).toBe(file.replace('- - 2\n', '- - 3\n'));
    expect(
      to((q) => {
        q[0][0][0] = 1;
      })
    ).toBe(file.replace('- - 2\n', '- - 1\n'));
  });

  it('the first value removed: the next takes the dash line', () => {
    expect(to((q) => q[0][0].shift())).toBe(
      file.replace('      - - 2\n        - 3\n', '      - - 3\n')
    );
  });

  it('a value added at the front, in the middle and at the end', () => {
    expect(to((q) => q[0][0].unshift(1))).toBe(
      file.replace(
        '      - - 2\n        - 3\n',
        '      - - 1\n        - 2\n        - 3\n'
      )
    );
    expect(to((q) => q[0][0].splice(1, 0, 9))).toBe(
      file.replace(
        '      - - 2\n        - 3\n',
        '      - - 2\n        - 9\n        - 3\n'
      )
    );
    expect(to((q) => q[0][0].push(4))).toBe(
      file.replace(
        '      - - 2\n        - 3\n',
        '      - - 2\n        - 3\n        - 4\n'
      )
    );
  });

  it('whole runs move, go and come back as their own text', () => {
    const swapped = to((q) => q[1].reverse());
    expect(swapped).toBe(
      file.replace(
        '      - - 1\n        - 2\n      - - 5\n        - 6\n',
        '      - - 5\n        - 6\n      - - 1\n        - 2\n'
      )
    );
    expect(to((q) => q[1].shift())).toBe(
      file.replace('      - - 1\n        - 2\n', '')
    );
  });

  it('a run whose values are maps keeps their lines under the moved value', () => {
    const maps = `q:
  - - a: 1
      b: 2
    - c: 3
      d: 4
`;
    const before = parse(maps);
    const current = structuredClone(before);
    current.q[0].reverse();
    expect(spliceYaml(maps, before, current)).toBe(`q:
  - - c: 3
      d: 4
    - a: 1
      b: 2
`);
  });

  it('a comment inside the run that the shared line cannot hold: the run is written whole, and the comment of a row that stays is set above it', () => {
    const commented = `q:
  - - 2
    # three
    - 3
`;
    const before = parse(commented);
    const shift = structuredClone(before);
    shift.q[0].shift();
    expect(spliceYaml(commented, before, shift)).toBe(
      'q:\n  # three\n  - - 3\n'
    );
    const swap = structuredClone(before);
    swap.q[0].reverse();
    expect(spliceYaml(commented, before, swap)).toBe(
      'q:\n  # three\n  - - 3\n    - 2\n'
    );
    // The comment of a removed row goes with it.
    const pop = structuredClone(before);
    pop.q[0] = [7];
    expect(parse(spliceYaml(commented, before, pop))).toEqual(pop);
  });
});

describe('an emptied map is `{}`, an emptied list `[]` (rpg-project#1014 review)', () => {
  const write = (file: string, edit: (v: never) => void) => {
    const own = parse(file);
    const current = structuredClone(own);
    edit(current as never);
    return spliceYaml(file, own, current);
  };

  it('a block map or list that loses every entry is written on its key’s line, and nothing else moves', () => {
    expect(
      write('# top\na:\n  x: 1 # one\n  y: 2\nb: 2\n', (v: { a: object }) => {
        v.a = {};
      })
    ).toBe('# top\na: {}\nb: 2\n');
    expect(
      write('a:\n  - 1\n  - 2\nb: 2\n', (v: { a: unknown[] }) => {
        v.a = [];
      })
    ).toBe('a: []\nb: 2\n');
    expect(
      write('top:\n  a:\n    x: 1\n  b: 2\n', (v: { top: { a: object } }) => {
        v.top.a = {};
      })
    ).toBe('top:\n  a: {}\n  b: 2\n');
    expect(
      write(
        'rows:\n  - a: 1\n    b: 2\n  - c: 3\n',
        (v: { rows: object[] }) => {
          v.rows[0] = {};
        }
      )
    ).toBe('rows:\n  - {}\n  - c: 3\n');
  });

  it('the first key or item goes into `{}`, `[]`, a `key:` with no value, and a missing key', () => {
    const add = (file: string, value: unknown) =>
      write(file, (v: { a: unknown }) => {
        v.a = value;
      });
    expect(add('a: {}\nb: 2\n', { x: 1 })).toBe('a: {x: 1}\nb: 2\n');
    expect(add('a: []\nb: 2\n', [1])).toBe('a: [1]\nb: 2\n');
    expect(add('a:\nb: 2\n', { x: 1 })).toBe('a: { x: 1 }\nb: 2\n');
    expect(add('b: 2\n', { x: 1 })).toBe('b: 2\na:\n  x: 1\n');
  });

  it('a block map or list turned into a scalar, or into text over several lines, is written from its key’s line', () => {
    const file =
      'list:\n  - id: a\n    # note\n    cell:\n      q: 1\n    after: 2\n';
    const to = (value: unknown) =>
      write(file, (v: { list: Record<string, unknown>[] }) => {
        v.list[0].cell = value;
      });
    expect(to(3)).toBe(file.replace('cell:\n      q: 1\n', 'cell: 3\n'));
    expect(to('multi\nline')).toBe(
      file.replace('cell:\n      q: 1\n', 'cell: |-\n      multi\n      line\n')
    );
  });

  it('a file that already holds `{}`, `[]` and `key:` takes an edit elsewhere, byte for byte', () => {
    const file = 'm: {}\nl: []\nn:\ns: ""\nb: 2\n';
    expect(
      write(file, (v: { b: number }) => {
        v.b = 3;
      })
    ).toBe(file.replace('b: 2', 'b: 3'));
  });
});

describe('the guard is in the real write path, and fails closed (rpg-project#1014 review)', () => {
  afterEach(() => vi.restoreAllMocks());
  const file = 'a:\n  x: 1\n  y: [1, 2]\nb: two\n';
  const own = parse(file);
  const edited = { ...structuredClone(own), b: 'three' };
  const refusal = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafeWriteError);
      return (error as Error).message;
    }
    throw new Error('the write was not refused');
  };

  it('a writer that loses the edit, garbles the text or writes elsewhere is refused by spliceYaml itself', () => {
    const real = spliceInternals.text;
    const faulty = (fault: (out: string) => string) =>
      vi
        .spyOn(spliceInternals, 'text')
        .mockImplementation((source, document, base, current) => {
          const written = real(source, document, base, current);
          return { ...written, out: fault(written.out) };
        });
    faulty((out) => out.replace('three', 'two'));
    expect(refusal(() => spliceYaml(file, own, edited))).toMatch(
      /reads b differently/
    );
    faulty((out) => `${out}- [ unclosed\n`);
    expect(refusal(() => spliceYaml(file, own, edited))).toMatch(
      /does not parse/
    );
    faulty((out) => out.replace('x: 1', 'x: 9'));
    expect(refusal(() => spliceYaml(file, own, edited))).toMatch(
      /reads a\.x differently/
    );
    vi.restoreAllMocks();
    expect(spliceYaml(file, own, edited)).toBe(
      file.replace('b: two', 'b: three')
    );
  });

  it('a writer that throws is a refusal, not an error the caller might swallow', () => {
    vi.spyOn(spliceInternals, 'text').mockImplementation(() => {
      throw new TypeError('boom');
    });
    expect(refusal(() => spliceYaml(file, own, edited))).toMatch(
      /could not finish: boom/
    );
  });

  it('a write whose alias lost its anchor is refused, not thrown as a ReferenceError', () => {
    const anchored = 'rows:\n  - &a { x: 1 }\n  - { y: *a }\n';
    const before = parse(anchored);
    expect(
      refusal(() =>
        spliceYaml(anchored, before, { rows: [before.rows[1], before.rows[0]] })
      )
    ).toMatch(/cannot be read back/);
  });
});

/** The one edit that turns `source` into `out`: what a writer that reports
 * its edits honestly would say. */
function honestEdit(source: string, out: string) {
  let head = 0;
  while (
    head < source.length &&
    head < out.length &&
    source[head] === out[head]
  )
    head++;
  let tail = 0;
  while (
    tail < source.length - head &&
    tail < out.length - head &&
    source[source.length - 1 - tail] === out[out.length - 1 - tail]
  )
    tail++;
  return {
    start: head,
    end: source.length - tail,
    text: out.slice(head, out.length - tail),
    order: 0,
  };
}

describe('a write that reads right line by line but wrong in its place is refused (rpg-project#1014 reviews)', () => {
  afterEach(() => vi.restoreAllMocks());
  /** `spliceYaml` over a writer that writes `out` for the edit, and says
   * so honestly. */
  const writes = (
    source: string,
    edit: (value: never) => void,
    out: string
  ) => {
    const own = parse(source);
    const current = structuredClone(own);
    edit(current as never);
    vi.spyOn(spliceInternals, 'text').mockReturnValue({
      out,
      edits: [honestEdit(source, out)],
    });
    return () => spliceYaml(source, own, current);
  };
  const refused = (run: () => unknown) => expect(run).toThrow(UnsafeWriteError);
  type M = { m: Record<string, unknown> };

  it('a `key: scalar` line written deeper than its key re-parents, joins a block scalar, or breaks the file', () => {
    refused(
      writes(
        'm:\n  a:\n  x: 2\n',
        (v: M) => {
          v.m.x = 5;
        },
        'm:\n  a:\n    x: 5\n'
      )
    );
    refused(
      writes(
        'm:\n  s: |\n    text\n  x: 2\n',
        (v: M) => {
          v.m.x = 5;
        },
        'm:\n  s: |\n    text\n    x: 5\n'
      )
    );
    refused(
      writes(
        'm:\n  s: hello\n  x: 2\n',
        (v: M) => {
          v.m.x = 5;
        },
        'm:\n  s: hello\n    x: 5\n'
      )
    );
  });

  it('edited lines that lose their last newline join the next line', () => {
    refused(
      writes(
        'k:\n  a: 1\n  b: 2\nj: 3\n',
        (v: { k: Record<string, number> }) => {
          v.k.b = 5;
        },
        'k:\n  a: 1\n  b: 5j: 3\n'
      )
    );
  });

  it('a list at its key’s own column rewritten as a map joins the parent’s keys', () => {
    const source = 'o:\n  k:\n  - a\n  - b\n  j: 1\n';
    refused(
      writes(
        source,
        (v: { o: Record<string, unknown> }) => {
          v.o.k = { x: 5 };
        },
        'o:\n  k:\n  x: 5\n  j: 1\n'
      )
    );
    refused(
      writes(
        source,
        (v: { o: Record<string, unknown> }) => {
          v.o.k = { j: 9 };
        },
        'o:\n  k:\n  j: 9\n  j: 1\n'
      )
    );
  });

  it('a block list rewritten as a map is refused', () => {
    refused(
      writes(
        'o:\n  k:\n    - a\n    - b\n  j: 1\n',
        (v: { o: Record<string, unknown> }) => {
          v.o.k = ['a', 'c'];
        },
        'o:\n  k:\n    x: a\n  j: 1\n'
      )
    );
  });

  it('a line that opens a block scalar takes the deeper lines after it', () => {
    refused(
      writes(
        'm:\n  x: 1\n      # note\n  y: 2\n',
        (v: M) => {
          // What `x: |` reads as alone: the line passes on its own.
          v.m.x = '';
        },
        'm:\n  x: |\n      # note\n  y: 2\n'
      )
    );
  });

  it('a sound write passes', () => {
    const source = 'm:\n  a:\n  x: 2\n  s: |\n    text\n  list:\n    - 1\n';
    expect(
      writes(
        source,
        (v: M) => {
          v.m.x = 5;
        },
        source.replace('x: 2', 'x: 5')
      )()
    ).toBe(source.replace('x: 2', 'x: 5'));
  });
});

describe('removing a row’s first key keeps the row (rpg-project#1014 second review)', () => {
  type L = { list: Record<string, unknown>[] };
  const write = (source: string, edit: (v: L) => void) => {
    const own = parse(source);
    const current = structuredClone(own);
    edit(current);
    return spliceYaml(source, own, current);
  };

  it('the next key moves up onto the dash line; the row’s other lines stay', () => {
    expect(
      write('list:\n  - id: a\n    x: 1 # one\n    y: 2\n  - id: b\n', (v) => {
        delete v.list[0].id;
      })
    ).toBe('list:\n  - x: 1 # one\n    y: 2\n  - id: b\n');
  });

  it('the comment above the key that moves up is set above the dash', () => {
    expect(
      write('list:\n  - id: a\n    # about x\n    x: 1\n', (v) => {
        delete v.list[0].id;
      })
    ).toBe('list:\n  # about x\n  - x: 1\n');
  });

  it('the first two keys go, a key is added before the one that moves up, and the only key goes', () => {
    expect(
      write('list:\n  - id: a\n    x: 1\n    y: 2\n', (v) => {
        delete v.list[0].id;
        delete v.list[0].x;
      })
    ).toBe('list:\n  - y: 2\n');
    expect(
      write('list:\n  - id: a\n    x: 1\n', (v) => {
        delete v.list[0].id;
        v.list[0] = { w: 0, ...v.list[0] };
      })
    ).toBe('list:\n  - w: 0\n    x: 1\n');
    expect(
      write('list:\n  - id: a\n', (v) => {
        delete v.list[0].id;
      })
    ).toBe('list:\n  - {}\n');
  });

  it('in a compact row (`- - id: a`) and before a nested list', () => {
    expect(
      write('q:\n  - - id: a\n      x: 1\n', (v) => {
        delete (v as unknown as { q: Record<string, unknown>[][] }).q[0][0].id;
      })
    ).toBe('q:\n  - - x: 1\n');
    expect(
      write('list:\n  - id: a\n    x:\n      - 1\n', (v) => {
        delete v.list[0].id;
      })
    ).toBe('list:\n  - x:\n      - 1\n');
  });
});
