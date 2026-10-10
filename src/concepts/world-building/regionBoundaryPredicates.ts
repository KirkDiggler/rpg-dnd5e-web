import type { WorldPoint } from './types';

/** Outward intervals: each rounded operation expands by 2 ulps of its
 * magnitude plus the smallest subnormal. This exceeds binary64's half-ulp
 * forward error, including gradual underflow. Overflow cannot certify a sign.
 * No tolerance is a connectivity rule. Exact certificates are deliberately
 * limited to identical authored points and axis-aligned contacts. */
export type Interval = readonly [number, number];
export type CertifiedPoint = { point: WorldPoint; x: Interval; z: Interval };
export type Sign = -1 | 0 | 1 | 'uncertain';
export function exactPoint(point: WorldPoint): CertifiedPoint {
  return { point, x: [point.x, point.x], z: [point.z, point.z] };
}
function outward(low: number, high: number): Interval {
  const error =
    Math.max(Math.abs(low), Math.abs(high)) * Number.EPSILON * 2 +
    Number.MIN_VALUE;
  return [low - error, high + error];
}
export function add(a: Interval, b: Interval): Interval {
  return outward(a[0] + b[0], a[1] + b[1]);
}
export function sub(a: Interval, b: Interval): Interval {
  return outward(a[0] - b[1], a[1] - b[0]);
}
export function mul(a: Interval, b: Interval): Interval {
  const values = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
  return outward(Math.min(...values), Math.max(...values));
}
export function divide(a: Interval, b: Interval): Interval | null {
  if (b[0] <= 0 && b[1] >= 0) return null;
  const values = [a[0] / b[0], a[0] / b[1], a[1] / b[0], a[1] / b[1]];
  const result = outward(Math.min(...values), Math.max(...values));
  return result.every(Number.isFinite) ? result : null;
}
export function intervalSign(value: Interval): Sign {
  if (!value.every(Number.isFinite)) return 'uncertain';
  return value[0] > 0 ? 1 : value[1] < 0 ? -1 : 'uncertain';
}
export function samePoint(a: WorldPoint, b: WorldPoint): boolean {
  return a.x === b.x && a.z === b.z;
}
export function orientation(
  a: CertifiedPoint,
  b: CertifiedPoint,
  c: CertifiedPoint
): Sign {
  if ([a, b, c].every((p) => p.x[0] === p.x[1] && p.z[0] === p.z[1])) {
    if (
      samePoint(a.point, b.point) ||
      samePoint(a.point, c.point) ||
      samePoint(b.point, c.point)
    )
      return 0;
    if (
      (a.point.x === b.point.x && b.point.x === c.point.x) ||
      (a.point.z === b.point.z && b.point.z === c.point.z)
    )
      return 0;
  }
  return intervalSign(
    sub(mul(sub(b.x, a.x), sub(c.z, a.z)), mul(sub(b.z, a.z), sub(c.x, a.x)))
  );
}
export type SegmentContact =
  | { kind: 'none' }
  | { kind: 'point'; point: CertifiedPoint; a: Interval; b: Interval }
  | { kind: 'unsupported' | 'uncertain' };
function parameter(
  a: WorldPoint,
  b: WorldPoint,
  p: CertifiedPoint
): Interval | null {
  if (samePoint(a, p.point)) return [0, 0];
  if (samePoint(b, p.point)) return [1, 1];
  const axis = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? 'x' : 'z';
  return divide(
    sub(p[axis], [a[axis], a[axis]]),
    sub([b[axis], b[axis]], [a[axis], a[axis]])
  );
}
export function segmentContact(
  a: WorldPoint,
  b: WorldPoint,
  c: WorldPoint,
  d: WorldPoint
): SegmentContact {
  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
    Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
    Math.max(a.z, b.z) < Math.min(c.z, d.z) ||
    Math.max(c.z, d.z) < Math.min(a.z, b.z)
  )
    return { kind: 'none' };
  if (
    (samePoint(a, c) && samePoint(b, d)) ||
    (samePoint(a, d) && samePoint(b, c))
  )
    return { kind: 'unsupported' };
  const points = [a, b, c, d].map(exactPoint);
  const signs = [
    orientation(points[0], points[1], points[2]),
    orientation(points[0], points[1], points[3]),
    orientation(points[2], points[3], points[0]),
    orientation(points[2], points[3], points[1]),
  ];
  const shared = [a, b].find((p) => samePoint(p, c) || samePoint(p, d));
  if (shared) {
    // Joined collinear axis sources are valid only when their interiors do not overlap.
    const axis =
      a.x === b.x && c.x === d.x
        ? 'z'
        : a.z === b.z && c.z === d.z
          ? 'x'
          : null;
    if (
      axis &&
      Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) >
        Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]))
    )
      return { kind: 'unsupported' };
    if (!axis && signs.some((s) => s === 'uncertain'))
      return { kind: 'uncertain' };
    const point = exactPoint(shared);
    return {
      kind: 'point',
      point,
      a: parameter(a, b, point)!,
      b: parameter(c, d, point)!,
    };
  }
  if (signs.every((s) => s === 0)) return { kind: 'unsupported' };
  if (signs.some((s) => s === 'uncertain')) return { kind: 'uncertain' };
  if (
    (signs[0] === signs[1] && signs[0] !== 0) ||
    (signs[2] === signs[3] && signs[2] !== 0)
  )
    return { kind: 'none' };
  const contactEndpoint =
    [c, d].find((_, i) => signs[i] === 0) ??
    [a, b].find((_, i) => signs[i + 2] === 0);
  if (contactEndpoint) {
    const point = exactPoint(contactEndpoint);
    const ta = parameter(a, b, point),
      tb = parameter(c, d, point);
    if (!ta || !tb) return { kind: 'uncertain' };
    return { kind: 'point', point, a: ta, b: tb };
  }
  // Axis crossings are exactly represented. General proper intersections carry
  // their construction intervals through graph ordering and seed classification.
  if ((a.x === b.x && c.z === d.z) || (a.z === b.z && c.x === d.x)) {
    const point = exactPoint({
      x: a.x === b.x ? a.x : c.x,
      z: a.z === b.z ? a.z : c.z,
    });
    return {
      kind: 'point',
      point,
      a: parameter(a, b, point)!,
      b: parameter(c, d, point)!,
    };
  }
  const rx = sub(points[1].x, points[0].x),
    rz = sub(points[1].z, points[0].z);
  const sx = sub(points[3].x, points[2].x),
    sz = sub(points[3].z, points[2].z);
  const cx = sub(points[2].x, points[0].x),
    cz = sub(points[2].z, points[0].z);
  const denominator = sub(mul(rx, sz), mul(rz, sx));
  const ta = divide(sub(mul(cx, sz), mul(cz, sx)), denominator);
  const tb = divide(sub(mul(cx, rz), mul(cz, rx)), denominator);
  if (!ta || !tb || ta[0] <= 0 || ta[1] >= 1 || tb[0] <= 0 || tb[1] >= 1)
    return { kind: 'uncertain' };
  const x = add(points[0].x, mul(ta, rx)),
    z = add(points[0].z, mul(ta, rz));
  return {
    kind: 'point',
    point: { x, z, point: { x: (x[0] + x[1]) / 2, z: (z[0] + z[1]) / 2 } },
    a: ta,
    b: tb,
  };
}

export function pointInRing(
  ring: readonly CertifiedPoint[],
  point: WorldPoint
): 'inside' | 'outside' | 'boundary' | 'uncertain' {
  if (
    point.x < Math.min(...ring.map((p) => p.x[0])) ||
    point.x > Math.max(...ring.map((p) => p.x[1])) ||
    point.z < Math.min(...ring.map((p) => p.z[0])) ||
    point.z > Math.max(...ring.map((p) => p.z[1]))
  )
    return 'outside';
  let winding = 0;
  const p = exactPoint(point);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const side = orientation(a, b, p);
    if (side === 'uncertain') {
      if (
        point.x >= Math.min(a.x[0], b.x[0]) &&
        point.x <= Math.max(a.x[1], b.x[1]) &&
        point.z >= Math.min(a.z[0], b.z[0]) &&
        point.z <= Math.max(a.z[1], b.z[1])
      )
        return 'uncertain';
    }
    if (
      side === 0 &&
      point.x >= Math.min(a.point.x, b.point.x) &&
      point.x <= Math.max(a.point.x, b.point.x) &&
      point.z >= Math.min(a.point.z, b.point.z) &&
      point.z <= Math.max(a.point.z, b.point.z)
    )
      return 'boundary';
    const belowA = a.z[1] <= point.z,
      aboveA = a.z[0] > point.z;
    const belowB = b.z[1] <= point.z,
      aboveB = b.z[0] > point.z;
    if ((!belowA && !aboveA) || (!belowB && !aboveB)) return 'uncertain';
    if (belowA && aboveB) {
      if (side === 'uncertain') return 'uncertain';
      if (side === 1) winding++;
    }
    if (aboveA && belowB) {
      if (side === 'uncertain') return 'uncertain';
      if (side === -1) winding--;
    }
  }
  return winding ? 'inside' : 'outside';
}
