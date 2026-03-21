/**
 * Wall Builder Utility
 * Version: 1.1
 * Date: 2026-01-19
 *
 * Generates procedural walls and pillars using the AdvancedCharacterShader
 * for consistent voxel-style shading with auto light/dark variance.
 *
 * WALL THICKNESS:
 *   Thickness is calculated as a percentage of hex width.
 *   Default: 10% of hex width (recommended starting point)
 *
 *   Example: hexWidth=48, ratio=0.10 → thickness=4.8 units
 *
 *   You can override with a fixed value if preferred.
 *
 * Usage:
 *   import { WallBuilder, WallColors } from './WallBuilder';
 *
 *   // Percentage-based (recommended)
 *   const builder = new WallBuilder({
 *       hexWidth: 48,              // Your hex tile width
 *       wallThicknessRatio: 0.10   // 10% = 4.8 units thick
 *   });
 *
 *   // Or fixed thickness
 *   const builder = new WallBuilder({
 *       thickness: 4   // Always 4 units, ignores hex width
 *   });
 *
 *   const pillar = builder.createPillar(position, height);
 *   const wall = builder.createWallBetween(anchorA, anchorB, height);
 *   scene.add(pillar, wall);
 */

import * as THREE from 'three';

import {
  createAdvancedCharacterShader,
  startShaderAnimation,
} from '@/shaders/AdvancedCharacterShader';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** Cube coordinate {x, y, z} where x + y + z = 0 */
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

/** Constructor options for WallBuilder */
export interface WallBuilderOptions {
  /** Width of your hex tiles (required for percentage-based thickness) */
  hexWidth?: number;
  /** Wall thickness as percentage of hex width (default: 0.10 = 10%) */
  wallThicknessRatio?: number;
  /** Fixed thickness override (ignores ratio if set) */
  thickness?: number;
  /** Default wall color */
  color?: number;
  /** Auto-shading amount (default: 0.15) */
  shadingVariance?: number;
  /** Enable flat shading (default: true) */
  flatShading?: boolean;
}

/** Options for individual wall/pillar creation */
export interface WallOptions {
  /** Thickness override */
  thickness?: number;
  /** Color override */
  color?: number;
}

/** Options for wall section creation (includes pillar sizing) */
export interface WallSectionOptions extends WallOptions {
  /** Pillar thickness override */
  pillarThickness?: number;
  /** Wall thickness override */
  wallThickness?: number;
}

/** Options for hex wall creation */
export type HexWallOptions = WallOptions;

/** Options for createWallsFromAPI */
export interface APIWallGroupOptions {
  /** Hex size for coordinate conversion */
  hexSize?: number;
  /** Wall height in world units */
  wallHeight?: number;
  /** Y position of floor (default 0) */
  floorY?: number;
  /** Default wall color */
  color?: number;
  /** Wall thickness ratio */
  thicknessRatio?: number;
}

/** Wall data from the API */
export interface APIWall {
  start: CubeCoord;
  end: CubeCoord;
  material?: string;
  type?: number;
}

/** Room data from the API */
export interface APIRoom {
  width?: number;
  height?: number;
  walls?: APIWall[];
}

/** Convenience function options */
export interface ConvenienceWallOptions {
  color?: number;
  hexWidth?: number;
  wallThicknessRatio?: number;
  thickness?: number;
}

// ============================================================================
// COLOR PRESETS
// ============================================================================

export const WallColors = {
  // Stone variants
  stoneLight: 0x9c9c9c,
  stoneMedium: 0x707070,
  stoneDark: 0x505050,

  // Brick variants
  brickRed: 0x8b4513,
  brickBrown: 0x6b3a2e,
  brickTan: 0xa67b5b,

  // Wood variants
  woodLight: 0xc4a484,
  woodMedium: 0x8b6914,
  woodDark: 0x5c4033,

  // Dungeon variants
  dungeonGray: 0x4a4a4a,
  dungeonMoss: 0x4a5a4a,
  dungeonWet: 0x3a4a5a,

  // Special
  marble: 0xe8e8e8,
  obsidian: 0x1a1a2e,
  sandstone: 0xd4b896,
  ice: 0xadd8e6,
} as const;

// ============================================================================
// TEXTURE HELPERS
// ============================================================================

/**
 * Create a solid color texture (1x1 pixel)
 * Used to feed the shader when we just want a solid color
 */
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
  texture.colorSpace = THREE.NoColorSpace;

  return texture;
}

// ============================================================================
// WALL BUILDER CLASS
// ============================================================================

export class WallBuilder {
  private hexWidth: number;
  private wallThicknessRatio: number;
  private defaultThickness: number;
  private defaultColor: number;
  private shadingVariance: number;
  private materialCache: Map<number, THREE.ShaderMaterial>;
  private animatedShaders: THREE.ShaderMaterial[];

  constructor(options: WallBuilderOptions = {}) {
    this.hexWidth = options.hexWidth ?? 48;
    this.wallThicknessRatio = options.wallThicknessRatio ?? 0.1;

    // Calculate thickness: fixed override OR percentage of hex width
    this.defaultThickness =
      options.thickness ?? this.hexWidth * this.wallThicknessRatio;

    this.defaultColor = options.color ?? WallColors.stoneMedium;
    this.shadingVariance = options.shadingVariance ?? 0.15;

    // Cache materials by color
    this.materialCache = new Map();

    // Track shaders that need animation updates
    this.animatedShaders = [];
  }

  /** Get the calculated wall thickness */
  getThickness(): number {
    return this.defaultThickness;
  }

  /** Update hex width and recalculate thickness */
  setHexWidth(width: number): void {
    this.hexWidth = width;
    this.defaultThickness = this.hexWidth * this.wallThicknessRatio;
  }

  /** Get or create a material for the given color */
  getMaterial(color: number | THREE.Color): THREE.ShaderMaterial {
    const colorHex =
      typeof color === 'number' ? color : (color as THREE.Color).getHex();

    if (this.materialCache.has(colorHex)) {
      return this.materialCache.get(colorHex)!;
    }

    const texture = createSolidColorTexture(colorHex);
    const material = createAdvancedCharacterShader(texture, {
      skinColor: colorHex,
      primaryColor: colorHex,
      shadingVariance: this.shadingVariance,
      selected: 0.0,
    });

    this.materialCache.set(colorHex, material);
    this.animatedShaders.push(material);

    return material;
  }

  /** Create a pillar at the given position */
  createPillar(
    position: THREE.Vector3,
    height: number,
    options: WallOptions = {}
  ): THREE.Mesh {
    const thickness = options.thickness ?? this.defaultThickness;
    const color = options.color ?? this.defaultColor;

    const geometry = new THREE.BoxGeometry(thickness, height, thickness);
    const material = this.getMaterial(color);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(position.x, position.y + height / 2, position.z);

    mesh.userData.type = 'pillar';
    mesh.userData.basePosition = position.clone();
    mesh.userData.height = height;

    return mesh;
  }

  /** Create a wall between two anchor positions */
  createWallBetween(
    anchorA: THREE.Vector3,
    anchorB: THREE.Vector3,
    height: number,
    options: WallOptions = {}
  ): THREE.Mesh {
    const thickness = options.thickness ?? this.defaultThickness;
    const color = options.color ?? this.defaultColor;

    // Calculate horizontal distance and direction
    const dx = anchorB.x - anchorA.x;
    const dz = anchorB.z - anchorA.z;
    const length = Math.sqrt(dx * dx + dz * dz);

    // Create wall geometry
    const geometry = new THREE.BoxGeometry(length, height, thickness);
    const material = this.getMaterial(color);
    const mesh = new THREE.Mesh(geometry, material);

    // Position at midpoint, raised by half height
    mesh.position.set(
      (anchorA.x + anchorB.x) / 2,
      anchorA.y + height / 2,
      (anchorA.z + anchorB.z) / 2
    );

    // Rotate to align with anchor direction
    const angle = Math.atan2(dz, dx);
    mesh.rotation.y = -angle;

    mesh.userData.type = 'wall';
    mesh.userData.anchorA = anchorA.clone();
    mesh.userData.anchorB = anchorB.clone();
    mesh.userData.height = height;

    return mesh;
  }

  /** Create a pillar with base OBJ and extended geometry */
  createPillarWithBase(
    baseModel: THREE.Object3D,
    position: THREE.Vector3,
    totalHeight: number,
    baseHeight: number,
    options: WallOptions = {}
  ): THREE.Group {
    const group = new THREE.Group();

    // Clone and position the base
    const base = baseModel.clone();
    base.position.copy(position);
    group.add(base);

    // Create the extended pillar portion above the base
    const extensionHeight = totalHeight - baseHeight;
    if (extensionHeight > 0) {
      const extension = this.createPillar(
        new THREE.Vector3(position.x, position.y + baseHeight, position.z),
        extensionHeight,
        options
      );
      // Adjust position since createPillar already offsets by half height
      extension.position.y = position.y + baseHeight + extensionHeight / 2;
      group.add(extension);
    }

    group.userData.type = 'pillarWithBase';
    group.userData.basePosition = position.clone();
    group.userData.totalHeight = totalHeight;

    return group;
  }

  /** Create a complete wall section with two pillars */
  createWallSection(
    anchorA: THREE.Vector3,
    anchorB: THREE.Vector3,
    height: number,
    options: WallSectionOptions = {}
  ): THREE.Group {
    const group = new THREE.Group();

    const pillarThickness =
      options.pillarThickness ?? this.defaultThickness * 1.5;
    const wallThickness = options.wallThickness ?? this.defaultThickness;

    // Create pillars
    const pillarA = this.createPillar(anchorA, height, {
      ...options,
      thickness: pillarThickness,
    });
    const pillarB = this.createPillar(anchorB, height, {
      ...options,
      thickness: pillarThickness,
    });

    // Create wall between them
    const wall = this.createWallBetween(anchorA, anchorB, height, {
      ...options,
      thickness: wallThickness,
    });

    group.add(pillarA, pillarB, wall);

    group.userData.type = 'wallSection';
    group.userData.anchorA = anchorA.clone();
    group.userData.anchorB = anchorB.clone();
    group.userData.height = height;

    return group;
  }

  /** Create walls along hex grid edges */
  createHexWalls(
    centerPos: THREE.Vector3,
    hexRadius: number,
    height: number,
    edges: number[] = [0, 1, 2, 3, 4, 5],
    options: HexWallOptions = {}
  ): THREE.Group {
    const group = new THREE.Group();

    // Hex vertex angles (pointy-top orientation)
    const vertexAngles = [
      Math.PI / 6, // 0: top-right
      Math.PI / 2, // 1: top
      (5 * Math.PI) / 6, // 2: top-left
      (7 * Math.PI) / 6, // 3: bottom-left
      (3 * Math.PI) / 2, // 4: bottom
      (11 * Math.PI) / 6, // 5: bottom-right
    ];

    // Calculate vertex positions
    const vertices = vertexAngles.map(
      (angle) =>
        new THREE.Vector3(
          centerPos.x + Math.cos(angle) * hexRadius,
          centerPos.y,
          centerPos.z + Math.sin(angle) * hexRadius
        )
    );

    // Build requested edges
    edges.forEach((edgeIndex) => {
      const v1 = vertices[edgeIndex];
      const v2 = vertices[(edgeIndex + 1) % 6];
      const wall = this.createWallBetween(v1, v2, height, options);
      group.add(wall);
    });

    group.userData.type = 'hexWalls';
    group.userData.center = centerPos.clone();
    group.userData.edges = edges;

    return group;
  }

  /**
   * Start animation loop for all shaders (needed for effects)
   * Call this if you're using selection, fire, or other animated effects
   */
  startAnimations(): () => void {
    const stopFunctions = this.animatedShaders.map((shader) =>
      startShaderAnimation(shader)
    );

    return () => stopFunctions.forEach((stop) => stop());
  }

  /**
   * Update shader time manually (alternative to startAnimations)
   * Call this in your render loop
   */
  updateTime(deltaTime: number): void {
    this.animatedShaders.forEach((shader) => {
      shader.uniforms.time.value += deltaTime;
    });
  }

  /** Set selection state on a wall/pillar */
  setSelected(
    mesh: THREE.Object3D,
    isSelected: boolean,
    color: number = 0xffffff
  ): void {
    const asMesh = mesh as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.ShaderMaterial
    >;
    if (asMesh.material?.uniforms) {
      asMesh.material.uniforms.selected.value = isSelected ? 1.0 : 0.0;
      asMesh.material.uniforms.selectionColor.value.set(color);
    }

    // Handle groups
    if (mesh.children) {
      mesh.children.forEach((child) =>
        this.setSelected(child, isSelected, color)
      );
    }
  }

  /** Clear material cache (call when changing scenes) */
  dispose(): void {
    this.materialCache.forEach((material) => {
      material.dispose();
    });
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

/** Map API material names to our color presets */
const MATERIAL_TO_COLOR: Record<string, number> = {
  stone: WallColors.stoneMedium,
  wood: WallColors.woodMedium,
  metal: WallColors.stoneDark,
  dungeon: WallColors.dungeonGray,
  brick: WallColors.brickRed,
  marble: WallColors.marble,
  obsidian: WallColors.obsidian,
  ice: WallColors.ice,
  sandstone: WallColors.sandstone,
};

/**
 * Create walls from rpg-api Wall array
 *
 * API Wall format:
 *   { start: {x, y, z}, end: {x, y, z}, material?: string, type?: number }
 */
export function createWallsFromAPI(
  apiWalls: APIWall[],
  options: APIWallGroupOptions = {}
): THREE.Group {
  const hexSize = options.hexSize ?? 1;
  const wallHeight = options.wallHeight ?? 3;
  const floorY = options.floorY ?? 0;
  const defaultColor = options.color ?? WallColors.stoneMedium;

  const builder = new WallBuilder({
    hexWidth: hexSize,
    wallThicknessRatio: options.thicknessRatio ?? 0.1,
    color: defaultColor,
  });

  const wallGroup = new THREE.Group();

  apiWalls.forEach((apiWall, index) => {
    // Convert cube coords to world coords
    const startWorld = cubeToWorld(apiWall.start, hexSize);
    const endWorld = cubeToWorld(apiWall.end, hexSize);

    // Create Three.js vectors
    const anchorA = new THREE.Vector3(startWorld.x, floorY, startWorld.z);
    const anchorB = new THREE.Vector3(endWorld.x, floorY, endWorld.z);

    // Determine color from material
    const color = apiWall.material
      ? (MATERIAL_TO_COLOR[apiWall.material] ?? defaultColor)
      : defaultColor;

    // Create wall
    const wall = builder.createWallBetween(anchorA, anchorB, wallHeight, {
      color,
    });

    // Store API reference for later (destruction, etc.)
    wall.userData.apiWall = apiWall;
    wall.userData.wallIndex = index;

    wallGroup.add(wall);
  });

  wallGroup.userData.type = 'apiWallGroup';
  wallGroup.userData.wallCount = apiWalls.length;

  return wallGroup;
}

/**
 * Create a complete room (walls + optional pillars at corners) from API data
 */
export function createRoomWallsFromAPI(
  apiRoom: APIRoom,
  options: APIWallGroupOptions = {}
): THREE.Group {
  const walls = apiRoom.walls ?? [];
  return createWallsFromAPI(walls, {
    ...options,
    hexSize: options.hexSize ?? 1,
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/** Quick pillar creation without instantiating WallBuilder */
export function createPillar(
  position: THREE.Vector3,
  height: number,
  options: ConvenienceWallOptions = {}
): THREE.Mesh {
  const builder = new WallBuilder({
    color: options.color ?? WallColors.stoneMedium,
    hexWidth: options.hexWidth,
    wallThicknessRatio: options.wallThicknessRatio,
    thickness: options.thickness,
  });
  return builder.createPillar(position, height);
}

/** Quick wall creation without instantiating WallBuilder */
export function createWall(
  anchorA: THREE.Vector3,
  anchorB: THREE.Vector3,
  height: number,
  options: ConvenienceWallOptions = {}
): THREE.Mesh {
  const builder = new WallBuilder({
    color: options.color ?? WallColors.stoneMedium,
    hexWidth: options.hexWidth,
    wallThicknessRatio: options.wallThicknessRatio,
    thickness: options.thickness,
  });
  return builder.createWallBetween(anchorA, anchorB, height);
}

/** Quick wall section (two pillars + wall between) */
export function createWallSection(
  anchorA: THREE.Vector3,
  anchorB: THREE.Vector3,
  height: number,
  options: ConvenienceWallOptions = {}
): THREE.Group {
  const builder = new WallBuilder({
    color: options.color ?? WallColors.stoneMedium,
    hexWidth: options.hexWidth,
    wallThicknessRatio: options.wallThicknessRatio,
    thickness: options.thickness,
  });
  return builder.createWallSection(anchorA, anchorB, height);
}
