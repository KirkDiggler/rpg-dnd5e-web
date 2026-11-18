import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameErrorBoundary } from './GameErrorBoundary';
import {
  clearFailedOpen,
  rememberFailedOpen,
  skipResumeOnce,
} from './resumeFailure';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function Throws(): React.JSX.Element {
  throw new Error('atlas missing');
}

describe('GameErrorBoundary', () => {
  it('a game view that throws shows why and a way home, not a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onBack = vi.fn();
    const onError = vi.fn();
    render(
      <GameErrorBoundary onBack={onBack} onError={onError}>
        <Throws />
      </GameErrorBoundary>
    );
    expect(screen.getByRole('alert').textContent).toContain('atlas missing');
    expect(onError).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('button', { name: 'Back to the studio' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('entered from the studio, it offers the way back there too', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onBackToStudio = vi.fn();
    render(
      <GameErrorBoundary onBack={vi.fn()} onBackToStudio={onBackToStudio}>
        <Throws />
      </GameErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to the studio' }));
    expect(onBackToStudio).toHaveBeenCalledOnce();
  });

  it('renders its children when nothing throws', () => {
    render(
      <GameErrorBoundary onBack={vi.fn()}>
        <p>the game</p>
      </GameErrorBoundary>
    );
    expect(screen.getByText('the game')).toBeTruthy();
  });
});

describe('resumeFailure', () => {
  it('skips the resume once, for that player and run only, then resumes again', () => {
    rememberFailedOpen('alice', 'run-1');
    expect(skipResumeOnce('bob', 'run-1')).toBe(false);
    expect(skipResumeOnce('alice', 'run-2')).toBe(false);
    expect(skipResumeOnce('alice', 'run-1')).toBe(true);
    // The same load asks again (an effect run twice): still skipped.
    expect(skipResumeOnce('alice', 'run-1')).toBe(true);
    // A later load: the mark carries another load's skip.
    const raw = JSON.parse(window.localStorage.getItem('rpg.game.openFailed')!);
    window.localStorage.setItem(
      'rpg.game.openFailed',
      JSON.stringify({ ...raw, skippedBy: 'an-earlier-load' })
    );
    expect(skipResumeOnce('alice', 'run-1')).toBe(false);
    expect(window.localStorage.getItem('rpg.game.openFailed')).toBeNull();
  });

  it('entering or leaving the run forgets the failure', () => {
    rememberFailedOpen('alice', 'run-1');
    clearFailedOpen('alice', 'run-2');
    expect(skipResumeOnce('alice', 'run-1')).toBe(true);
    clearFailedOpen('alice');
    expect(skipResumeOnce('alice', 'run-1')).toBe(false);
  });
});
