import { describe, expect, it } from 'vitest';
import { hexToProtoPosition, protoPositionToHex } from './hexCoord';

// HexCoord uses (q, r, s); Position uses (x, y, z). Both cube; 1:1 mapping.

describe('protoPositionToHex', () => {
  it('maps cube position (1, -1, 0) to hex (1, -1, 0)', () => {
    const pos = { x: 1, y: -1, z: 0 };
    expect(protoPositionToHex(pos)).toEqual({ q: 1, r: -1, s: 0 });
  });

  it('preserves the cube invariant x + y + z = 0', () => {
    const cases = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: -1, z: -1 },
      { x: -3, y: 5, z: -2 },
    ];
    for (const pos of cases) {
      const hex = protoPositionToHex(pos);
      expect(hex.q + hex.r + hex.s).toBe(0);
    }
  });
});

describe('hexToProtoPosition', () => {
  it('round-trips through protoPositionToHex', () => {
    const cases = [
      { q: 0, r: 0, s: 0 },
      { q: 1, r: -1, s: 0 },
      { q: -2, r: 1, s: 1 },
      { q: 5, r: -3, s: -2 },
    ];
    for (const hex of cases) {
      const pos = hexToProtoPosition(hex);
      expect(protoPositionToHex(pos)).toEqual(hex);
    }
  });
});
