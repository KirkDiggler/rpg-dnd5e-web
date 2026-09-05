import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SceneErrorBoundary } from './SceneErrorBoundary';

function BrokenScene(): never {
  throw new Error('fighter scene failed');
}

describe('SceneErrorBoundary', () => {
  it('shows the originating render error instead of leaving a blank canvas', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <SceneErrorBoundary>
        <BrokenScene />
      </SceneErrorBoundary>
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'fighter scene failed'
    );
  });
});
