import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { resolveRegions } from '../world-building/regionBoundaryGeometry';
import { createRegion, setRegionLighting } from '../world-building/regionEdits';
import {
  createRoomDraft,
  paintCells,
  type RoomDraft,
} from '../world-building/roomDraft';
import { LayoutRoomList } from './LayoutRoomList';
import { regionOverview } from './overviewColours';

afterEach(cleanup);

/** Two regions: the implicit one, painted, and a dim hall. */
function draft(): RoomDraft {
  let room = createRoomDraft(
    { version: 1, id: 'scene', name: 'Keep', items: [], groups: [] },
    'room'
  );
  room = paintCells(room, [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
  ]);
  room = createRegion(room, 'hall', 'Hall');
  room = paintCells(room, [{ q: 1, r: 0 }], 'hall');
  return setRegionLighting(room, 'hall', 0.3);
}

function list(overrides: Partial<Parameters<typeof LayoutRoomList>[0]> = {}) {
  const room = draft();
  const input = {
    draft: room,
    overview: regionOverview(room, resolveRegions(room)),
    selectedRegionId: null,
    activeRegionId: room.room.implicitRegionId,
    onSelect: vi.fn(),
    onActivate: vi.fn(),
    onCreate: vi.fn<(name: string) => boolean>(() => true),
    onShowEntire: vi.fn(),
    ...overrides,
  };
  render(<LayoutRoomList {...input} />);
  return input;
}

// The regions list (rpg-project#725 R5): every region by name with its size
// and its light, a radio for the ACTIVE region paint lands in, and New region
// creating a named one.
describe('the regions list', () => {
  it('lists every region by name with its hex count and light', () => {
    list();
    expect(
      screen.getByRole('button', {
        name: 'Room Untitled room, 1 hex · 1 × 1, light 100%',
      })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Room Hall, 1 hex · 1 × 1, light 30%',
      })
    ).toBeTruthy();
  });

  it('checks the active region and reports a new choice', () => {
    const input = list();
    const implicit = screen.getByRole('radio', {
      name: 'Paint into Untitled room',
    }) as HTMLInputElement;
    const hall = screen.getByRole('radio', {
      name: 'Paint into Hall',
    }) as HTMLInputElement;
    expect(implicit.checked).toBe(true);
    expect(hall.checked).toBe(false);
    fireEvent.click(hall);
    expect(input.onActivate).toHaveBeenCalledExactlyOnceWith('hall');
    expect(input.onSelect).not.toHaveBeenCalled();
  });

  it('creates a named region, clears the name on success and keeps it on refusal', () => {
    const input = list();
    const name = screen.getByLabelText('New region name') as HTMLInputElement;
    const create = screen.getByRole('button', { name: 'New region' });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(name, { target: { value: 'Chapel annex' } });
    fireEvent.submit(screen.getByRole('form', { name: 'New region' }));
    expect(input.onCreate).toHaveBeenCalledExactlyOnceWith('Chapel annex');
    expect(name.value).toBe('');
    (input.onCreate as Mock).mockReturnValue(false);
    fireEvent.change(name, { target: { value: 'Refused' } });
    fireEvent.submit(screen.getByRole('form', { name: 'New region' }));
    expect(name.value).toBe('Refused');
  });
});
