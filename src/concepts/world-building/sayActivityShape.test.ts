import { describe, expect, it } from 'vitest';
import { validateAnswerRows, validateOptions } from './answerTableShape';

const read = (row: unknown) =>
  validateAnswerRows([row], 'response', 'success')[0];

describe('say activity authoring', () => {
  it('carries the selected response cue through the actual option reader', () => {
    const result = validateOptions(
      [
        {
          id: 'ask',
          say: 'What happened?',
          check: [{ ability: 'persuasion', dc: 5 }],
          success: [
            {
              say: 'Let me think.',
              activity: { ref: 'dnd5e:activities:thoughtful', cycles: 2 },
            },
          ],
        },
      ],
      'options',
      false
    );
    expect(result[0].success).toEqual([
      {
        say: 'Let me think.',
        activity: { ref: 'dnd5e:activities:thoughtful', cycles: 2 },
      },
    ]);
  });

  it('leaves an ordinary response unchanged', () => {
    expect(read({ say: 'Hello.' })).toEqual({ say: 'Hello.' });
  });

  it('preserves an unknown reference for provider diagnostics, without substituting it', () => {
    expect(
      read({
        say: 'Hello.',
        activity: { ref: 'future:activity:bow', cycles: 1 },
      })
    ).toEqual({
      say: 'Hello.',
      activity: { ref: 'future:activity:bow', cycles: 1 },
    });
  });

  it.each([0, -1, 1.5, 4294967296, NaN, Infinity, '2', null, undefined])(
    'rejects an invalid sustain count %s at its field',
    (cycles) => {
      expect(() =>
        read({ say: 'Thinking.', activity: { ref: 'thoughtful', cycles } })
      ).toThrow(/response\[0\].activity.cycles/);
    }
  );

  it.each(['', null, undefined, 2])(
    'rejects a missing or invalid reference %s',
    (ref) => {
      expect(() =>
        read({ say: 'Thinking.', activity: { ref, cycles: 2 } })
      ).toThrow(/response\[0\].activity.ref/);
    }
  );

  it('does not silently turn a null cue into absence', () => {
    expect(() => read({ say: 'Thinking.', activity: null })).toThrow(
      /activity/
    );
  });

  it('refuses a cue without a spoken line even when the row has a deed', () => {
    expect(() =>
      read({ fact: 'known', activity: { ref: 'thoughtful', cycles: 2 } })
    ).toThrow(/activity.*say/);
    expect(() =>
      read({ say: '', activity: { ref: 'thoughtful', cycles: 2 } })
    ).toThrow(/activity.*say/);
  });

  it('refuses unknown cue fields instead of dropping authored intent', () => {
    expect(() =>
      read({
        say: 'Thinking.',
        activity: { ref: 'thoughtful', cycles: 2, delay: 1 },
      })
    ).toThrow(/activity.*delay/);
  });

  it('does not attach a cue to a bundle invocation instead of its selected leaf', () => {
    expect(() =>
      read({ use: 'greeting', activity: { ref: 'thoughtful', cycles: 2 } })
    ).toThrow(/activity/);
  });
});
