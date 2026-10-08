import {
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { ActionIconPresentation } from './organizedActionPresentation';

function art(
  family: string,
  name: string,
  fallback: string,
  tone: ActionIconPresentation['tone']
): ActionIconPresentation {
  return {
    src: `/models/synty/ui/desktop-hotbar/ICON_DarkFantasy_${family}_${name}_Clean.png`,
    fallback,
    tone,
  };
}

// Presentation curation only. Exact refs choose an image, never a category,
// label, rule or target. Unknown refs retain the verb's readable fallback.
// Bytes belong to the private runtime asset provider, not this repository.
const BY_REF: ReadonlyMap<string, ActionIconPresentation> = new Map([
  ['dnd5e:weapons:longsword', art('Inventory', 'Swords_01', 'Ls', 'gold')],
  ['dnd5e:weapons:shortbow', art('Inventory', 'Bows_01', 'Sb', 'gold')],
  ['dnd5e:weapons:mace', art('Inventory', 'Maces_01', 'Ma', 'gold')],
  ['dnd5e:weapons:unarmed-strike', art('Stat', 'Strength_02', 'Us', 'gold')],
  ['dnd5e:features:second_wind', art('Status', 'Health_01', 'Sw', 'green')],
  ['dnd5e:spells:resistance', art('Status', 'DefenseUp_03', 'Re', 'blue')],
  ['dnd5e:spells:toll-the-dead', art('Status', 'Dead_01', 'Td', 'violet')],
  ['dnd5e:spells:bane', art('Status', 'Cursed_03', 'Ba', 'violet')],
  ['dnd5e:spells:bless', art('Status', 'Fortified_01', 'Bl', 'gold')],
  ['dnd5e:spells:command', art('Stat', 'Mind_01', 'Co', 'blue')],
  ['dnd5e:spells:cure-wounds', art('Status', 'Health_02', 'Cw', 'green')],
  [
    'dnd5e:spells:healing-word',
    art('Status', 'FortifiedHealth_01', 'Hw', 'green'),
  ],
  ['dnd5e:combat_abilities:dash', art('Status', 'SpeedUp_01', 'Da', 'blue')],
  ['dnd5e:combat_abilities:dodge', art('Status', 'Stealthy_01', 'Do', 'gold')],
]);
const BY_VERB: ReadonlyMap<Verb, ActionIconPresentation> = new Map([
  [Verb.MOVE, art('Stat', 'Speed_02', 'Mv', 'blue')],
  [Verb.ATTACK, { src: '', fallback: '⚔', tone: 'gold' }],
  [Verb.ACTIVATE, { src: '', fallback: '✦', tone: 'gold' }],
  [Verb.CAST, { src: '', fallback: '✧', tone: 'blue' }],
  [Verb.DEATH_SAVE, { src: '', fallback: '✚', tone: 'green' }],
  [Verb.INTIMIDATE, { src: '', fallback: '☠', tone: 'violet' }],
  [Verb.PERSUADE, { src: '', fallback: '☮', tone: 'blue' }],
]);
const UNKNOWN: ActionIconPresentation = {
  src: '',
  fallback: '?',
  tone: 'gold',
};

export function liveActionArt(
  declarations: readonly Declaration[]
): Readonly<Record<string, ActionIconPresentation>> {
  return Object.fromEntries(
    declarations.map((declaration) => {
      const ref =
        declaration.verb === Verb.ATTACK
          ? declaration.attack?.ref
          : declaration.verb === Verb.ACTIVATE
            ? declaration.ability?.ref
            : declaration.verb === Verb.CAST
              ? declaration.spell?.ref
              : undefined;
      return [
        declaration.id,
        (ref ? BY_REF.get(ref) : undefined) ??
          BY_VERB.get(declaration.verb) ??
          UNKNOWN,
      ];
    })
  );
}
