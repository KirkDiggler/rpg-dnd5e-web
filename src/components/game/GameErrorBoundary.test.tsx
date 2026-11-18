import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameErrorBoundary } from './GameErrorBoundary';
import { isFailedResume, rememberFailedResume } from './resumeFailure';

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
  it('remembers the run that failed, and only that run', () => {
    expect(isFailedResume('run-1')).toBe(false);
    rememberFailedResume('run-1');
    expect(isFailedResume('run-1')).toBe(true);
    expect(isFailedResume('run-2')).toBe(false);
  });
});
