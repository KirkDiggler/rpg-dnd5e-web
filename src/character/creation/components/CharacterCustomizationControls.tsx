import {
  resolveHairColorSrgb,
  resolveHairRoughness,
  rgb24ToHex,
  type HairSlotSelection,
} from '@/character/customization/hairCustomization';
import type { CharacterCustomizationProfile } from '@/generated/characterCustomizationCatalog';
import { create } from '@bufbuild/protobuf';
import { EmptySchema } from '@bufbuild/protobuf/wkt';
import type { HairCustomization } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import {
  HairCustomizationSchema,
  StyleSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import { HairStyleGrid } from './HairStyleGrid';

interface CharacterCustomizationControlsProps {
  profile: CharacterCustomizationProfile;
  hair?: HairCustomization;
  onChange: (hair: HairCustomization | undefined) => void;
}

function slotSelection(value: HairCustomization['scalp']): HairSlotSelection {
  if (!value) return { kind: 'default' };
  if (value.selection.case === 'none') return { kind: 'none' };
  if (value.selection.case === 'styleRef') {
    return { kind: 'style', styleRef: value.selection.value };
  }
  return { kind: 'invalid' };
}

function editableSelection(
  value: HairCustomization['scalp']
): HairCustomization['scalp'] {
  return value?.selection.case === 'styleRef' ||
    value?.selection.case === 'none'
    ? value
    : undefined;
}

function editableColor(value: number | undefined): number | undefined {
  return value !== undefined && resolveHairColorSrgb(value) === value
    ? value
    : undefined;
}

function editableRoughness(value: number | undefined): number | undefined {
  return value !== undefined && resolveHairRoughness(value) === value
    ? value
    : undefined;
}

function styleSelection(selection: HairSlotSelection) {
  switch (selection.kind) {
    case 'default':
      return undefined;
    case 'none':
      return create(StyleSelectionSchema, {
        selection: { case: 'none', value: create(EmptySchema) },
      });
    case 'style':
      return create(StyleSelectionSchema, {
        selection: { case: 'styleRef', value: selection.styleRef },
      });
    case 'invalid':
      return undefined;
  }
}

function optionalHair(
  fields: Pick<
    HairCustomization,
    'scalp' | 'facialHair' | 'colorSrgb' | 'roughness'
  >
): HairCustomization | undefined {
  if (
    fields.scalp === undefined &&
    fields.facialHair === undefined &&
    fields.colorSrgb === undefined &&
    fields.roughness === undefined
  ) {
    return undefined;
  }
  return create(HairCustomizationSchema, fields);
}

export function CharacterCustomizationControls({
  profile,
  hair,
  onChange,
}: CharacterCustomizationControlsProps) {
  const update = (
    patch: Partial<
      Pick<
        HairCustomization,
        'scalp' | 'facialHair' | 'colorSrgb' | 'roughness'
      >
    >
  ) => {
    onChange(
      optionalHair({
        scalp: editableSelection(hair?.scalp),
        facialHair: editableSelection(hair?.facialHair),
        colorSrgb: editableColor(hair?.colorSrgb),
        roughness: editableRoughness(hair?.roughness),
        ...patch,
      })
    );
  };
  const displayedColor = rgb24ToHex(resolveHairColorSrgb(hair?.colorSrgb));
  const displayedRoughness = resolveHairRoughness(hair?.roughness);

  return (
    <div className="space-y-6">
      <HairStyleGrid
        profile={profile}
        slot="scalp"
        selection={slotSelection(hair?.scalp)}
        onChange={(selection) => update({ scalp: styleSelection(selection) })}
      />
      <HairStyleGrid
        profile={profile}
        slot="facialHair"
        selection={slotSelection(hair?.facialHair)}
        onChange={(selection) =>
          update({ facialHair: styleSelection(selection) })
        }
      />

      <fieldset className="space-y-4 rounded-lg border border-[var(--border-primary)] p-3">
        <legend className="px-1 text-sm font-semibold text-[var(--text-primary)]">
          Hair material
        </legend>
        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <label
            htmlFor="character-hair-color"
            className="text-sm text-[var(--text-primary)]"
          >
            Hair color
          </label>
          <input
            id="character-hair-color"
            type="color"
            value={displayedColor}
            onChange={(event) =>
              update({
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
            onClick={() => update({ colorSrgb: undefined })}
            className="rounded border border-[var(--border-primary)] px-2 py-1 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2"
          >
            Use default color
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <label
            htmlFor="character-hair-roughness"
            className="text-sm text-[var(--text-primary)]"
          >
            Hair roughness
          </label>
          <input
            id="character-hair-roughness"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={displayedRoughness}
            onChange={(event) =>
              update({ roughness: Number(event.currentTarget.value) })
            }
          />
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <output
              htmlFor="character-hair-roughness"
              className="w-10 text-right text-xs tabular-nums text-[var(--text-primary)]"
            >
              {displayedRoughness.toFixed(2)}
            </output>
            <button
              type="button"
              onClick={() => update({ roughness: undefined })}
              className="rounded border border-[var(--border-primary)] px-2 py-1 text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2"
            >
              Use default roughness
            </button>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
