import { describe, expect, it } from 'vitest';
import { fitBandIndexForBbox } from './cameraFit';

// Real cameraDials.ts band order/zooms: overview, tabletop, tactical,
// shoulder, detail — zoom-ascending, widest (most zoomed-out) first.
const BANDS = [
  { zoom: 35 }, // overview
  { zoom: 50 }, // tabletop
  { zoom: 80 }, // tactical
  { zoom: 110 }, // shoulder
  { zoom: 140 }, // detail
];
const VIEWPORT = { widthPx: 1600, heightPx: 900 };

describe('fitBandIndexForBbox', () => {
  it('returns -1 for an empty band list', () => {
    expect(fitBandIndexForBbox({ width: 10, height: 10 }, VIEWPORT, [])).toBe(
      -1
    );
  });

  it('picks the NARROWEST band that still fits a small bbox — zoom-to-fit, not the widest available', () => {
    // At zoom=140 (detail, margin 0.85): visible = 1600*0.85/140 x
    // 900*0.85/140 ≈ 9.7 x 5.46. A tiny 5x3 bbox fits even there.
    const index = fitBandIndexForBbox({ width: 5, height: 3 }, VIEWPORT, BANDS);
    expect(index).toBe(4); // detail — the narrowest, not overview
  });

  it('steps out to a wider band once the bbox is too big for a narrower one', () => {
    // At zoom=140: visible width ≈ 9.7. At zoom=110: visible width =
    // 1600*0.85/110 ≈ 12.36. A bbox 11 wide does not fit at 140 but does at
    // 110.
    const index = fitBandIndexForBbox(
      { width: 11, height: 4 },
      VIEWPORT,
      BANDS
    );
    expect(index).toBe(3); // shoulder
  });

  it('falls back to the widest band (index 0) when nothing fits', () => {
    const index = fitBandIndexForBbox(
      { width: 10_000, height: 10_000 },
      VIEWPORT,
      BANDS
    );
    expect(index).toBe(0);
  });

  it('respects height as well as width — a tall-but-narrow bbox is gated by whichever axis is tighter', () => {
    // At zoom=140: visible height ≈ 5.46. A bbox 5 wide but 6 tall does not
    // fit at 140 (height too tall) even though width alone would.
    const index = fitBandIndexForBbox({ width: 5, height: 6 }, VIEWPORT, BANDS);
    expect(index).not.toBe(4);
    // But it DOES fit at the next band out (zoom=110: visible height =
    // 900*0.85/110 ≈ 6.95).
    expect(index).toBe(3);
  });

  it('a smaller margin shrinks the effective visible area, pushing the pick wider', () => {
    const generous = fitBandIndexForBbox(
      { width: 9, height: 5 },
      VIEWPORT,
      BANDS,
      0.85
    );
    const tight = fitBandIndexForBbox(
      { width: 9, height: 5 },
      VIEWPORT,
      BANDS,
      0.5
    );
    expect(tight).toBeLessThanOrEqual(generous);
  });

  it('an exact zero-size bbox always fits the narrowest band', () => {
    expect(fitBandIndexForBbox({ width: 0, height: 0 }, VIEWPORT, BANDS)).toBe(
      4
    );
  });
});
