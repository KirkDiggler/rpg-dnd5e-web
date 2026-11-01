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
    case 'speak':
      return result('Speech', MessageCircle);
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
    case undefined:
      return result('Unknown event', CircleHelp, 'Unknown actor');
    default: {
      const never: never = body;
      return never;
    }
  }
}
