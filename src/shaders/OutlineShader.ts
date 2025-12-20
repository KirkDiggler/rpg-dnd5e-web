/**
 * Outline Shader Module
 * Version: 1.0
 * Date: 2025-12-18
 *
 * Creates cel-shaded outlines around characters (toon/anime style).
 * Makes voxel characters pop against backgrounds and improves readability.
 *
 * Technique: Two-pass rendering
 * 1. First pass: Render slightly expanded backfaces with outline color
 * 2. Second pass: Render normal frontfaces with character material
 * Result: Black (or colored) outline around character
 *
 * Popular in: Borderlands, Breath of the Wild, anime games
 */

import * as THREE from 'three';

export interface OutlineMaterialOptions {
  /** Outline color (default: black) */
  outlineColor?: number | THREE.Color;
  /** Thickness in world units (default: 0.03) */
  outlineThickness?: number;
}

const DEFAULT_OPTIONS: Required<OutlineMaterialOptions> = {
  outlineColor: 0x000000,
  outlineThickness: 0.03,
};

/**
 * Creates an outline material (for first pass rendering)
 *
 * @param options - Configuration options
 * @returns THREE.ShaderMaterial
 */
export function createOutlineMaterial(
  options: OutlineMaterialOptions = {}
): THREE.ShaderMaterial {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return new THREE.ShaderMaterial({
    uniforms: {
      outlineColor: { value: new THREE.Color(config.outlineColor) },
      outlineThickness: { value: config.outlineThickness },
    },

    vertexShader: `
            uniform float outlineThickness;

            void main() {
                // Expand vertices along their normals to create outline
                vec3 expandedPosition = position + normal * outlineThickness;

                gl_Position = projectionMatrix * modelViewMatrix * vec4(expandedPosition, 1.0);
            }
        `,

    fragmentShader: `
            uniform vec3 outlineColor;

            void main() {
                gl_FragColor = vec4(outlineColor, 1.0);
            }
        `,

    side: THREE.BackSide, // CRITICAL: Render only backfaces
    depthWrite: true,
    depthTest: true,
  });
}

/**
 * Helper class to manage outline rendering for a character
 *
 * Usage:
 * const outlineManager = new OutlineManager(character, {
 *     outlineColor: 0x000000,
 *     outlineThickness: 0.05
 * });
 * scene.add(outlineManager.outlineGroup);
 */
export class OutlineManager {
  public character: THREE.Object3D;
  public outlineMaterial: THREE.ShaderMaterial;
  public outlineGroup: THREE.Group;

  constructor(character: THREE.Object3D, options: OutlineMaterialOptions = {}) {
    this.character = character;
    this.outlineMaterial = createOutlineMaterial(options);
    this.outlineGroup = new THREE.Group();

    this.createOutlineMeshes();
  }

  private createOutlineMeshes(): void {
    // Clone character meshes for outline pass
    this.character.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const outlineMesh = new THREE.Mesh(mesh.geometry, this.outlineMaterial);

        // Match transform
        outlineMesh.position.copy(mesh.position);
        outlineMesh.rotation.copy(mesh.rotation);
        outlineMesh.scale.copy(mesh.scale);

        this.outlineGroup.add(outlineMesh);
      }
    });

    // Position outline group same as character
    this.outlineGroup.position.copy(this.character.position);
    this.outlineGroup.rotation.copy(this.character.rotation);
    this.outlineGroup.scale.copy(this.character.scale);
  }

  setOutlineColor(color: number | THREE.Color): void {
    if (color instanceof THREE.Color) {
      this.outlineMaterial.uniforms.outlineColor.value.copy(color);
    } else {
      this.outlineMaterial.uniforms.outlineColor.value.set(color);
    }
  }

  setOutlineThickness(thickness: number): void {
    this.outlineMaterial.uniforms.outlineThickness.value = thickness;
  }

  setVisible(visible: boolean): void {
    this.outlineGroup.visible = visible;
  }

  dispose(): void {
    this.outlineMaterial.dispose();
    this.outlineGroup.traverse((child) => {
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
    });
  }
}

/**
 * Simple helper: Add outline to character in one call
 *
 * @param character - The character mesh/group
 * @param scene - The scene to add outline to
 * @param options - Outline options
 * @returns OutlineManager
 *
 * @example
 * const outline = addOutline(character, scene, {
 *     outlineColor: 0x000000,
 *     outlineThickness: 0.05
 * });
 *
 * // Later: Change outline color
 * outline.setOutlineColor(0xFF0000); // Red outline
 *
 * // Disable outline
 * outline.setVisible(false);
 */
export function addOutline(
  character: THREE.Object3D,
  scene: THREE.Scene,
  options: OutlineMaterialOptions = {}
): OutlineManager {
  const manager = new OutlineManager(character, options);
  scene.add(manager.outlineGroup);
  return manager;
}

/**
 * Preset outline styles
 */
export const OutlinePresets = {
  // Classic black outline (most common)
  classic: {
    outlineColor: 0x000000,
    outlineThickness: 0.04,
  },

  // Thick cartoon outline
  cartoon: {
    outlineColor: 0x000000,
    outlineThickness: 0.08,
  },

  // Thin subtle outline
  subtle: {
    outlineColor: 0x000000,
    outlineThickness: 0.02,
  },

  // Colored outline (team indicator)
  teamRed: {
    outlineColor: 0xff0000,
    outlineThickness: 0.05,
  },

  teamBlue: {
    outlineColor: 0x0000ff,
    outlineThickness: 0.05,
  },

  // Glowing outline (magical effect)
  glow: {
    outlineColor: 0x00ffff,
    outlineThickness: 0.06,
  },

  // Dark outline (for bright backgrounds)
  dark: {
    outlineColor: 0x1a1a1a,
    outlineThickness: 0.04,
  },
} as const;
