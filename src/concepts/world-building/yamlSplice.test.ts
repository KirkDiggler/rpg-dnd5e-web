// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import served from '../encounter-studio/fixtures/the-mad-king-served.yaml?raw';
import {
  checkWrite,
  mergeValue,
  sameValue,
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

  it('a comment inside the run that the shared line cannot hold: the run is written whole, still exact', () => {
    const commented = `q:
  - - 2
    # three
    - 3
`;
    const before = parse(commented);
    const current = structuredClone(before);
    current.q[0].shift();
    const out = spliceYaml(commented, before, current);
    expect(parse(out)).toEqual(current);
    expect(out.startsWith('q:\n  - ')).toBe(true);
  });
});
