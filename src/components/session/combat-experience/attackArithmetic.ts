/**
 * attackArithmetic — the dock's and the result card's two attack formatters.
 *
 * Kept apart from the story so the verb responses that still carry a v1
 * `RollCalculation` (AttackResponse: the verbs stay on session v1alpha1, R2)
 * can be read without the retired v1 story builder.
 */
import type { RollCalculation } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { formatRollCalculation } from './rollTrace';
import type { CombatExperienceAttackModifierSource } from './types';

export function formatAttackRollArithmetic(
  roll: number,
  total: number,
  calculation?: RollCalculation,
  resolveSourceName?: (sourceId: string) => string | undefined
): string {
  const breakdown =
    calculation &&
    formatRollCalculation(calculation, resolveSourceName, {
      showDiceSources: true,
    });
  if (breakdown) return breakdown;
  const modifier = total - roll;
  const sign = modifier < 0 ? '−' : '+';
  return `d20 ${roll} ${sign} ${Math.abs(modifier)} = ${total}`;
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
