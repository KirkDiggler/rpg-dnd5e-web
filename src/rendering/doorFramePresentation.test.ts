import { describe, expect, it } from 'vitest';
import {
  copyDoorFramePresentation,
  copyWallFrameSpan,
} from './doorFramePresentation';
const frame = {
  span: { before: 3, after: 4 },
  faceFinishes: [{ side: 'positive-z', materialRef: 'opaque:gray', phaseU: 0 }],
};
describe('captured door frame facts', () => {
  it('copies nested facts, scales only lengths and keeps explicit zero and opaque intent', () => {
    const copied = copyDoorFramePresentation(frame, 'door', 0.5)!;
    expect(copied.span).toEqual({ before: 1.5, after: 2 });
    expect(copied.faceFinishes).toEqual(frame.faceFinishes);
    copied.span.before = 99;
    copied.faceFinishes[0].materialRef = 'changed';
    expect(frame.span.before).toBe(3);
    expect(frame.faceFinishes[0].materialRef).toBe('opaque:gray');
    expect(copyDoorFramePresentation(undefined)).toBeUndefined();
    expect(
      copyDoorFramePresentation({ span: { before: 1, after: 1 } })?.faceFinishes
    ).toEqual([]);
  });
  it.each([
    null,
    {},
    { ...frame, span: { before: 0, after: 3 } },
    { ...frame, faceFinishes: [{ side: 'positive-z', materialRef: 'look' }] },
    { ...frame, faceFinishes: [{ ...frame.faceFinishes[0], phaseU: 1 }] },
    { ...frame, faceFinishes: [{ ...frame.faceFinishes[0], phaseU: NaN }] },
    { ...frame, faceFinishes: [frame.faceFinishes[0], frame.faceFinishes[0]] },
  ])('refuses malformed present facts %#', (value) => {
    expect(() => copyDoorFramePresentation(value)).toThrow();
  });
  it('does not turn a missing or overflowing span into a valid visual cut', () => {
    expect(copyWallFrameSpan(undefined)).toBeUndefined();
    expect(() => copyWallFrameSpan({ before: Infinity, after: 1 })).toThrow();
  });
});
