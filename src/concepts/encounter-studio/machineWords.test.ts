/**
 * THE DRAWING IN THE ENGINE'S WORDS (rpg-project#1015), over the engine's
 * own `GetMachineWords` answer and castle read-back at encounter v0.225.0
 * (recorded through rpg-api's handler mapping; `fixtures/engineReadBack.ts`).
 */
import type {
  ReadBack,
  ReadBackConnection,
  ReadBackStatement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  castleMachinesReadBack,
  castleMachinesV225ReadBack,
  castleMachinesWithClaimReadBack,
  machineWordsV225,
} from './fixtures/engineReadBack';
import {
  layoutMachine,
  overlapsOf,
  strokeFaultsOf,
  textRect,
  type MachineLayout,
} from './machineLayout';
import {
  beatLabel,
  machineOf,
  shortBeatLabel,
  stayLabel,
  type MachineEdge,
} from './machineView';
import { conditionWords } from './machineWords';
import { machinesRunBy } from './runWatch';

const WORDS = machineWordsV225();

/** Every stroke end, label and caption that lies outside the drawing. */
const outsideOf = (layout: MachineLayout): string[] => {
  const out: string[] = [];
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x <= layout.width && y <= layout.height;
  for (const piece of layout.pieces) {
    for (const sg of piece.segments)
      if (!inside(sg.x1, sg.y1) || !inside(sg.x2, sg.y2))
        out.push(`${piece.id} stroke ${JSON.stringify(sg)}`);
    for (const [name, text, size] of [
      ['label', piece.label, 12],
      ['caption', piece.caption, 11],
    ] as const) {
      if (!text) continue;
      const r = textRect(text, size);
      if (!inside(r.x, r.y) || !inside(r.x + r.w, r.y + r.h))
        out.push(`${piece.id} ${name} ${JSON.stringify(r)}`);
    }
  }
  for (const box of layout.boxes) {
    const r = box.rect;
    if (!inside(r.x, r.y) || !inside(r.x + r.w, r.y + r.h))
      out.push(`${box.id} ${JSON.stringify(r)}`);
  }
  return out;
};
const LIE =
  'behaviorDefinitions.captain-policy.recipe.states.in-hall.transitions[1]';
const HEARD =
  'behaviorDefinitions.gate-1-policy.recipe.states.posted.transitions[5]';
const NOTHING_CAME =
  'behaviorDefinitions.gate-1-policy.recipe.states.alert.transitions[4]';

const statements = (readBack: ReadBack): ReadBackStatement[] =>
  readBack.sections.flatMap((s) => s.groups).flatMap((g) => g.statements);
const wakeAt = (readBack: ReadBack, path: string): ReadBackStatement =>
  statements(readBack).find(
    (st) => st.kind === 'routine.wake' && st.path === path
  )!;
const routineOf = (path: string): string =>
  /^behaviorDefinitions\.([^.]+)\./.exec(path)![1]!;
/** The arrow a step is drawn in. */
const edgeOf = (readBack: ReadBack, path: string): MachineEdge =>
  machineOf(readBack, routineOf(path))!.edges.find((edge) =>
    edge.steps.some((step) => step.statement.path === path)
  )!;
const conditionsOf = (st: ReadBackStatement): ReadBackConnection[] =>
  st.connects.filter((c) => c.kind === 'condition');

/** The step at `path` said again from another state, its connections
 * changed by `change`, beside the original. */
function withTwin(
  path: string,
  from: string,
  change: (c: ReadBackConnection[]) => void = () => {}
) {
  const readBack = castleMachinesV225ReadBack();
  const original = wakeAt(readBack, path);
  const group = readBack.sections
    .flatMap((s) => s.groups)
    .find((g) => g.statements.includes(original))!;
  const twin: ReadBackStatement = {
    ...original,
    path: path.replace(
      /states\.[^.]+\.transitions\[\d+\]$/,
      `states.${from}.transitions[9]`
    ),
    connects: original.connects.map((c) =>
      c.role === 'from' ? { ...c, id: from } : { ...c }
    ),
  };
  change(twin.connects);
  group.statements.push(twin);
  const view = machineOf(readBack, routineOf(path))!;
  const drawnIn = (st: ReadBackStatement) =>
    view.edges.find((edge) => edge.steps.some((s) => s.statement === st))!;
  return { original: drawnIn(original), twin: drawnIn(twin) };
}

describe('a step’s label in the engine’s words', () => {
  it('a beat alone is the beat’s label', () => {
    const view = machineOf(castleMachinesV225ReadBack(), 'reserve-1-policy')!;
    const labels = view.edges.map((edge) => beatLabel(edge, WORDS));
    expect(labels).toContain("a round of its side's fight");
    const gate = machineOf(castleMachinesV225ReadBack(), 'gate-1-policy')!;
    expect(beatLabel(gate.edges.find((e) => e.beat === 'barred')!, WORDS)).toBe(
      'someone walks into it'
    );
  });

  it('a beat that takes a thing says it, and its one condition is not said twice', () => {
    const turned = machineOf(
      castleMachinesV225ReadBack(),
      'gate-1-policy'
    )!.edges.find((e) => e.to === 'turned')!;
    expect(beatLabel(turned, WORDS)).toBe('learns guards-turned');
    expect(shortBeatLabel(turned, WORDS)).toBe('learns guards-turned');
    const admitted = edgeOf(
      castleMachinesV225ReadBack(),
      'behaviorDefinitions.captain-policy.recipe.states.ready.transitions[2]'
    );
    expect(beatLabel(admitted, WORDS)).toBe('notes admitted about someone');
  });

  it('a beat and one condition, with its comparison: gte is “at least”', () => {
    const edge = edgeOf(castleMachinesV225ReadBack(), NOTHING_CAME);
    expect(edge.conditions).toEqual([
      expect.objectContaining({ id: 'rounds', is: '3', op: 'gte' }),
    ]);
    expect(beatLabel(edge, WORDS)).toBe(
      'time passes · at least 3 rounds since it marked the moment'
    );
    expect(shortBeatLabel(edge, WORDS)).toBe('time passes +1');
  });

  it('the captain’s step says it was a claim that failed and what he has noted', () => {
    const edge = edgeOf(castleMachinesV225ReadBack(), LIE);
    expect(edge.to).toBe('back-to-gate');
    expect(beatLabel(edge, WORDS)).toBe(
      'hears something · it was a claim that failed and has noted admitted about them'
    );
    expect(shortBeatLabel(edge, WORDS)).toBe('hears something +2');
  });

  it('a negated condition reads as negated, in the structure `at` gives', () => {
    const edge = edgeOf(castleMachinesV225ReadBack(), HEARD);
    expect(beatLabel(edge, WORDS)).toBe(
      'hears something · within 6 cells and (NOT (it was a voice), or it was at least a shout)'
    );
    // A word with its own negated label says it.
    expect(
      conditionWords(WORDS, [
        {
          id: 'noted:admitted',
          is: 'true',
          op: '',
          negated: true,
          at: 'when.not',
        },
      ])
    ).toBe('has not noted admitted about them');
  });

  it('a bool asked `is false` is its negation', () => {
    expect(
      conditionWords(WORDS, [
        {
          id: 'fact:gate-cowed',
          is: 'false',
          op: '',
          negated: false,
          at: 'when',
        },
      ])
    ).toBe('has not learned gate-cowed');
    // Asked false under a `not`: asked true.
    expect(
      conditionWords(WORDS, [
        {
          id: 'fact:gate-cowed',
          is: 'false',
          op: '',
          negated: true,
          at: 'when.not',
        },
      ])
    ).toBe('has learned gate-cowed');
  });

  it('a `not` over several conditions keeps them together', () => {
    expect(
      conditionWords(WORDS, [
        {
          id: 'heard.claim',
          is: 'held',
          op: '',
          negated: true,
          at: 'when.not.all[0]',
        },
        {
          id: 'noted:admitted',
          is: 'true',
          op: '',
          negated: true,
          at: 'when.not.all[1]',
        },
      ])
    ).toBe('NOT (it was a claim that held and has noted admitted about them)');
  });

  it('the connections’ order does not change the label: `at` orders them', () => {
    const readBack = castleMachinesV225ReadBack();
    const step = wakeAt(readBack, HEARD);
    const before = beatLabel(edgeOf(readBack, HEARD), WORDS);
    step.connects = [...step.connects].reverse();
    expect(beatLabel(edgeOf(readBack, HEARD), WORDS)).toBe(before);
  });

  it('a condition said twice on one step is said once', () => {
    const readBack = castleMachinesV225ReadBack();
    const step = wakeAt(readBack, LIE);
    step.connects.push(...conditionsOf(step).map((c) => ({ ...c })));
    const edge = edgeOf(readBack, LIE);
    expect(edge.conditions.map((c) => c.id)).toEqual([
      'heard.claim',
      'noted:admitted',
    ]);
    expect(shortBeatLabel(edge, WORDS)).toBe('hears something +2');
  });

  it('a word the table does not have is said as its id', () => {
    const readBack = castleMachinesV225ReadBack();
    const step = wakeAt(readBack, NOTHING_CAME);
    step.connects.find((c) => c.kind === 'condition')!.id = 'moon:full';
    expect(beatLabel(edgeOf(readBack, NOTHING_CAME), WORDS)).toBe(
      'time passes · moon:full gte 3'
    );
  });

  it('a staying step says the lists it acts from', () => {
    const posted = machineOf(
      castleMachinesV225ReadBack(),
      'gate-1-policy'
    )!.states.find((s) => s.id === 'posted')!;
    expect(posted.stays.map((step) => stayLabel(step, WORDS))).toEqual(
      expect.arrayContaining(['time passes · acts from the post list'])
    );
  });
});

describe('two steps are one arrow only when their whole condition is', () => {
  const twinOfLie = (change?: (c: ReadBackConnection[]) => void) =>
    withTwin(LIE, 'ready', change);
  const claim = (c: ReadBackConnection[]) =>
    c.find((x) => x.kind === 'condition' && x.id === 'heard.claim')!;

  it.each([
    [
      'polarity',
      (c: ReadBackConnection[]) => {
        claim(c).negated = true;
      },
    ],
    [
      'a `not` around it',
      (c: ReadBackConnection[]) => {
        claim(c).negated = true;
        claim(c).at = 'when.all[0].not';
      },
    ],
    [
      'value',
      (c: ReadBackConnection[]) => {
        claim(c).is = 'held';
      },
    ],
    [
      'comparison',
      (c: ReadBackConnection[]) => {
        claim(c).op = 'gte';
      },
    ],
    [
      'place',
      (c: ReadBackConnection[]) => {
        claim(c).at = 'when.any[0]';
      },
    ],
  ])('differing only in %s, they are two arrows', (_, change) => {
    const { original, twin } = twinOfLie(change);
    expect(original).not.toBe(twin);
    expect(original.from).toEqual(['in-hall']);
    expect(twin.from).toEqual(['ready']);
  });

  it('a polarity difference shows in the words', () => {
    const { twin } = twinOfLie((c) => {
      claim(c).is = 'held';
    });
    expect(beatLabel(twin, WORDS)).toBe(
      'hears something · it was a claim that held and has noted admitted about them'
    );
  });

  it('alike in all, they are one arrow from both states', () => {
    const { original, twin } = twinOfLie();
    expect(twin).toBe(original);
    expect(original.from).toEqual(expect.arrayContaining(['in-hall', 'ready']));
  });

  it('the garrison turning is still one arrow from every state that has it', () => {
    const view = machineOf(castleMachinesV225ReadBack(), 'gate-1-policy')!;
    const turned = view.edges.filter((edge) => edge.to === 'turned');
    expect(turned).toHaveLength(1);
    expect(turned[0]!.from).toEqual(
      expect.arrayContaining(['posted', 'alert', 'challenged', 'cowed'])
    );
  });
});

describe('falling back', () => {
  it('with no words, the condition connections are said in their ids', () => {
    const edge = edgeOf(castleMachinesV225ReadBack(), LIE);
    expect(beatLabel(edge)).toBe(
      'on heard: heard.claim failed, noted:admitted'
    );
    expect(shortBeatLabel(edge)).toBe('on heard +2');
    // An `any` or a `not` the ids cannot say: the beat and a count, never
    // a flat list that would read as all needed (review finding 1).
    const heard = edgeOf(castleMachinesV225ReadBack(), HEARD);
    expect(beatLabel(heard)).toBe('on heard +3');
  });

  it('with no condition connections (an older engine), the reads are said as before', () => {
    const old = castleMachinesWithClaimReadBack();
    const edge = edgeOf(old, LIE);
    expect(edge.conditions).toEqual([]);
    expect(beatLabel(edge)).toBe('on heard: claim failed, topic admitted');
    // With words, the beat is the engine's; the reads stay as before.
    expect(beatLabel(edge, WORDS)).toBe(
      'hears something · claim failed · topic admitted'
    );
    const turned = machineOf(
      castleMachinesReadBack(),
      'gate-1-policy'
    )!.edges.find((e) => e.to === 'turned')!;
    // A `wakes-on` read alone never names the beat's thing: the engine
    // says it of a fact under a `not` too.
    expect(beatLabel(turned, WORDS)).toBe('learns a fact · guards-turned');
    expect(beatLabel(turned)).toBe('on fact: guards-turned');
  });

  it('a beat the table does not have keeps its id', () => {
    expect(beatLabel({ beat: 'storm', reads: [] }, WORDS)).toBe('on storm');
  });
});

describe('the castle’s ten machines in plain words', () => {
  const routines = castleMachinesV225ReadBack()
    .sections.flatMap((s) => s.groups)
    .filter((g) => g.about?.kind === 'routine')
    .map((g) => g.about!.id);

  it.each([
    ['in the engine’s words', WORDS],
    ['with no words', null],
  ])(
    'every machine lays out with nothing overlapping, at the studio’s width, %s',
    (_, words) => {
      expect(routines).toEqual(
        expect.arrayContaining([
          'gate-1-policy',
          'captain-policy',
          'reserve-1-policy',
        ])
      );
      for (const id of routines) {
        const view = machineOf(castleMachinesV225ReadBack(), id);
        expect(view, id).not.toBeNull();
        const layout = layoutMachine(view!, words);
        expect(overlapsOf(layout), id).toEqual([]);
        expect(strokeFaultsOf(layout), id).toEqual([]);
        expect(layout.width, id).toBeLessThanOrEqual(1100);
        // Every stroke and every label lies inside the drawing's own
        // width and height: nothing is clipped at its edges.
        expect(outsideOf(layout), id).toEqual([]);
        for (const edge of view!.edges)
          expect(
            layout.pieces.some((p) => p.edge === edge),
            `${id} ${edge.id}`
          ).toBe(true);
      }
    }
  );

  it('the captain’s step and the gate’s hearing are drawn whole, full sentence kept', () => {
    for (const path of [LIE, HEARD]) {
      const readBack = castleMachinesV225ReadBack();
      const layout = layoutMachine(
        machineOf(readBack, routineOf(path))!,
        WORDS
      );
      const piece = layout.pieces.find((p) =>
        p.steps.some((st) => st.statement.path === path)
      )!;
      expect(piece.label.text).toBe(piece.label.full);
      expect(piece.label.full.startsWith('hears something · ')).toBe(true);
      // The engine's sentence is still the mark's.
      expect(piece.steps[0]!.statement.sentence).toBe(
        wakeAt(readBack, path).sentence
      );
    }
  });

  it('a box too narrow for a staying step’s line puts its list on a line of its own', () => {
    const layout = layoutMachine(
      machineOf(castleMachinesV225ReadBack(), 'captain-policy')!,
      WORDS
    );
    const box = layout.boxes.find((b) => b.state.id === 'back-to-gate')!;
    const lines = box.lines.map((line) => line.text);
    expect(lines).toEqual(
      expect.arrayContaining(['time passes', 'acts from the back-to-gate list'])
    );
    // Nothing in it is cut, and each line keeps the whole step.
    expect(lines.some((text) => text.endsWith('…'))).toBe(false);
    expect(box.lines.map((line) => line.full)).toContain(
      'time passes · acts from the back-to-gate list'
    );
  });
});

/**
 * THE BEAT'S THING (review of #1462, finding A): the engine says
 * `{fact, X, wakes-on}` for a `fact:X` asked true under a `not` or inside
 * an `any`, and `{topic, T, wakes-on}` for `noted.anyone:T` asked false.
 * The beat names its thing only from one positive condition every path to
 * which is `all`; otherwise it is the plain beat and every condition.
 */
describe('a beat names its thing only from a needed, positive condition', () => {
  const step = (
    beat: string,
    wakesOn: { kind: string; id: string },
    conditions: {
      id: string;
      is: string;
      op?: string;
      negated?: boolean;
      at: string;
    }[]
  ) => ({
    beat,
    reads: [{ ...wakesOn, role: 'wakes-on' }],
    conditions: conditions.map((c) => ({
      op: '',
      negated: false,
      ...c,
    })),
  });

  it('a fact under a `not` is not the thing the beat learns', () => {
    const s = step('fact', { kind: 'fact', id: 'gate-cowed' }, [
      { id: 'fact:gate-cowed', is: 'true', negated: true, at: 'when.not' },
    ]);
    expect(beatLabel(s, WORDS)).toBe(
      'learns a fact · has not learned gate-cowed'
    );
  });

  it('a fact inside an `any` is not the thing, and its branch is kept', () => {
    const s = step('fact', { kind: 'fact', id: 'gate-cowed' }, [
      { id: 'fact:gate-cowed', is: 'true', at: 'when.any[0]' },
      { id: 'within', is: '6', op: 'lte', at: 'when.any[1]' },
    ]);
    expect(beatLabel(s, WORDS)).toBe(
      'learns a fact · (has learned gate-cowed, or within 6 cells)'
    );
    expect(shortBeatLabel(s, WORDS)).toBe('learns a fact +2');
  });

  it('a topic asked false is not the thing the beat notes', () => {
    const s = step('topic', { kind: 'topic', id: 'admitted' }, [
      { id: 'noted.anyone:admitted', is: 'false', at: 'when' },
    ]);
    expect(beatLabel(s, WORDS)).toBe(
      'notes a topic about someone · has not noted admitted about anyone'
    );
  });

  it('the one needed positive fact is the thing, and is said once', () => {
    const s = step('fact', { kind: 'fact', id: 'gate-cowed' }, [
      { id: 'fact:gate-cowed', is: 'true', at: 'when.all[0]' },
      { id: 'within', is: '6', op: 'lte', at: 'when.all[1]' },
    ]);
    expect(beatLabel(s, WORDS)).toBe('learns gate-cowed · within 6 cells');
    expect(shortBeatLabel(s, WORDS)).toBe('learns gate-cowed +1');
  });

  it('two needed facts: neither is the thing, both are said', () => {
    const s = {
      ...step('fact', { kind: 'fact', id: 'gate-cowed' }, [
        { id: 'fact:gate-cowed', is: 'true', at: 'when.all[0]' },
        { id: 'fact:guards-turned', is: 'true', at: 'when.all[1]' },
      ]),
    };
    s.reads.push({ kind: 'fact', id: 'guards-turned', role: 'wakes-on' });
    expect(beatLabel(s, WORDS)).toBe(
      'learns a fact · has learned gate-cowed and has learned guards-turned'
    );
  });
});

describe('the watch’s drawings', () => {
  it('are in the words they are given, the same as the Behaviours drawing', () => {
    const member = {
      id: 'captain',
      cell: null,
      party: false,
      state: 'in-hall',
      roles: {},
    };
    const said = (words: typeof WORDS | null) =>
      machinesRunBy(castleMachinesV225ReadBack(), member, words)
        .flatMap((m) => m.layout.pieces)
        .map((p) => p.label.full);
    expect(said(WORDS)).toContain(
      'hears something · it was a claim that failed and has noted admitted about them'
    );
    expect(said(null)).toContain(
      'on heard: heard.claim failed, noted:admitted'
    );
  });
});

describe('the drawing’s frame', () => {
  it('shows the whole drawing’s height: it caps no height, so no lane below the last row is cut off', () => {
    // The captain's machine in plain words is 708 tall; a frame capped at
    // 60vh cut its lowest lane at the bottom edge (look at 70eb264c).
    const studioCss = readFileSync(
      'src/concepts/encounter-studio/encounterStudio.css',
      'utf8'
    );
    const rule = /\n\.es-machine\s*\{([^}]*)\}/.exec(studioCss)![1]!;
    expect(rule).not.toMatch(/max-height/);
    expect(rule).toMatch(/overflow-x:\s*auto/);
  });

  it('a drawn behaviour’s section grows with its drawing, and the list and detail keep a usable height', () => {
    const studioCss = readFileSync(
      'src/concepts/encounter-studio/encounterStudio.css',
      'utf8'
    );
    const section =
      /\[data-layout='list-detail'\] > \.es-behaviours\[data-drawn\]\s*\{([^}]*)\}/.exec(
        studioCss
      )![1]!;
    // It does not shrink to the panel: the panel scrolls as one.
    expect(section).toMatch(/flex:\s*1 0 auto/);
    expect(section).not.toMatch(/(^|[^-])height/);
    const below =
      /\.es-behaviours\[data-drawn\] > \.es-machine ~ \.es-list-detail[^{]*\{([^}]*)\}/.exec(
        studioCss
      )![1]!;
    expect(below).toMatch(/min-height:\s*26rem/);
  });
});
