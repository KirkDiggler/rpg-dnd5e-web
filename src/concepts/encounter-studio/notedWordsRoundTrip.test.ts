/**
 * ADMISSION IS A TOPIC NOTED, AUTHORED (rpg-project#928; the noted words,
 * rpg-project#1005). The served castle carries an interaction's `outcomes`
 * that `give` a topic, a line that `requires` one (`noted`), and posts
 * whose `pass` is one; the studio loads each, writes each
 * back byte for byte, and edits only the lines its two controls own.
 */
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { linesOf } from '../world-building/answerTableShape';
import {
  giveOf,
  grantedTopics,
  outcomesOf,
  recipeStates,
  setInteractionOutcomes,
  withEntryRemoved,
  withGiveAdded,
  withHeard,
  withTopic,
} from '../world-building/interactionOutcomes';
import {
  bindingPosts,
  passForm,
  setBindingPostPass,
} from '../world-building/postPass';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import posts from './fixtures/the-mad-king-posts.yaml?raw';
import served from './fixtures/the-mad-king-served.yaml?raw';

function read(text: string) {
  const result = readDraftYaml(text);
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

/** Every line of `b` that differs from the same line of `a`. */
function changedLines(a: string, b: string): string[] {
  const left = a.split('\n');
  return b.split('\n').filter((line, i) => line !== left[i]);
}

/** The text with one fragment replaced, required to be there once. */
function edited(text: string, from: string, to: string): string {
  expect(text.split(from)).toHaveLength(2);
  return text.replace(from, to);
}

const roundTrips = (text: string) => {
  const result = read(text);
  expect(exportDraftYaml(result, result.key)).toBe(text);
  return result;
};

type Parsed = {
  interactions: Record<string, { outcomes?: unknown; recipe: unknown }>;
  room: {
    room: {
      monsterBindings: Record<
        string,
        { posts?: Record<string, { pass?: unknown }> }
      >;
    };
  };
};

/** The castle's arrest (rpg-project#925): an outcome the outcomes form
 * cannot say, carried through every edit of its neighbours. */
const ARREST = {
  arrest: {
    cell: 'region-cells',
    area: {
      regions: ['region-gatehouse'],
      cells: [
        { r: 13, q: [[-8, -5]] },
        { r: 14, q: [[-8, -6]] },
      ],
    },
  },
};

/** The castle's jail (rpg-project#925): the `jailed` outcome, kept as written
 * like the arrest beside it. */
const JAIL = {
  jail: {
    words: 'The guards march you to the cells.',
    rounds: 5,
    escaped: 'prisoners-escaped',
  },
};

describe('the noted grammar loads and writes back (rpg-project#928, #1005)', () => {
  it('the served castle carries every new field, and an unedited download is byte-identical', () => {
    const doc = parse(served) as Parsed;
    expect(doc.interactions['front-gate'].outcomes).toEqual({
      admitted: [
        {
          give: {
            topic: 'admitted',
            to: 'spoken_to',
            about: 'party_in_sight',
            heard_by: 'carriers_who_witnessed',
          },
        },
      ],
      arrested: [ARREST],
      jailed: [JAIL],
    });
    for (const id of ['gate-1', 'gate-2', 'captain'])
      for (const post of Object.values(
        doc.room.room.monsterBindings[id].posts!
      ))
        expect(post.pass).toEqual({ noted: 'admitted' });
    expect(served).toContain('              noted: admitted\n');
    expect(served).toContain('        behaviorState: policy\n');
    const result = roundTrips(served);
    expect(grantedTopics(result.scope)).toEqual(['admitted']);
  });

  it.each([
    [
      'a line that requires a topic noted',
      '            requires:\n              noted: admitted\n',
      '            requires:\n              noted: welcome\n',
    ],
    [
      'a line that requires its absence',
      '            requires:\n              noted: admitted\n',
      '            requires:\n              not:\n                noted: admitted\n',
    ],
    [
      'a line that requires it in a list',
      '            requires:\n              noted: admitted\n',
      '            requires:\n              - noted: admitted\n              - fact: feast-tonight\n',
    ],
    [
      'a binding post whose pass is a password',
      '          ready:\n            door: gate-wall-door\n            against: entering\n            pass: { noted: admitted }\n            at:\n              - q: -4\n',
      '          ready:\n            door: gate-wall-door\n            against: entering\n            pass: troupe-password\n            at:\n              - q: -4\n',
    ],
    [
      'a binding post whose pass is a list',
      '          ready:\n            door: gate-wall-door\n            against: entering\n            pass: { noted: admitted }\n            at:\n              - q: -4\n',
      '          ready:\n            door: gate-wall-door\n            against: entering\n            pass: [{ noted: admitted }, { fact: feast-tonight }]\n            at:\n              - q: -4\n',
    ],
    [
      'a binding post whose pass is a not',
      '          ready:\n            door: gate-wall-door\n            against: entering\n            pass: { noted: admitted }\n            at:\n              - q: -4\n',
      '          ready:\n            door: gate-wall-door\n            against: entering\n            pass: { not: { fact: caught-in-kitchen } }\n            at:\n              - q: -4\n',
    ],
    [
      'an outcome heard by nobody else',
      '\n            heard_by: carriers_who_witnessed\n',
      '\n',
    ],
    [
      'an outcome of a kind this build does not know',
      '        - give:\n',
      '        - announce: { to: garrison }\n        - give:\n',
    ],
    [
      'a give with a word this build does not know',
      '\n            to: spoken_to\n',
      '\n            to: everyone\n',
    ],
  ])('%s loads and writes back byte for byte', (_name, from, to) => {
    roundTrips(edited(served, from, to));
  });

  it.each([
    ['a password', 'pass: troupe-admitted }', 'pass: troupe-admitted }'],
    ['a topic noted', 'pass: troupe-admitted }', 'pass: { noted: admitted } }'],
    [
      'a list',
      'pass: troupe-admitted }',
      'pass: [{ noted: admitted }, { fact: feast-tonight }] }',
    ],
    [
      'a not',
      'pass: troupe-admitted }',
      'pass: { not: { noted: admitted } } }',
    ],
  ])(
    'a state’s post whose pass is %s loads and writes back byte for byte',
    (_name, from, to) => {
      // Every state of gate-1 posts the same pass; each is rewritten.
      const text = posts.replaceAll(from, to);
      expect(text.includes(to)).toBe(true);
      const result = roundTrips(text);
      const states = result.draft.room.monsterBindings!['gate-1'].states!;
      const posted = states.posted as { post?: { pass?: unknown } };
      expect(posted.post?.pass).toEqual(
        parse(text).room.room.monsterBindings['gate-1'].states.posted.post.pass
      );
    }
  );
});

describe('the gate’s outcome edits only its own lines (rpg-project#928)', () => {
  const outcomesAfter = (
    edit: (
      outcomes: ReturnType<typeof outcomesOf>
    ) => ReturnType<typeof outcomesOf>
  ) => {
    const result = read(served);
    const scope = setInteractionOutcomes(
      result.scope,
      'front-gate',
      edit(outcomesOf(result.scope, 'front-gate'))
    );
    return exportDraftYaml({ draft: result.draft, scope }, result.key);
  };

  it('reads the give in plain words, and the recipe’s states', () => {
    const result = read(served);
    const outcomes = outcomesOf(result.scope, 'front-gate');
    expect(giveOf(outcomes.admitted[0])).toEqual({
      topic: 'admitted',
      to: 'spoken_to',
      about: 'party_in_sight',
      heard: true,
    });
    expect(recipeStates(result.scope, 'front-gate')).toEqual(
      expect.arrayContaining(['fresh', 'admitted', 'arrested'])
    );
  });

  it('changing the topic rewrites its own line and nothing else', () => {
    const saved = outcomesAfter((o) => withTopic(o, 'admitted', 0, 'welcome'));
    expect(changedLines(served, saved)).toEqual(['            topic: welcome']);
    roundTrips(saved);
  });

  it('heard by nobody else drops its own line and nothing else', () => {
    const saved = outcomesAfter((o) => withHeard(o, 'admitted', 0, false));
    expect(saved).toBe(
      served.replace('\n            heard_by: carriers_who_witnessed\n', '\n')
    );
    roundTrips(saved);
  });

  it('adding a give to another state and removing it again', () => {
    const added = outcomesAfter((o) =>
      withGiveAdded(o, 'arrested', 'prisoner')
    );
    const after = parse(added) as Parsed;
    expect(after.interactions['front-gate'].outcomes).toMatchObject({
      arrested: [
        ARREST,
        {
          give: {
            topic: 'prisoner',
            to: 'spoken_to',
            about: 'party_in_sight',
            heard_by: 'carriers_who_witnessed',
          },
        },
      ],
      jailed: [JAIL],
    });
    expect(after.interactions['front-gate'].recipe).toEqual(
      (parse(served) as Parsed).interactions['front-gate'].recipe
    );
    const again = read(added);
    const removed = setInteractionOutcomes(
      again.scope,
      'front-gate',
      withEntryRemoved(outcomesOf(again.scope, 'front-gate'), 'arrested', 1)
    );
    expect(
      parse(exportDraftYaml({ draft: again.draft, scope: removed }, again.key))
        .interactions['front-gate'].outcomes
    ).toEqual((parse(served) as Parsed).interactions['front-gate'].outcomes);
  });

  it('removing a state’s only outcome drops that state and keeps the arrest and the jail in place (rpg-project#925)', () => {
    const saved = outcomesAfter((o) => withEntryRemoved(o, 'admitted', 0));
    const after = parse(saved) as Parsed;
    expect(after.interactions['front-gate'].outcomes).toEqual({
      arrested: [ARREST],
      jailed: [JAIL],
    });
    roundTrips(saved);
  });

  it('the castle’s arrest and jail survive an edit of the admitted give, byte for byte (rpg-project#925)', () => {
    const saved = outcomesAfter((o) => withTopic(o, 'admitted', 0, 'welcome'));
    const block = served.slice(
      served.indexOf('      # Hand edit (rpg-project#925, ruled 2026-11-13)'),
      served.indexOf('    recipe:\n      ref: site:interactions:front-gate')
    );
    expect(block).toContain('      arrested:\n        - arrest:\n');
    expect(block).toContain('      jailed:\n        - jail:\n');
    expect(saved).toContain(block);
    // The garrison's escape row and each gate speaker's quiet line ride
    // along untouched (rpg-project#925).
    expect(saved).toContain(
      '      - {fact: prisoners-escaped, then: hostile}\n'
    );
    expect(saved.split('say: We’ll come quietly.').length - 1).toBe(3);
    // The refusal line with its shouted answer, the garrison's row for it,
    // and the jail's step back into itself (rpg-project#925).
    expect(saved.split('say: You will never take me alive.').length - 1).toBe(
      3
    );
    expect(
      saved.split(
        '                loudness: shout\n                fact: refused-arrest\n'
      ).length - 1
    ).toBe(3);
    expect(saved).toContain('      - {fact: refused-arrest, then: hostile}\n');
    expect(saved).toContain(
      '            - { on: came-quietly, to: jailed, reason: another arrested went quietly }\n'
    );
    expect(
      Object.keys(
        (parse(saved) as Parsed).interactions['front-gate'].outcomes as object
      )
    ).toEqual(['admitted', 'arrested', 'jailed']);
  });

  it('removing the last outcome drops the key and keeps the interaction', () => {
    const saved = outcomesAfter((o) =>
      withEntryRemoved(
        withEntryRemoved(withEntryRemoved(o, 'admitted', 0), 'arrested', 0),
        'jailed',
        0
      )
    );
    const after = parse(saved) as Parsed;
    expect(after.interactions['front-gate']).not.toHaveProperty('outcomes');
    expect(after.interactions['front-gate'].recipe).toEqual(
      (parse(served) as Parsed).interactions['front-gate'].recipe
    );
  });

  it('an unknown consequence is kept through an edit of its neighbour', () => {
    const text = edited(
      served,
      '        - give:\n',
      '        - announce: { to: garrison }\n        - give:\n'
    );
    const result = read(text);
    const outcomes = outcomesOf(result.scope, 'front-gate');
    expect(giveOf(outcomes.admitted[0])).toBeUndefined();
    const scope = setInteractionOutcomes(
      result.scope,
      'front-gate',
      withTopic(outcomes, 'admitted', 1, 'welcome')
    );
    const saved = exportDraftYaml({ draft: result.draft, scope }, result.key);
    expect(changedLines(text, saved)).toEqual(['            topic: welcome']);
  });
});

describe('a post’s pass edits only its own line (rpg-project#928)', () => {
  it('a binding post switches from a topic to a password and back', () => {
    const result = read(served);
    const binding = result.draft.room.monsterBindings!.captain;
    expect(passForm(bindingPosts(binding).ready.pass)).toEqual({
      kind: 'noted',
      topic: 'admitted',
    });
    const draft = structuredClone(result.draft);
    draft.room.monsterBindings!.captain = setBindingPostPass(
      binding,
      'ready',
      'troupe-password'
    )!;
    const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
    expect(changedLines(served, saved)).toEqual([
      '            pass: troupe-password',
    ]);
    const again = read(saved);
    const back = structuredClone(again.draft);
    back.room.monsterBindings!.captain = setBindingPostPass(
      again.draft.room.monsterBindings!.captain,
      'ready',
      { noted: 'admitted' }
    )!;
    expect(
      exportDraftYaml({ draft: back, scope: again.scope }, again.key)
    ).toBe(served);
  });
});

describe('every noted word survives an edit of a neighbour (rpg-project#1005)', () => {
  /** The castle with one line's words changed through the draft, written
   * out: only that line may differ. */
  function withSayChanged(text: string, from: string, to: string): string {
    const result = read(text);
    const draft = structuredClone(result.draft);
    let changed = 0;
    for (const binding of Object.values(draft.room.monsterBindings ?? {}))
      for (const option of linesOf(binding.options))
        for (const row of [
          ...(option.success ?? []),
          ...(option.failure ?? []),
        ])
          if (row.say === from) {
            row.say = to;
            changed += 1;
          }
    expect(changed).toBeGreaterThan(0);
    return exportDraftYaml({ draft, scope: result.scope }, result.key);
  }

  it.each([
    ['noted, on a requirement', '              - noted: admitted\n'],
    ['noted, inside a not', '                  noted: wanted\n'],
    ['noted, on a pass', '            pass: { noted: admitted }\n'],
    [
      'give, on a row',
      '                give:\n                  topic: admitted\n                  to: spoken_to\n',
    ],
    [
      'give, on an outcome',
      '        - give:\n            topic: admitted\n            to: spoken_to\n',
    ],
    ['carries', '              carries: purse\n'],
    [
      'noted.anyone, on a guard',
      '                  name: noted.anyone:admitted\n',
    ],
  ])('the served castle keeps %s', (_name, words) => {
    expect(served).toContain(words);
    const saved = withSayChanged(
      served,
      'Evening. Keep to the road and mind the guards.',
      'Evening.'
    );
    expect(changedLines(served, saved)).toEqual([
      '              - say: Evening.',
    ]);
    expect(saved).toContain(words);
    roundTrips(saved);
  });

  it('a state’s post survives an edit of a neighbour', () => {
    const post =
      '            post: { door: gate-wall-door, at: [{ q: -3, r: 7 }, { q: -4, r: 7 }], against: entering, pass: troupe-admitted }\n';
    expect(posts.split(post)).toHaveLength(3);
    roundTrips(posts);
    const result = read(posts);
    const states = result.draft.room.monsterBindings!['gate-1'].states!;
    expect((states.posted as { post?: unknown }).post).toMatchObject({
      door: 'gate-wall-door',
      against: 'entering',
      pass: 'troupe-admitted',
    });
    const saved = withSayChanged(
      posts,
      'Through to the hall, then. Don’t dawdle.',
      'Through to the hall.'
    );
    expect(changedLines(posts, saved)).toEqual([
      '              - say: Through to the hall.',
    ]);
    expect(saved.split(post)).toHaveLength(3);
  });
});
