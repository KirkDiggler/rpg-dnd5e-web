import {
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { FeatureView } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type { CombatExperienceActionPresentation } from './types';

interface LiveActionPresentationInput {
  declarations: readonly Declaration[];
  knownCantrips?: readonly string[];
  knownSpells?: readonly string[];
  features?: readonly FeatureView[];
}

/** Display ordering only; declaration membership and availability remain authoritative. */
export function liveActionPresentation({
  declarations,
  knownCantrips,
  knownSpells,
  features,
}: LiveActionPresentationInput): CombatExperienceActionPresentation {
  const cantrips = new Set(knownCantrips);
  const leveledSpells = new Set(knownSpells);
  // Join the two wire representations of the SAME reference. Names, class,
  // costs and the spelling of an id never decide whether an offer is a feature.
  const featureRefs = new Set(
    features?.flatMap(({ ref }) =>
      ref?.module && ref.type && ref.id
        ? [`${ref.module}:${ref.type}:${ref.id}`]
        : []
    )
  );
  return {
    mode: 'organized-hud',
    quickDeclarationIds: declarations
      .filter((declaration) => {
        if (
          declaration.verb === Verb.ATTACK ||
          declaration.verb === Verb.MOVE ||
          declaration.verb === Verb.DEATH_SAVE
        )
          return true;
        if (declaration.verb === Verb.CAST) {
          const ref = declaration.spell?.ref;
          // Unknown/granted spells remain visible, not guessed to be leveled.
          return !ref || cantrips.has(ref) || !leveledSpells.has(ref);
        }
        if (declaration.verb === Verb.ACTIVATE) {
          // A missing private sheet must not hide potential common actions.
          return (
            features === undefined ||
            featureRefs.has(declaration.ability?.ref ?? '')
          );
        }
        return false;
      })
      .map(({ id }) => id),
  };
}
