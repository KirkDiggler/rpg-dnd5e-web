/**
 * Cube hex coordinates (q, r, s) used by src/components/hex-grid/hexMath.ts.
 * The cube invariant q + r + s = 0 holds for valid hexes.
 */
export interface HexCoord {
  q: number;
  r: number;
  s: number;
}

/**
 * v1alpha2's Position is cube (x, y, z) with the same invariant
 * (x + y + z = 0). Mapping is direct: q := x, r := y, s := z.
 *
 * Wrapped in this helper so a future proto field rename is a one-place fix.
 */
export interface ProtoPosition {
  x: number;
  y: number;
  z: number;
}

export function protoPositionToHex(pos: ProtoPosition): HexCoord {
  return { q: pos.x, r: pos.y, s: pos.z };
}

export function hexToProtoPosition(hex: HexCoord): ProtoPosition {
  return { x: hex.q, y: hex.r, z: hex.s };
}

/**
 * Stable string key for a hex coord — usable in Set<string> / Map<string, T>.
 */
export function hexKey(hex: HexCoord): string {
  return `${hex.q},${hex.r},${hex.s}`;
}
