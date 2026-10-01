import type { SessionCanvasProps } from '@/components/session/SessionCanvas';
import { DoorState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DungeonIntelConcept } from './DungeonIntelConcept';
import { ENTRY_DOOR, FURTHER_DOOR, HEIRLOOM } from './fixtures';

const { canvas } = vi.hoisted(() => ({ canvas: vi.fn() }));
// Mock only the WebGL boundary: real fixtures, scene builder, sighting adapter,
// inspector, selection and marker-layer construction run through this mount.
vi.mock('@/components/session/SessionCanvas', () => ({
  SessionCanvas: (props: SessionCanvasProps) => {
    canvas(props);
    return <div data-testid="session-canvas" />;
  },
}));
const lastCanvas = (): SessionCanvasProps => canvas.mock.calls.at(-1)![0];
const choose = (name: string): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};

describe('DungeonIntelConcept real composition', () => {
  beforeEach(() => canvas.mockClear());
  it('mounts the existing canvas with only entrance inputs, and a selected-answer inspector', () => {
    render(<DungeonIntelConcept />);
    expect(lastCanvas().scene.floorTiles.size).toBe(20);
    expect(lastCanvas().scene.props.map((prop) => prop.id)).toEqual([
      'bookcase',
    ]);
    expect(lastCanvas().movementPreviewEnabled).toBe(false);
    expect(lastCanvas().onHexClick).toBeUndefined();
    expect(screen.getByTestId('supplied-answer').textContent).not.toContain(
      'room-2'
    );
    expect(screen.getByTestId('supplied-answer').textContent).not.toContain(
      HEIRLOOM
    );
    expect(lastCanvas().presentationLayer).toBeDefined();
  });

  it('selects isolated observer snapshots, displays memory and replaces disproved placement', () => {
    render(<DungeonIntelConcept />);
    choose('2 · A looks inside');
    expect(lastCanvas().scene.floorTiles.size).toBe(44);
    expect(lastCanvas().otherMembers?.[0].remembered).toBe(false);
    choose('Observer B');
    expect(lastCanvas().scene.floorTiles.size).toBe(20);
    expect(lastCanvas().doors?.has(FURTHER_DOOR)).toBe(false);
    expect(screen.getByTestId('supplied-answer').textContent).not.toContain(
      HEIRLOOM
    );
    choose('Observer A');
    choose('3 · A withdraws');
    expect(lastCanvas().otherMembers?.[0].remembered).toBe(true);
    expect(screen.getByText('Heirloom vase · remembered')).toBeTruthy();
    choose('5 · Unseen changes');
    expect(lastCanvas().doors?.get(ENTRY_DOOR)?.state).toBe(DoorState.OPEN);
    expect(lastCanvas().scene.props.some((prop) => prop.id === HEIRLOOM)).toBe(
      true
    );
    choose('Observer B');
    expect(lastCanvas().doors?.get(ENTRY_DOOR)?.state).toBe(DoorState.CLOSED);
    expect(lastCanvas().scene.props.some((prop) => prop.id === HEIRLOOM)).toBe(
      false
    );
    choose('Observer A');
    choose('6 · A observes empty');
    expect(screen.getByText('Heirloom vase · location unknown')).toBeTruthy();
    expect(lastCanvas().scene.props.some((prop) => prop.id === HEIRLOOM)).toBe(
      false
    );
    choose('1 · Closed door');
    expect(lastCanvas().scene.floorTiles.size).toBe(20);
    expect(screen.getByTestId('supplied-answer').textContent).not.toContain(
      'room-2'
    );
  });
});
