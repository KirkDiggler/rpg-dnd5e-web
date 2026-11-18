/**
 * A SHOUTED ANSWER ROW KEEPS ITS LOUDNESS THROUGH THE ROW FORM
 * (rpg-project#936). The castle's gate guards answer `friends-inside` with a
 * shouted hint: `success[0]` carries `loudness: shout`. The row form edits
 * the row's words, weight and say; `loudness` it does not edit, and every
 * commit carries it as written.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnswerEntryRow } from './SitePolicies';

const hint = {
  say: 'The troupe? Aye, they’re inside.',
  loudness: 'shout',
};

function mount(entry: Record<string, unknown>) {
  const commit = vi.fn();
  render(
    <ul>
      <AnswerEntryRow
        trigger="success"
        label="gate-1 success"
        entry={entry}
        allowNoWord
        onCommit={commit}
        onRemove={() => {}}
      />
    </ul>
  );
  return commit;
}

describe('a shouted answer row through the row form (rpg-project#936)', () => {
  it('editing the words keeps the loudness', () => {
    const commit = mount(hint);
    fireEvent.change(screen.getByLabelText(/^Say/), {
      target: { value: 'Inside, the lot of them.' },
    });
    expect(commit).toHaveBeenLastCalledWith({
      say: 'Inside, the lot of them.',
      loudness: 'shout',
    });
  });

  it('editing the weight keeps the loudness', () => {
    const commit = mount(hint);
    fireEvent.change(screen.getByLabelText(/^Weight/), {
      target: { value: '2' },
    });
    expect(commit).toHaveBeenLastCalledWith({ ...hint, weight: 2 });
  });
});
