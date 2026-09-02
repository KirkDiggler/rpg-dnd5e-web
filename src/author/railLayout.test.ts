import { beforeEach, describe, expect, it } from 'vitest';
import {
  CANVAS_MIN,
  nextRailWidth,
  RAIL_MIN,
  readInspectorFolded,
  readRailWidth,
  writeInspectorFolded,
  writeRailWidth,
} from './railLayout';

// A 1600px viewport measures 1568px of grid, which is the width the live
// builder was measured at when this control was designed.
const ROOT = 1568;

describe('nextRailWidth', () => {
  it('widens the rail when the grip is dragged LEFT', () => {
    // The grip sits on the rail's left edge, so leftward travel is negative
    // dx and must ADD width — the sign is the one thing easy to get backwards.
    expect(nextRailWidth(376, -200, ROOT)).toBe(576);
    expect(nextRailWidth(376, 20, ROOT)).toBe(356);
  });

  it('never takes the canvas below its floor', () => {
    const widest = ROOT - (220 + 12 + 12) - CANVAS_MIN;
    expect(nextRailWidth(376, -99999, ROOT)).toBe(widest);
    // and the canvas really does keep its floor at that width
    expect(ROOT - (220 + 12 + 12) - widest).toBe(CANVAS_MIN);
  });

  it('never goes below the rail floor', () => {
    expect(nextRailWidth(376, 99999, ROOT)).toBe(RAIL_MIN);
  });

  it('gives the rail its minimum on a viewport too small for both floors', () => {
    // 600px cannot honour a 340 rail AND a 360 canvas. The rail floor wins
    // rather than the clamp inverting and handing out a negative width.
    expect(nextRailWidth(376, -400, 600)).toBe(RAIL_MIN);
  });
});

describe('persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults to the CSS width, and clearing restores that default exactly', () => {
    expect(readRailWidth()).toBeNull();
    writeRailWidth(640);
    expect(readRailWidth()).toBe(640);
    writeRailWidth(null);
    expect(readRailWidth()).toBeNull();
  });

  it('ignores a stored width the layout would refuse', () => {
    window.localStorage.setItem('dg.rail.width', '12');
    expect(readRailWidth()).toBeNull();
    window.localStorage.setItem('dg.rail.width', 'wide please');
    expect(readRailWidth()).toBeNull();
  });

  it('defaults the inspector to OPEN and round-trips the fold', () => {
    expect(readInspectorFolded()).toBe(false);
    writeInspectorFolded(true);
    expect(readInspectorFolded()).toBe(true);
    writeInspectorFolded(false);
    expect(readInspectorFolded()).toBe(false);
  });
});
