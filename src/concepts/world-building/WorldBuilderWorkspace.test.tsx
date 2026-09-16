import type { CompositionSource } from '@/compositions/compositionSource';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorldBuilderWorkspace } from './WorldBuilderWorkspace';

vi.mock('./WorldBuildingConcept', () => ({
  WorldBuildingConcept: ({ roomMode }: { roomMode?: boolean }) => (
    <div data-testid={roomMode ? 'rooms-editor' : 'props-editor'}>
      {roomMode ? 'Rooms editor' : 'Props editor'}
    </div>
  ),
}));

const source = { worldId: 'world-1' } as CompositionSource;

describe('WorldBuilderWorkspace', () => {
  it('opens Rooms by default and safely round-trips to prop compositions', () => {
    render(<WorldBuilderWorkspace compositionSource={source} />);

    expect(
      screen.getByRole('button', { name: 'Rooms' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByTestId('rooms-editor').parentElement?.className).toBe(
      'wb-mode-pane'
    );
    expect(
      screen.getByTestId('props-editor').parentElement?.className
    ).toContain('wb-mode-pane-hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Prop compositions' }));
    expect(screen.getByTestId('props-editor').parentElement?.className).toBe(
      'wb-mode-pane'
    );
    expect(
      screen.getByTestId('rooms-editor').parentElement?.className
    ).toContain('wb-mode-pane-hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Rooms' }));
    expect(screen.getByTestId('rooms-editor').parentElement?.className).toBe(
      'wb-mode-pane'
    );
  });
});
