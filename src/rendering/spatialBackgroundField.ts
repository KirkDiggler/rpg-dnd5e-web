import { ShapeUtils, Vector2 } from 'three';

export type SpatialBackgroundArea = {
  readonly id: string;
  readonly background: number;
  readonly ring: readonly { x: number; z: number }[];
};
export type SpatialBackgroundField = {
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  readonly gridSize: 64;
  readonly triangles: Float32Array;
  readonly binHeads: Uint32Array;
  readonly candidates: Uint32Array;
};
export type SpatialBackgroundSample = {
  background: number;
  configured: boolean;
};
const GRID = 64;
// All packed ordinals/offsets must be exactly representable in a float texture.
const MAX_PACKED_INTEGER = 2 ** 24;

function cross(ax: number, az: number, bx: number, bz: number): number {
  return ax * bz - az * bx;
}

/** Transient immutable-by-ownership arrays; no raster mask or authored cap. */
export function buildSpatialBackgroundField(
  areas: readonly SpatialBackgroundArea[]
): SpatialBackgroundField {
  const values: number[] = [];
  for (const area of areas) {
    if (
      !Number.isFinite(area.background) ||
      area.background < 0 ||
      area.background > 1
    )
      throw new Error(`Invalid background for ${area.id}`);
    if (
      area.ring.length < 3 ||
      area.ring.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))
    )
      throw new Error(`Invalid ring for ${area.id}`);
    const ring = area.ring.map((p) => new Vector2(p.x, p.z));
    const faces = ShapeUtils.triangulateShape(ring, []);
    if (faces.length !== ring.length - 2)
      throw new Error(`Incomplete triangulation for ${area.id}`);
    for (const face of faces) {
      const [a, b, c] = face.map((i) => ring[i]!);
      const ax = Math.fround(a!.x),
        az = Math.fround(a!.y);
      const bx = Math.fround(b!.x),
        bz = Math.fround(b!.y);
      const cx = Math.fround(c!.x),
        cz = Math.fround(c!.y);
      const signed = cross(bx - ax, bz - az, cx - ax, cz - az);
      if (!Number.isFinite(signed) || signed === 0)
        throw new Error(`Degenerate GPU triangle for ${area.id}`);
      // Every triangle has the same orientation, so closed tests need no epsilon.
      values.push(
        ax,
        az,
        ...(signed > 0 ? [bx, bz, cx, cz] : [cx, cz, bx, bz]),
        area.background,
        0
      );
    }
  }
  const triangles = new Float32Array(values);
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  for (let i = 0; i < triangles.length; i += 8) {
    for (const j of [0, 2, 4]) {
      bounds.minX = Math.min(bounds.minX, triangles[i + j]!);
      bounds.maxX = Math.max(bounds.maxX, triangles[i + j]!);
      bounds.minZ = Math.min(bounds.minZ, triangles[i + j + 1]!);
      bounds.maxZ = Math.max(bounds.maxZ, triangles[i + j + 1]!);
    }
  }
  if (!triangles.length)
    Object.assign(bounds, { minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
  const bins: number[][] = Array.from({ length: GRID * GRID }, () => []);
  const bin = (v: number, min: number, max: number): number =>
    Math.min(
      GRID - 1,
      Math.max(0, Math.floor(((v - min) / (max - min)) * GRID))
    );
  for (let i = 0; i < triangles.length; i += 8) {
    const xs = [triangles[i]!, triangles[i + 2]!, triangles[i + 4]!];
    const zs = [triangles[i + 1]!, triangles[i + 3]!, triangles[i + 5]!];
    const loX = bin(Math.min(...xs), bounds.minX, bounds.maxX),
      hiX = bin(Math.max(...xs), bounds.minX, bounds.maxX);
    const loZ = bin(Math.min(...zs), bounds.minZ, bounds.maxZ),
      hiZ = bin(Math.max(...zs), bounds.minZ, bounds.maxZ);
    for (let z = loZ; z <= hiZ; z++)
      for (let x = loX; x <= hiX; x++) bins[z * GRID + x]!.push(i / 8);
  }
  const total = bins.reduce((sum, b) => sum + b.length, 0);
  if (total > MAX_PACKED_INTEGER || triangles.length / 8 > MAX_PACKED_INTEGER)
    throw new Error(
      'Spatial field packed indices exceed Float32 exact integer capacity'
    );
  const candidates = new Uint32Array(total),
    binHeads = new Uint32Array(GRID * GRID * 2);
  let offset = 0;
  bins.forEach((list, i) => {
    binHeads[i * 2] = offset;
    binHeads[i * 2 + 1] = list.length;
    candidates.set(list, offset);
    offset += list.length;
  });
  return { bounds, gridSize: GRID, triangles, binHeads, candidates };
}

export function sampleSpatialBackgroundField(
  field: SpatialBackgroundField,
  point: { x: number; z: number }
): SpatialBackgroundSample {
  const { bounds: b, gridSize: g, triangles: t } = field;
  if (
    !t.length ||
    point.x < b.minX ||
    point.x > b.maxX ||
    point.z < b.minZ ||
    point.z > b.maxZ
  )
    return { background: 1, configured: false };
  const x = Math.min(
    g - 1,
    Math.floor(((point.x - b.minX) / (b.maxX - b.minX)) * g)
  );
  const z = Math.min(
    g - 1,
    Math.floor(((point.z - b.minZ) / (b.maxZ - b.minZ)) * g)
  );
  const head = (z * g + x) * 2,
    offset = field.binHeads[head]!,
    count = field.binHeads[head + 1]!;
  let background = 1,
    configured = false;
  for (let k = 0; k < count; k++) {
    const i = field.candidates[offset + k]! * 8;
    const ax = t[i]!,
      az = t[i + 1]!,
      bx = t[i + 2]!,
      bz = t[i + 3]!,
      cx = t[i + 4]!,
      cz = t[i + 5]!;
    if (
      cross(bx - ax, bz - az, point.x - ax, point.z - az) >= 0 &&
      cross(cx - bx, cz - bz, point.x - bx, point.z - bz) >= 0 &&
      cross(ax - cx, az - cz, point.x - cx, point.z - cz) >= 0
    ) {
      configured = true;
      background = Math.min(background, t[i + 6]!);
    }
  }
  return { background, configured };
}
