/**
 * Floor Builder Utility
 * Version: 1.1
 * Date: 2026-01-19
 *
 * Creates hex-tiled floors using instanced meshes for performance.
 * Supports per-tile color variation and integrates with AdvancedCharacterShader.
 *
 * HEX GRID COORDINATE SYSTEM:
 *   Uses axial coordinates (q, r) for hex positioning.
 *   Pointy-top orientation by default.
 *
 *   Visual layout:
 *        (0,-1)  (1,-1)
 *     (-1,0)  (0,0)  (1,0)
 *        (-1,1)  (0,1)
 *
 * Usage:
 *   import { FloorBuilder, FloorColors } from './FloorBuilder';
 *
 *   const builder = new FloorBuilder({ hexWidth: 48, hexHeight: 32 });
 *
 *   // Option 1: Procedural hex (no OBJ needed)
 *   const floor = builder.createProceduralFloor(radius, { color: FloorColors.stone });
 *
 *   // Option 2: Using your hex OBJ
 *   const floor = builder.createFloorFromOBJ(hexModel, radius, options);
 *
 *   scene.add(floor);
 */

import * as THREE from 'three';

import {
  createAdvancedCharacterShader,
  startShaderAnimation,
} from '@/shaders/AdvancedCharacterShader';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** Axial hex coordinate */
export interface HexCoord {
  q: number;
  r: number;
}

/** Cube hex coordinate */
export interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

/** World position on the XZ plane */
export interface WorldPos {
  x: number;
  z: number;
}

/** 3D scale values */
export interface ScaleXYZ {
  x?: number;
  y?: number;
  z?: number;
}

/** Scale value: either a uniform Y scale or per-axis */
export type ScaleValue = number | ScaleXYZ;

/** Elevation source: function, or record keyed by "q,r" */
export type ElevationSource =
  | ((q: number, r: number) => number)
  | Record<string, number>;

/** Scale source: function, or record keyed by "q,r" */
export type ScaleSource =
  | ((q: number, r: number) => ScaleValue)
  | Record<string, ScaleValue>;

/** Elevation source that also supports Map (for createFloorFromGeometry) */
export type ElevationSourceWithMap = ElevationSource | Map<string, number>;

/** Scale source that also supports Map (for createFloorFromGeometry) */
export type ScaleSourceWithMap = ScaleSource | Map<string, ScaleValue>;

/** Constructor options for FloorBuilder */
export interface FloorBuilderOptions {
  /** Width of hex (point to point) */
  hexWidth?: number;
  /** Height of hex (flat to flat), defaults to hexWidth * 0.866 */
  hexHeight?: number;
  /** Thickness of floor tiles */
  tileThickness?: number;
  /** Auto-shading amount (default: 0.12) */
  shadingVariance?: number;
  /** Per-tile color variation (default: 0.05) */
  colorVariance?: number;
}

/** Options for procedural floor and rectangular floor creation */
export interface FloorOptions {
  /** Base floor color */
  color?: number;
  /** Add per-tile color variation */
  addVariation?: boolean;
  /** Elevation function(q,r) or object {"q,r": y} */
  elevation?: ElevationSource | null;
  /** Scale function(q,r) or object {"q,r": ScaleValue} */
  scale?: ScaleSource | null;
}

/** Options for floor creation from custom geometry */
export interface FloorFromGeometryOptions {
  /** Base floor color */
  color?: number;
  /** Add per-tile color variation */
  addVariation?: boolean;
  /** Elevation function(q,r), Map, or object {"q,r": y} */
  elevation?: ElevationSourceWithMap | null;
  /** Scale function(q,r), Map, or object {"q,r": ScaleValue} */
  scale?: ScaleSourceWithMap | null;
}

/** A tile with elevation, optional scale and color */
export interface ElevationTile {
  q: number;
  r: number;
  y?: number;
  scale?: ScaleValue;
  color?: number;
}

/** Options for elevation-based floor creation */
export interface ElevationFloorOptions {
  /** Default base color */
  color?: number;
  /** Add per-tile color variation */
  addVariation?: boolean;
}

/** A tile with terrain color */
export interface TerrainTile {
  q: number;
  r: number;
  color?: number;
}

/** Options for mixed terrain floor */
export interface MixedTerrainOptions {
  /** Add per-tile color variation */
  addVariation?: boolean;
}

/** API Room data format */
export interface APIRoom {
  width: number;
  height: number;
  walls?: APIWall[];
}

/** API Wall segment */
export interface APIWall {
  start: CubeCoord;
  end: CubeCoord;
}

/** Options for creating floor from API room data */
export interface APIFloorOptions {
  /** Hex size for coordinate conversion */
  hexSize?: number;
  /** Optional custom hex geometry */
  hexGeometry?: THREE.BufferGeometry;
  /** Base floor color */
  color?: number;
  /** Floor tile thickness */
  thickness?: number;
  /** Per-tile color variation */
  colorVariance?: number;
  /** Darken hexes where walls are */
  markWallHexes?: boolean;
}

/** Options for creating a complete room from API data */
export interface APIRoomOptions {
  hexSize?: number;
  floorColor?: number;
  floorThickness?: number;
  colorVariance?: number;
  markWallHexes?: boolean;
  hexGeometry?: THREE.BufferGeometry;
}

/** Options for convenience floor functions */
export interface QuickFloorOptions {
  hexWidth?: number;
  hexHeight?: number;
  thickness?: number;
  color?: number;
  addVariation?: boolean;
  elevation?: ElevationSource | null;
  scale?: ScaleSource | null;
}

// ============================================================================
// COLOR PRESETS
// ============================================================================

export const FloorColors = {
  // Stone variants
  stone: 0x808080,
  stoneDark: 0x606060,
  stoneLight: 0xa0a0a0,
  cobblestone: 0x707070,

  // Wood variants
  woodLight: 0xc4a484,
  woodMedium: 0x8b7355,
  woodDark: 0x5c4033,

  // Terrain
  grass: 0x4a7c3a,
  grassDark: 0x3a5c2a,
  dirt: 0x8b6914,
  sand: 0xd4b896,
  snow: 0xe8e8e8,
  water: 0x4a90d9,
  waterDeep: 0x2a5080,

  // Dungeon
  dungeonFloor: 0x4a4a4a,
  dungeonWet: 0x3a4a5a,
  dungeonMoss: 0x4a5a4a,

  // Special
  lava: 0xff4500,
  ice: 0xadd8e6,
  marble: 0xf0f0f0,
  obsidian: 0x1a1a2e,
} as const;

// ============================================================================
// HEX GRID MATH
// ============================================================================

/**
 * Convert axial hex coordinates (q, r) to world position (x, z)
 * Pointy-top orientation
 */
export function axialToWorld(
  q: number,
  r: number,
  hexWidth: number,
  hexHeight: number
): WorldPos {
  const x = hexWidth * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const z = hexHeight * ((3 / 2) * r);
  return { x, z };
}

/**
 * Convert world position to axial coordinates (approximate, for picking)
 */
export function worldToAxial(
  x: number,
  z: number,
  hexWidth: number,
  hexHeight: number
): HexCoord {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * z) / hexWidth;
  const r = ((2 / 3) * z) / hexHeight;
  return { q: Math.round(q), r: Math.round(r) };
}

/**
 * Get all hex coordinates within a radius (hexagonal shape)
 */
export function getHexesInRadius(radius: number): HexCoord[] {
  const hexes: HexCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      hexes.push({ q, r });
    }
  }
  return hexes;
}

/**
 * Get all hex coordinates in a rectangular area
 */
export function getHexesInRect(width: number, height: number): HexCoord[] {
  const hexes: HexCoord[] = [];
  for (let r = 0; r < height; r++) {
    const rOffset = Math.floor(r / 2);
    for (let q = -rOffset; q < width - rOffset; q++) {
      hexes.push({ q, r });
    }
  }
  return hexes;
}

// ============================================================================
// TEXTURE HELPERS
// ============================================================================

function createSolidColorTexture(color: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  const ctx = canvas.getContext('2d')!;
  const c = new THREE.Color(color);
  ctx.fillStyle = `rgb(${Math.floor(c.r * 255)}, ${Math.floor(c.g * 255)}, ${Math.floor(c.b * 255)})`;
  ctx.fillRect(0, 0, 1, 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;

  return texture;
}

// ============================================================================
// PROCEDURAL HEX GEOMETRY
// ============================================================================

/**
 * Create a flat hexagon geometry (pointy-top)
 */
function createHexGeometry(
  width: number,
  height: number,
  thickness: number = 1
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();

  // Pointy-top hex vertices
  const angles = [
    Math.PI / 6, // 30°
    Math.PI / 2, // 90°
    (5 * Math.PI) / 6, // 150°
    (7 * Math.PI) / 6, // 210°
    (3 * Math.PI) / 2, // 270°
    (11 * Math.PI) / 6, // 330°
  ];

  const radiusX = width / 2;
  const radiusZ = height / 2;

  // Start at first vertex
  shape.moveTo(Math.cos(angles[0]) * radiusX, Math.sin(angles[0]) * radiusZ);

  // Draw to remaining vertices
  for (let i = 1; i < 6; i++) {
    shape.lineTo(Math.cos(angles[i]) * radiusX, Math.sin(angles[i]) * radiusZ);
  }
  shape.closePath();

  // Extrude to give thickness
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: thickness,
    bevelEnabled: false,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Rotate so it lies flat (Y-up)
  geometry.rotateX(-Math.PI / 2);

  // Center vertically
  geometry.translate(0, thickness / 2, 0);

  return geometry;
}

// ============================================================================
// HELPER: resolve scale value
// ============================================================================

function applyScaleValue(scaleVec: THREE.Vector3, s: ScaleValue): void {
  if (typeof s === 'number') {
    scaleVec.set(1, s, 1); // Just Y scale
  } else {
    scaleVec.set(s.x ?? 1, s.y ?? 1, s.z ?? 1);
  }
}

// ============================================================================
// FLOOR BUILDER CLASS
// ============================================================================

export class FloorBuilder {
  hexWidth: number;
  hexHeight: number;
  tileThickness: number;
  shadingVariance: number;
  colorVariance: number;

  private materialCache: Map<number, THREE.ShaderMaterial>;
  private animatedShaders: THREE.ShaderMaterial[];

  constructor(options: FloorBuilderOptions = {}) {
    this.hexWidth = options.hexWidth ?? 48;
    this.hexHeight = options.hexHeight ?? this.hexWidth * 0.866;
    this.tileThickness = options.tileThickness ?? 2;
    this.shadingVariance = options.shadingVariance ?? 0.12;
    this.colorVariance = options.colorVariance ?? 0.05;

    this.materialCache = new Map();
    this.animatedShaders = [];
  }

  /**
   * Get or create material for color
   */
  getMaterial(color: number | THREE.Color): THREE.ShaderMaterial {
    const colorHex = typeof color === 'number' ? color : color.getHex();

    const cached = this.materialCache.get(colorHex);
    if (cached) {
      return cached;
    }

    const texture = createSolidColorTexture(colorHex);
    const material = createAdvancedCharacterShader(texture, {
      skinColor: colorHex,
      shadingVariance: this.shadingVariance,
      opacity: 1.0,
    });

    this.materialCache.set(colorHex, material);
    this.animatedShaders.push(material);

    return material;
  }

  /**
   * Create a floor using procedural hex geometry (no OBJ needed)
   * Uses InstancedMesh for performance
   */
  createProceduralFloor(
    radius: number,
    options: FloorOptions = {}
  ): THREE.InstancedMesh {
    const color = options.color ?? FloorColors.stone;
    const addVariation = options.addVariation ?? true;
    const elevation = options.elevation ?? null;
    const scale = options.scale ?? null;

    const hexes = getHexesInRadius(radius);
    const hexGeometry = createHexGeometry(
      this.hexWidth,
      this.hexHeight,
      this.tileThickness
    );
    const material = this.getMaterial(color);

    const instancedMesh = new THREE.InstancedMesh(
      hexGeometry,
      material,
      hexes.length
    );

    // Set up instance colors if variation enabled
    if (addVariation) {
      const colors = new Float32Array(hexes.length * 3);
      const baseColor = new THREE.Color(color);

      for (let i = 0; i < hexes.length; i++) {
        const variation = 1 + (Math.random() - 0.5) * 2 * this.colorVariance;
        colors[i * 3] = baseColor.r * variation;
        colors[i * 3 + 1] = baseColor.g * variation;
        colors[i * 3 + 2] = baseColor.b * variation;
      }

      instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
        colors,
        3
      );
    }

    // Position each hex
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3(1, 1, 1);

    hexes.forEach((hex, index) => {
      const pos = axialToWorld(hex.q, hex.r, this.hexWidth, this.hexHeight);

      // Get elevation
      let y = 0;
      if (elevation) {
        if (typeof elevation === 'function') {
          y = elevation(hex.q, hex.r) || 0;
        } else {
          y = elevation[`${hex.q},${hex.r}`] || 0;
        }
      }

      // Get scale
      scaleVec.set(1, 1, 1);
      if (scale) {
        let s: ScaleValue | undefined;
        if (typeof scale === 'function') {
          s = scale(hex.q, hex.r);
        } else {
          s = scale[`${hex.q},${hex.r}`];
        }
        if (s !== undefined) {
          applyScaleValue(scaleVec, s);
        }
      }

      position.set(pos.x, y, pos.z);
      matrix.compose(position, quaternion, scaleVec);
      instancedMesh.setMatrixAt(index, matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;

    instancedMesh.userData.type = 'hexFloor';
    instancedMesh.userData.hexes = hexes;
    instancedMesh.userData.radius = radius;

    return instancedMesh;
  }

  /**
   * Create a floor using your custom hex OBJ model
   */
  createFloorFromGeometry(
    hexGeometry: THREE.BufferGeometry,
    radius: number,
    options: FloorFromGeometryOptions = {}
  ): THREE.InstancedMesh {
    const color = options.color ?? FloorColors.stone;
    const addVariation = options.addVariation ?? true;
    const elevation = options.elevation ?? null;
    const scale = options.scale ?? null;

    const hexes = getHexesInRadius(radius);
    const material = this.getMaterial(color);

    const instancedMesh = new THREE.InstancedMesh(
      hexGeometry,
      material,
      hexes.length
    );

    if (addVariation) {
      const colors = new Float32Array(hexes.length * 3);
      const baseColor = new THREE.Color(color);

      for (let i = 0; i < hexes.length; i++) {
        const variation = 1 + (Math.random() - 0.5) * 2 * this.colorVariance;
        colors[i * 3] = baseColor.r * variation;
        colors[i * 3 + 1] = baseColor.g * variation;
        colors[i * 3 + 2] = baseColor.b * variation;
      }

      instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
        colors,
        3
      );
    }

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3(1, 1, 1);

    hexes.forEach((hex, index) => {
      const pos = axialToWorld(hex.q, hex.r, this.hexWidth, this.hexHeight);

      // Get elevation
      let y = 0;
      if (elevation) {
        if (typeof elevation === 'function') {
          y = elevation(hex.q, hex.r) || 0;
        } else if (elevation instanceof Map) {
          y = elevation.get(`${hex.q},${hex.r}`) || 0;
        } else {
          y = elevation[`${hex.q},${hex.r}`] || 0;
        }
      }

      // Get scale
      scaleVec.set(1, 1, 1);
      if (scale) {
        let s: ScaleValue | undefined;
        if (typeof scale === 'function') {
          s = scale(hex.q, hex.r);
        } else if (scale instanceof Map) {
          s = scale.get(`${hex.q},${hex.r}`);
        } else {
          s = scale[`${hex.q},${hex.r}`];
        }
        if (s !== undefined) {
          applyScaleValue(scaleVec, s);
        }
      }

      position.set(pos.x, y, pos.z);
      matrix.compose(position, quaternion, scaleVec);
      instancedMesh.setMatrixAt(index, matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;

    instancedMesh.userData.type = 'hexFloor';
    instancedMesh.userData.hexes = hexes;

    return instancedMesh;
  }

  /**
   * Create a floor with explicit elevation map
   */
  createFloorWithElevation(
    hexGeometry: THREE.BufferGeometry,
    elevationMap: ElevationTile[],
    options: ElevationFloorOptions = {}
  ): THREE.Group {
    const defaultColor = options.color ?? FloorColors.stone;
    const addVariation = options.addVariation ?? true;

    // Build lookup maps
    const elevationLookup: Record<string, number> = {};
    const scaleLookup: Record<string, ScaleValue> = {};
    const colorLookup: Record<string, number> = {};

    elevationMap.forEach((tile) => {
      const key = `${tile.q},${tile.r}`;
      if (tile.y !== undefined) elevationLookup[key] = tile.y;
      if (tile.scale !== undefined) scaleLookup[key] = tile.scale;
      if (tile.color !== undefined) colorLookup[key] = tile.color;
    });

    // Get all hex positions from the map
    const hexes: HexCoord[] = elevationMap.map((t) => ({
      q: t.q,
      r: t.r,
    }));

    // Group by color for efficient rendering
    const colorGroups = new Map<number, HexCoord[]>();
    hexes.forEach((hex) => {
      const key = `${hex.q},${hex.r}`;
      const tileColor = colorLookup[key] ?? defaultColor;
      if (!colorGroups.has(tileColor)) {
        colorGroups.set(tileColor, []);
      }
      colorGroups.get(tileColor)!.push(hex);
    });

    const floorGroup = new THREE.Group();

    colorGroups.forEach((groupHexes, colorHex) => {
      const material = this.getMaterial(colorHex);
      const instancedMesh = new THREE.InstancedMesh(
        hexGeometry,
        material,
        groupHexes.length
      );

      if (addVariation) {
        const colors = new Float32Array(groupHexes.length * 3);
        const baseColor = new THREE.Color(colorHex);

        for (let i = 0; i < groupHexes.length; i++) {
          const variation = 1 + (Math.random() - 0.5) * 2 * this.colorVariance;
          colors[i * 3] = baseColor.r * variation;
          colors[i * 3 + 1] = baseColor.g * variation;
          colors[i * 3 + 2] = baseColor.b * variation;
        }

        instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
          colors,
          3
        );
      }

      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scaleVec = new THREE.Vector3(1, 1, 1);

      groupHexes.forEach((hex, index) => {
        const pos = axialToWorld(hex.q, hex.r, this.hexWidth, this.hexHeight);
        const key = `${hex.q},${hex.r}`;

        const y = elevationLookup[key] ?? 0;
        const s = scaleLookup[key];

        scaleVec.set(1, 1, 1);
        if (s !== undefined) {
          applyScaleValue(scaleVec, s);
        }

        position.set(pos.x, y, pos.z);
        matrix.compose(position, quaternion, scaleVec);
        instancedMesh.setMatrixAt(index, matrix);
      });

      instancedMesh.instanceMatrix.needsUpdate = true;
      instancedMesh.userData.hexes = groupHexes;
      floorGroup.add(instancedMesh);
    });

    floorGroup.userData.type = 'elevatedHexFloor';
    floorGroup.userData.elevationMap = elevationMap;

    return floorGroup;
  }

  /**
   * Create a rectangular floor area
   */
  createRectangularFloor(
    width: number,
    height: number,
    options: FloorOptions = {}
  ): THREE.InstancedMesh {
    const color = options.color ?? FloorColors.stone;
    const addVariation = options.addVariation ?? true;

    const hexes = getHexesInRect(width, height);
    const hexGeometry = createHexGeometry(
      this.hexWidth,
      this.hexHeight,
      this.tileThickness
    );
    const material = this.getMaterial(color);

    const instancedMesh = new THREE.InstancedMesh(
      hexGeometry,
      material,
      hexes.length
    );

    if (addVariation) {
      const colors = new Float32Array(hexes.length * 3);
      const baseColor = new THREE.Color(color);

      for (let i = 0; i < hexes.length; i++) {
        const variation = 1 + (Math.random() - 0.5) * 2 * this.colorVariance;
        colors[i * 3] = baseColor.r * variation;
        colors[i * 3 + 1] = baseColor.g * variation;
        colors[i * 3 + 2] = baseColor.b * variation;
      }

      instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
        colors,
        3
      );
    }

    const matrix = new THREE.Matrix4();
    hexes.forEach((hex, index) => {
      const pos = axialToWorld(hex.q, hex.r, this.hexWidth, this.hexHeight);
      matrix.setPosition(pos.x, 0, pos.z);
      instancedMesh.setMatrixAt(index, matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;

    instancedMesh.userData.type = 'hexFloor';
    instancedMesh.userData.hexes = hexes;

    return instancedMesh;
  }

  /**
   * Create a floor with mixed terrain (multiple colors)
   */
  createMixedTerrainFloor(
    terrainMap: TerrainTile[],
    options: MixedTerrainOptions = {}
  ): THREE.Group {
    const addVariation = options.addVariation ?? true;

    // Group hexes by color for efficient instancing
    const colorGroups = new Map<number, HexCoord[]>();

    terrainMap.forEach((tile) => {
      const colorHex = tile.color ?? FloorColors.stone;
      if (!colorGroups.has(colorHex)) {
        colorGroups.set(colorHex, []);
      }
      colorGroups.get(colorHex)!.push({ q: tile.q, r: tile.r });
    });

    const floorGroup = new THREE.Group();
    const hexGeometry = createHexGeometry(
      this.hexWidth,
      this.hexHeight,
      this.tileThickness
    );

    colorGroups.forEach((hexes, colorHex) => {
      const material = this.getMaterial(colorHex);
      const instancedMesh = new THREE.InstancedMesh(
        hexGeometry,
        material,
        hexes.length
      );

      if (addVariation) {
        const colors = new Float32Array(hexes.length * 3);
        const baseColor = new THREE.Color(colorHex);

        for (let i = 0; i < hexes.length; i++) {
          const variation = 1 + (Math.random() - 0.5) * 2 * this.colorVariance;
          colors[i * 3] = baseColor.r * variation;
          colors[i * 3 + 1] = baseColor.g * variation;
          colors[i * 3 + 2] = baseColor.b * variation;
        }

        instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
          colors,
          3
        );
      }

      const matrix = new THREE.Matrix4();
      hexes.forEach((hex, index) => {
        const pos = axialToWorld(hex.q, hex.r, this.hexWidth, this.hexHeight);
        matrix.setPosition(pos.x, 0, pos.z);
        instancedMesh.setMatrixAt(index, matrix);
      });

      instancedMesh.instanceMatrix.needsUpdate = true;
      floorGroup.add(instancedMesh);
    });

    floorGroup.userData.type = 'mixedTerrainFloor';
    floorGroup.userData.terrainMap = terrainMap;

    return floorGroup;
  }

  /**
   * Highlight a specific hex tile (for hover/selection)
   */
  highlightHex(
    floor: THREE.InstancedMesh,
    q: number,
    r: number,
    color: number = 0xffff00
  ): void {
    const hexes = floor.userData.hexes as HexCoord[] | undefined;
    if (!hexes) return;

    const index = hexes.findIndex((h) => h.q === q && h.r === r);
    if (index === -1) return;

    if (!floor.instanceColor) {
      // Initialize instance colors if not present
      const colors = new Float32Array(hexes.length * 3);
      for (let i = 0; i < hexes.length; i++) {
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 1;
        colors[i * 3 + 2] = 1;
      }
      floor.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    }

    const c = new THREE.Color(color);
    floor.instanceColor.setXYZ(index, c.r, c.g, c.b);
    floor.instanceColor.needsUpdate = true;
  }

  /**
   * Get hex coordinates from world position (for mouse picking)
   */
  worldToHex(x: number, z: number): HexCoord {
    return worldToAxial(x, z, this.hexWidth, this.hexHeight);
  }

  /**
   * Get world position from hex coordinates
   */
  hexToWorld(q: number, r: number): WorldPos {
    return axialToWorld(q, r, this.hexWidth, this.hexHeight);
  }

  /**
   * Start shader animations
   */
  startAnimations(): () => void {
    const stopFunctions = this.animatedShaders.map((shader) =>
      startShaderAnimation(shader)
    );
    return () => stopFunctions.forEach((stop) => stop());
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.materialCache.forEach((material) => material.dispose());
    this.materialCache.clear();
    this.animatedShaders = [];
  }
}

// ============================================================================
// API ADAPTER - Consume rpg-toolkit/rpg-api data format
// ============================================================================

/**
 * Convert cube coordinates to world coordinates
 * Cube coords: {x, y, z} where x + y + z = 0
 * World coords: {x, z} on the Three.js XZ plane
 */
export function cubeToWorld(cube: CubeCoord, hexSize: number): WorldPos {
  const SQRT_3 = Math.sqrt(3);
  return {
    x: hexSize * SQRT_3 * (cube.x + cube.z / 2),
    z: hexSize * (3 / 2) * cube.z,
  };
}

/**
 * Convert cube coordinates to our axial format
 * Cube {x, y, z} -> Axial {q, r}
 * Note: cube.y is derived (y = -x - z), so we use x and z
 */
export function cubeToAxial(cube: CubeCoord): HexCoord {
  return { q: cube.x, r: cube.z };
}

/**
 * Generate all hex positions in a rectangular room
 * Uses offset coordinates internally, converts to cube for output
 */
function generateRoomHexes(width: number, height: number): CubeCoord[] {
  const hexes: CubeCoord[] = [];

  for (let row = 0; row < height; row++) {
    const rowOffset = Math.floor(row / 2);
    for (let col = 0; col < width; col++) {
      // Offset to cube conversion (odd-r offset)
      const x = col - rowOffset;
      const z = row;
      const y = -x - z;
      hexes.push({ x, y, z });
    }
  }

  return hexes;
}

/**
 * Create floor from rpg-api Room data
 */
export function createFloorFromAPI(
  apiRoom: APIRoom,
  options: APIFloorOptions = {}
): THREE.Group | THREE.InstancedMesh {
  const hexSize = options.hexSize ?? 1;
  const baseColor = options.color ?? FloorColors.stone;
  const markWallHexes = options.markWallHexes ?? true;

  // Calculate hex dimensions from hexSize
  const hexWidth = hexSize * Math.sqrt(3);
  const hexHeight = hexSize * 2;

  const builder = new FloorBuilder({
    hexWidth: hexWidth,
    hexHeight: hexHeight * 0.75, // Hex row spacing
    tileThickness: options.thickness ?? 2,
    colorVariance: options.colorVariance ?? 0.05,
  });

  // Generate all hex positions for the room
  const roomHexes = generateRoomHexes(apiRoom.width, apiRoom.height);

  // Build wall lookup for marking wall hexes
  const wallHexSet = new Set<string>();
  if (markWallHexes && apiRoom.walls) {
    apiRoom.walls.forEach((wall) => {
      // Get all hexes along wall path
      const hexLine = getHexLineCube(wall.start, wall.end);
      hexLine.forEach((hex) => {
        wallHexSet.add(`${hex.x},${hex.z}`);
      });
    });
  }

  // Build elevation/color map
  const terrainMap: ElevationTile[] = roomHexes.map((cube) => {
    const axial = cubeToAxial(cube);
    const isWallHex = wallHexSet.has(`${cube.x},${cube.z}`);

    return {
      q: axial.q,
      r: axial.r,
      y: 0,
      color: isWallHex ? FloorColors.stoneDark : baseColor,
    };
  });

  // Use custom geometry if provided, otherwise procedural
  if (options.hexGeometry) {
    return builder.createFloorWithElevation(options.hexGeometry, terrainMap, {
      addVariation: true,
    });
  } else {
    return builder.createMixedTerrainFloor(terrainMap, {
      addVariation: true,
    });
  }
}

/**
 * Get all hexes along a line (cube coordinates)
 * Used for wall path calculation
 */
function getHexLineCube(start: CubeCoord, end: CubeCoord): CubeCoord[] {
  const N = Math.max(
    Math.abs(end.x - start.x),
    Math.abs(end.y - start.y),
    Math.abs(end.z - start.z)
  );

  const results: CubeCoord[] = [];

  for (let i = 0; i <= N; i++) {
    const t = N === 0 ? 0 : i / N;
    const x = Math.round(start.x + (end.x - start.x) * t);
    const z = Math.round(start.z + (end.z - start.z) * t);
    const y = -x - z;
    results.push({ x, y, z });
  }

  return results;
}

/**
 * Create complete room visualization from API data
 * Returns both floor and walls as a group
 */
export function createRoomFromAPI(
  apiRoom: APIRoom,
  options: APIRoomOptions = {}
): THREE.Group {
  const roomGroup = new THREE.Group();

  // Create floor
  const floor = createFloorFromAPI(apiRoom, {
    hexSize: options.hexSize,
    color: options.floorColor ?? FloorColors.stone,
    thickness: options.floorThickness,
    colorVariance: options.colorVariance,
    markWallHexes: options.markWallHexes,
    hexGeometry: options.hexGeometry,
  });
  floor.name = 'floor';
  roomGroup.add(floor);

  // Note: Wall creation handled separately via WallBuilder

  roomGroup.userData.type = 'apiRoom';
  roomGroup.userData.width = apiRoom.width;
  roomGroup.userData.height = apiRoom.height;

  return roomGroup;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick hex floor creation
 */
export function createHexFloor(
  radius: number,
  options: QuickFloorOptions = {}
): THREE.InstancedMesh {
  const builder = new FloorBuilder({
    hexWidth: options.hexWidth,
    hexHeight: options.hexHeight,
    tileThickness: options.thickness,
  });
  return builder.createProceduralFloor(radius, options);
}

/**
 * Quick rectangular floor
 */
export function createRectFloor(
  width: number,
  height: number,
  options: QuickFloorOptions = {}
): THREE.InstancedMesh {
  const builder = new FloorBuilder({
    hexWidth: options.hexWidth,
    hexHeight: options.hexHeight,
    tileThickness: options.thickness,
  });
  return builder.createRectangularFloor(width, height, options);
}
