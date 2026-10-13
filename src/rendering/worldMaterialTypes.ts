/** Consumer-safe projection of Assets' material catalog v1. Image identity is
 * immutable bytes; color space and UV channel belong to the sampling role. */
export interface WorldSurfaceImage {
  readonly url: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
}
export interface WorldSurfaceMaterial {
  readonly ref: string;
  readonly displayName: string;
  readonly family: string;
  readonly baseColor: WorldSurfaceImage;
  readonly normal: WorldSurfaceImage;
  readonly metallicRoughness?: WorldSurfaceImage;
  readonly occlusion?: WorldSurfaceImage;
  /** Physical meters, not normalized asset units or scene units. */
  readonly repeatMeters: readonly [number, number];
  /** Logical strength. The renderer's chart/basis adapter is separate. */
  readonly normalScale: readonly [number, number];
  readonly roughness: number;
  readonly metalness: number;
}
