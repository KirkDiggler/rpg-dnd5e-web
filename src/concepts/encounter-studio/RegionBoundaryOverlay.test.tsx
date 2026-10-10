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
      container
        .querySelector('[data-region-id="room"] polygon')
        ?.getAttribute('points')
    ).toBe('0,0 4,0 4,4');
    expect(
      container.querySelectorAll('[data-region-id="forest"] polygon')
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
    expect(container.querySelectorAll('polygon')).toHaveLength(0);
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
