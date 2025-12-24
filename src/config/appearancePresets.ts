/**
 * Character Appearance Presets
 *
 * Defines the preset color options shown in the UI.
 * Colors are stored as hex strings for flexibility.
 */

export interface SkinTonePreset {
  name: string;
  hex: string;
}

export interface ColorPreset {
  name: string;
  hex: string;
}

/**
 * Curated skin tone presets (shown as swatches, not color picker)
 */
export const SKIN_TONE_PRESETS: SkinTonePreset[] = [
  { name: 'Pale', hex: '#F1D4C0' },
  { name: 'Light', hex: '#E8C3A8' },
  { name: 'Medium', hex: '#D5A88C' },
  { name: 'Tan', hex: '#C68E6D' },
  { name: 'Dark', hex: '#9D6B4D' },
  { name: 'Deep', hex: '#704937' },
];

/**
 * Eye color presets (suggested colors in picker)
 */
export const EYE_COLOR_PRESETS: ColorPreset[] = [
  { name: 'Brown', hex: '#4A2511' },
  { name: 'Blue', hex: '#4A90E2' },
  { name: 'Green', hex: '#4CAF50' },
  { name: 'Hazel', hex: '#8B7355' },
  { name: 'Gray', hex: '#708090' },
  { name: 'Amber', hex: '#FFBF00' },
  { name: 'Violet', hex: '#8A2BE2' },
];

/**
 * Armor/clothing color presets (suggested colors in picker)
 */
export const ARMOR_COLOR_PRESETS: ColorPreset[] = [
  { name: 'Dark Red', hex: '#8B0000' },
  { name: 'Navy Blue', hex: '#00008B' },
  { name: 'Forest Green', hex: '#006400' },
  { name: 'Royal Purple', hex: '#4B0082' },
  { name: 'Charcoal', hex: '#2F4F4F' },
  { name: 'Saddle Brown', hex: '#8B4513' },
  { name: 'Black', hex: '#1C1C1C' },
  { name: 'Crimson', hex: '#DC143C' },
];

/**
 * Accent/trim color presets (suggested colors in picker)
 */
export const ACCENT_COLOR_PRESETS: ColorPreset[] = [
  { name: 'Gold', hex: '#FFD700' },
  { name: 'Silver', hex: '#C0C0C0' },
  { name: 'Bronze', hex: '#CD7F32' },
  { name: 'Copper', hex: '#B87333' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Cream', hex: '#FFFDD0' },
  { name: 'Sky Blue', hex: '#87CEEB' },
  { name: 'Rose', hex: '#FF007F' },
];

/**
 * Default appearance values (used when appearance is not set)
 */
export const DEFAULT_APPEARANCE = {
  skinTone: '#D5A88C', // Medium
  primaryColor: '#8B0000', // Dark red
  secondaryColor: '#FFD700', // Gold
  eyeColor: '#4A2511', // Brown
};

/**
 * Appearance type for component props
 * Matches the proto Appearance message structure
 */
export interface CharacterAppearance {
  skinTone: string;
  primaryColor: string;
  secondaryColor: string;
  eyeColor: string;
}

/**
 * Convert hex string to Three.js color number
 */
export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/**
 * Get appearance with defaults filled in for missing values
 */
export function getAppearanceWithDefaults(
  appearance?: Partial<CharacterAppearance>
): CharacterAppearance {
  return {
    skinTone: appearance?.skinTone || DEFAULT_APPEARANCE.skinTone,
    primaryColor: appearance?.primaryColor || DEFAULT_APPEARANCE.primaryColor,
    secondaryColor:
      appearance?.secondaryColor || DEFAULT_APPEARANCE.secondaryColor,
    eyeColor: appearance?.eyeColor || DEFAULT_APPEARANCE.eyeColor,
  };
}
