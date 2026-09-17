/**
 * The registry's own exhaustiveness guard (rpg-dnd5e-web#1104).
 *
 * THIS IS THE TEST THE ISSUE ASKED FOR, and it is the half TypeScript cannot
 * supply: the `Verb` enum is GENERATED from the wire and grows without this
 * file being recompiled against it, so a verb the protos add is a verb the
 * table silently does not know until somebody walks it.
 *
 * A forgotten row used to be a dead button on Kirk's walk, with a different
 * symptom depending on which of six hand-written lists missed it. It is now a
 * red test here.
 */
import {
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  ALL_VERBS,
  isExecutableVerb,
  isFreeOnWorldClock,
  promptsForMember,
  SOCIAL_VERBS,
  VERB_REGISTRY,
} from './verbRegistry';

describe('the verb registry knows every verb the wire defines', () => {
  it('has a row for every value of the proto Verb enum', () => {
    const missing = ALL_VERBS.filter(
      (verb) => VERB_REGISTRY[verb] === undefined
    );
    expect(
      missing,
      'the protos added a verb with no registry row: add one in verbRegistry.ts, ' +
        'or the dock draws no button, or a button that arms and tears itself down'
    ).toEqual([]);
  });

  it('walks a non-trivial number of verbs — the guard cannot pass vacuously', () => {
    // Without this, a change that made ALL_VERBS empty would turn the
    // exhaustiveness check above into a test that can never fail.
    expect(ALL_VERBS.length).toBeGreaterThanOrEqual(10);
    expect(ALL_VERBS).toContain(Verb.PERSUADE);
    expect(ALL_VERBS).toContain(Verb.UNSPECIFIED);
  });

  it('gives every row a complete behavior, not a partial one', () => {
    for (const verb of ALL_VERBS) {
      const row = VERB_REGISTRY[verb];
      expect(typeof row.executable, `Verb ${verb} executable`).toBe('boolean');
      expect(typeof row.freeOnWorldClock, `Verb ${verb} freeOnWorldClock`).toBe(
        'boolean'
      );
      expect(
        row.arms === null || typeof row.arms === 'number',
        `Verb ${verb} arms`
      ).toBe(true);
    }
  });
});

describe('what the table says about each verb', () => {
  it('draws the priced rows and not the two that have their own surfaces', () => {
    expect(isExecutableVerb(Verb.ATTACK)).toBe(true);
    expect(isExecutableVerb(Verb.MOVE)).toBe(true);
    expect(isExecutableVerb(Verb.ACTIVATE)).toBe(true);
    expect(isExecutableVerb(Verb.CAST)).toBe(true);
    expect(isExecutableVerb(Verb.DEATH_SAVE)).toBe(true);
    expect(isExecutableVerb(Verb.INTIMIDATE)).toBe(true);
    expect(isExecutableVerb(Verb.PERSUADE)).toBe(true);

    // END_TURN has its own control and REACT is answered through the interrupt
    // window. Drawing either as a priced row would draw it twice.
    expect(isExecutableVerb(Verb.END_TURN)).toBe(false);
    expect(isExecutableVerb(Verb.REACT)).toBe(false);
  });

  it('draws nothing at all for a verb this build cannot name', () => {
    // The zero value telling the truth. The six label functions this registry
    // replaced defaulted an unknown verb to 'Move' and drew a row that was a
    // move that was not one.
    expect(isExecutableVerb(Verb.UNSPECIFIED)).toBe(false);
    expect(promptsForMember(Verb.UNSPECIFIED)).toBe(false);
    expect(isFreeOnWorldClock(Verb.UNSPECIFIED)).toBe(false);
  });

  it('knows which verbs arm and wait for a member the server named', () => {
    expect(promptsForMember(Verb.ATTACK)).toBe(true);
    expect(promptsForMember(Verb.ACTIVATE)).toBe(true);
    expect(promptsForMember(Verb.CAST)).toBe(true);
    expect(promptsForMember(Verb.INTIMIDATE)).toBe(true);
    expect(promptsForMember(Verb.PERSUADE)).toBe(true);

    // Move picks a path on its own surface and a death save has nobody to
    // point at: the click IS the whole interaction for both.
    expect(promptsForMember(Verb.MOVE)).toBe(false);
    expect(promptsForMember(Verb.DEATH_SAVE)).toBe(false);
    expect(VERB_REGISTRY[Verb.PERSUADE].arms).toBe(TargetKind.MEMBER);
  });

  it('treats an undefined verb as arming for nothing', () => {
    // The coherence check calls this with the armed declaration's verb, which
    // is undefined when nothing is armed. Answering true there would judge an
    // empty hand incoherent.
    expect(promptsForMember(undefined)).toBe(false);
  });

  it('marks exactly the social verbs free on the world clock (R3)', () => {
    expect(isFreeOnWorldClock(Verb.INTIMIDATE)).toBe(true);
    expect(isFreeOnWorldClock(Verb.PERSUADE)).toBe(true);

    // Every turn-economy verb spends a turn's budget and is not a world-clock
    // row. Move is deliberately not one either: free roam has its own
    // movement affordance rather than a dock row.
    expect(isFreeOnWorldClock(Verb.ATTACK)).toBe(false);
    expect(isFreeOnWorldClock(Verb.CAST)).toBe(false);
    expect(isFreeOnWorldClock(Verb.ACTIVATE)).toBe(false);
    expect(isFreeOnWorldClock(Verb.MOVE)).toBe(false);
  });

  it('derives SOCIAL_VERBS from the table rather than restating it', () => {
    // A seventh hand-written list is exactly what this file exists to prevent,
    // so the social list is derived. A third social verb joins it by adding
    // its row and nothing else.
    expect([...SOCIAL_VERBS].sort()).toEqual(
      [Verb.INTIMIDATE, Verb.PERSUADE].sort()
    );
  });
});
