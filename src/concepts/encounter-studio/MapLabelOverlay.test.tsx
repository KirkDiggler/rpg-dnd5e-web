import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createLayoutTransform } from './layoutGeometry';
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
