import type { Roll } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { formatRollBreakdown } from './describeAct';

/** Annotate supplied dice, not reconstructed rolls. Comparison is numerical,
 * not a hit/save verdict: those remain the act's authoritative outcome. */
export function rollReadout(roll: Roll, targetLabel?: 'AC' | 'DC'): string {
  if (roll.of > 0) return formatRollBreakdown(roll);
  const comparison =
    roll.against === undefined
      ? ''
      : ` ${roll.total > roll.against ? '>' : roll.total < roll.against ? '<' : '='} ${targetLabel ? `${targetLabel} ` : ''}${roll.against}`;
  const tokens = [...roll.expression.matchAll(/\b(\d+)d(\d+)\b/gi)];
  if (!roll.expression)
    return `${formatRollBreakdown({ ...roll, against: undefined })}${comparison}`;
  let faces: readonly (readonly number[])[] = [];
  if (roll.terms.length) {
    const aligned =
      tokens.length === roll.terms.length &&
      tokens.every(
        (token, index) =>
          Number(token[1]) === roll.terms[index]!.count &&
          Number(token[2]) === roll.terms[index]!.dieSize
      );
    if (!aligned)
      return `${formatRollBreakdown({ ...roll, against: undefined })}${comparison}`;
    faces = roll.terms.map((term) => term.faces);
  } else if (
    tokens.length === 1 &&
    Number(tokens[0]![1]) === roll.dice.length
  ) {
    faces = [roll.dice];
  }
  let index = 0;
  const expression = roll.expression.replace(/\b(\d+)d(\d+)\b/gi, (token) => {
    const supplied = faces[index++];
    return supplied?.length ? `${token} (${supplied.join(', ')})` : token;
  });
  return `${expression} = ${roll.total}${comparison}`;
}
