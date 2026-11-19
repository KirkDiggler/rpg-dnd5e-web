/**
 * Where the compiler's refusals of the noted grammar land
 * (rpg-project#928; the noted words, rpg-project#1005). The studio does not judge these fields: the
 * validate-only PutDungeon does, and its `FieldError` paths open the noun
 * that holds them. Paths and sentences are the compiler's (rpg-toolkit
 * dungeonspec `outcomesOf`, `optionRequires`, `passRefusal`, at encounter v0.222.1).
 */
import { describe, expect, it } from 'vitest';
import { readDraftYaml } from './draftFile';
import served from './fixtures/the-mad-king-served.yaml?raw';
import { refusalJumps } from './refusalJump';

function document() {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return { draft: read.draft, scope: read.scope };
}

describe('the noted refusals land at their nouns', () => {
  it.each([
    [
      'an unknown word on an outcome',
      'interactions.front-gate.outcomes.admitted[0].give.to',
      'a topic is given `to: spoken_to`, the creature the line was said to',
      { kind: 'home', section: 'interactions', id: 'front-gate' },
    ],
    [
      'an outcome on a state the recipe lacks',
      'interactions.front-gate.outcomes.welcomed',
      '"welcomed" is not a state of this interaction\'s recipe',
      { kind: 'home', section: 'interactions', id: 'front-gate' },
    ],
    [
      'a line asking for a topic nothing gives',
      'room.room.monsterBindings.captain.options[6].requires.noted',
      '"welcome" is a topic no interaction\'s `outcomes` and no line\'s row gives, so nobody could ever have noted it about anyone',
      { kind: 'creature', id: 'captain' },
    ],
    [
      'a pass asking for a topic nothing gives',
      'room.room.monsterBindings.gate-2.posts.ready.pass.noted',
      '"welcome" is a topic no interaction\'s `outcomes` and no line\'s row gives, so nobody could ever have noted it about anyone',
      { kind: 'creature', id: 'gate-2' },
    ],
  ])('%s', (_name, path, message, target) => {
    const [jump] = refusalJumps([{ path, message }], document());
    expect(jump).toEqual({ path, message, target });
  });

  it('an interaction the document does not author is a sentence', () => {
    const [jump] = refusalJumps(
      [{ path: 'interactions.back-gate.outcomes', message: 'refused' }],
      document()
    );
    expect(jump!.target).toBeNull();
  });
});
