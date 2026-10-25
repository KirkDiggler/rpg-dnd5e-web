import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RecordFeedSnapshot } from '../recordFeed';
import { StoryLog } from './StoryLog';

const record = { rows: [], notice: undefined };

function renderLog(
  mode: 'story' | 'debug',
  onShown: (shown: boolean) => void,
  feed: RecordFeedSnapshot = record
) {
  return render(
    <StoryLog
      story={[]}
      record={feed}
      onRecordShownChange={onShown}
      mode={mode}
      streamState="live"
      onModeChange={() => {}}
      diagnosticsEnabled
    />
  );
}

describe('StoryLog record visibility', () => {
  it('says the record is shown only in Debug with the log expanded', () => {
    const onShown = vi.fn();
    renderLog('debug', onShown);
    expect(onShown).toHaveBeenLastCalledWith(true);

    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse combat log' })
    );
    expect(onShown).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Expand combat log' }));
    expect(onShown).toHaveBeenLastCalledWith(true);
  });

  it('says the record is no longer shown when the log unmounts', () => {
    const onShown = vi.fn();
    const { unmount } = renderLog('debug', onShown);
    expect(onShown).toHaveBeenLastCalledWith(true);
    unmount();
    expect(onShown).toHaveBeenLastCalledWith(false);
  });

  it('says it is not shown in Story mode', () => {
    const onShown = vi.fn();
    renderLog('story', onShown);
    expect(onShown).toHaveBeenLastCalledWith(false);
  });

  // rpg-project#674: the row-by-row reading of a pick is debug. The live log
  // shows the roll and the result from the acts, never the table's words.
  it('reads a pick in its table’s words only in Debug', () => {
    const answered = {
      id: 'r2',
      at: 1n,
      act: 'time:r2',
      beat: 'answered',
      fields: {
        beat: 'answered',
        creature: 'gate-1',
        option: '',
        key: 'time',
        roll: 3,
        of: 4,
        entry: 0,
        temper: '',
        rows: [
          {
            entry: 0,
            held: true,
            affordable: true,
            weight: 1,
            percent: 100,
            loaded: 100,
          },
        ],
      },
    };
    const table = {
      id: 'r1',
      at: 1n,
      act: 'time:r2',
      beat: 'table',
      fields: {
        beat: 'table',
        creature: 'gate-1',
        option: '',
        key: 'time',
        temper: '',
        rows: [
          {
            entry: 0,
            when: ['enemy seen'],
            word: 'attack',
            selector: 'enemy',
            weight: 1,
            say: '',
            fact: '',
            search: null,
          },
        ],
      },
    };
    const feed = { rows: [table, answered], notice: undefined };
    const sentence =
      'gate-1 · time · rolled 3 of 4 · enemy seen → attack enemy';

    const story = renderLog('story', () => {}, feed);
    expect(screen.queryByText(sentence)).toBeNull();
    story.unmount();

    renderLog('debug', () => {}, feed);
    expect(screen.getByText(sentence)).toBeTruthy();
  });
});
