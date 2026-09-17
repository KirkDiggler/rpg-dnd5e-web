import type {
  DamageComponent,
  DiceKeep,
  DiceTrace,
  RollCalculation,
  RollComponent,
  RollSource,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { KeepRule } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { DamageType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

type ResolveSourceName = (sourceId: string) => string | undefined;

function providerText(
  source: RollSource | undefined,
  resolveSourceName?: ResolveSourceName
): string {
  const value = source?.label || source?.name || '';
  const requiresJsonQuoting =
    value.includes('"') ||
    value.includes('\\') ||
    [...value].some((character) => character.charCodeAt(0) <= 0x1f);
  const label = requiresJsonQuoting ? JSON.stringify(value) : value;
  const contributor = source?.sourceId
    ? (resolveSourceName?.(source.sourceId) ?? source.sourceId)
    : '';
  if (label && contributor) return `${label} (${contributor})`;
  return label || contributor;
}

function rollFaces(trace: DiceTrace): string {
  const original = trace.originalRolls ?? [];
  const final = trace.finalRolls ?? [];
  const rerolls = trace.rerolls ?? [];
  const count = Math.max(original.length, final.length);
  const faces: string[] = [];

  for (let dieIndex = 0; dieIndex < count; dieIndex += 1) {
    const history: number[] = [];
    if (original[dieIndex] !== undefined) history.push(original[dieIndex]);
    for (const reroll of rerolls) {
      if (reroll.dieIndex !== dieIndex) continue;
      if (history.at(-1) !== reroll.before) history.push(reroll.before);
      history.push(reroll.after);
    }
    const finalFace = final[dieIndex];
    if (finalFace !== undefined && history.at(-1) !== finalFace) {
      history.push(finalFace);
    }
    faces.push(history.join(' → '));
  }

  return `[${faces.join(', ')}]`;
}

/**
 * One keep source as the log names it: the rule's own word, and the entity
 * behind it when that entity is somebody else.
 *
 * THE NAME COMES DOWN FROM THE SERVER. `RollSource.name` is authored — the
 * untrained rule publishes "Untrained", Help publishes "Help" — and this
 * client never invents or maps a word for a rule it was not told about.
 *
 * "FROM <ENTITY>" IS OMITTED WHEN IT WOULD SAY NOTHING: when there is no
 * resolver, when the id does not resolve, and when it resolves to the ROLLER
 * themself. "advantage: Reckless Attack, from Bob" told to Bob about Bob's own
 * feat is noise; "advantage (Help, from Alice)" is the fact that matters,
 * because somebody else spent something on this roll.
 */
function keepSourceText(
  source: RollSource,
  resolveSourceName?: ResolveSourceName,
  rollerId?: string
): string {
  const name = source.name || source.ref || '';
  const entity =
    source.sourceId && source.sourceId !== rollerId
      ? resolveSourceName?.(source.sourceId)
      : undefined;
  return entity ? `${name}, from ${entity}` : name;
}

function keepSourcesText(
  sources: readonly RollSource[] | undefined,
  resolveSourceName?: ResolveSourceName,
  rollerId?: string
): string {
  return (sources ?? [])
    .map((source) => keepSourceText(source, resolveSourceName, rollerId))
    .filter(Boolean)
    .join(', ');
}

/**
 * The faces that counted, read off the trace's own kept indices.
 *
 * NEVER DERIVED FROM THE RULE. A reader could compute "advantage keeps the
 * max", and it would be right until the first rule that does not — Elven
 * Accuracy keeps one of three, and a reroll changes which face is even a
 * candidate. The producer said which index counted; this prints that.
 */
function keptFacesText(trace: DiceTrace): string {
  const final = trace.finalRolls ?? [];
  return (trace.keptIndices ?? [])
    .map((index) => final[index])
    .filter((face): face is number => face !== undefined)
    .join(', ');
}

/**
 * One dice pool as a line of log: the notation, every face, and — when a rule
 * decided between them — which face counted and whose rule it was.
 *
 * ```
 * 1d20 [11]
 * 2d20 [7, 18] kept 18 · advantage: Reckless Attack
 * 2d20 [7, 18] kept 7 · disadvantage: Untrained
 * 1d20 [11] · advantage (Help, from Alice) cancelled by disadvantage (Untrained)
 * ```
 *
 * THE RULE IS READ, NEVER INFERRED (rpg-project#462, R1). Two faces do not
 * mean advantage and one face does not mean a straight roll: a CANCELLED pool
 * has one face and a record saying two rules met. The old
 * `(kept indices [1])` text is replaced rather than kept beside it — it named
 * a position in an array and said nothing about why.
 *
 * NO `keep`, NO RULE PRINTED, even on a pool with two faces and no kept
 * index. Server-side validation refuses that combination, so it is a producer
 * defect; this client renders the faces and invents nothing.
 *
 * THE DISCARDED FACE IS NOT STRUCK THROUGH HERE, and that is deliberate: this
 * function returns a plain string that the story log, the debug feed and the
 * beat line all print as text, with no markup channel between them. `kept 18`
 * says which face counted in a form every one of those surfaces can show.
 * Drawing the discarded die struck through belongs to the tray slice, which
 * owns pixels (rpg-project#463, R6).
 */
function formatDice(
  trace: DiceTrace | undefined,
  resolveSourceName?: ResolveSourceName,
  rollerId?: string
): string | undefined {
  if (!trace?.notation) return undefined;
  const faces = `${trace.notation} ${rollFaces(trace)}`;
  const keep = trace.keep;
  if (!keep) return faces;

  const granted = keepSourcesText(keep.granted, resolveSourceName, rollerId);
  const imposed = keepSourcesText(keep.imposed, resolveSourceName, rollerId);

  switch (keep.rule) {
    case KeepRule.ADVANTAGE:
      return `${faces} kept ${keptFacesText(trace)} · advantage: ${granted}`;
    case KeepRule.DISADVANTAGE:
      return `${faces} kept ${keptFacesText(trace)} · disadvantage: ${imposed}`;
    case KeepRule.CANCELLED:
      // THE CASE THE LOG HAS NEVER BEEN ABLE TO SHOW (R2). One die was rolled
      // and it was NOT a straight roll: two rules met and ate each other. No
      // "kept" clause, because every face counted.
      return `${faces} · advantage (${granted}) cancelled by disadvantage (${imposed})`;
    default:
      // A rule this build cannot name. The server refuses to send one, so this
      // is unreachable against a current server — and if it ever is reached,
      // printing the faces without a claim is the honest degradation.
      return faces;
  }
}

type AdditiveTerm =
  | {
      readonly kind: 'dice';
      readonly text: string;
      readonly source: string;
      readonly subtract: boolean;
    }
  | {
      readonly kind: 'modifier';
      readonly value: number;
      readonly source: string;
    };

function componentTerms(
  component: RollComponent,
  resolveSourceName?: ResolveSourceName,
  showDiceSources = false
): AdditiveTerm[] {
  const terms: AdditiveTerm[] = [];
  // The pool's own entity is the roller for a d20 (R7: every pool names the
  // entity whose rule threw it), which is what lets the keep line omit
  // "from <me>" and keep "from Alice".
  const dice = formatDice(
    component.dice,
    resolveSourceName,
    component.source?.sourceId
  );
  const source = providerText(component.source, resolveSourceName);
  if (dice) {
    // WHETHER TO NAME WHOSE DIE THIS IS. Left exactly as it was, and that is
    // a deliberate non-change (rpg-project#462): R7 gives every pool an entity
    // now, the roller's own d20 included, so this test fires on pools it never
    // used to — a check d20 was anonymous before and is not now.
    //
    // NOT TIGHTENED HERE, because the two surfaces that would be affected
    // disagree about what is right. The design's example lines show a check
    // d20 with no attribution, while saves and concentration checks have
    // SHIPPED printing theirs ("Concentration check (staniel)") and three
    // tests encode that as correct. Choosing one silently would change output
    // Kirk has already accepted, on a slice whose brief does not mention
    // attribution at all. Reported instead.
    terms.push({
      kind: 'dice',
      text: dice,
      source:
        showDiceSources || component.subtractDice || component.source?.sourceId
          ? source
          : '',
      subtract: component.subtractDice,
    });
  }
  if (component.modifier !== undefined) {
    terms.push({
      kind: 'modifier',
      value: component.modifier,
      source,
    });
  }
  return terms;
}

function appendAdditiveTerm(text: string, term: AdditiveTerm): string {
  if (term.kind === 'dice') {
    const source = term.source ? ` ${term.source}` : '';
    if (!text) return `${term.subtract ? '-' : ''}${term.text}${source}`;
    return `${text} ${term.subtract ? '-' : '+'} ${term.text}${source}`;
  }

  const source = term.source ? ` ${term.source}` : '';
  if (!text) return `${term.value}${source}`;
  if (term.value < 0) return `${text} - ${Math.abs(term.value)}${source}`;
  return `${text} + ${term.value}${source}`;
}

function formatAdditiveTerms(
  terms: readonly AdditiveTerm[]
): string | undefined {
  const text = terms.reduce(appendAdditiveTerm, '');
  return text || undefined;
}

/**
 * Formats provider-authored dice/modifier facts and prints the provider's total.
 * It deliberately does not parse refs, validate rules, or derive any subtotal.
 */
export function formatRollCalculation(
  calculation: RollCalculation,
  resolveSourceName?: ResolveSourceName,
  options: { showDiceSources?: boolean } = {}
): string | undefined {
  if (!calculation) return undefined;
  const expression = formatAdditiveTerms(
    (calculation.components ?? []).flatMap((component) =>
      componentTerms(component, resolveSourceName, options.showDiceSources)
    )
  );
  return expression ? `${expression} = ${calculation.total}` : undefined;
}

/**
 * Formats new damage roll components in producer order. Multipliers remain
 * domain facts beside additive inputs rather than becoming roll modifiers;
 * callers append the authoritative damage total and type. Legacy scalar
 * components intentionally do not become fabricated traces.
 */
export function formatDamageRolls(
  components: readonly DamageComponent[]
): string | undefined {
  if (components.length === 0) return undefined;
  let text = '';
  for (const component of components) {
    if (!component.roll) return undefined;
    const terms = componentTerms(component.roll);
    const hasMultiplier = component.multiplier !== undefined;
    if (terms.length === 0 && !hasMultiplier) return undefined;

    for (const term of terms) text = appendAdditiveTerm(text, term);
    if (hasMultiplier) {
      const source = providerText(component.roll.source);
      text += `${text ? ' ' : ''}× ${component.multiplier}${source ? ` ${source}` : ''}`;
    }
  }
  return text || undefined;
}

function quoteDebugString(value: string): string {
  return JSON.stringify(value);
}

function numberArray(values: readonly number[] | undefined): string {
  return `[${(values ?? []).join(',')}]`;
}

function debugRollSource(source: RollSource | undefined): string {
  if (!source) return 'unset';
  return (
    `{ref=${quoteDebugString(source.ref)} ` +
    `name=${quoteDebugString(source.name)} ` +
    `label=${quoteDebugString(source.label)}}`
  );
}

/**
 * The keep record, rendered where the trace that owns it is rendered
 * (rpg-project#462, R1).
 *
 * ONE PLACE, because a keep belongs to the pool it decided and every debug
 * surface that dumps a calculation should show it: the check beats, the paused
 * window's raw body, the strike. A second renderer keyed off the beat instead
 * of the trace is a parallel spelling that can disagree with the dice it
 * describes, which is the defect this whole slice is about.
 *
 * The RULE is printed by name. "cancelled" is not derivable from the two
 * lists — it has both of them full and is neither advantage nor disadvantage.
 */
function debugDiceKeep(keep: DiceKeep | undefined): string {
  if (!keep) return 'unset';
  const sources = (list: readonly RollSource[] | undefined) =>
    `[${(list ?? []).map(debugRollSource).join(', ')}]`;
  return (
    `{rule=${KeepRule[keep.rule] ?? String(keep.rule)} ` +
    `granted=${sources(keep.granted)} imposed=${sources(keep.imposed)}}`
  );
}

function debugDiceTrace(trace: DiceTrace | undefined): string {
  if (!trace) return 'unset';
  const rerolls = (trace.rerolls ?? []).map(
    (reroll) =>
      `{index=${reroll.dieIndex} before=${reroll.before} after=${reroll.after} ` +
      `source=${debugRollSource(reroll.source)}}`
  );
  return (
    `{notation=${quoteDebugString(trace.notation)} die_size=${trace.dieSize} ` +
    `original_rolls=${numberArray(trace.originalRolls)} ` +
    `rerolls=[${rerolls.join(', ')}] ` +
    `final_rolls=${numberArray(trace.finalRolls)} ` +
    `kept_indices=${numberArray(trace.keptIndices)} subtotal=${trace.subtotal} ` +
    `keep=${debugDiceKeep(trace.keep)}}`
  );
}

function debugRollComponent(component: RollComponent): string {
  const modifierPresent = component.modifier !== undefined;
  return (
    `{source=${debugRollSource(component.source)} ` +
    `dice=${debugDiceTrace(component.dice)} ` +
    `modifier.present=${modifierPresent} ` +
    `modifier=${modifierPresent ? component.modifier : 'unset'}}`
  );
}

export function formatDebugRollCalculation(
  calculation: RollCalculation | undefined
): string {
  if (!calculation) return 'unset';
  return `{components=[${(calculation.components ?? [])
    .map(debugRollComponent)
    .join(', ')}] total=${calculation.total}}`;
}

function debugDamageComponent(component: DamageComponent): string {
  const multiplierPresent = component.multiplier !== undefined;
  return (
    `{source=${quoteDebugString(component.source)} ` +
    `legacy.ref=${quoteDebugString(component.sourceRef)} ` +
    `legacy.dice=${quoteDebugString(component.dice)} ` +
    `legacy.final_rolls=${numberArray(component.finalRolls)} ` +
    `legacy.flat=${component.flatBonus} ` +
    `type=${DamageType[component.damageType] ?? String(component.damageType)} ` +
    `multiplier.present=${multiplierPresent} ` +
    `multiplier=${multiplierPresent ? component.multiplier : 'unset'} ` +
    `roll=${component.roll ? debugRollComponent(component.roll) : 'unset'}}`
  );
}

export function formatDebugDamageComponents(
  components: readonly DamageComponent[] | undefined
): string {
  return `[${(components ?? []).map(debugDamageComponent).join(', ')}]`;
}
