import {
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { FeatureView } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type { DesktopHotbarSection } from './desktopHotbarLayout';
import { liveActionArt } from './liveActionArt';
import type { CombatExperienceActionPresentation } from './types';
import { isExecutableVerb } from './verbRegistry';

interface LiveActionPresentationInput {
  declarations: readonly Declaration[];
  knownCantrips?: readonly string[];
  knownSpells?: readonly string[];
  features?: readonly FeatureView[];
  /** Responsive presentation only; absent preserves the current organizer. */
  desktop?: boolean;
}

/** Display ordering only; declaration membership and availability remain authoritative. */
export function liveActionPresentation({
  declarations,
  knownCantrips,
  knownSpells,
  features,
  desktop = false,
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
  const desktopDeclarations = desktop
    ? declarations.filter(({ verb }) => isExecutableVerb(verb))
    : [];
  return {
    mode: 'organized-hud',
    ...(desktop
      ? {
          desktopFavorites: false,
          desktopIcons: liveActionArt(desktopDeclarations),
          desktopSectionByDeclarationId: Object.fromEntries(
            desktopDeclarations.map(
              (declaration): [string, DesktopHotbarSection] => [
                declaration.id,
                declaration.verb === Verb.CAST
                  ? 'spells'
                  : declaration.verb === Verb.ACTIVATE &&
                      featureRefs.has(declaration.ability?.ref ?? '')
                    ? 'features'
                    : 'actions',
              ]
            )
          ),
          desktopSpellKindByDeclarationId: Object.fromEntries(
            desktopDeclarations.flatMap<[string, 'cantrip' | 'leveled']>(
              (declaration) => {
                if (declaration.verb !== Verb.CAST) return [];
                const ref = declaration.spell?.ref;
                if (ref && cantrips.has(ref))
                  return [[declaration.id, 'cantrip']];
                if (ref && leveledSpells.has(ref))
                  return [[declaration.id, 'leveled']];
                // Granted/unknown spells remain visible in Other spells.
                return [];
              }
            )
          ),
        }
      : {}),
    quickGroupByDeclarationId: Object.fromEntries(
      declarations.flatMap<[string, 'cantrips' | 'features']>((declaration) => {
        if (
          declaration.verb === Verb.CAST &&
          cantrips.has(declaration.spell?.ref ?? '')
        )
          return [[declaration.id, 'cantrips' as const]];
        if (
          declaration.verb === Verb.ACTIVATE &&
          featureRefs.has(declaration.ability?.ref ?? '')
        )
          return [[declaration.id, 'features' as const]];
        return [];
      })
    ),
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
