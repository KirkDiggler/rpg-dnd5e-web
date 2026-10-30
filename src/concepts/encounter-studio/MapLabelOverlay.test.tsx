import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { regionLabelPoint } from '../world-building/regionLabel';
import { toRows } from '../world-building/regionRuns';
import type { RoomRegion } from '../world-building/roomDraft';
import { createLayoutTransform, worldToClient } from './layoutGeometry';
import { MapLabelOverlay } from './MapLabelOverlay';

describe('MapLabelOverlay', () => {
  it('escapes plain authored text and keeps duplicate names keyed by canonical IDs', () => {
    const onSelect = vi.fn();
    const labels = [
      {
        id: 'a',
        text: '<img src=x onerror=alert(1)>',
        location: { x: 0, z: 0 },
      },
      {
        id: 'b',
        text: '<img src=x onerror=alert(1)>',
        location: { x: 1, z: 0 },
      },
    ];
    const { container } = render(
      <svg>
        <MapLabelOverlay
          labels={labels}
          transform={
            createLayoutTransform(
              { left: 30, top: 70, width: 600, height: 600 },
              { center: { x: 0, z: 0 }, zoom: 1 },
              12
            )!
          }
          selectedId="b"
          preview={null}
          onSelect={onSelect}
        />
      </svg>
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-label-id="a"]')?.textContent).toBe(
      labels[0].text
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(buttons[1], { key: ' ' });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('b');
  });
  it('positions a transient preview in root pixels without scaling text or mutating canonical labels', () => {
    const labels = [
      { id: 'kitchen', text: 'Kitchen', location: { x: 0, z: 0 } },
    ];
    const { container } = render(
      <svg>
        <MapLabelOverlay
          labels={labels}
          transform={
            createLayoutTransform(
              { left: 30, top: 70, width: 600, height: 600 },
              { center: { x: 1, z: -1 }, zoom: 2 },
              12
            )!
          }
          selectedId="kitchen"
          preview={{ id: 'kitchen', location: { x: 2, z: 3 } }}
          onSelect={vi.fn()}
        />
      </svg>
    );
    const text = container.querySelector('text')!;
    expect(text.getAttribute('x')).toBe('350');
    expect(text.getAttribute('y')).toBe('500');
    expect(text.getAttribute('font-size')).toBe('14');
    expect(labels[0].location).toEqual({ x: 0, z: 0 });
  });
});

// A region's label is its name drawn at the centroid of its cells
// (rpg-project#725); notes are linked to no region and carry no warning.
it('draws each painted region by name at its centroid and selects it; an unpainted region has no label', () => {
  const transform = createLayoutTransform(
    { left: 0, top: 0, width: 800, height: 600 },
    { center: { x: 0, z: 0 }, zoom: 1 },
    12
  )!;
  const kitchen: RoomRegion = {
    id: 'kitchen',
    name: 'Kitchen',
    lighting: { intensity: 1 },
    cells: toRows([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]),
  };
  const onSelect = vi.fn();
  const onSelectRegion = vi.fn();
  const { container } = render(
    <svg>
      <MapLabelOverlay
        labels={[{ id: 'note', text: 'Note', location: { x: 2, z: 0 } }]}
        transform={transform}
        selectedId={null}
        preview={null}
        onSelect={onSelect}
        regions={[
          kitchen,
          {
            id: 'unpainted',
            name: 'Cellar',
            lighting: { intensity: 1 },
            cells: [],
          },
        ]}
        selectedRegionId="kitchen"
        onSelectRegion={onSelectRegion}
      />
    </svg>
  );
  const label = container.querySelector('[data-region-label="kitchen"]')!;
  expect(label.textContent).toBe('Kitchen');
  const at = worldToClient(regionLabelPoint(kitchen)!, transform)!;
  expect(Number(label.getAttribute('x'))).toBeCloseTo(at.x);
  expect(Number(label.getAttribute('y'))).toBeCloseTo(at.y);
  expect(container.querySelector('[data-region-label="unpainted"]')).toBeNull();
  expect(container.querySelector('[data-label-id="note"]')?.textContent).toBe(
    'Note'
  );
  const button = screen.getByRole('button', { name: 'Select region Kitchen' });
  expect(button.getAttribute('aria-pressed')).toBe('true');
  fireEvent.pointerDown(button, { button: 0 });
  fireEvent.keyDown(button, { key: 'Enter' });
  expect(onSelectRegion).toHaveBeenCalledTimes(2);
  expect(onSelectRegion).toHaveBeenLastCalledWith('kitchen');
  expect(onSelect).not.toHaveBeenCalled();
});
it("a region label is drawn in its region's colour; a note is not", () => {
  const { container } = render(
    <svg>
      <MapLabelOverlay
        labels={[{ id: 'note', text: 'Note', location: { x: 1, z: 0 } }]}
        transform={
          createLayoutTransform(
            { left: 0, top: 0, width: 600, height: 600 },
            { center: { x: 0, z: 0 }, zoom: 1 },
            12
          )!
        }
        selectedId={null}
        preview={null}
        onSelect={() => undefined}
        regions={[
          {
            id: 'hall',
            name: 'Hall',
            lighting: { intensity: 1 },
            cells: toRows([{ q: 0, r: 0 }]),
          },
        ]}
        colours={new Map([['hall', '#5cc98a']])}
      />
    </svg>
  );
  expect(
    container.querySelector('[data-region-label="hall"]')?.getAttribute('fill')
  ).toBe('#5cc98a');
  expect(
    container.querySelector('[data-label-id="note"]')?.getAttribute('fill')
  ).toBe('#fff4d8');
});
