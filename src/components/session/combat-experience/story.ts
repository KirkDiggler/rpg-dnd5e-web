import {
  EventKind,
  type Event,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DeathSaveOutcome,
  DoorState,
  type AttackRef,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { damageTypeWord } from '../combatBeat';
import { formatDamageRolls, formatRollCalculation } from './rollTrace';
import type {
  CombatExperienceAttackOutcome,
  CombatExperienceStoryExchange,
} from './types';

export interface CombatStoryFact {
  readonly event: Event;
  readonly source: 'live' | 'catchup';
  /** Actor-live attack facts stay false until their local release is accepted. */
  readonly visible: boolean;
}

export interface CombatStoryContext {
  readonly viewerMember: string;
  readonly memberNames?: Readonly<Record<string, string>>;
}

function storyKey(event: Event): string {
  return `${event.session.length}:${event.session}:${event.seq}`;
}

function storyId(event: Event): string {
  return storyKey(event);
}

function memberName(id: string, context: CombatStoryContext): string {
  return context.memberNames?.[id] ?? id;
}

function attackSnapshot(
  attack: AttackRef | undefined
): Readonly<Pick<AttackRef, 'ref' | 'name' | 'damageType'>> | undefined {
  if (!attack) return undefined;
  return Object.freeze({
    ref: attack.ref,
    name: attack.name,
    damageType: attack.damageType,
  });
}

function attackName(attack: AttackRef | undefined): string {
  return attack?.name || attack?.ref || 'Attack';
}

function healingArithmetic(
  roll: number,
  modifier: number,
  requested: number
): string | undefined {
  if (roll === 0 && modifier === 0) return undefined;
  if (modifier > 0) return `${roll} + ${modifier} = ${requested}`;
  if (modifier < 0) return `${roll} - ${Math.abs(modifier)} = ${requested}`;
  return `${roll} = ${requested}`;
}

function buildActivationResultStory(
  event: Event,
  context: CombatStoryContext
): CombatExperienceStoryExchange | undefined {
  if (
    event.body.case !== 'activationResult' ||
    event.kind !== EventKind.ACTIVATION_RESULT
  ) {
    return undefined;
  }

  const actor = memberName(event.body.value.actor, context);
  const base = { id: storyId(event), eyebrow: 'Ability result' };
  switch (event.body.value.result.case) {
    case 'healingApplied': {
      const healing = event.body.value.result.value;
      const arithmetic = healing.calculation
        ? formatRollCalculation(healing.calculation)
        : healingArithmetic(healing.roll, healing.modifier, healing.requested);
      const source = healing.sourceName || 'Healing';
      return Object.freeze({
        ...base,
        headline: `${memberName(healing.target, context)} recovers ${healing.amount} HP`,
        detail:
          `${source}${arithmetic ? ` rolled ${arithmetic}` : ''}; ` +
          `${healing.amount} applied (${healing.hpBefore} → ${healing.hpAfter} HP).`,
        tone: 'success',
      });
    }
    case 'conditionApplied': {
      const condition = event.body.value.result.value;
      return Object.freeze({
        ...base,
        headline: `${memberName(condition.target, context)} begins ${condition.name}`,
        detail: `Applied by ${actor}.`,
        tone: 'success',
      });
    }
    case 'conditionRemoved': {
      const condition = event.body.value.result.value;
      return Object.freeze({
        ...base,
        headline: `${memberName(condition.target, context)} is no longer ${condition.name}`,
        detail: condition.reason,
        tone: 'neutral',
      });
    }
    case 'capacityGranted': {
      const capacity = event.body.value.result.value;
      return Object.freeze({
        ...base,
        headline: `${memberName(capacity.member, context)} gains capacity`,
        detail: capacity.description,
        tone: 'success',
      });
    }
    case undefined:
      return undefined;
  }
}

function attackTone(
  attacker: string,
  target: string,
  hit: boolean,
  context: CombatStoryContext
): CombatExperienceStoryExchange['tone'] {
  if (!hit) return 'neutral';
  if (attacker === context.viewerMember) return 'success';
  if (target === context.viewerMember) return 'danger';
  return 'neutral';
}

function buildAttackStory(
  event: Event,
  context: CombatStoryContext
): CombatExperienceStoryExchange | undefined {
  if (event.body.case === 'struck' && event.kind === EventKind.STRUCK) {
    const struck = event.body.value;
    const actor = memberName(struck.attacker, context);
    const target = memberName(struck.target, context);
    const word = damageTypeWord(struck.attack?.damageType);
    const damage = word ? `${struck.damage} ${word}` : `${struck.damage}`;
    const rollDetail = formatDamageRolls(struck.damageComponents);
    const damageDetail = rollDetail
      ? `${attackName(struck.attack)} rolled ${rollDetail} = ${damage} damage`
      : `${damage} damage`;
    return Object.freeze({
      id: storyId(event),
      eyebrow: `${actor} · ${attackName(struck.attack)}`,
      headline: `${actor} strikes ${target}`,
      detail:
        `d20 ${struck.roll} · total ${struck.total} against AC ${struck.against} · ` +
        `${struck.critical ? 'Critical hit' : 'Hit'} · ${damageDetail}`,
      tone: attackTone(struck.attacker, struck.target, true, context),
      attack: attackSnapshot(struck.attack),
    });
  }
  if (event.body.case === 'missed' && event.kind === EventKind.MISSED) {
    const missed = event.body.value;
    const actor = memberName(missed.attacker, context);
    const target = memberName(missed.target, context);
    return Object.freeze({
      id: storyId(event),
      eyebrow: `${actor} · ${attackName(missed.attack)}`,
      headline: `${target} evades ${actor}`,
      detail: `d20 ${missed.roll} · total ${missed.total} against AC ${missed.against} · Miss`,
      tone: 'neutral',
      attack: attackSnapshot(missed.attack),
    });
  }
  return undefined;
}

function buildOtherStory(
  event: Event,
  context: CombatStoryContext
): CombatExperienceStoryExchange | undefined {
  const base = { id: storyId(event) };
  switch (event.body.case) {
    case 'downed': {
      const name = memberName(event.body.value.member, context);
      return Object.freeze({
        ...base,
        eyebrow: 'Combat',
        headline: `${name} is downed`,
        detail: `Story sequence ${event.seq}.`,
        tone: 'danger',
      });
    }
    case 'fightStarted':
      return Object.freeze({
        ...base,
        eyebrow: 'Combat begins',
        headline: 'A fight begins',
        detail: event.body.value.members
          .map((member) => memberName(member, context))
          .join(', '),
        tone: 'turn',
      });
    case 'fightEnded':
      return Object.freeze({
        ...base,
        eyebrow: 'Fight ended',
        headline: 'The fight is over',
        detail: `Story sequence ${event.seq}.`,
        tone: 'success',
      });
    case 'turnEnded': {
      const ended = memberName(event.body.value.member, context);
      const next = memberName(event.body.value.next, context);
      return Object.freeze({
        ...base,
        eyebrow: 'Turn ended',
        headline: `${next} is next`,
        detail: `${ended} ended their turn.`,
        tone: 'turn',
      });
    }
    case 'moved': {
      const moved = event.body.value;
      return Object.freeze({
        ...base,
        eyebrow: 'Movement',
        headline: `${memberName(moved.member, context)} moves`,
        detail: moved.to
          ? `Position ${moved.to.x}, ${moved.to.y}.`
          : `Story sequence ${event.seq}.`,
        tone: 'neutral',
      });
    }
    case 'joined':
      return Object.freeze({
        ...base,
        eyebrow: 'Party',
        headline: `${memberName(event.body.value.member, context)} joins`,
        detail: `Story sequence ${event.seq}.`,
        tone: 'success',
      });
    case 'exited':
      return Object.freeze({
        ...base,
        eyebrow: 'Party',
        headline: `${memberName(event.body.value.member, context)} leaves`,
        detail: `Story sequence ${event.seq}.`,
        tone: 'neutral',
      });
    case 'ended':
      return Object.freeze({
        ...base,
        eyebrow: 'Encounter ended',
        headline: 'The encounter is over',
        detail: event.body.value.ending,
        tone: 'turn',
      });
    case 'door': {
      const door = event.body.value;
      const actor = door.actor ? memberName(door.actor, context) : 'The door';
      const state = DoorState[door.state] ?? String(door.state);
      return Object.freeze({
        ...base,
        eyebrow: 'Door',
        headline: `${actor} changes ${door.door}`,
        detail: door.dc
          ? `${door.total} against DC ${door.dc} · ${door.beaten ? 'Succeeded' : 'Failed'}`
          : state.toLowerCase(),
        tone: door.beaten ? 'success' : 'neutral',
      });
    }
    case 'activated': {
      if (event.kind !== EventKind.ACTIVATED) return undefined;
      const activated = event.body.value;
      const actor = memberName(activated.actor, context);
      return Object.freeze({
        ...base,
        eyebrow: 'Ability',
        headline: `${actor} uses ${activated.ability?.name || 'Ability'}`,
        detail: activated.target
          ? `${memberName(activated.target, context)} is the target.`
          : `Story sequence ${event.seq}.`,
        tone: 'neutral',
      });
    }
    case 'activationResult':
      return buildActivationResultStory(event, context);
    case 'deathSaveRolled': {
      if (event.kind !== EventKind.DEATH_SAVE_ROLLED) return undefined;
      const save = event.body.value;
      const actor = memberName(save.actor, context);
      const shared = {
        ...base,
        eyebrow: `${actor} · Death Save`,
      };
      switch (save.outcome) {
        case DeathSaveOutcome.SUCCESS:
          return Object.freeze({
            ...shared,
            headline: `Death save! ${save.successes} successes — ${save.successesNeeded} to stabilize.`,
            detail: `${actor} holds on. ${save.failures} failures · ${save.failuresRemaining} remaining.`,
            tone: 'success',
          });
        case DeathSaveOutcome.FAILURE:
          return Object.freeze({
            ...shared,
            headline: `Failure. ${save.failures} down — ${save.failuresRemaining} remaining.`,
            detail: `${save.successes} successes · ${save.successesNeeded} to stabilize.`,
            tone: 'danger',
          });
        case DeathSaveOutcome.CRITICAL_FAILURE:
          return Object.freeze({
            ...shared,
            headline: 'Natural 1. Two failures.',
            detail: `${save.failures} down · ${save.failuresRemaining} remaining.`,
            tone: 'danger',
          });
        case DeathSaveOutcome.RECOVERED:
          return Object.freeze({
            ...shared,
            headline: `Natural 20! Back on your feet with ${save.hpRestored} HP.`,
            detail: `${actor} is conscious.`,
            tone: 'success',
          });
        case DeathSaveOutcome.STABILIZED:
          return Object.freeze({
            ...shared,
            headline: `${save.successes} successes — stabilized.`,
            detail: `${actor} is stable.`,
            tone: 'success',
          });
        case DeathSaveOutcome.DEAD:
          return Object.freeze({
            ...shared,
            headline: `${save.failures} failures — dead.`,
            detail: `${actor} has died.`,
            tone: 'danger',
          });
        case DeathSaveOutcome.UNSPECIFIED:
          return undefined;
      }
      return undefined;
    }
    case 'struck':
    case 'missed':
    case 'doorRevealed':
    case 'regionRevealed':
    case undefined:
      return undefined;
  }
}

/**
 * Builds Story only from typed event bodies. The first accepted `(session,
 * seq)` owns the group, so a conflicting duplicate can never replace the
 * visible result. Raw payload bytes are deliberately never read.
 */
export function buildCombatStory(
  facts: readonly CombatStoryFact[],
  context: CombatStoryContext
): readonly CombatExperienceStoryExchange[] {
  const seen = new Set<string>();
  const story: CombatExperienceStoryExchange[] = [];
  for (const fact of facts) {
    const key = storyKey(fact.event);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!fact.visible) continue;
    const entry =
      buildAttackStory(fact.event, context) ??
      buildOtherStory(fact.event, context);
    if (entry) story.push(entry);
  }
  return Object.freeze(story);
}

/** No bonus or HP arithmetic: every value comes directly from Struck/Missed. */
export function buildCombatAttackOutcome(
  event: Event,
  context: CombatStoryContext
): CombatExperienceAttackOutcome | undefined {
  if (event.body.case === 'struck' && event.kind === EventKind.STRUCK) {
    const struck = event.body.value;
    const word = damageTypeWord(struck.attack?.damageType);
    return Object.freeze({
      attackId: storyKey(event),
      session: event.session,
      seq: event.seq,
      actor: memberName(struck.attacker, context),
      target: memberName(struck.target, context),
      action: attackName(struck.attack),
      attackRef: struck.attack?.ref || undefined,
      d20: struck.roll,
      total: struck.total,
      against: struck.against,
      hit: true,
      critical: struck.critical,
      damage: struck.damage,
      damageType: word || undefined,
      targetIsViewer: struck.target === context.viewerMember,
    });
  }
  if (event.body.case === 'missed' && event.kind === EventKind.MISSED) {
    const missed = event.body.value;
    return Object.freeze({
      attackId: storyKey(event),
      session: event.session,
      seq: event.seq,
      actor: memberName(missed.attacker, context),
      target: memberName(missed.target, context),
      action: attackName(missed.attack),
      attackRef: missed.attack?.ref || undefined,
      d20: missed.roll,
      total: missed.total,
      against: missed.against,
      hit: false,
      critical: false,
      targetIsViewer: missed.target === context.viewerMember,
    });
  }
  return undefined;
}
