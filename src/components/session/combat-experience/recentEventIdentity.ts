import {
  AttackOutcome,
  ClockMark,
  StateKind,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import {
  Activity,
  ArrowDownToLine,
  Award,
  Backpack,
  CircleHelp,
  Clock3,
  DoorOpen,
  Eye,
  EyeOff,
  Flag,
  Footprints,
  Hand,
  HeartPulse,
  MessageCircle,
  Moon,
  PackageOpen,
  Pause,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  Skull,
  Sparkles,
  Sword,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { partyName, type DescribeContext } from './describeAct';
import { relocateEyebrow } from './relocateLine';
import { actorOf } from './toastPolicy';

export interface RecentEventIdentity {
  what: string;
  who: string;
  icon: LucideIcon;
}
/** Typed event identity, not a parse of narration (a miss starts with its defender). */
export function recentEventIdentity(
  act: Act,
  context: DescribeContext
): RecentEventIdentity {
  const actor = partyName(actorOf(act), context) || 'Unknown actor';
  const result = (
    what: string,
    icon: LucideIcon,
    who = actor
  ): RecentEventIdentity => ({ what, icon, who });
  if (act.refused)
    return result('Unreadable event', CircleHelp, 'Unknown actor');
  const body = act.body;
  switch (body.case) {
    case 'attack':
      return body.value.outcome === AttackOutcome.MISS
        ? result('Miss', ShieldX)
        : body.value.outcome === AttackOutcome.WARDED
          ? result('Warded attack', ShieldCheck)
          : result('Attack', Sword);
    case 'cast':
      return result('Cast', Sparkles);
    case 'activate':
      return result('Ability', Zap);
    // RETIRED (rpg-project#934): a `speak` body is no longer sent.
    case 'speak':
      return result('Unknown event', CircleHelp, 'Unknown actor');
    case 'speech':
      // No speaker seen is no speaker named (rpg-project#934); words not
      // caught are a voice, not speech.
      return result(
        body.value.words === undefined && !body.value.speaker?.id
          ? 'Voice'
          : 'Speech',
        MessageCircle,
        partyName(body.value.speaker, context) || 'Someone'
      );
    case 'deathSave':
      return result('Death save', HeartPulse);
    case 'loot':
      return result('Loot', PackageOpen);
    case 'hold':
      return result('Pick up', Hand);
    case 'drop':
      return result('Drop', ArrowDownToLine);
    case 'door':
      return result('Door', DoorOpen);
    case 'equip':
      return result('Equipment', Backpack);
    case 'walk':
      return result('Move', Footprints);
    case 'stay':
      return result('Stay', Pause);
    case 'sneak':
      return result('Sneak', EyeOff);
    case 'rest':
      return result('Rest', Moon);
    case 'barred':
      // Who barred, not who bumped: the barrier is the news.
      return result(
        'Barred',
        Hand,
        partyName(body.value.barrier, context) || 'Unknown actor'
      );
    case 'tableAnswer':
      return result(
        'Answer',
        MessageCircle,
        partyName(body.value.who, context) || 'Unknown actor'
      );
    case 'state': {
      const state = body.value;
      const subject = partyName(state.party, context) || 'Unknown actor';
      switch (state.change) {
        case StateKind.DOWNED:
          return result('Downed', Skull, subject);
        case StateKind.CONCENTRATION_ENDED:
          return result('Concentration ended', ShieldOff, subject);
        case StateKind.CONDITION_REMOVED:
          return result('Effect ended', ShieldOff, subject);
        case StateKind.STANCE:
          return result(
            'Stance',
            ShieldCheck,
            state.stance?.between
              .map((p) => partyName(p, context))
              .filter(Boolean)
              .join(', ') || subject
          );
        case StateKind.EXPERIENCE:
          return result(
            'Experience',
            Award,
            state.experience
              .map((g) => context.memberNames?.[g.character] ?? g.character)
              .filter(Boolean)
              .join(', ') || subject
          );
        case StateKind.MACHINE:
          return result('State', Activity, subject);
        default:
          return result('Status', CircleHelp, subject);
      }
    }
    case 'perception':
      return result(
        'Notice',
        Eye,
        partyName(body.value.observer, context) || 'Unknown observer'
      );
    case 'clock':
      return result(
        body.value.mark === ClockMark.FIGHT_FORMED
          ? 'Fight begins'
          : body.value.mark === ClockMark.FIGHT_DISSOLVED
            ? 'Fight ends'
            : 'Encounter event',
        body.value.mark === ClockMark.FIGHT_FORMED ||
          body.value.mark === ClockMark.FIGHT_DISSOLVED
          ? Flag
          : Clock3,
        'Encounter'
      );
    case 'relocate':
      return result(
        relocateEyebrow(body.value),
        Footprints,
        partyName(body.value.mover, context) || 'Someone'
      );
    case 'arrest':
      return result('Arrest', ShieldX, 'Guards');
    // A thing done to a prop (rpg-project#959): the doer is named, the thing
    // never (a witness not shown it has no name for it).
    case 'interact':
      return result(
        'Done',
        Hand,
        partyName(body.value.actor, context) || 'Someone'
      );
    case undefined:
      return result('Unknown event', CircleHelp, 'Unknown actor');
    default: {
      const never: never = body;
      return never;
    }
  }
}
