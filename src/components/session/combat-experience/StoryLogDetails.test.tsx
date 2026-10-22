import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import styles from './CombatExperience.module.css';
import { StoryLog } from './StoryLog';

const record = { rows: [], notice: undefined };
const base = {
  story: [],
  record,
  mode: 'debug' as const,
  streamState: 'live' as const,
  onModeChange: vi.fn(),
};

describe('the Debug panel reads the record (web#1305)', () => {
  it('adopts a measured desktop default without overriding an explicit log choice', () => {
    const view = render(<StoryLog {...base} initialCollapsed={false} />);
    expect(
      screen.queryByRole('button', { name: 'Expand combat log' })
    ).toBeNull();
    view.rerender(<StoryLog {...base} initialCollapsed />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand combat log' }));
    view.rerender(<StoryLog {...base} initialCollapsed={false} />);
    view.rerender(<StoryLog {...base} initialCollapsed />);
    expect(
      screen.queryByRole('button', { name: 'Expand combat log' })
    ).toBeNull();
  });

  it('widens only Debug and can return to compact width', () => {
    const { rerender } = render(<StoryLog {...base} />);
    const log = screen.getByTestId('session-combat-log');
    expect(log.classList.contains(styles.storyLogWide)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Widen debug panel' }));
    expect(log.classList.contains(styles.storyLogWide)).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse combat log' })
    );
    expect(log.classList.contains(styles.storyLogWide)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Expand combat log' }));
    expect(log.classList.contains(styles.storyLogWide)).toBe(true);
    rerender(<StoryLog {...base} mode="story" />);
    expect(log.classList.contains(styles.storyLogWide)).toBe(false);
    rerender(<StoryLog {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Narrow debug panel' }));
    expect(log.classList.contains(styles.storyLogWide)).toBe(false);
  });

  it('shows the record, and says so when a view has none', () => {
    const { rerender } = render(<StoryLog {...base} />);
    expect(screen.getByText('The record')).toBeTruthy();
    expect(screen.queryByText('No session record for this view.')).toBeNull();
    rerender(<StoryLog {...base} record={undefined} />);
    expect(screen.getByText('No session record for this view.')).toBeTruthy();
  });
});
