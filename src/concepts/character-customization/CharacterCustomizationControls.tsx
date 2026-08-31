import { HexColorPicker } from 'react-colorful';
import {
  FACIAL_HAIR_OPTIONS,
  SCALP_OPTIONS,
  type CharacterCustomizationAsset,
} from './characterCustomizationAssets';
import {
  SURFACE_PRESETS,
  type ActiveSurfacePreset,
  type CharacterCustomizationFixture,
  type StyleSelection,
  type SurfacePresetName,
} from './characterCustomizationExperiment';

const PRESET_LABELS: Readonly<Record<SurfacePresetName, string>> = {
  hair: 'Hair',
  clothLike: 'Cloth-like',
  leatherLike: 'Leather-like',
  metalLike: 'Metal-like',
};
const COLOR_SWATCHES = [
  { label: 'Black', value: '#111111' },
  { label: 'Blond', value: '#D8B36A' },
  { label: 'Red', value: '#C02626' },
] as const;
const EXACT_HEX = /^#[0-9A-F]{6}$/i;

function StyleSelector({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: StyleSelection;
  readonly options: readonly CharacterCustomizationAsset[];
  readonly onChange: (value: StyleSelection) => void;
}) {
  const values = [
    { value: 'default', label: 'Default' },
    { value: 'none', label: 'None' },
    ...options.map((option) => ({
      value: option.styleRef,
      label: option.label,
    })),
  ];
  return (
    <fieldset aria-label={label} className="space-y-2">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className="rounded border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: active
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
                borderColor: active
                  ? 'var(--accent-primary)'
                  : 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <fieldset aria-label={label} className="space-y-2">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className="rounded border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: active
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
                borderColor: active
                  ? 'var(--accent-primary)'
                  : 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface CharacterCustomizationControlsProps {
  readonly fixture: CharacterCustomizationFixture;
  readonly surfacePreset: ActiveSurfacePreset;
  readonly onFixtureChange: (
    patch: Partial<CharacterCustomizationFixture>
  ) => void;
  readonly onTreatmentChange: (
    patch: Partial<CharacterCustomizationFixture['treatment']>
  ) => void;
  readonly onPreset: (preset: SurfacePresetName) => void;
}

export function CharacterCustomizationControls({
  fixture,
  surfacePreset,
  onFixtureChange,
  onTreatmentChange,
  onPreset,
}: CharacterCustomizationControlsProps) {
  return (
    <section
      className="grid gap-4 rounded border p-4 md:grid-cols-2"
      style={{ borderColor: 'var(--border-primary)' }}
    >
      <StyleSelector
        label="Scalp style"
        value={fixture.scalp}
        options={SCALP_OPTIONS}
        onChange={(scalp) => onFixtureChange({ scalp })}
      />
      <StyleSelector
        label="Facial hair style"
        value={fixture.facialHair}
        options={FACIAL_HAIR_OPTIONS}
        onChange={(facialHair) => onFixtureChange({ facialHair })}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Shared surface color</h2>
        <HexColorPicker
          color={fixture.treatment.baseColorSrgb}
          onChange={(baseColorSrgb) =>
            onTreatmentChange({
              baseColorSrgb: baseColorSrgb.toUpperCase() as `#${string}`,
            })
          }
        />
        <label className="block text-xs">
          Exact sRGB color
          <input
            aria-label="Shared accessory color"
            value={fixture.treatment.baseColorSrgb}
            onChange={(event) => {
              const next = event.target.value.toUpperCase();
              if (EXACT_HEX.test(next)) {
                onTreatmentChange({ baseColorSrgb: next as `#${string}` });
              }
            }}
            className="mt-1 w-full rounded border bg-transparent px-2 py-1 font-mono"
            style={{ borderColor: 'var(--border-primary)' }}
          />
        </label>
        <div className="flex gap-2">
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch.label}
              type="button"
              aria-label={`${swatch.label} color`}
              onClick={() => onTreatmentChange({ baseColorSrgb: swatch.value })}
              className="h-8 w-8 rounded-full border"
              style={{
                backgroundColor: swatch.value,
                borderColor: 'var(--border-primary)',
              }}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Provisional PBR treatment</h2>
        <label className="block text-xs">
          Roughness · {fixture.treatment.roughness.toFixed(2)}
          <input
            aria-label="Roughness"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={fixture.treatment.roughness}
            onChange={(event) =>
              onTreatmentChange({ roughness: Number(event.target.value) })
            }
            className="block w-full"
          />
        </label>
        <label className="block text-xs">
          Metalness · {fixture.treatment.metalness.toFixed(2)}
          <input
            aria-label="Metalness"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={fixture.treatment.metalness}
            onChange={(event) =>
              onTreatmentChange({ metalness: Number(event.target.value) })
            }
            className="block w-full"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SURFACE_PRESETS) as SurfacePresetName[]).map(
            (preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={surfacePreset === preset}
                onClick={() => onPreset(preset)}
                className="rounded border px-2 py-1 text-xs"
                style={{
                  borderColor:
                    surfacePreset === preset
                      ? 'var(--accent-primary)'
                      : 'var(--border-primary)',
                }}
              >
                {PRESET_LABELS[preset]}
              </button>
            )
          )}
        </div>
      </section>

      <ToggleGroup
        label="Motion"
        value={fixture.motion}
        onChange={(motion) => onFixtureChange({ motion })}
        options={[
          { value: 'idle', label: 'Idle' },
          { value: 'walk', label: 'Walk' },
        ]}
      />
      <ToggleGroup
        label="Evidence view"
        value={fixture.view}
        onChange={(view) => onFixtureChange({ view })}
        options={[
          { value: 'close', label: 'Head close-up' },
          { value: 'orbit', label: 'Full orbit' },
          { value: 'play', label: 'Tactical play' },
        ]}
      />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Socket regression</h2>
        <button
          type="button"
          aria-pressed={fixture.showWeaponWitness}
          onClick={() =>
            onFixtureChange({
              showWeaponWitness: !fixture.showWeaponWitness,
            })
          }
          className="rounded border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          Canonical weapon witness
        </button>
      </section>
    </section>
  );
}
