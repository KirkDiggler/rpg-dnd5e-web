import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { AnswerEntryShape } from './answerTableShape';
import { AnswerEntryRow } from './SitePolicies';

const thoughtful = 'dnd5e:activities:thoughtful';
function Editor({
  initial = { say: 'Let me think.', weight: 3 },
}: {
  initial?: AnswerEntryShape;
}) {
  const [entry, setEntry] = useState(initial);
  return (
    <>
      <ul>
        <AnswerEntryRow
          trigger="success"
          entry={entry}
          onCommit={setEntry}
          onRemove={() => {}}
        />
      </ul>
      <output aria-label="authored response">{JSON.stringify(entry)}</output>
    </>
  );
}
const authored = () =>
  JSON.parse(screen.getByLabelText('authored response').textContent!);

describe('say activity fields through the real answer editor', () => {
  it.each(['thoughtful', 'arms-folded', 'hands-on-hips', 'standing-prayer'])(
    'configures and clears %s without changing the line or weight',
    (name) => {
      const ref = `dnd5e:activities:${name}`;
      render(<Editor />);
      const select = screen.getByLabelText('Activity for success entry');
      expect(screen.queryByRole('option', { name: 'Walk' })).toBeNull();
      fireEvent.change(select, { target: { value: ref } });
      fireEvent.change(
        screen.getByLabelText('Sustain cycles for success entry'),
        { target: { value: '2' } }
      );
      expect(authored()).toEqual({
        say: 'Let me think.',
        weight: 3,
        activity: { ref, cycles: 2 },
      });
      fireEvent.change(
        screen.getByLabelText('Say (optional) for success entry'),
        { target: { value: 'I remember now.' } }
      );
      expect(authored().activity).toEqual({ ref, cycles: 2 });
      fireEvent.change(select, { target: { value: '' } });
      expect(authored()).toEqual({ say: 'I remember now.', weight: 3 });
    }
  );

  it('does not replace an imported unsupported reference', () => {
    render(
      <Editor
        initial={{
          say: 'Hello.',
          activity: { ref: 'future:activity:bow', cycles: 4 },
        }}
      />
    );
    expect(
      (screen.getByLabelText('Activity for success entry') as HTMLSelectElement)
        .value
    ).toBe('future:activity:bow');
    expect(screen.getByText(/Unavailable activity/)).toBeTruthy();
    expect(authored().activity).toEqual({
      ref: 'future:activity:bow',
      cycles: 4,
    });
  });

  it('does not commit a zero or fractional cycle count', () => {
    render(
      <Editor
        initial={{ say: 'Hello.', activity: { ref: thoughtful, cycles: 2 } }}
      />
    );
    const cycles = screen.getByLabelText('Sustain cycles for success entry');
    for (const value of ['0', '1.5', '4294967296']) {
      fireEvent.change(cycles, { target: { value } });
      expect(authored().activity.cycles).toBe(2);
    }
  });
});
