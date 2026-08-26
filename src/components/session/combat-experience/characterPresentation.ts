import type {
  CharacterData,
  ConditionView,
  FeatureView,
  Ref,
  ResourceView,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';

export type CharacterPresentationTone = 'neutral' | 'warm' | 'cool' | 'danger';

export interface CharacterPresentationStyle {
  icon: string;
  tone: CharacterPresentationTone;
}

export const GENERIC_CHARACTER_PRESENTATION: CharacterPresentationStyle =
  Object.freeze({
    icon: '•',
    tone: 'neutral',
  });

/**
 * Asset-owned presentation for refs already projected by the provider. The
 * full module/type/id key fails closed to a generic glyph; refs never become
 * arbitrary URLs and this table never grants behavior or legality.
 */
const PRESENTATION_BY_REF: Readonly<
  Record<string, CharacterPresentationStyle>
> = Object.freeze({
  'dnd5e:features:action_surge': Object.freeze({
    icon: '◆',
    tone: 'warm',
  }),
  'dnd5e:features:second_wind': Object.freeze({
    icon: '◇',
    tone: 'warm',
  }),
  'dnd5e:conditions:fighting_style_dueling': Object.freeze({
    icon: '◈',
    tone: 'cool',
  }),
});

export type PresentedFeature = FeatureView & CharacterPresentationStyle;
export type PresentedCondition = ConditionView & CharacterPresentationStyle;
export type PresentedResource = ResourceView & CharacterPresentationStyle;

export interface PresentedCharacterData {
  features: PresentedFeature[];
  conditions: PresentedCondition[];
  resources: PresentedResource[];
}

function refKey(ref: Ref | undefined): string | undefined {
  if (!ref?.module || !ref.type || !ref.id) return undefined;
  return `${ref.module}:${ref.type}:${ref.id}`;
}

export function presentationForCharacterRef(
  ref: Ref | undefined
): CharacterPresentationStyle {
  const key = refKey(ref);
  return (key && PRESENTATION_BY_REF[key]) || GENERIC_CHARACTER_PRESENTATION;
}

/**
 * Adds icon/tone presentation only. Every provider-authored name, detail,
 * source, resource key, and count is copied unchanged; no resource or HP
 * arithmetic and no rule interpretation belongs in this projection.
 */
export function presentCharacterData(
  characterData: CharacterData
): PresentedCharacterData {
  return {
    features: characterData.features.map((feature) => ({
      ...feature,
      ...presentationForCharacterRef(feature.ref),
    })),
    conditions: characterData.conditions.map((condition) => ({
      ...condition,
      ...presentationForCharacterRef(condition.ref),
    })),
    // ResourceView intentionally carries only an opaque key, not a full Ref.
    // It therefore cannot opt into ref-specific presentation safely.
    resources: characterData.resources.map((resource) => ({
      ...resource,
      ...GENERIC_CHARACTER_PRESENTATION,
    })),
  };
}
