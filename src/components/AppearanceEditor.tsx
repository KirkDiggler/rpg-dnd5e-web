/**
 * AppearanceEditor - Character appearance customization component
 *
 * Allows players to customize:
 * - Skin tone (preset swatches)
 * - Primary armor color (color picker)
 * - Secondary accent color (color picker)
 * - Eye color (color picker)
 *
 * Used in character creation and character sheet editing.
 */

import {
  ACCENT_COLOR_PRESETS,
  ARMOR_COLOR_PRESETS,
  EYE_COLOR_PRESETS,
  SKIN_TONE_PRESETS,
  type CharacterAppearance,
} from '@/config/appearancePresets';
import { cn } from '@/utils/cn';
import { useCallback, useState } from 'react';
import { HexColorPicker } from 'react-colorful';

export interface AppearanceEditorProps {
  /** Current appearance values */
  appearance: CharacterAppearance;
  /** Callback when any color changes */
  onChange: (appearance: CharacterAppearance) => void;
  /** Whether the editor is read-only */
  readonly?: boolean;
  /** Optional className for the container */
  className?: string;
}

interface ColorPickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  presets?: Array<{ name: string; hex: string }>;
  readonly?: boolean;
}

function ColorPickerField({
  label,
  value,
  onChange,
  presets,
  readonly,
}: ColorPickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-2">
      <label
        className="block text-sm font-medium"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </label>

      <div className="relative">
        {/* Color swatch button */}
        <button
          type="button"
          onClick={() => !readonly && setIsOpen(!isOpen)}
          disabled={readonly}
          className={cn(
            'flex items-center gap-3 w-full p-2 rounded-lg border transition-colors',
            readonly
              ? 'cursor-not-allowed opacity-60'
              : 'cursor-pointer hover:border-blue-400'
          )}
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
          }}
        >
          <div
            className="w-8 h-8 rounded-md border-2 border-white/20 shadow-inner"
            style={{ backgroundColor: value }}
          />
          <span
            className="font-mono text-sm uppercase"
            style={{ color: 'var(--text-primary)' }}
          >
            {value}
          </span>
        </button>

        {/* Color picker dropdown */}
        {isOpen && !readonly && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Picker panel */}
            <div
              className="absolute top-full left-0 mt-2 z-50 p-3 rounded-lg shadow-xl border"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-primary)',
              }}
            >
              <HexColorPicker color={value} onChange={onChange} />

              {/* Preset swatches */}
              {presets && presets.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="text-xs text-gray-400 mb-2">Quick picks</div>
                  <div className="flex flex-wrap gap-1">
                    {presets.map((preset) => (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => {
                          onChange(preset.hex);
                        }}
                        className={cn(
                          'w-6 h-6 rounded border-2 transition-transform hover:scale-110',
                          value.toLowerCase() === preset.hex.toLowerCase()
                            ? 'border-white'
                            : 'border-white/20'
                        )}
                        style={{ backgroundColor: preset.hex }}
                        title={preset.name}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Close button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="mt-3 w-full py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface SkinToneFieldProps {
  value: string;
  onChange: (value: string) => void;
  readonly?: boolean;
}

function SkinToneField({ value, onChange, readonly }: SkinToneFieldProps) {
  return (
    <div className="space-y-2">
      <label
        className="block text-sm font-medium"
        style={{ color: 'var(--text-secondary)' }}
      >
        Skin Tone
      </label>

      <div className="flex gap-2">
        {SKIN_TONE_PRESETS.map((preset) => (
          <button
            key={preset.hex}
            type="button"
            onClick={() => !readonly && onChange(preset.hex)}
            disabled={readonly}
            className={cn(
              'w-10 h-10 rounded-lg border-2 transition-all',
              readonly && 'cursor-not-allowed opacity-60',
              value.toLowerCase() === preset.hex.toLowerCase()
                ? 'border-white scale-110 shadow-lg'
                : 'border-transparent hover:border-white/50 hover:scale-105'
            )}
            style={{ backgroundColor: preset.hex }}
            title={preset.name}
          />
        ))}
      </div>

      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {SKIN_TONE_PRESETS.find(
          (p) => p.hex.toLowerCase() === value.toLowerCase()
        )?.name || 'Custom'}
      </div>
    </div>
  );
}

export function AppearanceEditor({
  appearance,
  onChange,
  readonly = false,
  className,
}: AppearanceEditorProps) {
  const handleChange = useCallback(
    (field: keyof CharacterAppearance, value: string) => {
      onChange({
        ...appearance,
        [field]: value,
      });
    },
    [appearance, onChange]
  );

  return (
    <div className={cn('space-y-6', className)}>
      {/* Skin Tone - swatches only */}
      <SkinToneField
        value={appearance.skinTone}
        onChange={(value) => handleChange('skinTone', value)}
        readonly={readonly}
      />

      {/* Primary Armor Color */}
      <ColorPickerField
        label="Armor Primary"
        value={appearance.primaryColor}
        onChange={(value) => handleChange('primaryColor', value)}
        presets={ARMOR_COLOR_PRESETS}
        readonly={readonly}
      />

      {/* Secondary Accent Color */}
      <ColorPickerField
        label="Armor Accent"
        value={appearance.secondaryColor}
        onChange={(value) => handleChange('secondaryColor', value)}
        presets={ACCENT_COLOR_PRESETS}
        readonly={readonly}
      />

      {/* Eye Color */}
      <ColorPickerField
        label="Eye Color"
        value={appearance.eyeColor}
        onChange={(value) => handleChange('eyeColor', value)}
        presets={EYE_COLOR_PRESETS}
        readonly={readonly}
      />
    </div>
  );
}
