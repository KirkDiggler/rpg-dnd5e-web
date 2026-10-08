import {
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { DesktopHotbarSection } from './desktopHotbarLayout';
import {
  organizeDeclarations,
  type OrganizedActionPresentation,
} from './organizedActionPresentation';

export interface HotbarBand {
  id: string;
  label?: string;
  offers: readonly Declaration[];
}
export interface HotbarGroup {
  key: DesktopHotbarSection;
  label: string;
  offers: readonly Declaration[];
  bands: readonly HotbarBand[];
}
const labels: Record<DesktopHotbarSection, string> = {
  actions: 'Actions',
  features: 'Features',
  spells: 'Spells',
  items: 'Items',
};

/** Registry-filtered offers only; hints cannot mint a capability/category.
 * Unavailable offers still count: spent resources must not erase a module. */
export function desktopHotbarGroups(
  declarations: readonly Declaration[],
  presentation?: OrganizedActionPresentation
): HotbarGroup[] {
  const organized = organizeDeclarations(declarations, presentation);
  const currentIds = new Set(
    [...organized.quick, ...Object.values(organized.sections).flat()].map(
      (offer) => offer.id
    )
  );
  const offers = [
    ...new Map(
      declarations
        .filter((offer) => currentIds.has(offer.id))
        .map((offer) => [offer.id, offer])
    ).values(),
  ];
  const sections: Record<DesktopHotbarSection, Declaration[]> = {
    actions: [],
    features: [],
    spells: [],
    items: [],
  };
  for (const offer of offers) {
    const section =
      presentation?.desktopSectionByDeclarationId?.[offer.id] ??
      (offer.verb === Verb.CAST ? 'spells' : 'actions');
    sections[section].push(offer);
  }
  return (Object.keys(labels) as DesktopHotbarSection[])
    .filter((key) => sections[key].length > 0)
    .map((key) => {
      const current = sections[key];
      const bands: HotbarBand[] =
        key === 'spells'
          ? [
              {
                id: 'cantrips',
                label: 'Cantrips',
                offers: current.filter(
                  (offer) =>
                    presentation?.desktopSpellKindByDeclarationId?.[
                      offer.id
                    ] === 'cantrip'
                ),
              },
              {
                id: 'leveled',
                label: 'Leveled spells',
                offers: current.filter(
                  (offer) =>
                    presentation?.desktopSpellKindByDeclarationId?.[
                      offer.id
                    ] === 'leveled'
                ),
              },
              {
                id: 'other',
                label: 'Other spells',
                offers: current.filter(
                  (offer) =>
                    !presentation?.desktopSpellKindByDeclarationId?.[offer.id]
                ),
              },
            ].filter((band) => band.offers.length > 0)
          : [{ id: 'all', offers: current }];
      return { key, label: labels[key], offers: current, bands };
    });
}
