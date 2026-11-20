/**
 * A line card's face from the engine's structure (rpg-project#1030): every
 * negatable requirement reads true. The engine marks a negated topic on its
 * connection (`negated`), but a negated fact, prop or conversation carries
 * the same `asks` connection as the plain one (rpg-toolkit `triggerWords`,
 * `TriggerNot`), so the face reads the draft's `<requires[k]>.not` at the
 * engine's path. Each statement here has the shape the engine gives.
 */
import { create } from '@bufbuild/protobuf';
import {
  ReadBackConnectionSchema,
  ReadBackStatementSchema,
  type ReadBackStatement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import { difficultyOf, lineFaceOf, type FacePart } from './lineFace';
import type { LineReadBack } from './sharedLinesView';

const LINE = 'conversations.talk.lines[0]';
const AT = `${LINE}.requires[0]`;

function requirement(
  connects: { kind: string; id: string; role: string; negated?: boolean }[]
): ReadBackStatement {
  return create(ReadBackStatementSchema, {
    kind: 'line.requires',
    path: AT,
    sentence: 'The engine’s sentence.',
    about: { kind: 'shared-lines', id: 'talk' },
    connects: connects.map((c) => create(ReadBackConnectionSchema, c)),
  });
}

const read = (offered: ReadBackStatement): LineReadBack => ({
  line: [],
  offered: [offered],
  check: [],
  advance: [],
  pass: [],
  miss: [],
  more: [],
});

/** The draft's values, by the paths the face asks for. */
const draft =
  (values: Record<string, unknown>) =>
  (path: string): unknown =>
    values[path];

const words = (parts: readonly FacePart[]): string =>
  parts.map((part) => (typeof part === 'string' ? part : part.id)).join('');

const clause = (
  statement: ReadBackStatement,
  values: Record<string, unknown>
): string => {
  const face = lineFaceOf(read(statement), LINE, draft(values));
  expect(face.offered).toHaveLength(1);
  return words(face.offered[0]!.parts);
};

describe('every negatable requirement reads true (rpg-project#1030 review)', () => {
  it('a fact: knows, and under `not` does not know', () => {
    const asks = requirement([{ kind: 'fact', id: 'feast', role: 'asks' }]);
    expect(clause(asks, { [AT]: { fact: 'feast' } })).toBe('knows feast');
    expect(
      clause(asks, { [AT]: { not: { fact: 'feast' } }, [`${AT}.not`]: {} })
    ).toBe('does not know feast');
  });

  it('a prop: carries, and under `not` does not carry', () => {
    const asks = requirement([{ kind: 'prop', id: 'key', role: 'asks' }]);
    expect(clause(asks, {})).toBe('carries key');
    expect(clause(asks, { [`${AT}.not`]: { carries: 'key' } })).toBe(
      'does not carry key'
    );
  });

  it('a conversation: is in its states, and under `not` is not, its states read under `not`', () => {
    const asks = requirement([
      { kind: 'conversation', id: 'front-gate', role: 'asks' },
    ]);
    expect(
      clause(asks, { [`${AT}.interaction.in`]: ['fresh', 'warned-guest'] })
    ).toBe('front-gate is fresh or warned-guest');
    expect(
      clause(asks, {
        [`${AT}.not`]: { interaction: { id: 'front-gate' } },
        [`${AT}.not.interaction.in`]: ['fresh', 'warned-guest'],
      })
    ).toBe('front-gate is not fresh or warned-guest');
  });

  it('a noted topic: by the engine’s `negated`, or by the draft’s `not`', () => {
    const plain = requirement([
      { kind: 'topic', id: 'turned-away', role: 'asks' },
      { kind: 'who', id: 'the_speaker', role: 'about' },
    ]);
    expect(clause(plain, {})).toBe(
      'listener has noted turned-away about the speaker'
    );
    const negated = requirement([
      { kind: 'topic', id: 'turned-away', role: 'asks', negated: true },
      { kind: 'who', id: 'the_speaker', role: 'about' },
    ]);
    expect(clause(negated, {})).toBe(
      'listener has not noted turned-away about the speaker'
    );
    expect(clause(plain, { [`${AT}.not`]: { noted: 'turned-away' } })).toBe(
      'listener has not noted turned-away about the speaker'
    );
  });
});

describe('a difficulty typed on a card', () => {
  it('is a whole number, 0 or more, or nothing written', () => {
    expect(difficultyOf('13')).toBe(13);
    expect(difficultyOf('0')).toBe(0);
    for (const typed of ['', ' ', '-3', '12.5', '1e1', 'ten'])
      expect(difficultyOf(typed)).toBeNull();
  });
});
