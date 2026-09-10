import type {
  DamageComponent,
  DiceTrace,
  RollCalculation,
  RollComponent,
  RollSource,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
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

function formatDice(trace: DiceTrace | undefined): string | undefined {
  if (!trace?.notation) return undefined;
  const kept = trace.keptIndices ?? [];
  const keptText =
    kept.length === 0 ? '' : ` (kept indices [${kept.join(', ')}])`;
  return `${trace.notation} ${rollFaces(trace)}${keptText}`;
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
  resolveSourceName?: ResolveSourceName
): AdditiveTerm[] {
  const terms: AdditiveTerm[] = [];
  const dice = formatDice(component.dice);
  const source = providerText(component.source, resolveSourceName);
  if (dice) {
    terms.push({
      kind: 'dice',
      text: dice,
      source:
        component.subtractDice || component.source?.sourceId ? source : '',
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
  resolveSourceName?: ResolveSourceName
): string | undefined {
  if (!calculation) return undefined;
  const expression = formatAdditiveTerms(
    (calculation.components ?? []).flatMap((component) =>
      componentTerms(component, resolveSourceName)
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
    `kept_indices=${numberArray(trace.keptIndices)} subtotal=${trace.subtotal}}`
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
