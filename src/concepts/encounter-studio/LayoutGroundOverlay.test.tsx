import type { GroundCatalogSnapshot } from '@/rendering/groundCatalog';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RoomRegion } from '../world-building/roomDraft';
import { LayoutGroundOverlay } from './LayoutGroundOverlay';

const ref = 'dnd5e:ground:fantasy-kingdom:grass_01';
const hash = 'a'.repeat(64);
const catalog: GroundCatalogSnapshot = {
  status: 'ready',
  catalog: {
    schemaVersion: 1,
    styles: [
      {
        ref,
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
  name: 'Court',
  lighting: { intensity: 1 },
  cells: [{ r: 0, q: [[0, 0]] }],
};
afterEach(cleanup);

describe('Layout ground feedback', () => {
  it('does not introduce resource patterns or ground polygons into unpainted maps', () => {
    const view = render(
      <svg>
        <LayoutGroundOverlay
          cells={[{ q: 0, r: 0 }]}
          regions={[region]}
          catalog={catalog}
        />
      </svg>
    );
    expect(view.container.querySelector('pattern')).toBeNull();
    expect(view.container.querySelector('[data-ground-cell]')).toBeNull();
  });
  it('draws only owned styled cells and replaces a failed image with a visible diagnostic', () => {
    const view = render(
      <svg>
        <LayoutGroundOverlay
          cells={[
            { q: 0, r: 0 },
            { q: 9, r: 9 },
          ]}
          regions={[{ ...region, ground: { baseRef: ref } }]}
          catalog={catalog}
        />
      </svg>
    );
    const polygon = view.container.querySelector('[data-ground-cell="0,0"]')!;
    expect(polygon.getAttribute('fill')).toMatch(/^url\(#ground-/);
    expect(view.container.querySelector('[data-ground-cell="9,9"]')).toBeNull();
    expect(view.container.querySelector('pattern')?.getAttribute('width')).toBe(
      '6'
    );
    // World Z increases downward in Layout; WebGL v=0 samples the
    // bottom of a flipY image. Both views must share that chart.
    expect(
      view.container.querySelector('image')?.getAttribute('transform')
    ).toBe('translate(0 6) scale(1 -1)');
    fireEvent.error(view.container.querySelector('image')!);
    expect(polygon.getAttribute('fill')).toBe('#d850a0');
    expect(polygon.textContent).toContain('unavailable');
  });
});
