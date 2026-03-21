/**
 * Advanced Character Shader Module
 * Version: 4.0
 * Date: 2026-03-21
 *
 * Combines multiple shader effects for complete character customization:
 * 1. Color Swapping (skin, armor primary/secondary, eyes)
 * 2. Emissive Glow (magic items, runes, glowing eyes)
 * 3. Hit Flash (damage feedback)
 * 4. Transparency (invisibility, stealth, fade in/out)
 * 5. Auto-Shading (HSL-based lighter/darker variants from picked colors)
 * 6. Ghost Mode (Fresnel rim glow, desaturation, ethereal transparency)
 * 7. Fire Aura (Animated rim glow, flickering, ember colors)
 * 8. Selection Aura (Subtle pulsing rim glow for selected characters)
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
  /** Auto-shading intensity (0.0=off, 0.15=+-15% lightness, default: 0.0) */
  shadingVariance?: number;
  /** Ghost effect intensity (0.0=solid, 1.0=full ghost, default: 0.0) */
  ghostAmount?: number;
  /** Ghost tint color (default: pale cyan 0x88ccff) */
  ghostColor?: number | THREE.Color;
  /** Ghost rim glow sharpness (1.0=soft, 4.0=sharp, default: 2.0) */
  ghostRimPower?: number;
  /** Fire aura intensity (0.0=off, 1.0=full blaze, default: 0.0) */
  fireAmount?: number;
  /** Fire animation speed (default: 1.0) */
  fireSpeed?: number;
  /** Inner fire color (default: 0xff4400 orange-red) */
  fireColorInner?: number | THREE.Color;
  /** Outer fire color (default: 0xffdd00 yellow) */
  fireColorOuter?: number | THREE.Color;
  /** Selection aura (0.0=not selected, 1.0=selected, default: 0.0) */
  selected?: number;
  /** Selection aura color (default: 0xffffff white) */
  selectionColor?: number | THREE.Color;
  /** Selection pulse speed (default: 2.0) */
  selectionSpeed?: number;
  /** Selection glow brightness (default: 0.5) */
  selectionIntensity?: number;
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
  shadingVariance: 0.0,
  ghostAmount: 0.0,
  ghostColor: 0x88ccff,
  ghostRimPower: 2.0,
  fireAmount: 0.0,
  fireSpeed: 1.0,
  fireColorInner: 0xff4400,
  fireColorOuter: 0xffdd00,
  selected: 0.0,
  selectionColor: 0xffffff,
  selectionSpeed: 2.0,
  selectionIntensity: 0.5,
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
      shadingVariance: { value: config.shadingVariance },

      // Ghost effect
      ghostAmount: { value: config.ghostAmount },
      ghostColor: { value: new THREE.Color(config.ghostColor) },
      ghostRimPower: { value: config.ghostRimPower },

      // Fire aura effect
      time: { value: 0.0 },
      fireAmount: { value: config.fireAmount },
      fireSpeed: { value: config.fireSpeed },
      fireColorInner: { value: new THREE.Color(config.fireColorInner) },
      fireColorOuter: { value: new THREE.Color(config.fireColorOuter) },

      // Selection aura
      selected: { value: config.selected },
      selectionColor: { value: new THREE.Color(config.selectionColor) },
      selectionSpeed: { value: config.selectionSpeed },
      selectionIntensity: { value: config.selectionIntensity },
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
            uniform float shadingVariance;

            // Ghost effect
            uniform float ghostAmount;
            uniform vec3 ghostColor;
            uniform float ghostRimPower;

            // Fire aura effect
            uniform float time;
            uniform float fireAmount;
            uniform float fireSpeed;
            uniform vec3 fireColorInner;
            uniform vec3 fireColorOuter;

            // Selection aura
            uniform float selected;
            uniform vec3 selectionColor;
            uniform float selectionSpeed;
            uniform float selectionIntensity;

            // === HSL CONVERSION FUNCTIONS ===
            // RGB to HSL conversion
            vec3 rgbToHsl(vec3 color) {
                float maxC = max(max(color.r, color.g), color.b);
                float minC = min(min(color.r, color.g), color.b);
                float l = (maxC + minC) / 2.0;

                if (maxC == minC) {
                    return vec3(0.0, 0.0, l); // achromatic
                }

                float d = maxC - minC;
                float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);

                float h;
                if (maxC == color.r) {
                    h = (color.g - color.b) / d + (color.g < color.b ? 6.0 : 0.0);
                } else if (maxC == color.g) {
                    h = (color.b - color.r) / d + 2.0;
                } else {
                    h = (color.r - color.g) / d + 4.0;
                }
                h /= 6.0;

                return vec3(h, s, l);
            }

            // Helper for HSL to RGB
            float hueToRgb(float p, float q, float t) {
                if (t < 0.0) t += 1.0;
                if (t > 1.0) t -= 1.0;
                if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
                if (t < 1.0/2.0) return q;
                if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
                return p;
            }

            // HSL to RGB conversion
            vec3 hslToRgb(vec3 hsl) {
                float h = hsl.x;
                float s = hsl.y;
                float l = hsl.z;

                if (s == 0.0) {
                    return vec3(l); // achromatic
                }

                float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
                float p = 2.0 * l - q;

                float r = hueToRgb(p, q, h + 1.0/3.0);
                float g = hueToRgb(p, q, h);
                float b = hueToRgb(p, q, h - 1.0/3.0);

                return vec3(r, g, b);
            }

            // Apply shading variance: shift lightness based on normal direction
            vec3 applyAutoShading(vec3 color, float shadeFactor, float variance) {
                if (variance <= 0.0) return color;

                vec3 hsl = rgbToHsl(color);
                // shadeFactor: 0.0 = full shadow, 1.0 = full highlight
                // Shift lightness by variance amount (e.g., +-0.15)
                float lightnessShift = (shadeFactor - 0.5) * 2.0 * variance;
                hsl.z = clamp(hsl.z + lightnessShift, 0.0, 1.0);
                return hslToRgb(hsl);
            }

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
                vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
                float diffuse = dot(normalize(vNormal), lightDir);
                float shadeFactor = diffuse * 0.5 + 0.5;

                if (isEmissive) {
                    // Emissive regions glow (boost brightness, no lighting)
                    finalColor *= glowIntensity;
                } else if (shadingVariance > 0.0) {
                    // === AUTO-SHADING MODE ===
                    // Use HSL lightness shift for color-preserving shading
                    finalColor = applyAutoShading(finalColor, shadeFactor, shadingVariance);
                } else {
                    // === LEGACY MODE (shadingVariance = 0) ===
                    float lighting = 0.6 + 0.4 * max(diffuse, 0.0);
                    finalColor *= lighting;
                }

                // === GHOST EFFECT ===
                float finalOpacity = opacity;
                if (ghostAmount > 0.0) {
                    // Fresnel rim calculation - edges facing away from camera glow brighter
                    vec3 viewDir = normalize(vViewPosition);
                    float fresnel = 1.0 - abs(dot(normalize(vNormal), viewDir));
                    fresnel = pow(fresnel, ghostRimPower);

                    // Desaturate the base color
                    float luminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
                    vec3 desaturated = vec3(luminance);

                    // Blend toward ghost color based on ghostAmount
                    vec3 ghostBase = mix(finalColor, desaturated, ghostAmount * 0.7);
                    ghostBase = mix(ghostBase, ghostColor, ghostAmount * 0.5);

                    // Add rim glow
                    vec3 rimGlow = ghostColor * fresnel * ghostAmount * 1.5;
                    finalColor = ghostBase + rimGlow;

                    // Reduce base opacity, but keep rim more visible
                    float baseOpacity = mix(1.0, 0.3, ghostAmount);
                    float rimOpacity = fresnel * ghostAmount * 0.5;
                    finalOpacity = opacity * (baseOpacity + rimOpacity);
                }

                // === FIRE AURA EFFECT ===
                if (fireAmount > 0.0) {
                    // Fresnel rim for fire glow
                    vec3 viewDir = normalize(vViewPosition);
                    float rim = 1.0 - abs(dot(normalize(vNormal), viewDir));
                    rim = pow(rim, 1.5);

                    // Animated time value
                    float t = time * fireSpeed;

                    // Multi-frequency flicker for organic fire look
                    float flicker = 0.0;
                    flicker += sin(t * 10.0) * 0.15;
                    flicker += sin(t * 23.0 + 1.0) * 0.1;
                    flicker += sin(t * 37.0 + 2.0) * 0.08;
                    flicker += sin(t * 53.0) * 0.05;
                    flicker = flicker + 0.7; // Base intensity

                    // Vertical variation - flames rise up (use world Y via normal)
                    float rise = sin(t * 5.0 + vNormal.y * 3.0) * 0.2 + 0.8;

                    // Combine rim with flicker and rise
                    float fireIntensity = rim * flicker * rise * fireAmount;

                    // Blend between inner (orange-red) and outer (yellow) fire colors
                    vec3 fireColor = mix(fireColorInner, fireColorOuter, rim);

                    // Add fire glow
                    finalColor += fireColor * fireIntensity * 2.0;

                    // Warm up the base color slightly
                    finalColor = mix(finalColor, finalColor * vec3(1.2, 0.9, 0.7), fireAmount * 0.3);

                    // Clamp to prevent over-bright
                    finalColor = min(finalColor, vec3(1.5));
                }

                // === SELECTION AURA ===
                if (selected > 0.0) {
                    // Fresnel rim glow
                    vec3 viewDir = normalize(vViewPosition);
                    float rim = 1.0 - abs(dot(normalize(vNormal), viewDir));
                    rim = pow(rim, 2.0);

                    // Gentle sine pulse - smooth and subtle
                    float pulse = sin(time * selectionSpeed) * 0.3 + 0.7;

                    // Apply selection glow
                    float glowStrength = rim * pulse * selected * selectionIntensity;
                    finalColor += selectionColor * glowStrength;
                }

                // === HIT FLASH EFFECT ===
                // Mix toward white based on flash amount
                finalColor = mix(finalColor, vec3(1.0), flashAmount);

                // === OUTPUT ===
                gl_FragColor = vec4(finalColor, finalOpacity);
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

  // Ghost tint colors
  GhostColors: {
    classic: 0x88ccff,
    spooky: 0x44ff88,
    wraith: 0xaa88ff,
    banshee: 0xffffff,
    shadow: 0x6688aa,
    fire: 0xff8844,
    void: 0x220033,
  },

  // Fire aura color presets (inner, outer pairs)
  FireColors: {
    normal: { inner: 0xff4400, outer: 0xffdd00 },
    arcane: { inner: 0x0044ff, outer: 0x44ddff },
    fel: { inner: 0x00ff44, outer: 0xaaff00 },
    void: { inner: 0x8800ff, outer: 0xff44ff },
    holy: { inner: 0xffdd44, outer: 0xffffff },
    frost: { inner: 0x0088ff, outer: 0xaaffff },
    shadow: { inner: 0x440066, outer: 0x8844aa },
    infernal: { inner: 0xff0000, outer: 0xff4400 },
  },

  // Selection aura colors
  SelectionColors: {
    white: 0xffffff,
    gold: 0xffdd44,
    blue: 0x44aaff,
    red: 0xff4444,
    green: 0x44ff44,
    purple: 0xaa44ff,
    cyan: 0x44ffff,
  },
} as const;

export type ColorType =
  | 'skin'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'detail'
  | 'ghost'
  | 'selection';

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

/**
 * Helper: Set auto-shading variance
 * @param shader - The character shader
 * @param variance - Lightness variance (0.0=off, 0.1=subtle, 0.15=normal, 0.25=dramatic)
 */
export function setShadingVariance(
  shader: THREE.ShaderMaterial,
  variance: number
): void {
  shader.uniforms.shadingVariance.value = Math.max(
    0.0,
    Math.min(0.5, variance)
  );
}

/**
 * Helper: Set ghost effect
 * @param shader - The character shader
 * @param amount - Ghost intensity (0.0=solid, 1.0=full ghost)
 * @param color - Optional ghost tint color
 */
export function setGhostMode(
  shader: THREE.ShaderMaterial,
  amount: number,
  color?: number | THREE.Color
): void {
  shader.uniforms.ghostAmount.value = Math.max(0.0, Math.min(1.0, amount));
  if (color !== undefined) {
    if (color instanceof THREE.Color) {
      shader.uniforms.ghostColor.value.copy(color);
    } else {
      shader.uniforms.ghostColor.value.set(color);
    }
  }
}

/**
 * Helper: Animate ghost fade in/out
 * @param shader - The character shader
 * @param toGhost - True to fade to ghost, false to fade to solid
 * @param duration - Animation duration in ms (default: 1000)
 */
export function fadeToGhost(
  shader: THREE.ShaderMaterial,
  toGhost = true,
  duration = 1000
): void {
  const startAmount = shader.uniforms.ghostAmount.value as number;
  const targetAmount = toGhost ? 1.0 : 0.0;
  const startTime = Date.now();

  function animate(): void {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1.0);

    // Ease in-out
    const eased =
      progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    shader.uniforms.ghostAmount.value =
      startAmount + (targetAmount - startAmount) * eased;

    if (progress < 1.0) {
      requestAnimationFrame(animate);
    }
  }

  animate();
}

/**
 * Helper: Update shader time (call this in your render loop for animated effects)
 * @param shader - The character shader
 * @param deltaTime - Time since last frame in seconds
 */
export function updateShaderTime(
  shader: THREE.ShaderMaterial,
  deltaTime: number
): void {
  shader.uniforms.time.value += deltaTime;
}

export interface FireModeOptions {
  speed?: number;
  innerColor?: number | THREE.Color;
  outerColor?: number | THREE.Color;
}

/**
 * Helper: Set fire aura effect
 * @param shader - The character shader
 * @param amount - Fire intensity (0.0=off, 1.0=full blaze)
 * @param options - Optional fire settings
 */
export function setFireMode(
  shader: THREE.ShaderMaterial,
  amount: number,
  options: FireModeOptions = {}
): void {
  shader.uniforms.fireAmount.value = Math.max(0.0, Math.min(1.0, amount));

  if (options.speed !== undefined) {
    shader.uniforms.fireSpeed.value = options.speed;
  }
  if (options.innerColor !== undefined) {
    if (options.innerColor instanceof THREE.Color) {
      shader.uniforms.fireColorInner.value.copy(options.innerColor);
    } else {
      shader.uniforms.fireColorInner.value.set(options.innerColor);
    }
  }
  if (options.outerColor !== undefined) {
    if (options.outerColor instanceof THREE.Color) {
      shader.uniforms.fireColorOuter.value.copy(options.outerColor);
    } else {
      shader.uniforms.fireColorOuter.value.set(options.outerColor);
    }
  }
}

export interface SelectionOptions {
  color?: number | THREE.Color;
  intensity?: number;
  speed?: number;
}

/**
 * Helper: Set selection state
 * @param shader - The character shader
 * @param isSelected - Whether the character is selected
 * @param options - Optional selection settings
 */
export function setSelected(
  shader: THREE.ShaderMaterial,
  isSelected: boolean,
  options: SelectionOptions = {}
): void {
  shader.uniforms.selected.value = isSelected ? 1.0 : 0.0;

  if (options.color !== undefined) {
    if (options.color instanceof THREE.Color) {
      shader.uniforms.selectionColor.value.copy(options.color);
    } else {
      shader.uniforms.selectionColor.value.set(options.color);
    }
  }
  if (options.intensity !== undefined) {
    shader.uniforms.selectionIntensity.value = options.intensity;
  }
  if (options.speed !== undefined) {
    shader.uniforms.selectionSpeed.value = options.speed;
  }
}

/**
 * Helper: Start automatic time updates for animated effects
 * Returns a stop function to cancel the animation loop
 * @param shader - The character shader
 * @returns Stop function
 */
export function startShaderAnimation(shader: THREE.ShaderMaterial): () => void {
  let lastTime = Date.now();
  let animationId: number | null = null;

  function animate(): void {
    const now = Date.now();
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;

    shader.uniforms.time.value += deltaTime;
    animationId = requestAnimationFrame(animate);
  }

  animate();

  // Return stop function
  return () => {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  };
}
