import type { GroundCatalogSnapshot } from '@/rendering/groundCatalog';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomRegion } from '../world-building/roomDraft';
import { StudioGroundControls } from './StudioGroundControls';

const REF = 'dnd5e:ground:fantasy-kingdom:grass_01';
const hash = 'a'.repeat(64);
const ready: GroundCatalogSnapshot = {
  status: 'ready',
  catalog: {
    schemaVersion: 1,
    styles: [
      {
        ref: REF,
        displayName: 'Grass',
        diffuse: `ground/images/${hash}.png`,
        sha256: hash,
        width: 2048,
        height: 2048,
        worldUnitsPerRepeat: 6,
      },
    ],
  },
};
const region: RoomRegion = {
  id: 'court',
  name: 'Courtyard',
  lighting: { intensity: 1 },
  cells: [{ r: 0, q: [[0, 1]] }],
};
afterEach(cleanup);

describe('region base ground control', () => {
  it('sends an appearance choice and an explicit return to the default', () => {
    const choose = vi.fn(() => true);
    render(
      <StudioGroundControls
        region={region}
        catalog={ready}
        onSetBase={choose}
      />
    );
    fireEvent.change(screen.getByLabelText('Base ground'), {
      target: { value: REF },
    });
    expect(choose).toHaveBeenLastCalledWith(REF);
    fireEvent.change(screen.getByLabelText('Base ground'), {
      target: { value: '' },
    });
    expect(choose).toHaveBeenLastCalledWith(null);
    expect(
      screen.getByText(/painted hexes keep their appearances/i)
    ).toBeTruthy();
  });

  it('retains an unavailable imported ref and reports it instead of showing stone', () => {
    render(
      <StudioGroundControls
        region={{ ...region, ground: { baseRef: 'missing' } }}
        catalog={ready}
        onSetBase={() => true}
      />
    );
    expect(
      (screen.getByLabelText('Base ground') as HTMLSelectElement).value
    ).toBe('missing');
    expect(screen.getByRole('alert').textContent).toContain('missing');
  });

  it('allows reset to the default when the appearance catalog is unavailable', () => {
    const choose = vi.fn(() => true);
    render(
      <StudioGroundControls
        region={{ ...region, ground: { baseRef: REF } }}
        catalog={{ status: 'error', message: 'Catalog unavailable' }}
        onSetBase={choose}
      />
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Catalog unavailable'
    );
    fireEvent.change(screen.getByLabelText('Base ground'), {
      target: { value: '' },
    });
    expect(choose).toHaveBeenCalledWith(null);
  });
});
