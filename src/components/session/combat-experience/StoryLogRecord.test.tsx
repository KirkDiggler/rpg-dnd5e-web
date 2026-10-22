import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StoryLog } from './StoryLog';

const record = { rows: [], notice: undefined };

function renderLog(mode: 'story' | 'debug', onShown: (shown: boolean) => void) {
  return render(
    <StoryLog
      story={[]}
      record={record}
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
});
