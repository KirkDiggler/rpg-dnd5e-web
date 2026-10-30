import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { layoutCellCorners } from './layoutGeometry';
import { RegionBoundaryOverlay } from './RegionBoundaryOverlay';
import { regionStatus } from './StudioArrangeFields';
import type { RegionResolution } from './studioSession';

describe('Layout region boundary projection', () => {
  // Regions are the floor (rpg-project#725): every resolved area is a hex
  // union; polygons and stale automatic reasons are gone.
  it('draws resolved cell unions but never an unpainted region', () => {
    const resolutions: RegionResolution[] = [
      {
        id: 'room',
        status: 'resolved',
        area: { kind: 'hex-union', cells: [{ q: 0, r: 0 }] },
      },
      {
        id: 'forest',
        status: 'resolved',
        area: {
          kind: 'hex-union',
          cells: [
            { q: 3, r: 0 },
            { q: 4, r: 0 },
          ],
        },
      },
      { id: 'unpainted', status: 'unresolved', reason: 'empty' },
    ];
    const { container, rerender } = render(
      <svg>
        <RegionBoundaryOverlay
          resolutions={resolutions}
          selectedId="room"
          transform="scale(2)"
        />
      </svg>
    );
    expect(
      container.querySelector('[data-region-fill="room"]')?.getAttribute('d')
    ).toBe(
      `M${layoutCellCorners({ q: 0, r: 0 })
        .map((p) => `${p.x},${p.z}`)
        .join('L')}Z`
    );
    // One hexagon per counted cell in the union's one fill path.
    expect(
      container
        .querySelector('[data-region-fill="forest"]')
        ?.getAttribute('d')
        ?.match(/Z/g)
    ).toHaveLength(2);
    expect(container.querySelector('[data-region-id="unpainted"]')).toBeNull();
    expect(
      container
        .querySelector('.es-region-boundaries')
        ?.getAttribute('transform')
    ).toBe('scale(2)');
    expect(
      container
        .querySelector('.es-region-boundaries')
        ?.getAttribute('pointer-events')
    ).toBe('none');
    rerender(
      <svg>
        <RegionBoundaryOverlay
          resolutions={[{ id: 'room', status: 'unresolved', reason: 'empty' }]}
        />
      </svg>
    );
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });
  it('a resolved region renders a fill in its colour', () => {
    const { container } = render(
      <svg>
        <RegionBoundaryOverlay
          resolutions={[
            {
              id: 'hall',
              status: 'resolved',
              area: { kind: 'hex-union', cells: [{ q: 0, r: 0 }] },
            },
          ]}
          colours={new Map([['hall', '#5cc98a']])}
          selectedId="hall"
        />
      </svg>
    );
    const fill = container.querySelector('[data-region-fill="hall"]')!;
    expect(fill.getAttribute('fill')).toBe('#5cc98a');
    expect(Number(fill.getAttribute('fill-opacity'))).toBeGreaterThan(0);
    const outline = container.querySelector('[data-region-outline="hall"]')!;
    expect(outline.getAttribute('stroke')).toBe('#5cc98a');
    // Six outer edges of one hexagon; the selected outline is the thick one.
    expect(outline.getAttribute('d')?.match(/M/g)).toHaveLength(6);
    expect(Number(outline.getAttribute('stroke-width'))).toBeGreaterThan(2);
  });
  it('an unresolved region renders no fill', () => {
    const { container } = render(
      <svg>
        <RegionBoundaryOverlay
          resolutions={[{ id: 'hall', status: 'unresolved', reason: 'empty' }]}
          colours={new Map([['hall', '#5cc98a']])}
        />
      </svg>
    );
    expect(container.querySelector('[data-region-fill="hall"]')).toBeNull();
    expect(container.querySelector('[data-region-id="hall"]')).toBeNull();
  });
  it('two cells of one union share an edge that is not stroked', () => {
    const { container } = render(
      <svg>
        <RegionBoundaryOverlay
          resolutions={[
            {
              id: 'pair',
              status: 'resolved',
              area: {
                kind: 'hex-union',
                cells: [
                  { q: 0, r: 0 },
                  { q: 1, r: 0 },
                ],
              },
            },
          ]}
        />
      </svg>
    );
    expect(
      container
        .querySelector('[data-region-outline="pair"]')
        ?.getAttribute('d')
        ?.match(/M/g)
    ).toHaveLength(10);
  });
  // Automatic/explicit modes and their reasons are retired; a region is
  // painted or not.
  it('names a painted region by its hex count and an unpainted one by the action', () => {
    expect(
      regionStatus({
        id: 'a',
        status: 'resolved',
        area: { kind: 'hex-union', cells: [{ q: 0, r: 0 }] },
      })
    ).toBe('Painted · 1 hex');
    expect(
      regionStatus({
        id: 'a',
        status: 'resolved',
        area: {
          kind: 'hex-union',
          cells: [
            { q: 0, r: 0 },
            { q: 1, r: 0 },
          ],
        },
      })
    ).toBe('Painted · 2 hexes');
    expect(
      regionStatus({ id: 'a', status: 'unresolved', reason: 'empty' })
    ).toBe('Not painted yet. Make it active and paint its cells.');
    expect(regionStatus(undefined)).toMatch(/^Not painted yet/);
  });
});
