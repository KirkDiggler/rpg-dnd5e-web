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
import {
  DamageType,
  type AttackRef,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  DamageType as ActDamageType,
  AttackOutcome,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { damageTypeWord } from '../combatBeat';
import type { HeardCell } from '../heardBeat';
import {
  actToasts,
  describeAct,
  formatRollBreakdown,
  partyName,
  type DescribeContext,
} from './describeAct';
import type {
  CombatExperienceAttackOutcome,
  CombatExperienceStoryExchange,
} from './types';

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
  for (const fact of facts) {
    const id = actStoryId(fact.act, fact.index);
    if (seen.has(id)) continue;
    seen.add(id);
    if (!fact.visible) continue;
    const line = describeAct(fact.act, context);
    if (!line) continue;
    const group = fact.act.act;
    const breakdown = formatRollBreakdown(line.roll);
    story.push({
      id,
      deliverySource: fact.source,
      eyebrow: line.eyebrow,
      headline: line.headline,
      detail: line.detail,
      tone: line.tone,
      attack: attackRefOf(fact.act),
      group: group || undefined,
      nested: group !== '' && group === lastGroup,
      rollBreakdown: breakdown || undefined,
      toast: actToasts(fact.act),
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
    targetIsViewer: a.to?.id === context.viewerMember,
  });
}
