import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RepeatPlacementCount } from './RepeatPlacementPreview';

describe('RepeatPlacementCount', () => {
  it('announces the singular and plural production preview count', () => {
    const rendered = render(<RepeatPlacementCount count={1} />);
    const count = screen.getByRole('status');
    expect(count.textContent).toBe('1 piece');
    expect(count.getAttribute('aria-live')).toBe('polite');

    rendered.rerender(<RepeatPlacementCount count={2} />);
    expect(screen.getByRole('status').textContent).toBe('2 pieces');
  });
});
