import { outfitDefaultColors } from '@/character/customization/outfitCustomization';
import type { OutfitCustomization } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';

interface OutfitColorControlsProps {
  readonly classRefId?: string;
  readonly outfit?: OutfitCustomization;
  readonly onChange: (outfit: OutfitCustomization | undefined) => void;
}

function validRgb24(value: number | undefined): value is number {
  return (
    value !== undefined &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffffff
  );
}

function colorHex(value: number): `#${string}` {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/** Provider-default-aware optional primary/secondary outfit editor. */
export function OutfitColorControls({
  classRefId,
  outfit,
  onChange,
}: OutfitColorControlsProps) {
  const defaults = outfitDefaultColors(classRefId);
  if (!defaults) return null;
  const primary = validRgb24(outfit?.primaryColorSrgb)
    ? colorHex(outfit.primaryColorSrgb)
    : defaults.primaryColor;
  const secondary = validRgb24(outfit?.secondaryColorSrgb)
    ? colorHex(outfit.secondaryColorSrgb)
    : defaults.secondaryColor;
  const update = (
    channel: 'primaryColorSrgb' | 'secondaryColorSrgb',
    value: number
  ) => {
    const next = {
      ...(validRgb24(outfit?.primaryColorSrgb)
        ? { primaryColorSrgb: outfit.primaryColorSrgb }
        : {}),
      ...(validRgb24(outfit?.secondaryColorSrgb)
        ? { secondaryColorSrgb: outfit.secondaryColorSrgb }
        : {}),
      [channel]: value,
    };
    onChange(next as OutfitCustomization);
  };

  return (
    <fieldset className="space-y-4 rounded-lg border border-[var(--border-primary)] p-3">
      <legend className="px-1 text-sm font-semibold text-[var(--text-primary)]">
        Gear colors
      </legend>
      <p className="text-xs text-[var(--text-muted)]">
        Colors left untouched use this class outfit&apos;s provider palette.
      </p>
      <label className="grid gap-2 text-sm text-[var(--text-primary)]">
        Gear primary color
        <input
          aria-label="Gear primary color"
          type="color"
          value={primary}
          onChange={(event) =>
            update(
              'primaryColorSrgb',
              Number.parseInt(event.currentTarget.value.slice(1), 16)
            )
          }
          className="h-10 w-full cursor-pointer rounded border border-[var(--border-primary)] bg-transparent"
        />
      </label>
      <label className="grid gap-2 text-sm text-[var(--text-primary)]">
        Gear secondary color
        <input
          aria-label="Gear secondary color"
          type="color"
          value={secondary}
          onChange={(event) =>
            update(
              'secondaryColorSrgb',
              Number.parseInt(event.currentTarget.value.slice(1), 16)
            )
          }
          className="h-10 w-full cursor-pointer rounded border border-[var(--border-primary)] bg-transparent"
        />
      </label>
      <button
        type="button"
        aria-label="Reset gear colors"
        onClick={() => onChange(undefined)}
        className="rounded border border-[var(--border-primary)] px-2 py-1 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2"
      >
        Reset gear colors
      </button>
    </fieldset>
  );
}
