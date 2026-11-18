import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACK_TO_STUDIO_Z, BackToStudio } from './BackToStudio';

afterEach(cleanup);

describe('BackToStudio', () => {
  it('is on the body, above every game layer, and returns to the studio', () => {
    const onBack = vi.fn();
    const { container } = render(
      <div style={{ position: 'relative', zIndex: 4201 }}>
        <BackToStudio onBack={onBack} />
      </div>
    );
    const button = screen.getByRole('button', {
      name: '← Back to the studio',
    });
    // Portalled: not inside the game's own stacking context.
    expect(container.contains(button)).toBe(false);
    expect(button.parentElement).toBe(document.body);
    expect(Number(button.style.zIndex)).toBe(BACK_TO_STUDIO_Z);
    expect(BACK_TO_STUDIO_Z).toBeGreaterThan(4201);
    fireEvent.click(button);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
