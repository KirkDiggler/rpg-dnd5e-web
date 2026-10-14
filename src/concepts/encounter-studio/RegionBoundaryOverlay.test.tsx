import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RegionBoundaryOverlay } from './RegionBoundaryOverlay';
import { regionStatus } from './StudioArrangeFields';
import type { RegionResolution } from './studioSession';

describe('Layout region boundary projection', () => {
  it('draws current polygons and explicit cell unions but never unresolved stale areas', () => {
    const resolutions: RegionResolution[] = [
      {
        id: 'room',
        status: 'resolved',
        area: {
          kind: 'polygon',
          ring: [
            { x: 0, z: 0 },
            { x: 4, z: 0 },
            { x: 4, z: 4 },
          ],
        },
      },
      {
        id: 'forest',
        status: 'resolved',
        area: {
          kind: 'hex-union',
          cells: [
            { q: 0, r: 0 },
            { q: 1, r: 0 },
          ],
        },
      },
      { id: 'broken', status: 'unresolved', reason: 'boundary-changed' },
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
    ).toBe('M0,0L4,0L4,4Z');
    // One hexagon per counted cell in the union's one fill path.
    expect(
      container
        .querySelector('[data-region-fill="forest"]')
        ?.getAttribute('d')
        ?.match(/Z/g)
    ).toHaveLength(2);
    expect(container.querySelector('[data-region-id="broken"]')).toBeNull();
    expect(
      container
        .querySelector('.es-region-boundaries')
        ?.getAttribute('pointer-events')
    ).toBe('none');
    rerender(
      <svg>
        <RegionBoundaryOverlay
          resolutions={[{ id: 'room', status: 'unresolved', reason: 'open' }]}
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
          resolutions={[{ id: 'hall', status: 'unresolved', reason: 'open' }]}
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
  it('names automatic/explicit modes and actionable unresolved reasons without a conflict winner', () => {
    expect(
      regionStatus(
        { id: 'a', labelId: 'l', boundary: { kind: 'automatic' } },
        { id: 'a', status: 'unresolved', reason: 'unbound' }
      )
    ).toMatch(/Automatic · Unresolved.*Use enclosing walls/);
    expect(
      regionStatus(
        { id: 'a', labelId: 'l', boundary: { kind: 'explicit', cells: [] } },
        { id: 'a', status: 'unresolved', reason: 'overlap' }
      )
    ).toMatch(/Explicit · Unresolved.*no region takes priority/);
  });
});
