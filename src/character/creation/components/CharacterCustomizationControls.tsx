import {
  resolveHairColorSrgb,
  resolveHairRoughness,
  rgb24ToHex,
  type HairSlotSelection,
} from '@/character/customization/hairCustomization';
import { outfitDefaultColors } from '@/character/customization/outfitCustomization';
import type { CharacterCustomizationProfile } from '@/generated/characterCustomizationCatalog';
import { create } from '@bufbuild/protobuf';
import { EmptySchema } from '@bufbuild/protobuf/wkt';
import type {
  HairCustomization,
  OutfitCustomization,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import {
  HairCustomizationSchema,
  OutfitCustomizationSchema,
  StyleSelectionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import type { Appearance } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { AppearanceSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useState } from 'react';
import {
  AppearanceAccordionSection,
  type AppearanceSection,
} from './AppearanceAccordionSection';
import { HairStyleGrid } from './HairStyleGrid';
import { OutfitColorControls } from './OutfitColorControls';
import { SharedHairMaterialControls } from './SharedHairMaterialControls';

interface CharacterCustomizationControlsProps {
  readonly profile: CharacterCustomizationProfile;
  readonly classRefId?: string;
  readonly appearance: Appearance;
  readonly onChange: (appearance: Appearance) => void;
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

function editableOutfit(value: OutfitCustomization | undefined) {
  const primary = value?.primaryColorSrgb;
  const secondary = value?.secondaryColorSrgb;
  if (
    (primary === undefined ||
      (Number.isInteger(primary) && primary >= 0 && primary <= 0xffffff)) &&
    (secondary === undefined ||
      (Number.isInteger(secondary) && secondary >= 0 && secondary <= 0xffffff))
  ) {
    if (primary === undefined && secondary === undefined) return undefined;
    return create(OutfitCustomizationSchema, {
      primaryColorSrgb: primary,
      secondaryColorSrgb: secondary,
    });
  }
  return undefined;
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

/** One complete Appearance editor; every patch preserves the sibling container. */
export function CharacterCustomizationControls({
  profile,
  classRefId,
  appearance,
  onChange,
}: CharacterCustomizationControlsProps) {
  const [openSection, setOpenSection] = useState<AppearanceSection>('hair');
  const updateHair = (
    patch: Partial<
      Pick<
        HairCustomization,
        'scalp' | 'facialHair' | 'colorSrgb' | 'roughness'
      >
    >
  ) => {
    const hair = appearance.hair;
    onChange(
      create(AppearanceSchema, {
        hair: optionalHair({
          scalp: editableSelection(hair?.scalp),
          facialHair: editableSelection(hair?.facialHair),
          colorSrgb: editableColor(hair?.colorSrgb),
          roughness: editableRoughness(hair?.roughness),
          ...patch,
        }),
        outfit: editableOutfit(appearance.outfit),
      })
    );
  };
  const updateOutfit = (outfit: OutfitCustomization | undefined) => {
    onChange(
      create(AppearanceSchema, {
        hair: optionalHair({
          scalp: editableSelection(appearance.hair?.scalp),
          facialHair: editableSelection(appearance.hair?.facialHair),
          colorSrgb: editableColor(appearance.hair?.colorSrgb),
          roughness: editableRoughness(appearance.hair?.roughness),
        }),
        outfit: editableOutfit(outfit),
      })
    );
  };
  const hairSummary = rgb24ToHex(
    resolveHairColorSrgb(appearance.hair?.colorSrgb)
  );
  const defaults = outfitDefaultColors(classRefId);
  const gearSummary =
    appearance.outfit?.primaryColorSrgb === undefined
      ? (defaults?.primaryColor ?? 'Unavailable')
      : `#${appearance.outfit.primaryColorSrgb.toString(16).padStart(6, '0').toUpperCase()}`;

  return (
    <div className="space-y-3">
      <AppearanceAccordionSection
        section="hair"
        title="Hair"
        openSection={openSection}
        onOpenSection={setOpenSection}
        summary={hairSummary}
      >
        <div className="space-y-6">
          <HairStyleGrid
            profile={profile}
            slot="scalp"
            selection={slotSelection(appearance.hair?.scalp)}
            onChange={(selection) =>
              updateHair({ scalp: styleSelection(selection) })
            }
          />
          <SharedHairMaterialControls
            idPrefix="appearance-hair"
            label="Hair"
            hair={appearance.hair}
            onChange={updateHair}
          />
        </div>
      </AppearanceAccordionSection>
      <AppearanceAccordionSection
        section="facialHair"
        title="Facial Hair"
        openSection={openSection}
        onOpenSection={setOpenSection}
        summary={hairSummary}
      >
        <div className="space-y-6">
          <HairStyleGrid
            profile={profile}
            slot="facialHair"
            selection={slotSelection(appearance.hair?.facialHair)}
            onChange={(selection) =>
              updateHair({ facialHair: styleSelection(selection) })
            }
          />
          <SharedHairMaterialControls
            idPrefix="appearance-facial-hair"
            label="Facial hair"
            hair={appearance.hair}
            onChange={updateHair}
          />
        </div>
      </AppearanceAccordionSection>
      <AppearanceAccordionSection
        section="gear"
        title="Gear Colors"
        openSection={openSection}
        onOpenSection={setOpenSection}
        summary={gearSummary}
      >
        <OutfitColorControls
          classRefId={classRefId}
          outfit={appearance.outfit}
          onChange={updateOutfit}
        />
      </AppearanceAccordionSection>
    </div>
  );
}
