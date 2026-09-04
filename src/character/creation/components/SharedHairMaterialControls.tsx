import {
  resolveHairColorSrgb,
  resolveHairRoughness,
  rgb24ToHex,
} from '@/character/customization/hairCustomization';
import type { HairCustomization } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';

interface SharedHairMaterialControlsProps {
  readonly idPrefix: string;
  readonly label: string;
  readonly hair?: HairCustomization;
  readonly onChange: (
    patch: Partial<Pick<HairCustomization, 'colorSrgb' | 'roughness'>>
  ) => void;
}

/** Two UI locations edit the one wire HairCustomization material value. */
export function SharedHairMaterialControls({
  idPrefix,
  label,
  hair,
  onChange,
}: SharedHairMaterialControlsProps) {
  const colorId = `${idPrefix}-color`;
  const roughnessId = `${idPrefix}-roughness`;
  const color = rgb24ToHex(resolveHairColorSrgb(hair?.colorSrgb));
  const roughness = resolveHairRoughness(hair?.roughness);
  return (
    <fieldset className="space-y-4 rounded-lg border border-[var(--border-primary)] p-3">
      <legend className="px-1 text-sm font-semibold text-[var(--text-primary)]">
        {label} material
      </legend>
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <label htmlFor={colorId} className="text-sm text-[var(--text-primary)]">
          {label} color
        </label>
        <input
          id={colorId}
          type="color"
          value={color}
          onChange={(event) =>
            onChange({
              colorSrgb: Number.parseInt(
                event.currentTarget.value.slice(1),
                16
              ),
            })
          }
          className="h-10 w-full cursor-pointer rounded border border-[var(--border-primary)] bg-transparent"
        />
        <button
          type="button"
          onClick={() => onChange({ colorSrgb: undefined })}
          className="rounded border border-[var(--border-primary)] px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          Use default color
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <label
          htmlFor={roughnessId}
          className="text-sm text-[var(--text-primary)]"
        >
          {label} roughness
        </label>
        <input
          id={roughnessId}
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={roughness}
          onChange={(event) =>
            onChange({ roughness: Number(event.currentTarget.value) })
          }
        />
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <output
            htmlFor={roughnessId}
            className="w-10 text-right text-xs tabular-nums text-[var(--text-primary)]"
          >
            {roughness.toFixed(2)}
          </output>
          <button
            type="button"
            onClick={() => onChange({ roughness: undefined })}
            className="rounded border border-[var(--border-primary)] px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            Use default roughness
          </button>
        </div>
      </div>
    </fieldset>
  );
}
