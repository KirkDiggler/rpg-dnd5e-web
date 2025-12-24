/**
 * AppearanceEditor - Character appearance customization component
 *
 * Allows players to customize:
 * - Skin tone (preset swatches)
 * - Primary armor color (color picker with presets)
 * - Secondary accent color (color picker with presets)
 * - Eye color (color picker with presets)
 *
 * Used in character creation modal with live 3D preview.
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
  presets: Array<{ name: string; hex: string }>;
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

  // Find matching preset name
  const presetName = presets.find(
    (p) => p.hex.toLowerCase() === value.toLowerCase()
  )?.name;

  return (
    <div className="space-y-3">
      <label
        className="block text-sm font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-primary)' }}
      >
        {label}
      </label>

      {/* Current color display - large clickable button */}
      <button
        type="button"
        onClick={() => !readonly && setIsOpen(!isOpen)}
        disabled={readonly}
        className={cn(
          'w-full flex items-center gap-4 p-3 rounded-xl border-2 transition-all',
          readonly
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:border-blue-400 hover:shadow-lg active:scale-[0.98]'
        )}
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderColor: isOpen
            ? 'var(--accent-primary)'
            : 'var(--border-primary)',
        }}
      >
        {/* Large color swatch */}
        <div
          className="w-12 h-12 rounded-lg border-2 border-white/30 shadow-md flex-shrink-0"
          style={{ backgroundColor: value }}
        />
        <div className="flex-1 text-left">
          <div
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            {presetName || 'Custom Color'}
          </div>
          <div
            className="text-xs font-mono uppercase"
            style={{ color: 'var(--text-muted)' }}
          >
            {value}
          </div>
        </div>
        <div className="text-lg" style={{ color: 'var(--text-muted)' }}>
          {isOpen ? '▲' : '▼'}
        </div>
      </button>

      {/* Quick preset swatches */}
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.hex}
            type="button"
            onClick={() => {
              if (!readonly) {
                onChange(preset.hex);
              }
            }}
            disabled={readonly}
            className={cn(
              'w-10 h-10 rounded-lg border-2 transition-all flex-shrink-0',
              readonly && 'cursor-not-allowed opacity-60',
              value.toLowerCase() === preset.hex.toLowerCase()
                ? 'border-white ring-2 ring-blue-400 scale-110 shadow-lg'
                : 'border-white/20 hover:border-white/60 hover:scale-105'
            )}
            style={{ backgroundColor: preset.hex }}
            title={preset.name}
          />
        ))}
      </div>

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
            className="relative z-50 p-4 rounded-xl shadow-2xl border-2 mt-2"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-primary)',
            }}
          >
            <HexColorPicker
              color={value}
              onChange={onChange}
              style={{ width: '100%' }}
            />

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="mt-4 w-full py-2.5 text-sm font-semibold rounded-lg transition-colors"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'white',
              }}
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface SkinToneFieldProps {
  value: string;
  onChange: (value: string) => void;
  readonly?: boolean;
}

function SkinToneField({ value, onChange, readonly }: SkinToneFieldProps) {
  const selectedPreset = SKIN_TONE_PRESETS.find(
    (p) => p.hex.toLowerCase() === value.toLowerCase()
  );

  return (
    <div className="space-y-3">
      <label
        className="block text-sm font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-primary)' }}
      >
        Skin Tone
      </label>

      {/* Skin tone swatches - larger buttons */}
      <div className="flex gap-3 flex-wrap">
        {SKIN_TONE_PRESETS.map((preset) => (
          <button
            key={preset.hex}
            type="button"
            onClick={() => !readonly && onChange(preset.hex)}
            disabled={readonly}
            className={cn(
              'w-12 h-12 rounded-xl border-2 transition-all',
              readonly && 'cursor-not-allowed opacity-60',
              value.toLowerCase() === preset.hex.toLowerCase()
                ? 'border-white ring-2 ring-blue-400 scale-110 shadow-lg'
                : 'border-white/20 hover:border-white/60 hover:scale-105'
            )}
            style={{ backgroundColor: preset.hex }}
            title={preset.name}
          />
        ))}
      </div>

      {/* Selected name */}
      <div
        className="text-sm font-medium"
        style={{ color: 'var(--text-secondary)' }}
      >
        {selectedPreset?.name || 'Custom'}
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
    <div className={cn('space-y-8', className)}>
      {/* Skin Tone */}
      <SkinToneField
        value={appearance.skinTone}
        onChange={(value) => handleChange('skinTone', value)}
        readonly={readonly}
      />

      {/* Primary Armor Color */}
      <ColorPickerField
        label="Primary Color"
        value={appearance.primaryColor}
        onChange={(value) => handleChange('primaryColor', value)}
        presets={ARMOR_COLOR_PRESETS}
        readonly={readonly}
      />

      {/* Secondary Accent Color */}
      <ColorPickerField
        label="Accent Color"
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
