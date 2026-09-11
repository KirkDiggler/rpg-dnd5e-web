import { getConditionDisplay } from '@/utils/conditionIcons';
import { refId } from '@/utils/refs';
import {
  EventKind,
  type AttackModifierSource,
  type Event,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DeathSaveOutcome,
  DoorState,
  type AttackRef,
  type ReactionRef,
  type SpellRef,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { damageTypeWord } from '../combatBeat';
import { dissolveSentence, formatFactionBeat } from '../factionBeat';
import { formatHoldingBeat } from '../holdingBeat';
import { formatDamageRolls, formatRollCalculation } from './rollTrace';
import type {
  CombatExperienceAttackModifierSource,
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
  /**
   * WHAT THIS RUN HAS WATCHED SOMEBODY CAST, accumulated by
   * `buildCombatStory` as it walks the beats in order. Two cards read
   * differently once the log knows a spell was cast, and NEITHER FACT IS ON
   * THE BEAT THAT NEEDS IT:
   *
   *   - `Saved` says who rolled, against what DC, and which spell was the
   *     source — but not whether the saver was RESISTING that spell or
   *     HOLDING it. A concentration check and a target's save are the same
   *     six fields on the wire (design rpg-project#407 leaves this to the
   *     client; the gap is recorded on #997).
   *   - `ConditionRemoved` says a condition ended and why, but never that
   *     the condition was a spell's residue rather than a class feature's.
   *
   * The discriminator is a fact this client SAW, not a rule it derived: the
   * saver is the member who cast that spell, and the ending condition shares
   * its name. Absent the cast — a log window that scrolled past it, a
   * catch-up that starts later — both cards degrade to the wording they had
   * before, which is a weaker sentence and never a wrong one.
   */
  readonly castSpells?: CastSpellsWitnessed;
}

export interface CastSpellsWitnessed {
  /** `${caster}\u0000${spell ref}` for every cast seen so far. */
  readonly byCaster: ReadonlySet<string>;
  /** Every spell NAME seen cast, to recognise the conditions it leaves. */
  readonly names: ReadonlySet<string>;
}

function castsConcentration(
  saver: string,
  spell: SpellRef | undefined,
  context: CombatStoryContext
): boolean {
  if (!spell?.ref) return false;
  return (
    context.castSpells?.byCaster.has(`${saver}\u0000${spell.ref}`) ?? false
  );
}

function storyKey(event: Event): string {
  return `${event.session.length}:${event.session}:${event.seq}`;
}

export function storyId(event: Event): string {
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

/**
 * What a spell calls itself, on a beat that carries a `SpellRef`.
 *
 * THE NAME IS THE SERVER'S, NEVER DERIVED FROM THE REF. `SpellRef` carries a
 * display name authored by the spell itself for exactly this, and the ref is
 * the last resort so an unresolvable one shows as itself rather than as a
 * plausible invention. `source` is unset when something other than a spell
 * forced a save — a trap, a monster trait — and the save then narrates alone.
 */
function spellName(spell: SpellRef | undefined): string | undefined {
  if (!spell) return undefined;
  return spell.name || spell.ref || undefined;
}

/**
 * WHY THE CONCENTRATION BROKE, IN WORDS A VIEWER ALREADY KNOWS.
 *
 * `ConcentrationEnded.reason` is an OPEN STRING in the rulebook's own
 * vocabulary, not a wire contract (design rpg-project#407, R10). So this is a
 * presentation table and nothing else: the client never branches on the reason
 * for a rule, and a reason nobody has phrased yet still reaches the log —
 * underscores turned into spaces — rather than vanishing behind a default.
 */
const CONCENTRATION_END_PHRASES: Readonly<Record<string, string>> =
  Object.freeze({
    damage: 'the hit broke it',
    recast: 'another concentration spell took its place',
    duration: 'it ran out',
    combat_end: 'the fight ended',
    spell_ended: 'the spell was already spent',
    caster_down: 'the caster went down',
    'long rest': 'a long rest',
  });

function concentrationEndPhrase(reason: string): string | undefined {
  if (!reason) return undefined;
  return CONCENTRATION_END_PHRASES[reason] ?? reason.replace(/_/g, ' ');
}

/**
 * A strike taken as a reaction is named by the reacting rule itself
 * (`ReactionRef.name` on Struck/Missed), so an opportunity attack during a
 * monster's turn stops reading as a bug. The name is used verbatim and never
 * derived from the ref: no rulebook vocabulary lives in the client. Absent on
 * an ordinary swing, and the eyebrow then reads exactly as it did before.
 */
function reactionLabel(reaction: ReactionRef | undefined): string | undefined {
  return reaction?.name || undefined;
}

function attackEyebrow(
  actor: string,
  attack: AttackRef | undefined,
  reaction: ReactionRef | undefined
): string {
  const swing = `${actor} · ${attackName(attack)}`;
  const label = reactionLabel(reaction);
  return label ? `${label} · ${swing}` : swing;
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
    // WHAT A CAST COST SOMEBODY, through the arm the activation result gained
    // for it (design rpg-project#405, R7). The 1d4 face reaches the player
    // because `calculation` carries the rulebook's own components; `amount` is
    // the post-clamp fact and is never recomputed from them.
    case 'damageApplied': {
      const damage = event.body.value.result.value;
      const word = damageTypeWord(damage.damageType);
      const arithmetic = damage.calculation
        ? formatRollCalculation(damage.calculation)
        : undefined;
      const source = damage.sourceName || damage.sourceRef || 'Damage';
      return Object.freeze({
        ...base,
        headline: `${memberName(damage.target, context)} takes ${damage.amount}${
          word ? ` ${word}` : ''
        } damage`,
        detail:
          `${source}${arithmetic ? ` rolled ${arithmetic}` : ''}; ` +
          `${damage.amount} applied (${damage.hpBefore} → ${damage.hpAfter} HP).`,
        tone: damage.target === context.viewerMember ? 'danger' : 'neutral',
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
      const target = memberName(condition.target, context);
      // A SPELL'S RESIDUE LEAVING, SAID AS A SPELL ENDING. The generic
      // template names the condition as a state the member stopped being —
      // "staniel is no longer True Strike" — which is the right sentence for
      // Raging and nonsense for a spell. Only a condition sharing its name
      // with a spell this run watched somebody cast takes the other wording,
      // so a class feature's removal reads exactly as it did before.
      if (condition.name && context.castSpells?.names.has(condition.name)) {
        return Object.freeze({
          ...base,
          headline: `${condition.name} fades from ${target}`,
          detail: concentrationEndPhrase(condition.reason) ?? condition.reason,
          tone: 'neutral',
        });
      }
      return Object.freeze({
        ...base,
        headline: `${target} is no longer ${condition.name}`,
        detail: condition.reason,
        tone: 'neutral',
      });
    }
    // A CREATURE MOVED WHO DID NOT CHOOSE TO. Thunderwave's shove is the
    // first of these: the spell decided the direction and the distance, and
    // this says what the floor allowed. The cells entered arrive separately
    // as ordinary MOVED beats, so nothing here repeats the route.
    case 'moveImposed': {
      const move = event.body.value.result.value;
      const target = memberName(move.target, context);
      // NAMED, NOT COUNTED. `stopped_by` is whatever the rulebook authored —
      // a creature standing in the way resolves to their name, a prop keeps
      // the ref the rulebook wrote. Empty means nothing stopped it and the
      // whole budget was spent, which is a different sentence with nothing
      // to add.
      const detail = move.stoppedBy
        ? `Stopped by ${memberName(move.stoppedBy, context)}.`
        : `Pushed by ${actor}.`;
      return Object.freeze({
        ...base,
        headline:
          move.movedCells === 0
            ? `${target} is pushed but does not move`
            : `${target} slides ${move.movedCells} cell${move.movedCells === 1 ? '' : 's'}`,
        detail,
        tone: move.target === context.viewerMember ? 'danger' : 'neutral',
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

export function formatAttackRollArithmetic(
  roll: number,
  total: number
): string {
  const modifier = total - roll;
  const sign = modifier < 0 ? '−' : '+';
  return `d20 ${roll} ${sign} ${Math.abs(modifier)} = ${total}`;
}

function attackModifierSources(
  kind: CombatExperienceAttackModifierSource['kind'],
  sources: readonly AttackModifierSource[],
  attackerId: string,
  targetId: string,
  context: CombatStoryContext
): readonly CombatExperienceAttackModifierSource[] {
  return sources.flatMap((source) => {
    // Both fields are optional on the wire. Without a source ref there is no
    // honest label for the influence, so leave that incomplete attribution out
    // rather than deriving a rule from the source member or attack shape.
    if (!source.sourceRef) return [];
    const sourceMemberId = source.sourceId || undefined;
    return [
      Object.freeze({
        kind,
        sourceRef: source.sourceRef,
        label: getConditionDisplay(refId(source.sourceRef) ?? source.sourceRef)
          .label,
        sourceMemberId,
        sourceMemberName: sourceMemberId
          ? context.memberNames?.[sourceMemberId]
          : undefined,
        attackerId,
        targetId,
        attackerName: memberName(attackerId, context),
        targetName: memberName(targetId, context),
        sourceIsViewer: sourceMemberId === context.viewerMember,
      }),
    ];
  });
}

export function formatAttackModifierSource(
  source: CombatExperienceAttackModifierSource
): string {
  if (source.sourceIsViewer && source.sourceMemberId === source.attackerId) {
    return `Your ${source.label} → ${source.targetName}`;
  }
  const owner = source.sourceIsViewer
    ? `Your ${source.label}`
    : `${source.label}${
        source.sourceMemberId
          ? ` · source ${source.sourceMemberName ?? source.sourceMemberId}`
          : ''
      }`;
  return `${owner} · ${source.attackerName} → ${source.targetName}`;
}

function attackModifierDetail(
  sources: readonly CombatExperienceAttackModifierSource[]
): string {
  const groups = (['advantage', 'disadvantage'] as const).flatMap((kind) => {
    const matching = sources.filter((source) => source.kind === kind);
    if (matching.length === 0) return [];
    const heading = kind === 'advantage' ? 'Advantage' : 'Disadvantage';
    return [
      `${heading}: ${matching.map(formatAttackModifierSource).join('; ')}`,
    ];
  });
  return groups.length > 0 ? ` · ${groups.join(' · ')}` : '';
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
    const modifierSources = [
      ...attackModifierSources(
        'advantage',
        struck.advantageSources,
        struck.attacker,
        struck.target,
        context
      ),
      ...attackModifierSources(
        'disadvantage',
        struck.disadvantageSources,
        struck.attacker,
        struck.target,
        context
      ),
    ];
    return Object.freeze({
      id: storyId(event),
      eyebrow: attackEyebrow(actor, struck.attack, struck.reaction),
      headline: `${actor} strikes ${target}`,
      detail:
        `${formatAttackRollArithmetic(struck.roll, struck.total)} · ` +
        `${struck.critical ? 'Critical hit' : 'Hit'} · ${damageDetail}` +
        attackModifierDetail(modifierSources),
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
      eyebrow: attackEyebrow(actor, missed.attack, missed.reaction),
      headline: `${target} evades ${actor}`,
      detail: `${formatAttackRollArithmetic(missed.roll, missed.total)} · Miss`,
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
        // By cause (`factionBeat.ts`): the hold-out's dissolve says the
        // sides stood down rather than that one of them lost.
        headline: dissolveSentence(event.body.value.cause).replace(/\.$/, ''),
        detail: `Story sequence ${event.seq}.`,
        tone: 'success',
      });
    // THE STANCE FOLDED (rpg-project#375 §5): the pair and the word, the
    // sentence `factionBeat.ts` owns, and nothing of why — who carried what
    // to whom is knowledge and never rides this beat.
    case 'stanceChanged':
      return Object.freeze({
        ...base,
        eyebrow: 'Stance',
        headline: (formatFactionBeat(event) ?? '').replace(/\.$/, ''),
        detail: `Now ${event.body.value.stance || 'unspecified'}. Story sequence ${event.seq}.`,
        tone: 'success',
      });
    // A RESERVED PLACEMENT ENTERED THE RUN (§3.7): the first the log hears
    // of it, so it is named by the author's own id.
    case 'arrived':
      return Object.freeze({
        ...base,
        eyebrow: 'Arrival',
        headline: (formatFactionBeat(event) ?? '').replace(/\.$/, ''),
        detail: `Story sequence ${event.seq}.`,
        tone: 'danger',
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
        // The departure's own statement — through which authored exit, and
        // carrying what (rpg-project#368 §6). `holdingBeat.ts` owns the
        // sentence; the beat line reads the identical one.
        headline: holdingHeadline(event, context),
        detail: `Story sequence ${event.seq}.`,
        tone: 'neutral',
      });
    // Loot names looter and body and NOTHING of what moved (design P3) —
    // the log entry for a body with nothing to give is byte-identical to
    // the one for the captain, which is the secret this slice keeps.
    case 'looted':
      return Object.freeze({
        ...base,
        eyebrow: 'Loot',
        headline: holdingHeadline(event, context),
        detail: `Story sequence ${event.seq}.`,
        tone: 'neutral',
      });
    case 'held':
      return Object.freeze({
        ...base,
        eyebrow: 'Holding',
        headline: holdingHeadline(event, context),
        detail: `Story sequence ${event.seq}.`,
        tone: 'success',
      });
    case 'dropped':
      return Object.freeze({
        ...base,
        eyebrow: 'Holding',
        headline: holdingHeadline(event, context),
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
    // A SPELL LEFT THE CASTER'S HANDS. Its own beat rather than an activation,
    // because a cast is its own verb all the way down (design rpg-project#405,
    // R1) — and the name is the spell's, copied from the server-authored
    // declaration.
    case 'cast': {
      if (event.kind !== EventKind.CAST) return undefined;
      const cast = event.body.value;
      const actor = memberName(cast.actor, context);
      const targetIds =
        cast.targets.length > 0
          ? cast.targets
          : cast.target
            ? [cast.target]
            : [];
      const targets = targetIds.map((target) => memberName(target, context));
      return Object.freeze({
        ...base,
        eyebrow: 'Spell',
        headline: `${actor} casts ${spellName(cast.spell) ?? 'a spell'}`,
        detail:
          targets.length === 1
            ? `${targets[0]} is the target.`
            : targets.length > 1
              ? `Targets in order: ${targets.join(', ')}.`
              : `Story sequence ${event.seq}.`,
        tone: 'neutral',
      });
    }
    // ONE CREATURE'S SAVING THROW, WHOLE. Every number the player needs to
    // believe the outcome is on the beat, and `succeeded` is the rulebook's
    // own reading: the client shows both numbers and never compares them
    // itself, the law DeathSaveRolled.outcome already keeps.
    case 'saved': {
      if (event.kind !== EventKind.SAVED) return undefined;
      const saved = event.body.value;
      const saver = memberName(saved.saver, context);
      const source = spellName(saved.source);
      const arithmetic = saved.calculation
        ? formatRollCalculation(saved.calculation, (sourceId) =>
            memberName(sourceId, context)
          )
        : undefined;
      const detail =
        `${arithmetic ?? `d20 ${saved.roll} · total ${saved.total}`} against ` +
        `DC ${saved.dc} · ${saved.succeeded ? 'Succeeded' : 'Failed'}`;
      // THE SAVER IS HOLDING THIS SPELL, NOT RESISTING IT. Same six fields on
      // the wire either way, so the log reads it off a cast it watched: the
      // saver is the one who cast this spell. "staniel saves vs True Strike"
      // is a sentence about somebody being attacked by their own buff, and
      // Kirk read exactly that on the walk.
      if (castsConcentration(saved.saver, saved.source, context)) {
        return Object.freeze({
          ...base,
          eyebrow: `${saver} · Concentration check`,
          headline: saved.succeeded
            ? `${saver} holds ${source}`
            : `${saver} loses their grip on ${source}`,
          detail,
          tone: saved.succeeded ? 'success' : 'danger',
        });
      }
      return Object.freeze({
        ...base,
        eyebrow: source ? `${saver} · ${source}` : `${saver} · Saving throw`,
        headline: source
          ? `${saver} saves vs ${source}`
          : `${saver} makes a saving throw`,
        detail,
        tone: saved.succeeded ? 'success' : 'danger',
      });
    }
    // A SPELL THE CASTER WAS HOLDING LET GO (design rpg-project#407, R10).
    // Its own beat, because it is the only thing in the record that says the
    // spell ended AND why: what it took off the board arrives separately as
    // condition removals. The spell's name is the server-authored one, copied
    // like Cast.spell, and the reason is phrased rather than interpreted.
    case 'concentrationEnded': {
      if (event.kind !== EventKind.CONCENTRATION_ENDED) return undefined;
      const ended = event.body.value;
      const caster = memberName(ended.caster, context);
      const spell = spellName(ended.spell);
      const why = concentrationEndPhrase(ended.reason);
      return Object.freeze({
        ...base,
        eyebrow: 'Concentration',
        headline: spell
          ? `${caster} loses concentration on ${spell}`
          : `${caster} loses concentration`,
        detail: why ? `${why}.` : `Story sequence ${event.seq}.`,
        tone: 'danger',
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
    // THE FIGHT IS WAITING ON SOMEBODY (rpg-project#316). The step has NOT
    // happened — `to` is announced, not taken — so this beat narrates the
    // pause and never the move; the MOVED that follows the answer is where
    // the mover arrives. The two answers are deliberately not recited here:
    // the audience reads them off their own VERB_REACT declaration, and a
    // log that listed them would be a second, staler control surface.
    case 'windowOpened': {
      const window = event.body.value;
      const mover = memberName(window.mover, context);
      const audience = window.audience
        .map((id) => memberName(id, context))
        .join(', ');
      return Object.freeze({
        ...base,
        eyebrow: reactionLabel(window.reaction) ?? 'Reaction',
        headline: audience
          ? `${audience} may strike as ${mover} leaves reach`
          : `${mover} leaves reach`,
        detail: `Story sequence ${event.seq}.`,
        tone: 'turn',
      });
    }
    // THE DIE IS ROLLED AND THE SWING HAS NOT LANDED (rpg-project#398). No
    // STRUCK and no MISSED exists for this attack yet, so this line says what
    // stands on the table and never what it did — the beat that follows the
    // answer carries the outcome, with a total this one cannot know.
    //
    // THE AC IS NOT NARRATED because the wire does not carry it: the audience
    // decides on the roll, not on whether the roll already beat something.
    case 'rollWindowOpened': {
      const window = event.body.value;
      const audience = memberName(window.audience, context);
      return Object.freeze({
        ...base,
        eyebrow: reactionLabel(window.offer) ?? 'Reaction',
        headline: `${audience} rolled ${formatAttackRollArithmetic(window.roll, window.total)}`,
        detail: `Story sequence ${event.seq}.`,
        tone: 'turn',
      });
    }
    case 'struck':
    case 'missed':
    case 'doorRevealed':
    case 'regionRevealed':
    case undefined:
      return undefined;
  }
}

/** One of `holdingBeat.ts`'s sentences, with the roster name in both
 * positions — the Story log is written about the party, not to the viewer,
 * so nobody is "You" here (the beat line is where that distinction lives).
 * A headline never ends in a period, so the sentence's own one comes off. */
function holdingHeadline(event: Event, context: CombatStoryContext): string {
  const sentence = formatHoldingBeat(event, {
    subject: (id) => memberName(id, context),
    object: (id) => memberName(id, context),
  });
  return sentence ? sentence.replace(/\.$/, '') : '';
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
  // Accumulated IN ORDER and read by the beats that follow, never by the ones
  // that came first: a spell cast later in the fight must not retroactively
  // change how an earlier save was worded. A cast counts even when its own
  // card is withheld — it happened, whether or not this viewer watched the
  // die land.
  const byCaster = new Set<string>();
  const names = new Set<string>();
  const castSpells = { byCaster, names };
  const withCasts: CombatStoryContext = { ...context, castSpells };
  for (const fact of facts) {
    const key = storyKey(fact.event);
    if (seen.has(key)) continue;
    seen.add(key);
    if (fact.visible) {
      const entry =
        buildAttackStory(fact.event, withCasts) ??
        buildOtherStory(fact.event, withCasts);
      if (entry) story.push(entry);
    }
    const body = fact.event.body;
    if (body.case === 'cast' && fact.event.kind === EventKind.CAST) {
      const spell = body.value.spell;
      if (spell?.ref) byCaster.add(`${body.value.actor}\u0000${spell.ref}`);
      if (spell?.name) names.add(spell.name);
    }
  }
  return Object.freeze(story);
}

/** Presentation arithmetic uses only the provider's roll and total. */
export function buildCombatAttackOutcome(
  event: Event,
  context: CombatStoryContext
): CombatExperienceAttackOutcome | undefined {
  if (event.body.case === 'struck' && event.kind === EventKind.STRUCK) {
    const struck = event.body.value;
    const word = damageTypeWord(struck.attack?.damageType);
    const modifierSources = [
      ...attackModifierSources(
        'advantage',
        struck.advantageSources,
        struck.attacker,
        struck.target,
        context
      ),
      ...attackModifierSources(
        'disadvantage',
        struck.disadvantageSources,
        struck.attacker,
        struck.target,
        context
      ),
    ];
    return Object.freeze({
      attackId: storyKey(event),
      session: event.session,
      seq: event.seq,
      actor: memberName(struck.attacker, context),
      target: memberName(struck.target, context),
      action: attackName(struck.attack),
      attackRef: struck.attack?.ref || undefined,
      reaction: reactionLabel(struck.reaction),
      d20: struck.roll,
      total: struck.total,
      against: struck.against,
      hit: true,
      critical: struck.critical,
      damage: struck.damage,
      damageType: word || undefined,
      modifierSources:
        modifierSources.length > 0 ? Object.freeze(modifierSources) : undefined,
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
      reaction: reactionLabel(missed.reaction),
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
