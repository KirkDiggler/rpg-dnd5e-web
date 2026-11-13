/**
 * ADMISSION IS RECOGNITION, AUTHORED (rpg-project#928). The served castle
 * carries an interaction's `outcomes`, a line that `requires` recognition,
 * and posts whose `pass` is a recognition; the studio loads each, writes each
 * back byte for byte, and edits only the lines its two controls own.
 */
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  grantedTopics,
  outcomesOf,
  recipeStates,
  recognizeOf,
  setInteractionOutcomes,
  withEntryRemoved,
  withHeard,
  withRecognizeAdded,
  withTopic,
} from '../world-building/interactionOutcomes';
import {
  bindingPosts,
  passForm,
  setBindingPostPass,
} from '../world-building/postPass';
import { patchStateHolds } from '../world-building/statePostEdits';
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

describe('the recognition grammar loads and writes back (rpg-project#928)', () => {
  it('the served castle carries every new field, and an unedited download is byte-identical', () => {
    const doc = parse(served) as Parsed;
    expect(doc.interactions['front-gate'].outcomes).toEqual({
      admitted: [
        {
          recognize: {
            topic: 'admitted',
            holder: 'spoken_to',
            about: 'party_in_sight',
            heard_by: 'carriers_who_witnessed',
          },
        },
      ],
      arrested: [ARREST],
    });
    for (const id of ['gate-1', 'gate-2', 'captain'])
      for (const post of Object.values(
        doc.room.room.monsterBindings[id].posts!
      ))
        expect(post.pass).toEqual({ recognized: 'admitted' });
    expect(served).toContain('              recognized: admitted\n');
    expect(served).toContain('        behaviorState: policy\n');
    const result = roundTrips(served);
    expect(grantedTopics(result.scope)).toEqual(['admitted']);
  });

  it.each([
    [
      'a line that requires recognition',
      '            requires:\n              recognized: admitted\n',
      '            requires:\n              recognized: welcome\n',
    ],
    [
      'a line that requires its absence',
      '            requires:\n              recognized: admitted\n',
      '            requires:\n              not:\n                recognized: admitted\n',
    ],
    [
      'a line that requires it in a list',
      '            requires:\n              recognized: admitted\n',
      '            requires:\n              - recognized: admitted\n              - fact: feast-tonight\n',
    ],
    [
      'a binding post whose pass is a password',
      '            pass: { recognized: admitted }\n            at:\n              - q: -4\n',
      '            pass: troupe-password\n            at:\n              - q: -4\n',
    ],
    [
      'a binding post whose pass is a list',
      '            pass: { recognized: admitted }\n            at:\n              - q: -4\n',
      '            pass: [{ recognized: admitted }, { fact: feast-tonight }]\n            at:\n              - q: -4\n',
    ],
    [
      'a binding post whose pass is a not',
      '            pass: { recognized: admitted }\n            at:\n              - q: -4\n',
      '            pass: { not: { fact: caught-in-kitchen } }\n            at:\n              - q: -4\n',
    ],
    [
      'an outcome heard by nobody else',
      '\n            heard_by: carriers_who_witnessed\n',
      '\n',
    ],
    [
      'an outcome of a kind this build does not know',
      '        - recognize:\n',
      '        - announce: { to: garrison }\n        - recognize:\n',
    ],
    [
      'a recognize with a word this build does not know',
      '\n            holder: spoken_to\n',
      '\n            holder: everyone\n',
    ],
  ])('%s loads and writes back byte for byte', (_name, from, to) => {
    roundTrips(edited(served, from, to));
  });

  it.each([
    ['a password', 'pass: troupe-admitted }', 'pass: troupe-admitted }'],
    [
      'a recognition',
      'pass: troupe-admitted }',
      'pass: { recognized: admitted } }',
    ],
    [
      'a list',
      'pass: troupe-admitted }',
      'pass: [{ recognized: admitted }, { fact: feast-tonight }] }',
    ],
    [
      'a not',
      'pass: troupe-admitted }',
      'pass: { not: { recognized: admitted } } }',
    ],
  ])(
    'a state’s post whose pass is %s loads and writes back byte for byte',
    (_name, from, to) => {
      // Every state of gate-1 posts the same pass; each is rewritten.
      const text = posts.replaceAll(from, to);
      expect(text.includes(to)).toBe(true);
      const result = roundTrips(text);
      const states = result.draft.room.monsterBindings!['gate-1'].states!;
      const posted = states.posted as { holds?: { pass?: unknown } };
      expect(posted.holds?.pass).toEqual(
        parse(text).room.room.monsterBindings['gate-1'].states.posted.holds.pass
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

  it('reads the recognize in plain words, and the recipe’s states', () => {
    const result = read(served);
    const outcomes = outcomesOf(result.scope, 'front-gate');
    expect(recognizeOf(outcomes.admitted[0])).toEqual({
      topic: 'admitted',
      holder: 'spoken_to',
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

  it('adding a recognize to another state and removing it again', () => {
    const added = outcomesAfter((o) =>
      withRecognizeAdded(o, 'arrested', 'prisoner')
    );
    const after = parse(added) as Parsed;
    expect(after.interactions['front-gate'].outcomes).toMatchObject({
      arrested: [
        ARREST,
        {
          recognize: {
            topic: 'prisoner',
            holder: 'spoken_to',
            about: 'party_in_sight',
            heard_by: 'carriers_who_witnessed',
          },
        },
      ],
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

  it('removing a state’s only outcome drops that state and keeps the arrest in place (rpg-project#925)', () => {
    const saved = outcomesAfter((o) => withEntryRemoved(o, 'admitted', 0));
    const after = parse(saved) as Parsed;
    expect(after.interactions['front-gate'].outcomes).toEqual({
      arrested: [ARREST],
    });
    roundTrips(saved);
  });

  it('the castle’s arrest survives an edit of the admitted recognition, byte for byte (rpg-project#925)', () => {
    const saved = outcomesAfter((o) => withTopic(o, 'admitted', 0, 'welcome'));
    const block = served.slice(
      served.indexOf('      # Hand edit (rpg-project#925'),
      served.indexOf('    recipe:\n      ref: site:interactions:front-gate')
    );
    expect(block).toContain('      arrested:\n        - arrest:\n');
    expect(saved).toContain(block);
    expect(
      Object.keys(
        (parse(saved) as Parsed).interactions['front-gate'].outcomes as object
      )
    ).toEqual(['admitted', 'arrested']);
  });

  it('removing the last outcome drops the key and keeps the interaction', () => {
    const saved = outcomesAfter((o) =>
      withEntryRemoved(withEntryRemoved(o, 'admitted', 0), 'arrested', 0)
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
      '        - recognize:\n',
      '        - announce: { to: garrison }\n        - recognize:\n'
    );
    const result = read(text);
    const outcomes = outcomesOf(result.scope, 'front-gate');
    expect(recognizeOf(outcomes.admitted[0])).toBeUndefined();
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
  it('a binding post switches from recognition to a password and back', () => {
    const result = read(served);
    const binding = result.draft.room.monsterBindings!.captain;
    expect(passForm(bindingPosts(binding).ready.pass)).toEqual({
      kind: 'recognized',
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
      { recognized: 'admitted' }
    )!;
    expect(
      exportDraftYaml({ draft: back, scope: again.scope }, again.key)
    ).toBe(served);
  });

  it('a state’s post switches from a password to recognition', () => {
    const result = read(posts);
    const draft = structuredClone(result.draft);
    const binding = draft.room.monsterBindings!['gate-1'];
    binding.states = patchStateHolds(binding.states!, 'posted', {
      pass: { recognized: 'admitted' },
    });
    const saved = exportDraftYaml({ draft, scope: result.scope }, result.key);
    const after = parse(saved).room.room.monsterBindings['gate-1'].states;
    expect(after.posted.holds.pass).toEqual({ recognized: 'admitted' });
    expect(after.alert).toEqual(
      parse(posts).room.room.monsterBindings['gate-1'].states.alert
    );
    roundTrips(saved);
  });
});
