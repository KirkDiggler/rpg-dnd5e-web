import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntityTargetLabel } from './EntityTargetMarker';

describe('target name/check label', () => {
  it('shows a non-color selected check/order and routes one click without bubbling into the map', () => {
    const choose = vi.fn();
    const map = vi.fn();
    const hover = vi.fn();
    const leave = vi.fn();
    const view = render(
      <div onClick={map}>
        <EntityTargetLabel
          entityId="member"
          name="Mira"
          selected={false}
          onChoose={choose}
          onHover={hover}
          onLeave={leave}
        />
      </div>
    );
    const label = screen.getByRole('button', { name: 'Select Mira' });
    expect(label).toHaveAttribute('aria-pressed', 'false');
    fireEvent.pointerEnter(label);
    expect(hover).toHaveBeenCalledOnce();
    fireEvent.click(label);
    expect(choose).toHaveBeenCalledOnce();
    expect(map).not.toHaveBeenCalled();
    fireEvent.pointerLeave(label);
    expect(leave).toHaveBeenCalledOnce();
    view.rerender(
      <EntityTargetLabel
        entityId="member"
        name="Mira"
        selected
        order={2}
        onChoose={choose}
        onHover={hover}
        onLeave={leave}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Deselect Mira' })
    ).toHaveTextContent('✓ 2');
    expect(
      screen.getByRole('button', { name: 'Deselect Mira' })
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
