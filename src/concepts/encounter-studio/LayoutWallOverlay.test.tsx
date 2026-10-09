import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import { createLayoutTransform, worldToClient } from './layoutGeometry';
import { LayoutWallOverlay } from './LayoutWallOverlay';

afterEach(cleanup);
describe('canonical Layout wall pixel overlay', () => {
  it.each([0.25, 1, 4])(
    'cuts actual opening gaps and keeps hits/handles screen-sized at zoom %s',
    (zoom) => {
      const wall = createPopulatedStudioDocument().draft.room.walls![0];
      const transform = createLayoutTransform(
        { left: 30, top: 70, width: 960, height: 600 },
        { center: { x: 2, z: -1 }, zoom },
        12
      )!;
      const { container } = render(
        <svg>
          <LayoutWallOverlay
            walls={[wall]}
            transform={transform}
            selectedId={wall.id}
            interactive
            preview={null}
            layer="body"
          />
          <LayoutWallOverlay
            walls={[wall]}
            transform={transform}
            selectedId={wall.id}
            interactive
            preview={null}
            layer="handles"
          />
        </svg>
      );
      const spans = [...container.querySelectorAll('[data-wall-span]')];
      expect(spans).toHaveLength(3);
      const intervals = [
        [0, 1.5],
        [2.5, 5],
        [7, 8],
      ];
      spans.forEach((span, index) => {
        const [a, b] = intervals[index];
        const start = worldToClient(
          { x: wall.line.start.x + a, z: -3 },
          transform
        )!;
        const end = worldToClient(
          { x: wall.line.start.x + b, z: -3 },
          transform
        )!;
        expect(Number(span.getAttribute('x1'))).toBeCloseTo(start.x - 30);
        expect(Number(span.getAttribute('x2'))).toBeCloseTo(end.x - 30);
        expect(span.getAttribute('stroke-width')).toBe('5');
      });
      expect(
        container
          .querySelector('line[data-wall-id]')
          ?.getAttribute('stroke-width')
      ).toBe('18');
      expect(
        [...container.querySelectorAll('[data-wall-endpoint]')].map((node) =>
          node.getAttribute('r')
        )
      ).toEqual(['7', '7']);
    }
  );
  it('does not mount wall hit targets in floor/Wall modes and never creates a door-state overlay', () => {
    const wall = createPopulatedStudioDocument().draft.room.walls![0];
    const transform = createLayoutTransform(
      { left: 0, top: 0, width: 600, height: 400 },
      { center: { x: 0, z: 0 }, zoom: 1 },
      12
    )!;
    const { container } = render(
      <svg>
        <LayoutWallOverlay
          walls={[wall]}
          transform={transform}
          selectedId={wall.id}
          interactive={false}
          preview={null}
          layer="body"
        />
      </svg>
    );
    expect(container.querySelectorAll('[data-wall-id]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-wall-span]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-door-id]')).toHaveLength(0);
    expect(container.querySelector('g')?.getAttribute('pointer-events')).toBe(
      'none'
    );
  });
});
