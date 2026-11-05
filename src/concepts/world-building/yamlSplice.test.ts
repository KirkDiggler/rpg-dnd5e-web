// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { mergeValue, sameValue, spliceYaml } from './yamlSplice';

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
