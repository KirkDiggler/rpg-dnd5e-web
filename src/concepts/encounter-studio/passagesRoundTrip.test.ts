/**
 * THE KITCHEN PASSAGE ROUND-TRIPS (rpg-project#958, Passages S1). The served
 * castle carries its first concealment (`kitchen-passage`, the grate by the
 * hearth), the record that reveals it (`kitchen-way`), the scullion's
 * `favour` line whose answer `tells` that record, and the grate's two lines
 * whose rows `relocate` the speaker. The studio has no form for `tells` or
 * `relocate` yet: it loads them, keeps them through every neighbouring edit,
 * and writes them back byte for byte. The engine judges them, not the studio.
 */
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { setConcealment } from '../world-building/concealmentEdits';
import { normalizeBinding } from '../world-building/monsterOrderEdits';
import {
  addOption,
  patchOption,
  patchOptionRow,
} from '../world-building/optionEdits';
import { setPropOption } from '../world-building/propBindingEdits';
import type { SiteScope } from '../world-building/siteScope';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}
type Read = ReturnType<typeof read>;
type Draft = Read['draft'];

/** Every line of `b` that differs from the same line of `a`. */
function changedLines(a: string, b: string): string[] {
  const left = a.split('\n');
  return b.split('\n').filter((line, i) => line !== left[i]);
}

const save = (result: Read, draft: Draft, scope: SiteScope = result.scope) =>
  exportDraftYaml({ draft, scope }, result.key);

const TELLS_ROW = `            success:
              - say: The grate by the hearth. Lift it. One way climbs to the chapel, the other drops to the cells.
                tells: kitchen-way
`;
const TO_CHAPEL = `              - relocate:
                  to: region-chapel
                  words: The tunnel climbs, and you come up through a flagstone behind the chapel's altar.
                  rounds: 1
`;
const TO_CELLS = `              - relocate:
                  to: region-cells
                  words: The tunnel drops, and you squeeze out through a drain in the cells.
                  rounds: 1
`;
const CONCEALMENT = `concealments:
  kitchen-passage:
    checks: [{ ability: investigation, dc: 18 }]
    props: [grate]
`;
const RECORD = `  - id: kitchen-way
    reveals:
      concealment: kitchen-passage
`;

/** Everything the passage authored, still in place in `saved`. */
function expectPassageKept(saved: string, except: readonly string[] = []) {
  for (const [name, block] of Object.entries({
    TELLS_ROW,
    TO_CHAPEL,
    TO_CELLS,
    CONCEALMENT,
    RECORD,
  }))
    if (!except.includes(name)) expect(saved).toContain(block);
}

/** One draft edit applied to a deep copy of the served castle's draft. */
function withDraft(result: Read, edit: (draft: Draft) => void): Draft {
  const draft = structuredClone(result.draft);
  edit(draft);
  return draft;
}

function scullionEdit(
  result: Read,
  change: (
    option: NonNullable<
      NonNullable<Draft['room']['monsterBindings']>[string]['options']
    >[number]
  ) => typeof option
): Draft {
  return withDraft(result, (draft) => {
    const scullion = draft.room.monsterBindings!.scullion;
    draft.room.monsterBindings!.scullion = normalizeBinding({
      ...scullion,
      options: scullion.options!.map((o) =>
        o.id === 'favour' ? change(o) : o
      ),
    })!;
  });
}

function grateEdit(
  result: Read,
  index: number,
  change: (
    option: NonNullable<
      NonNullable<Draft['room']['propBindings']>[string]['options']
    >[number]
  ) => typeof option
): Draft {
  return withDraft(result, (draft) => {
    const grate = draft.room.propBindings!.grate;
    draft.room.propBindings!.grate = setPropOption(
      grate,
      index,
      change(grate.options![index]!)
    )!;
  });
}

describe('the kitchen passage loads and writes back (rpg-project#958)', () => {
  it('the castle loads with every passage key, and an unedited download is byte-identical', () => {
    expectPassageKept(served);
    const result = read(served);
    expect(save(result, result.draft)).toBe(served);

    const favour = result.draft.room.monsterBindings!.scullion.options!.find(
      (o) => o.id === 'favour'
    )!;
    expect(favour.success).toEqual([
      {
        say: 'The grate by the hearth. Lift it. One way climbs to the chapel, the other drops to the cells.',
        tells: 'kitchen-way',
      },
    ]);
    const grate = result.draft.room.propBindings!.grate.options!;
    expect(grate.map((o) => o.id)).toEqual(['to-chapel', 'to-cells']);
    expect(grate[0]!.success).toEqual([
      {
        relocate: {
          to: 'region-chapel',
          words:
            "The tunnel climbs, and you come up through a flagstone behind the chapel's altar.",
          rounds: 1,
        },
      },
    ]);
    expect(result.scope.concealments?.['kitchen-passage']).toEqual({
      checks: [{ ability: 'investigation', dc: 18 }],
      props: ['grate'],
    });
    expect(result.scope.intel).toContainEqual({
      id: 'kitchen-way',
      reveals: { concealment: 'kitchen-passage' },
    });
  });

  it('editing the scullion’s line keeps its `tells`', () => {
    const result = read(served);
    const saved = save(
      result,
      scullionEdit(result, (o) =>
        patchOption(o, { say: 'A coin for a way out?' })
      )
    );
    expect(changedLines(served, saved)).toEqual([
      '            say: A coin for a way out?',
    ]);
    expectPassageKept(saved);
  });

  it('editing the answer row that tells keeps `tells` on it', () => {
    const result = read(served);
    const saved = save(
      result,
      scullionEdit(result, (o) =>
        patchOptionRow(o, 'success', 0, {
          ...o.success![0]!,
          say: 'The grate. Lift it.',
        })
      )
    );
    expect(changedLines(served, saved)).toEqual([
      '              - say: The grate. Lift it.',
    ]);
    expectPassageKept(saved, ['TELLS_ROW']);
    expect(saved).toContain(
      '              - say: The grate. Lift it.\n                tells: kitchen-way\n'
    );
  });

  it('editing one grate line keeps every `relocate` field on both', () => {
    const result = read(served);
    const saved = save(
      result,
      grateEdit(result, 0, (o) => patchOption(o, { say: '(climb)' }))
    );
    expect(changedLines(served, saved)).toEqual(['            say: (climb)']);
    expectPassageKept(saved);
  });

  it('editing the row that relocates keeps all three of its fields', () => {
    const result = read(served);
    const saved = save(
      result,
      grateEdit(result, 1, (o) =>
        patchOptionRow(o, 'success', 0, {
          ...o.success![0]!,
          say: 'Down you go.',
        })
      )
    );
    const doc = parse(saved);
    expect(doc.room.room.propBindings.grate.options[1].success).toEqual([
      {
        relocate: {
          to: 'region-cells',
          words:
            'The tunnel drops, and you squeeze out through a drain in the cells.',
          rounds: 1,
        },
        say: 'Down you go.',
      },
    ]);
    // The new key takes the dash's line; the relocate stays whole under it.
    expect(saved).toContain(
      TO_CELLS.replace(
        '              - relocate:\n',
        '              - say: Down you go.\n                relocate:\n'
      )
    );
    expect(saved).toContain(TO_CHAPEL);
    // It re-imports and writes back as it was saved.
    const again = read(saved);
    expect(save(again, again.draft)).toBe(saved);
  });

  it('adding a line to the grate keeps both passage lines', () => {
    const result = read(served);
    const saved = save(
      result,
      withDraft(result, (draft) => {
        const grate = draft.room.propBindings!.grate;
        const options = addOption(grate.options);
        options[2] = patchOption(options[2]!, { say: '(listen at the grate)' });
        draft.room.propBindings!.grate = { ...grate, options };
      })
    );
    expectPassageKept(saved);
    expect(parse(saved).room.room.propBindings.grate.options).toHaveLength(3);
  });

  it('editing the concealment keeps the record, the lines and the grate', () => {
    const result = read(served);
    const scope = setConcealment(result.scope, 'kitchen-passage', {
      ...result.scope.concealments!['kitchen-passage']!,
      checks: [{ ability: 'investigation', dc: 20 }],
    });
    const saved = save(result, result.draft, scope);
    expect(changedLines(served, saved)).toEqual([
      '    checks: [{ ability: investigation, dc: 20 }]',
    ]);
    expectPassageKept(saved, ['CONCEALMENT']);
  });

  it('editing the record keeps the concealment and the lines', () => {
    const result = read(served);
    const scope: SiteScope = {
      ...result.scope,
      intel: result.scope.intel!.map((record) =>
        record.id === 'kitchen-way'
          ? { ...record, reveals: { concealment: 'kitchen-tunnel' } }
          : record
      ),
    };
    const saved = save(result, result.draft, scope);
    expect(changedLines(served, saved)).toEqual([
      '      concealment: kitchen-tunnel',
    ]);
    // The concealment keeps its own name: the studio rewrites no reference
    // across records, the engine judges it.
    expectPassageKept(saved, ['RECORD']);
  });

  it('editing the grate itself keeps its lines and its concealment', () => {
    const result = read(served);
    const saved = save(
      result,
      withDraft(result, (draft) => {
        draft.room.propDeclarations.grate = {
          ...draft.room.propDeclarations.grate!,
          blocksMovement: true,
        };
      })
    );
    expect(changedLines(served, saved)).toEqual([
      '        blocksMovement: true',
    ]);
    expectPassageKept(saved);
  });
});
