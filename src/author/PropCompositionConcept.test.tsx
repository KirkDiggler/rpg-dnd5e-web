import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PropCompositionConcept } from './PropCompositionConcept';

vi.mock('./preview3d/DungeonPreview3D', () => ({
  DungeonPreview3D: (props: {
    onSelect?: (selection: { roomId: null; index: number }) => void;
  }) => (
    <div data-testid="preview-3d">
      <button onClick={() => props.onSelect?.({ roomId: null, index: 0 })}>
        select left model
      </button>
    </div>
  ),
}));

describe('PropCompositionConcept — real interaction/state path', () => {
  it('exposes bounded, basis-labelled nudge and snap with visible movement previews', () => {
    render(<PropCompositionConcept />);
    expect(screen.getByText('NUDGE · WALL-LOCAL BASIS')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Nudge right along wall' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Nudge away from wall' })
    );
    expect(screen.getByTestId('nudge-values').textContent).toContain(
      'along +0.05 m · normal +0.05 m'
    );
    expect(screen.getByText(/moves 5 cm along wall/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: /Snap to span center/ })
    );
    expect(screen.getByTestId('nudge-values').textContent).toContain(
      'along +0.00 m · normal +0.05 m'
    );
  });

  it('replaces in one action, keeps the nudge visible, and distinguishes adjustment reset from fixture reset', () => {
    render(<PropCompositionConcept />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Nudge right along wall' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Replace with ornate torch' })
    );

    expect(screen.getByTestId('selected-placement').textContent).toContain(
      'center · ornate torch'
    );
    expect(screen.getByTestId('nudge-values').textContent).toContain(
      'along +0.05 m'
    );
    expect(screen.getByTestId('replacement-ownership').textContent).toContain(
      'Preserve: span center + local nudge. Refresh: model/variant'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset adjustment' }));
    expect(screen.getByTestId('selected-placement').textContent).toContain(
      'ornate torch'
    );
    expect(screen.getByTestId('nudge-values').textContent).toContain(
      'along +0.00 m · normal +0.00 m'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset fixture' }));
    expect(screen.getByTestId('selected-placement').textContent).toContain(
      'center · bookcase'
    );
    expect(screen.getByTestId('composition-status').textContent).toContain(
      '3 bookcases · 0 ornate torches'
    );
  });

  it('selecting a model retargets subsequent edits instead of moving the center placement', () => {
    render(<PropCompositionConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'select left model' }));
    expect(screen.getByTestId('selected-placement').textContent).toContain(
      'left · bookcase'
    );
  });
});
