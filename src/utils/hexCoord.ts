/**
 * Cube hex coordinates (q, r, s) — the v1alpha2 coordinate-transform path.
 * The cube invariant q + r + s = 0 holds for valid hexes.
 *
 * Distinct from src/rendering/FloorBuilder.ts's `HexCoord` (2-field axial
 * `{q, r}`) and src/components/hex-grid/hexMath.ts's `CubeCoord` (3-field
 * `{x, y, z}`). The intentional rename to `CubeHexCoord` avoids structural-
 * typing collisions with those neighbors.
 */
export interface CubeHexCoord {
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

export function protoPositionToHex(pos: ProtoPosition): CubeHexCoord {
  return { q: pos.x, r: pos.y, s: pos.z };
}

export function hexToProtoPosition(hex: CubeHexCoord): ProtoPosition {
  return { x: hex.q, y: hex.r, z: hex.s };
}

/**
 * Stable string key for a hex coord — usable in Set<string> / Map<string, T>.
 */
export function hexKey(hex: CubeHexCoord): string {
  return `${hex.q},${hex.r},${hex.s}`;
}
