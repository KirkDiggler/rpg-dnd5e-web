/**
 * Advanced Character Shader Module
 * Version: 3.0
 * Date: 2025-12-24
 *
 * Combines multiple shader effects for complete character customization:
 * 1. Color Swapping (skin, armor primary/secondary, eyes)
 * 2. Emissive Glow (magic items, runes, glowing eyes)
 * 3. Hit Flash (damage feedback)
 * 4. Transparency (invisibility, stealth, fade in/out)
 *
 * Qubicle Marker Color Convention (from shader package):
 * - White    #FFFFFF - Skin color (exposed skin areas)
 * - Magenta  #F704FF - Primary color (main armor, can glow)
 * - Yellow   #E5FF02 - Secondary color (accent trim)
 * - Cyan     #1EDFFF - Tertiary color (minor details)
 * - Green    #2BFF06 - Detail color (fine decorative elements)
 *
 * Everything else renders as-is (browns, grays, metallics painted in Qubicle).
 */

import * as THREE from 'three';

export interface AdvancedCharacterShaderOptions {
  /** Skin color (replaces white #FFFFFF marker) */
  skinColor?: number | THREE.Color;
  /** Primary color - main armor (replaces magenta #F704FF marker) */
  primaryColor?: number | THREE.Color;
  /** Secondary color - accent trim (replaces yellow #E5FF02 marker) */
  secondaryColor?: number | THREE.Color;
  /** Tertiary color - minor details (replaces cyan #1EDFFF marker) */
  tertiaryColor?: number | THREE.Color;
  /** Detail color - fine decorative (replaces green #2BFF06 marker) */
  detailColor?: number | THREE.Color;
  /** Glow brightness multiplier (default: 2.0) */
  glowIntensity?: number;
  /** Overall transparency (0.0-1.0, default: 1.0) */
  opacity?: number;
  /** Hit flash intensity (0.0-1.0, default: 0.0) */
  flashAmount?: number;
  /** Enable emissive glow on primary color regions */
  primaryGlow?: boolean;
}

const DEFAULT_OPTIONS: Required<AdvancedCharacterShaderOptions> = {
  skinColor: 0xd5a88c, // Medium skin
  primaryColor: 0x8b0000, // Dark red armor
  secondaryColor: 0xffd700, // Gold accent
  tertiaryColor: 0x000000, // Black
  detailColor: 0xc0c0c0, // Silver
  glowIntensity: 2.0,
  opacity: 1.0,
  flashAmount: 0.0,
  primaryGlow: false,
};

/**
 * Creates an advanced character shader with multiple effects
 *
 * @param texture - The character texture (with marker colors)
 * @param options - Configuration options
 * @returns THREE.ShaderMaterial
 *
 * @example
 * const shader = createAdvancedCharacterShader(texture, {
 *     skinColor: 0xD5A88C,
 *     trimColor: 0x8B0000,
 *     teamColor: 0x0000FF,
 *     glowColor: 0x00FFFF,
 *     glowIntensity: 3.0
 * });
 */
export function createAdvancedCharacterShader(
  texture: THREE.Texture,
  options: AdvancedCharacterShaderOptions = {}
): THREE.ShaderMaterial {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return new THREE.ShaderMaterial({
    uniforms: {
      // Texture
      characterTexture: { value: texture },

      // Swappable colors (marker replacement)
      skinColor: { value: new THREE.Color(config.skinColor) },
      primaryColor: { value: new THREE.Color(config.primaryColor) },
      secondaryColor: { value: new THREE.Color(config.secondaryColor) },
      tertiaryColor: { value: new THREE.Color(config.tertiaryColor) },
      detailColor: { value: new THREE.Color(config.detailColor) },

      // Effect parameters
      glowIntensity: { value: config.glowIntensity },
      opacity: { value: config.opacity },
      flashAmount: { value: config.flashAmount },
      primaryGlow: { value: config.primaryGlow ? 1.0 : 0.0 },
    },

    vertexShader: `
            // Output to fragment shader
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            void main() {
                // Pass UV coordinates for texture sampling
                vUv = uv;

                // Pass normals for lighting
                vNormal = normalize(normalMatrix * normal);

                // Calculate view position for advanced lighting
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz;

                // Standard vertex transformation
                gl_Position = projectionMatrix * mvPosition;
            }
        `,

    fragmentShader: `
            // Inputs from vertex shader
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            // Uniforms
            uniform sampler2D characterTexture;

            // Swappable colors (Qubicle marker colors)
            uniform vec3 skinColor;      // White #FFFFFF
            uniform vec3 primaryColor;   // Magenta #F704FF
            uniform vec3 secondaryColor; // Yellow #E5FF02
            uniform vec3 tertiaryColor;  // Cyan #1EDFFF
            uniform vec3 detailColor;    // Green #2BFF06

            // Effects
            uniform float glowIntensity;
            uniform float opacity;
            uniform float flashAmount;
            uniform float primaryGlow;

            // Marker color detection helper with threshold for texture compression
            bool isColor(vec4 texColor, float r, float g, float b) {
                float threshold = 0.02;
                return abs(texColor.r - r) < threshold &&
                       abs(texColor.g - g) < threshold &&
                       abs(texColor.b - b) < threshold;
            }

            void main() {
                // Sample the character texture
                vec4 texColor = texture2D(characterTexture, vUv);

                vec3 finalColor;
                bool isEmissive = false;

                // Check Qubicle marker colors and replace

                // White #FFFFFF - Skin color (exposed skin areas)
                if (isColor(texColor, 1.0, 1.0, 1.0)) {
                    finalColor = skinColor;
                }
                // Magenta #F704FF - Primary color (main armor)
                // 247/255=0.969, 4/255=0.016, 255/255=1.0
                else if (isColor(texColor, 0.969, 0.016, 1.0)) {
                    finalColor = primaryColor;
                    if (primaryGlow > 0.5) {
                        isEmissive = true;
                    }
                }
                // Yellow #E5FF02 - Secondary color (accent trim)
                // 229/255=0.898, 255/255=1.0, 2/255=0.008
                else if (isColor(texColor, 0.898, 1.0, 0.008)) {
                    finalColor = secondaryColor;
                }
                // Cyan #1EDFFF - Tertiary color (minor details)
                // 30/255=0.118, 223/255=0.875, 255/255=1.0
                else if (isColor(texColor, 0.118, 0.875, 1.0)) {
                    finalColor = tertiaryColor;
                }
                // Green #2BFF06 - Detail color (fine decorative)
                // 43/255=0.169, 255/255=1.0, 6/255=0.024
                else if (isColor(texColor, 0.169, 1.0, 0.024)) {
                    finalColor = detailColor;
                }
                // Keep original texture color
                else {
                    finalColor = texColor.rgb;
                }

                // === LIGHTING ===
                if (!isEmissive) {
                    // Simple directional lighting for non-emissive regions
                    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
                    float diffuse = max(dot(vNormal, lightDir), 0.0);
                    float lighting = 0.6 + 0.4 * diffuse; // Ambient + diffuse
                    finalColor *= lighting;
                } else {
                    // Emissive regions glow (boost brightness)
                    finalColor *= glowIntensity;
                }

                // === HIT FLASH EFFECT ===
                // Mix toward white based on flash amount
                finalColor = mix(finalColor, vec3(1.0), flashAmount);

                // === OUTPUT ===
                gl_FragColor = vec4(finalColor, opacity);
            }
        `,

    // Material properties
    transparent: true, // Enable transparency
    side: THREE.DoubleSide, // Render both sides
    depthWrite: true,
    depthTest: true,
  });
}

/**
 * Pre-defined color palettes
 */
export const ColorPalettes = {
  // Skin tones
  SkinTones: {
    pale: 0xf1d4c0,
    light: 0xe8c3a8,
    medium: 0xd5a88c,
    tan: 0xc68e6d,
    dark: 0x9d6b4d,
    deep: 0x704937,
  },

  // Trim/leather colors
  TrimColors: {
    brown: 0x8b4513,
    black: 0x1c1c1c,
    darkRed: 0x8b0000,
    darkGreen: 0x006400,
    darkBlue: 0x00008b,
    purple: 0x800080,
    orange: 0xff8c00,
  },

  // Metal colors
  MetalColors: {
    silver: 0xc0c0c0,
    gold: 0xffd700,
    bronze: 0xcd7f32,
    copper: 0xb87333,
    iron: 0x808080,
    steel: 0xb0c4de,
  },

  // Team/faction colors
  TeamColors: {
    red: 0xff0000,
    blue: 0x0000ff,
    green: 0x00ff00,
    yellow: 0xffff00,
    purple: 0x800080,
    orange: 0xff8c00,
    cyan: 0x00ffff,
    white: 0xffffff,
  },

  // Emissive/glow colors
  GlowColors: {
    cyan: 0x00ffff,
    magenta: 0xff00ff,
    yellow: 0xffff00,
    green: 0x00ff00,
    blue: 0x0088ff,
    red: 0xff0000,
    white: 0xffffff,
  },

  // Eye colors
  EyeColors: {
    brown: 0x4a2511,
    blue: 0x4a90e2,
    green: 0x4caf50,
    hazel: 0x8b7355,
    gray: 0x708090,
    amber: 0xffbf00,
    violet: 0x8a2be2,
  },

  // Hair colors
  HairColors: {
    black: 0x1c1c1c,
    brown: 0x4a2511,
    blonde: 0xe6c35c,
    red: 0xa0522d,
    auburn: 0x8b4513,
    gray: 0x808080,
    white: 0xe0e0e0,
    platinum: 0xe5e4e2,
  },
} as const;

export type ColorType =
  | 'skin'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'detail';

/**
 * Helper: Update a specific color uniform
 */
export function setCharacterColor(
  shader: THREE.ShaderMaterial,
  colorType: ColorType,
  color: number | THREE.Color
): void {
  const uniformName = `${colorType}Color`;

  if (!shader.uniforms[uniformName]) {
    console.warn(`Unknown color type: ${colorType}`);
    return;
  }

  if (color instanceof THREE.Color) {
    shader.uniforms[uniformName].value.copy(color);
  } else {
    shader.uniforms[uniformName].value.set(color);
  }
}

/**
 * Helper: Trigger hit flash effect
 */
export function triggerHitFlash(
  shader: THREE.ShaderMaterial,
  duration = 300
): void {
  // Set flash to full
  shader.uniforms.flashAmount.value = 1.0;

  // Fade out over duration
  const startTime = Date.now();

  function animate(): void {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1.0);

    // Ease out
    shader.uniforms.flashAmount.value = 1.0 - progress;

    if (progress < 1.0) {
      requestAnimationFrame(animate);
    }
  }

  animate();
}

/**
 * Helper: Fade character in/out
 */
export function fadeCharacter(
  shader: THREE.ShaderMaterial,
  targetOpacity: number,
  duration = 1000
): void {
  const startOpacity = shader.uniforms.opacity.value as number;
  const startTime = Date.now();

  function animate(): void {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1.0);

    // Ease in-out
    const eased =
      progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    shader.uniforms.opacity.value =
      startOpacity + (targetOpacity - startOpacity) * eased;

    if (progress < 1.0) {
      requestAnimationFrame(animate);
    }
  }

  animate();
}

/**
 * Helper: Pulse glow effect
 * Returns a stop function to cancel the animation
 */
export function pulseGlow(
  shader: THREE.ShaderMaterial,
  minIntensity = 1.5,
  maxIntensity = 3.0,
  speed = 2.0
): () => void {
  const startTime = Date.now();
  let animationId: number;

  function animate(): void {
    const time = (Date.now() - startTime) / 1000;
    const intensity =
      minIntensity +
      (maxIntensity - minIntensity) * (Math.sin(time * speed) * 0.5 + 0.5);
    shader.uniforms.glowIntensity.value = intensity;
    animationId = requestAnimationFrame(animate);
  }

  animate();

  // Return stop function
  return () => {
    cancelAnimationFrame(animationId);
    shader.uniforms.glowIntensity.value = 2.0; // Reset to default
  };
}

/**
 * Helper: Make character invisible (stealth)
 */
export function setInvisible(
  shader: THREE.ShaderMaterial,
  invisible = true
): void {
  fadeCharacter(shader, invisible ? 0.3 : 1.0, 500);
}
