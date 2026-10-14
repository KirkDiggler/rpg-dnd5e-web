/**
 * Every fact id a `when` names, at any nesting: a list's conditions and the
 * one condition inside each `not` (rpg-project#569 R8). Shared by the
 * read-back and the fact index so the two can never disagree about which
 * facts a row reads.
 */
import {
  isNotCondition,
  whenConditions,
  type AnswerWhenCondition,
  type AnswerWhenShape,
} from './answerTableShape';

export function walkFacts(
  when: AnswerWhenShape | undefined,
  visit: (fact: string) => void
): void {
  for (const condition of whenConditions(when)) walkCondition(condition, visit);
}

function walkCondition(
  condition: AnswerWhenCondition,
  visit: (fact: string) => void
): void {
  if (isNotCondition(condition)) walkCondition(condition.not, visit);
  else if ('fact' in condition) visit(condition.fact);
}
