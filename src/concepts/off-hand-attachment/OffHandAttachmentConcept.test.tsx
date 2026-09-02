import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConceptsView } from '../ConceptsView';
import { OffHandAttachmentConcept } from './OffHandAttachmentConcept';

vi.mock('./OffHandAttachmentPreview', () => ({
  OffHandAttachmentPreview: (props: {
    stateId: string;
    classId: string;
    raceId: string;
    motion: string;
    view: string;
    facing: number;
  }) => (
    <div data-testid="mock-off-hand-preview">
      {props.stateId}|{props.classId}|{props.raceId}|{props.motion}|{props.view}
      |{props.facing}
    </div>
  ),
}));

describe('OffHandAttachmentConcept', () => {
  it('preserves historical controls and exposes all four specialist states', () => {
    render(<OffHandAttachmentConcept />);
    for (const label of [
      'Empty',
      'Shield only',
      'Longsword + Shield',
      'Shortsword + Dagger',
      'Glaive main',
      'Trident main',
      'Scimitar main',
      'Dual Scimitars',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(document.body.textContent).not.toMatch(/nudge|transform matrix/i);
  });

  it('drives the production-backed preview controls', () => {
    render(<OffHandAttachmentConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Dual Scimitars' }));
    fireEvent.click(screen.getByRole('button', { name: 'Walk' }));
    expect(screen.getByTestId('mock-off-hand-preview').textContent).toContain(
      'dual-scimitars'
    );
    expect(screen.getByTestId('mock-off-hand-preview').textContent).toContain(
      'walk'
    );
  });

  it('registers the deep link in ConceptsView', () => {
    window.history.replaceState({}, '', '?concept=off-hand-attachment');
    render(<ConceptsView onBack={vi.fn()} />);
    expect(
      screen
        .getByRole('button', { name: 'Off-Hand Attachment' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByTestId('mock-off-hand-preview')).toBeTruthy();
  });
});
