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
 * drives `useCombatPanel`'s own pacing state machine (the "the monster's
 * turn as a moment" sequencing, web#561) rather than a context-free
 * string this module could produce alone — see that hook's own doc
 * comment.
 */
import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DamageType,
  DoorState,
  type AttackRef,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
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
  names: Map<string, string>
): string | null {
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
      return 'The fight is over.';
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
