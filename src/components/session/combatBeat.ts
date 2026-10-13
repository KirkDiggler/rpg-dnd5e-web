import { formatWardBeat } from './wardBeat';
/**
 * combatBeat — turns one typed `Event.body` into the combat panel's single
 * beat-line string (rpg-project#249 §3/§4, rpg-dnd5e-web#762). Framework-
 * free, same split every other pure selector on this route keeps.
 *
 * RENDERS ONLY FROM `Event.body`'s TYPED FIELDS — never `Event.payload`
 * (an explicitly temporary, unversioned passthrough blob per the
 * toolkit's own doc comments, pending toolkit#941; `rpg-api`'s own
 * `events.proto` doc comment: "PASSTHROUGH"). This module is what deletes
 * the old payload-decoding and the unnamed-DOWNED workaround `useCombat
 * Panel.ts` used to carry (gate review, PR #769) — `Downed.member` is now
 * a real typed field (rpg-toolkit#1137), so a downed beat finally names
 * who.
 *
 * NAMES, NOT IDS (rpg-dnd5e-web#564) — every id this module renders goes
 * through `resolveName`/`resolveNameLower` (`participantNames.ts`), which
 * reads the SAME roster the combat panel's participant list reads
 * (`Turn.participants`), never a second name source.
 *
 * `turnEnded` and `moved` deliberately return `null` here: `moved` isn't
 * narrated on the single evolving beat line (a walk would otherwise
 * clobber the last meaningful combat beat on every step), and `turnEnded`
 * drives the shared Story pacing state machine (the "the monster's
 * turn as a moment" sequencing, web#561) rather than a context-free
 * string this module could produce alone — see that hook's own doc
 * comment.
 */
import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { AnswerWord } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DamageType,
  DoorState,
  type AttackRef,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { speakSkillName } from './combat-experience/speakOptions';
import { dissolveSentence, formatFactionBeat } from './factionBeat';
import { heardSentence, type HeardCell } from './heardBeat';
import { formatHoldingBeat } from './holdingBeat';
import { resolveName, resolveNameLower } from './participantNames';

const DAMAGE_TYPE_WORD: Partial<Record<DamageType, string>> = {
  [DamageType.ACID]: 'acid',
  [DamageType.BLUDGEONING]: 'bludgeoning',
  [DamageType.COLD]: 'cold',
  [DamageType.FIRE]: 'fire',
  [DamageType.FORCE]: 'force',
  [DamageType.LIGHTNING]: 'lightning',
  [DamageType.NECROTIC]: 'necrotic',
  [DamageType.PIERCING]: 'piercing',
  [DamageType.POISON]: 'poison',
  [DamageType.PSYCHIC]: 'psychic',
  [DamageType.RADIANT]: 'radiant',
  [DamageType.SLASHING]: 'slashing',
  [DamageType.THUNDER]: 'thunder',
};

/** "slashing", "bludgeoning" — a closed set (`DamageType`'s own doc
 * comment: "the UI branches on it"). `''` for an unrecognised/unset
 * value, so a caller building "N <word>" degrades to a bare number
 * rather than "N ". */
export function damageTypeWord(type: DamageType | undefined): string {
  if (type === undefined) return '';
  return DAMAGE_TYPE_WORD[type] ?? '';
}

function damageText(damage: number, attack: AttackRef | undefined): string {
  const word = damageTypeWord(attack?.damageType);
  return word ? `${damage} ${word}` : `${damage}`;
}

/**
 * Formats one event into the beat line, or `null` for a kind this module
 * deliberately doesn't narrate on its own (see module doc comment).
 * `names`/`member` resolve ids to display text — see `participantNames.ts`.
 */
export function formatBeat(
  event: SessionEvent,
  member: string,
  names: Map<string, string>,
  /** Where this player stood when the beat arrived — read only by a `heard`
   * beat, for which way to look. Absent leaves the bearing out. */
  listenerAt?: HeardCell | null
): string | null {
  // Loot, hold, drop and leave read as ONE set of sentences wherever they
  // are narrated (`holdingBeat.ts`), so this line and the Story log cannot
  // drift into two different accounts of the same beat. It answers `null`
  // for everything else and the switch below carries on.
  const holding = formatHoldingBeat(event, {
    subject: (id) => resolveName(names, id, member),
    object: (id) => resolveNameLower(names, id, member),
  });
  if (holding !== null) return holding;
  // The stance and arrival beats, likewise ONE set of sentences
  // (`factionBeat.ts`, rpg-project#375 §5).
  const faction = formatFactionBeat(event);
  if (faction !== null) return faction;

  const ward = formatWardBeat(event, (id) => resolveName(names, id, member));
  if (ward) return `${ward.headline}. ${ward.detail}`;

  switch (event.body?.case) {
    case 'struck': {
      const s = event.body.value;
      const verb = s.attacker === member ? 'hit' : 'hits';
      const crit = s.critical ? ' Critical hit!' : '';
      return (
        `${resolveName(names, s.attacker, member)} ${verb} ` +
        `${resolveNameLower(names, s.target, member)} — ${s.total} vs AC ` +
        `${s.against}, ${damageText(s.damage, s.attack)}.${crit}`
      );
    }
    case 'missed': {
      const m = event.body.value;
      const verb = m.attacker === member ? 'miss' : 'misses';
      return (
        `${resolveName(names, m.attacker, member)} ${verb} ` +
        `${resolveNameLower(names, m.target, member)} — ${m.total} vs AC ${m.against}.`
      );
    }
    case 'downed': {
      const d = event.body.value;
      return `${resolveName(names, d.member, member)} is downed.`;
    }
    case 'fightStarted': {
      const f = event.body.value;
      const roster = f.members
        .map((id) => resolveName(names, id, member))
        .join(', ');
      return `A fight begins: ${roster}.`;
    }
    case 'fightEnded':
      // By cause: a fight that dissolved because the sides stopped being
      // hostile (BY_STANCE, R1) is said differently from one a side lost.
      return dissolveSentence(event.body.value.cause);
    case 'door': {
      // A door beat narrates from typed facts (rpg-project#268): an unlock
      // attempt carries its author and its numbers — the miss is as much
      // fiction as the hit — and a plain open/close names whose hands.
      const d = event.body.value;
      const who = d.actor ? resolveName(names, d.actor, member) : 'The door';
      if (d.dc) {
        return d.beaten
          ? `${who} picks the lock — ${d.total} vs DC ${d.dc}. The door swings open.`
          : `${who} tries the lock — ${d.total} vs DC ${d.dc}. It holds.`;
      }
      if (d.state === DoorState.OPEN) {
        return d.actor ? `${who} opens the door.` : 'The door opens.';
      }
      return d.actor ? `${who} shuts the door.` : 'The door shuts.';
    }
    case 'spoke': {
      // THE ONE SOCIAL CHECK (rpg-project#569): the line as authored, then
      // the skill it rolled and the numbers. THE ONLY ACCOUNT OF THIS ROLL,
      // and the actor reads it here too: `SpeakResponse` carries no beaten,
      // total or dc. Delivered on a miss as well as a hit — the miss is as
      // much fiction as the hit, the same reason the door beat narrates a
      // failed pick.
      //
      // THE READING IS THE SERVER'S. `beaten` is copied, never derived here
      // from total against dc.
      //
      // NOTHING ABOUT WHAT HAPPENS NEXT. What the creature says or does about
      // it is the `answered` beat below, rolled on that option's table.
      const sp = event.body.value;
      const actor = resolveName(names, sp.actor, member);
      const target =
        sp.target.case === 'memberId'
          ? resolveNameLower(names, sp.target.value, member)
          : (sp.target.value ?? 'something');
      const said = sp.line
        ? `${actor}: “${sp.line}”`
        : `${actor} ${sp.actor === member ? 'speak' : 'speaks'} to ${target}`;
      if (!sp.check) return `${said}.`;
      return (
        `${said} — ${speakSkillName(sp.skill)} ${sp.check.total} vs DC ` +
        `${sp.check.dc}. ${sp.check.beaten ? 'Success.' : 'Failure.'}`
      );
    }
    case 'heard':
      // A SOUND, NEVER ITS MAKER (rpg-project#569 R4). One sentence, shared
      // with the Story log (`heardBeat.ts`).
      return heardSentence(event.body.value, listenerAt);
    case 'answered': {
      // WHAT THE CREATURE DID ABOUT IT (rpg-project#458): the author's line,
      // VERBATIM and quoted, plus one sentence for the word.
      //
      // THE DIE IS NOT HERE (R1). The roll, the summed weights and the entry
      // index are on the beat and rendered in the debug log; this line is the
      // fiction, and a d100 face in the middle of a goblin's sentence is not.
      //
      // AN ENTRY THAT ONLY SPEAKS GETS NO CLAUSE. An empty word is an answer,
      // not a gap, and appending an outcome to it would narrate a thing that
      // did not happen.
      const a = event.body.value;
      const who = resolveName(names, a.creature, member);
      const spoken = a.say ? `${who}: “${a.say}”` : `${who} answers`;
      if (a.word === AnswerWord.FACT) {
        return `${spoken} …and the party learned something.`;
      }
      if (a.word === AnswerWord.FLEE) {
        return `${spoken} …and bolts.`;
      }
      return `${spoken}`;
    }
    case 'ended': {
      // The run's own last word — the key is content vocabulary and the
      // sentence is the client's (rpg-project#269 §6.3); the overlay owns
      // the big headline, this is the log's plain record.
      return 'The encounter is over.';
    }
    case 'turnEnded':
    case 'moved':
    case undefined:
      return null;
    default:
      return null;
  }
}
