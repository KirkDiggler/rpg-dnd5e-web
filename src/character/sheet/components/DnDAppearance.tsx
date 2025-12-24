import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Card } from '../../../components/ui/Card';
import {
  ACCENT_COLOR_PRESETS,
  ARMOR_COLOR_PRESETS,
  DEFAULT_APPEARANCE,
  EYE_COLOR_PRESETS,
  SKIN_TONE_PRESETS,
} from '../../../config/appearancePresets';

interface DnDAppearanceProps {
  character: Character;
}

function getColorName(
  hex: string,
  presets: { name: string; hex: string }[]
): string {
  const preset = presets.find((p) => p.hex.toLowerCase() === hex.toLowerCase());
  return preset?.name || 'Custom';
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-6 h-6 rounded border"
        style={{
          backgroundColor: color,
          borderColor: 'var(--border-primary)',
        }}
      />
      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
        {label}
      </span>
    </div>
  );
}

export function DnDAppearance({ character }: DnDAppearanceProps) {
  const appearance = character.appearance || {
    skinTone: DEFAULT_APPEARANCE.skinTone,
    primaryColor: DEFAULT_APPEARANCE.primaryColor,
    secondaryColor: DEFAULT_APPEARANCE.secondaryColor,
    eyeColor: DEFAULT_APPEARANCE.eyeColor,
  };

  const skinName = getColorName(appearance.skinTone, SKIN_TONE_PRESETS);
  const eyeName = getColorName(appearance.eyeColor, EYE_COLOR_PRESETS);
  const primaryName = getColorName(
    appearance.primaryColor,
    ARMOR_COLOR_PRESETS
  );
  const accentName = getColorName(
    appearance.secondaryColor,
    ACCENT_COLOR_PRESETS
  );

  return (
    <Card className="p-4">
      <h4
        className="text-lg font-bold mb-4 text-center"
        style={{
          fontFamily: 'Cinzel, serif',
          color: 'var(--text-primary)',
        }}
      >
        APPEARANCE
      </h4>

      <div className="grid grid-cols-2 gap-3">
        <ColorSwatch color={appearance.skinTone} label={`Skin: ${skinName}`} />
        <ColorSwatch color={appearance.eyeColor} label={`Eyes: ${eyeName}`} />
        <ColorSwatch
          color={appearance.primaryColor}
          label={`Primary: ${primaryName}`}
        />
        <ColorSwatch
          color={appearance.secondaryColor}
          label={`Accent: ${accentName}`}
        />
      </div>

      <p
        className="text-xs mt-3 text-center italic"
        style={{ color: 'var(--text-muted)' }}
      >
        Set during character creation
      </p>
    </Card>
  );
}
