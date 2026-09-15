import { describe, expect, it } from 'vitest';
import { parseCameraDials, touchViewAtZoom } from './cameraDials';
const dials = parseCameraDials('');
const bands = dials.curve!.bands;
const tactical = bands[2]!;
const shoulder = bands[3]!;

describe('continuous phone camera angle', () => {
  it('holds tactical when zoomed out and shoulder once close enough', () => {
    for (const zoom of [dials.zoomMin, tactical.zoom]) {
      expect(touchViewAtZoom({ zoom, bands })).toEqual({
        polar: tactical.polar,
        focusLead: tactical.focusLead,
      });
    }
    for (const zoom of [shoulder.zoom, dials.zoomMax]) {
      expect(touchViewAtZoom({ zoom, bands })).toEqual({
        polar: shoulder.polar,
        focusLead: shoulder.focusLead,
      });
    }
  });
  it('smoothly blends the authored angle and focus lead between the two points', () => {
    const middle = touchViewAtZoom({
      zoom: (tactical.zoom + shoulder.zoom) / 2,
      bands,
    })!;
    expect(middle.polar).toBeCloseTo((tactical.polar + shoulder.polar) / 2);
    expect(middle.focusLead).toBeCloseTo(
      (tactical.focusLead + shoulder.focusLead) / 2
    );
    expect(
      touchViewAtZoom({ zoom: tactical.zoom + 0.001, bands })!.polar
    ).toBeCloseTo(tactical.polar, 7);
    expect(
      touchViewAtZoom({ zoom: shoulder.zoom - 0.001, bands })!.polar
    ).toBeCloseTo(shoulder.polar, 7);
  });
  it('leaves a caller without the authored transition on its existing fixed view', () => {
    expect(touchViewAtZoom({ zoom: 80, bands: undefined })).toBeNull();
    expect(touchViewAtZoom({ zoom: 80, bands: [] })).toBeNull();
  });
});
