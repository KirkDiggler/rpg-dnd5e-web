/**
 * actStory — the story log and the latest-result card, built from acts
 * (rpg-project#630, event-stream R14).
 *
 * Every row is one act's describer line (`describeAct.ts`) with its roll
 * breakdown. ROWS GROUP BY ACT ID: a row whose act tag matches the row above
 * it sits under that row — a failed line's own answer under the line, the
 * concentrations a rest ended under the rest, an opportunity attack under the
 * walk it interrupted.
 */
import { getConditionDisplay } from '@/utils/conditionIcons';
import { refId } from '@/utils/refs';
import {
  DamageType,
  type AttackRef,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  DamageType as ActDamageType,
  AttackOutcome,
  ClockMark,
  InfluenceKind,
  type Act,
  type Roll,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { damageTypeWord } from '../combatBeat';
import type { HeardCell } from '../heardBeat';
import {
  describeAct,
  formatRollBreakdown,
  partyName,
  type DescribeContext,
} from './describeAct';
import { isIdleHoldPick } from './foldLogRows';
import { actorOf, isDeed, toastFor } from './toastPolicy';
import type {
  CombatExperienceAttackModifierSource,
  CombatExperienceAttackOutcome,
  CombatExperienceStoryExchange,
} from './types';

/**
 * A roll's advantage and disadvantage sources (Roll.influences, R17) as the
 * result card lists them. A source with no ref has no honest label, so it is
 * left out rather than guessed.
 */
function influenceSources(
  roll: Roll | undefined,
  attackerId: string,
  targetId: string,
  context: DescribeContext
): CombatExperienceAttackModifierSource[] {
  const name = (id: string) => context.memberNames?.[id] ?? id;
  return (roll?.influences ?? []).flatMap((influence) => {
    if (!influence.sourceRef) return [];
    if (
      influence.kind !== InfluenceKind.ADVANTAGE &&
      influence.kind !== InfluenceKind.DISADVANTAGE
    ) {
      return [];
    }
    const sourceMemberId = influence.sourceId || undefined;
    return [
      Object.freeze({
        kind:
          influence.kind === InfluenceKind.ADVANTAGE
            ? ('advantage' as const)
            : ('disadvantage' as const),
        sourceRef: influence.sourceRef,
        // The name the rulebook recorded, as written; only a source with
        // none takes its label from the ref.
        label:
          influence.name ||
          getConditionDisplay(refId(influence.sourceRef) ?? influence.sourceRef)
            .label,
        sourceMemberId,
        sourceMemberName: sourceMemberId
          ? context.memberNames?.[sourceMemberId]
          : undefined,
        attackerId,
        targetId,
        attackerName: name(attackerId),
        targetName: name(targetId),
        sourceIsViewer: sourceMemberId === context.viewerMember,
      }),
    ];
  });
}

export interface CombatStoryFact {
  readonly act: Act;
  /** The act's place in its same-id run, so every act has its own row. */
  readonly index: number;
  /** Recipient-local delivery order. */
  readonly seq: bigint;
  readonly source: 'live' | 'catchup';
  /** Actor-live attack facts stay false until their local release. */
  readonly visible: boolean;
  /** Where this viewer stood when a sound arrived (hearing only). */
  readonly listenerAt?: HeardCell;
}

/** One act's row id: its session, its record id and its place in the run. */
export function actStoryId(act: Act, index: number): string {
  return `${act.session.length}:${act.session}:${act.id}#${index}`;
}

/** The act's attack ref in the shape the story and dice layers carry. */
export function attackRefOf(
  act: Act
): Readonly<Pick<AttackRef, 'ref' | 'name' | 'damageType'>> | undefined {
  if (act.body.case !== 'attack' || !act.body.value.attack) return undefined;
  const a = act.body.value.attack;
  const word = ActDamageType[a.damageType] as keyof typeof DamageType;
  return Object.freeze({
    ref: a.ref,
    name: a.name,
    damageType: DamageType[word] ?? DamageType.UNSPECIFIED,
  });
}

export function buildActStory(
  facts: readonly CombatStoryFact[],
  context: DescribeContext
): readonly CombatExperienceStoryExchange[] {
  const seen = new Set<string>();
  const story: CombatExperienceStoryExchange[] = [];
  let lastGroup = '';
  // Whether a fight is formed, read from the acts themselves: a fight forms
  // and dissolves on the clock, and a turn passing means one is formed.
  let inFight = false;
  // Who spoke each line, by act tag, so a line's own table answer can be
  // told apart as an answer to the viewer (toast case `answer-to-your-line`).
  const speakers = new Map<string, string>();
  for (const fact of facts) {
    const id = actStoryId(fact.act, fact.index);
    if (seen.has(id)) continue;
    seen.add(id);
    const act = fact.act;
    let fightEdge: 'formed' | 'dissolved' | undefined;
    if (act.body.case === 'clock') {
      const mark = act.body.value.mark;
      if (mark === ClockMark.FIGHT_FORMED) {
        inFight = true;
        fightEdge = 'formed';
      } else if (mark === ClockMark.FIGHT_DISSOLVED) {
        inFight = false;
        fightEdge = 'dissolved';
      } else if (mark === ClockMark.TURN_ENDED) {
        inFight = true;
      }
    }
    if (act.body.case === 'speak' && act.act && act.body.value.by?.id) {
      speakers.set(act.act, act.body.value.by.id);
    }
    if (!fact.visible) continue;
    // R36 is proposed: hide the idle hold pick here until the fold drops it.
    if (isIdleHoldPick(act)) continue;
    const line = describeAct(act, context);
    if (!line) continue;
    const group = act.act;
    const breakdown = formatRollBreakdown(line.roll);
    const toastRule = toastFor(
      act,
      context.viewerMember,
      inFight,
      group ? speakers.get(group) : undefined
    );
    story.push({
      id,
      deliverySource: fact.source,
      eyebrow: line.eyebrow,
      headline: line.headline,
      detail: line.detail,
      tone: line.tone,
      attack: attackRefOf(act),
      group: group || undefined,
      nested: group !== '' && group === lastGroup,
      rollBreakdown: breakdown || undefined,
      act,
      describeContext: context,
      toastRule: toastRule ?? undefined,
      toastText: line.text,
      byViewer:
        isDeed(act) &&
        Boolean(context.viewerMember) &&
        actorOf(act)?.id === context.viewerMember,
      inFight,
      fightEdge,
    });
    lastGroup = group;
  }
  return Object.freeze(story);
}

/** The latest-result card for an attack act; undefined for anything else. */
export function buildActAttackOutcome(
  fact: Pick<CombatStoryFact, 'act' | 'index' | 'seq'>,
  context: DescribeContext
): CombatExperienceAttackOutcome | undefined {
  const { act } = fact;
  if (act.body.case !== 'attack') return undefined;
  const a = act.body.value;
  if (a.outcome !== AttackOutcome.HIT && a.outcome !== AttackOutcome.MISS) {
    return undefined; // a warded swing rolled no attack
  }
  const hit = a.outcome === AttackOutcome.HIT;
  const ref = attackRefOf(act);
  const word = damageTypeWord(ref?.damageType);
  const roll = a.roll;
  const modifierSources = influenceSources(
    roll,
    a.by?.id ?? '',
    a.to?.id ?? '',
    context
  );
  return Object.freeze({
    attackId: actStoryId(act, fact.index),
    session: act.session,
    seq: fact.seq,
    actor: partyName(a.by, context),
    target: partyName(a.to, context),
    action: a.attack?.name || a.attack?.ref || 'Attack',
    attackRef: a.attack?.ref || undefined,
    reaction: a.reaction?.name || undefined,
    rollArithmetic: formatRollBreakdown(roll) || undefined,
    d20: roll?.dice[0] ?? roll?.total ?? 0,
    total: roll?.total ?? 0,
    against: roll?.against ?? 0,
    hit,
    critical: a.critical,
    ...(hit ? { damage: a.damage, damageType: word || undefined } : {}),
    modifierSources:
      modifierSources.length > 0 ? Object.freeze(modifierSources) : undefined,
    targetIsViewer: a.to?.id === context.viewerMember,
  });
}
