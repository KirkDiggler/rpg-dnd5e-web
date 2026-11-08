/** Consumer-safe projections of Assets' shared material catalog. Image identity is
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

/** Color-only atlas choice. It uses the model's authored UVs/sampling, never
 * masonry charts or manufactured normal/emissive channels. */
export interface WorldAtlasMaterial {
  readonly ref: string;
  readonly displayName: string;
  readonly family: string;
  readonly mapping: 'authored-uv';
  readonly baseColor: WorldSurfaceImage;
  readonly normal: null;
  readonly emissive: null;
}
export interface WorldMaterialCollection {
  readonly ref: string;
  readonly displayName: string;
  readonly materials: readonly string[];
}
export interface WorldAtlasSampler {
  readonly wrapS: number;
  readonly wrapT: number;
  readonly magFilter: number;
  readonly minFilter: number;
}
export interface WorldAtlasSurface {
  readonly id: string;
  readonly node: string;
  readonly material: string;
  readonly texCoord: number;
  readonly defaultBaseColorSha256: string;
  readonly sampler: WorldAtlasSampler;
  readonly suggestedCollections: readonly string[];
}
export interface WorldAtlasBinding {
  readonly assetRef: string;
  readonly glbSha256: string;
  readonly surfaces: readonly WorldAtlasSurface[];
}

/** Authored-UV view of the same shared material catalog. */
export interface WorldAtlasCatalog {
  readonly materials: readonly WorldAtlasMaterial[];
  readonly collections: readonly WorldMaterialCollection[];
  readonly bindings: readonly WorldAtlasBinding[];
}

/** Typed views of one source document and digest. A v1 result retains its
 * earlier shape; v2 must be explicitly handled before generation/publication. */
export type WorldMaterialResources = {
  readonly catalogSha256: string;
  readonly materials: readonly WorldSurfaceMaterial[];
} & (
  | { readonly schemaVersion?: undefined }
  | {
      readonly schemaVersion: 2;
      readonly atlasMaterials: readonly WorldAtlasMaterial[];
      readonly collections: readonly WorldMaterialCollection[];
      readonly bindings: readonly WorldAtlasBinding[];
    }
);
