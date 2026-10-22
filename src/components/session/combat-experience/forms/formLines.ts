import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import {
  describeAct,
  formatRollBreakdown,
  formatRollFormula,
  type DescribeContext,
} from '../describeAct';
import type { FormLines } from './FormShell';

/**
 * An act's lines for a form: the describer line, the formula line and the
 * breakdown. `withRoll` false is a form for an act whose body carries no
 * roll; null when the act describes to nothing (bookkeeping).
 */
export function formLines(
  act: Act,
  context: DescribeContext,
  withRoll = true
): FormLines | null {
  const described = describeAct(act, context);
  if (!described) return null;
  return {
    eyebrow: described.eyebrow,
    headline: described.headline,
    outcome: described.outcome || undefined,
    formula: withRoll
      ? formatRollFormula(act, context) || undefined
      : undefined,
    breakdown: withRoll
      ? formatRollBreakdown(described.roll) || undefined
      : undefined,
  };
}
