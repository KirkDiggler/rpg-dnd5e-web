import type { Ref } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import type {
  CharacterPresentationTone,
  PresentedCharacterData,
  PresentedResource,
} from './characterPresentation';
import type { ActionIconPresentation } from './organizedActionPresentation';

export interface CharacterStatusNote {
  key: string;
  label: string;
  detail: string;
  icon: string;
  tone: CharacterPresentationTone;
}
export interface CharacterStatusEntry {
  key: string;
  kind: 'feature' | 'condition' | 'resource' | 'status';
  name: string;
  detail: string;
  art: ActionIconPresentation;
  tone: CharacterPresentationTone;
  resource?: PresentedResource;
  resourceMissing: boolean;
  sourceMember?: string;
}
function art(
  name: string,
  tone: ActionIconPresentation['tone']
): ActionIconPresentation {
  return {
    src: `/models/synty/ui/desktop-hotbar/ICON_DarkFantasy_${name}_Clean.png`,
    fallback: '?',
    tone,
  };
}
// Exact identities curate artwork only, never applicability or active/passive status.
const byRef: Readonly<Record<string, ActionIconPresentation>> = {
  'dnd5e:features:second_wind': art('Status_Health_01', 'green'),
  'dnd5e:features:action_surge': art('Stat_Speed_02', 'gold'),
  'dnd5e:features:bardic_inspiration': art('Status_Fortified_01', 'gold'),
  'dnd5e:features:rage': art('Stat_Strength_02', 'gold'),
  'dnd5e:conditions:raging': art('Stat_Strength_02', 'gold'),
  'dnd5e:conditions:fighting_style_dueling': art('Inventory_Swords_01', 'blue'),
  'dnd5e:conditions:fighting_style_great_weapon_fighting': art(
    'Stat_Strength_02',
    'blue'
  ),
  'dnd5e:conditions:opportunity_attack': art('Inventory_Swords_01', 'gold'),
  'dnd5e:conditions:martial_arts': art('Stat_Strength_02', 'blue'),
  'dnd5e:conditions:unarmored_defense': art('Status_DefenseUp_03', 'blue'),
  'dnd5e:conditions:inspired': art('Status_Fortified_01', 'gold'),
  'dnd5e:conditions:blessed': art('Status_Fortified_01', 'green'),
  'dnd5e:conditions:concentrating': art('Stat_Mind_01', 'violet'),
  'dnd5e:conditions:true_strike': art('Stat_Mind_01', 'blue'),
  'dnd5e:conditions:vicious_mockery': art('Status_Cursed_03', 'violet'),
};
const byResource: Readonly<Record<string, ActionIconPresentation>> = {
  hit_dice: art('Status_Health_02', 'green'),
  second_wind: byRef['dnd5e:features:second_wind'],
  action_surge: byRef['dnd5e:features:action_surge'],
  inspiration: byRef['dnd5e:features:bardic_inspiration'],
  rage_charges: byRef['dnd5e:features:rage'],
  ki: art('Stat_Mind_01', 'blue'),
  spell_slot_level_1: art('Stat_Mind_01', 'violet'),
};
const unknown: ActionIconPresentation = {
  src: '',
  fallback: '?',
  tone: 'gold',
};
function fullRef(ref: Ref | undefined): string {
  return ref?.module && ref.type && ref.id
    ? `${ref.module}:${ref.type}:${ref.id}`
    : '';
}
/** Display-only join. Names, class and count values never establish a relationship. */
export function characterStatusEntries(
  character: PresentedCharacterData,
  notes: readonly CharacterStatusNote[] = []
): CharacterStatusEntry[] {
  const linked = new Set<string>();
  const entries: CharacterStatusEntry[] = character.features.map(
    (feature, index) => {
      const matches = feature.resourceKey
        ? character.resources.filter(
            (resource) => resource.key === feature.resourceKey
          )
        : [];
      const resource = matches.length === 1 ? matches[0] : undefined;
      if (resource) linked.add(resource.key);
      return {
        key: JSON.stringify(['feature', fullRef(feature.ref), index]),
        kind: 'feature',
        name: feature.name,
        detail: feature.detail,
        art: byRef[fullRef(feature.ref)] ?? unknown,
        tone: feature.tone,
        resource,
        resourceMissing: feature.resourceKey !== undefined && !resource,
      };
    }
  );
  entries.push(
    ...character.conditions.map(
      (condition, index): CharacterStatusEntry => ({
        key: JSON.stringify([
          'condition',
          fullRef(condition.ref),
          condition.sourceMember,
          index,
        ]),
        kind: 'condition',
        name: condition.name,
        detail: condition.detail,
        art: byRef[fullRef(condition.ref)] ?? unknown,
        tone: condition.tone,
        sourceMember: condition.sourceMember,
        resourceMissing: false,
      })
    )
  );
  entries.push(
    ...character.resources.flatMap((resource, index): CharacterStatusEntry[] =>
      linked.has(resource.key)
        ? []
        : [
            {
              key: JSON.stringify(['resource', resource.key, index]),
              kind: 'resource',
              name: resource.name,
              detail: '',
              art: byResource[resource.key] ?? unknown,
              tone: resource.tone,
              resource,
              resourceMissing: false,
            },
          ]
    )
  );
  entries.push(
    ...notes.map(
      (note): CharacterStatusEntry => ({
        key: JSON.stringify(['status', note.key]),
        kind: 'status',
        name: note.label,
        detail: note.detail,
        art: { src: '', fallback: note.icon, tone: 'blue' },
        tone: note.tone,
        resourceMissing: false,
      })
    )
  );
  return entries;
}
