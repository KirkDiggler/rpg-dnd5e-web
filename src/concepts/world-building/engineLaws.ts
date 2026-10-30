/**
 * The engine's laws, as the read-back states them (rpg-project#576, B4).
 *
 * A LAW IS SAID ONLY WITH ITS SOURCE. Each sentence names the rpg-toolkit
 * file and symbol that enforces it, confirmed at rpg-toolkit `origin/main`
 * 2f570aa9 when this was written. Changing the engine's law means changing
 * the entry here; a law whose source cannot be found is left out rather
 * than paraphrased.
 *
 * WORDS, NEVER NUMBERS (S2-Q2). A sound's DC and the per-hop rise are
 * rulebook content and not on the wire, so the hearing law says how the DC
 * moves and never what it is. Law text over the wire is a later question
 * (S2-Q7).
 */
import type { Stance } from '@/author/factionVocabulary';

export interface EngineLaw {
  id: string;
  sentence: string;
  /** "rpg-toolkit <path> <symbol>". */
  source: string;
}

export type EngineLawId =
  | 'untilTurns'
  | 'untilOnMind'
  | 'provocation'
  | 'temperAtSpawn'
  | 'hearing'
  | 'weights'
  | 'holds'
  | 'dropAbsent'
  | 'noWeapons';

export const ENGINE_LAWS: Readonly<Record<EngineLawId, EngineLaw>> =
  Object.freeze({
    untilTurns: {
      id: 'untilTurns',
      sentence:
        'When its until holds, a hostile pair becomes neutral and a neutral pair becomes hostile.',
      source:
        'rpg-toolkit rulebooks/dnd5e/encounter/dungeonspec/factions.go turnsTo',
    },
    untilOnMind: {
      id: 'untilOnMind',
      sentence:
        'A fact until is judged on the mind of a side: the pair turns when that mind knows the fact, and nobody else knowing it counts.',
      source: 'rpg-toolkit rulebooks/dnd5e/encounter/field.go TriggerFact',
    },
    provocation: {
      id: 'provocation',
      sentence:
        'A hostile act against it turns its side hostile to the actor’s side when the two are neutral, whatever the file says.',
      source:
        'rpg-toolkit rulebooks/dnd5e/encounter/turning.go Encounter.aggression',
    },
    temperAtSpawn: {
      id: 'temperAtSpawn',
      sentence:
        'A mix is dealt once, as the creature enters the run; a word of its own deals nothing.',
      source:
        'rpg-toolkit rulebooks/dnd5e/encounter/worldtime.go Encounter.dealTemperFor',
    },
    hearing: {
      id: 'hearing',
      sentence:
        'A sound is heard when the listener’s passive Perception meets its DC, which rises with each region the sound crosses and again for each closed door.',
      source:
        'rpg-toolkit rulebooks/dnd5e/encounter/noise.go Encounter.hearersOf',
    },
    weights: {
      id: 'weights',
      sentence:
        'Among the rows that hold, one is picked in proportion to its weight, as its temper scales each word.',
      source: 'rpg-toolkit mind/behavior/table.go Pick',
    },
    holds: {
      id: 'holds',
      sentence: 'When no row holds, it stands where it is.',
      source: 'rpg-toolkit mind/behavior/table.go holdPick',
    },
    noWeapons: {
      id: 'noWeapons',
      sentence:
        'A creature must keep at least one weapon: the session refuses the run at launch when every one is dropped.',
      source:
        'rpg-toolkit rulebooks/dnd5e/monster/weapons.go Monster.SetWeapons',
    },
    dropAbsent: {
      id: 'dropAbsent',
      sentence:
        'A dropped action must be in its list at that layer: the session refuses the run at launch when it is not.',
      source: 'rpg-toolkit rulebooks/dnd5e/session/entities.go augmentActions',
    },
  });

/** The stance a declared one turns to when its `until` holds: the other of
 * hostile and neutral. Allied carries no `until` (the decoder refuses one)
 * and answers itself. The computation the `untilTurns` law states. */
export function turnsTo(stance: Stance): Stance {
  if (stance === 'hostile') return 'neutral';
  if (stance === 'neutral') return 'hostile';
  return stance;
}
