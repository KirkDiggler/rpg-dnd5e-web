import {
  PartyKind,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { ActivityCueRequest } from './activityTypes';

export interface PresentedSayActivity {
  readonly member: string;
  readonly cue: ActivityCueRequest;
}
export interface ActivityCueSettlement {
  readonly member: string;
  readonly id: string;
}

/** Read the selected answer, never the question's actor or current content. */
export function sayActivityFromAct(input: {
  readonly act: Act;
  readonly id: string;
}): PresentedSayActivity | undefined {
  const answer =
    input.act.body.case === 'speak'
      ? input.act.body.value.answer
      : input.act.body.case === 'tableAnswer'
        ? input.act.body.value
        : undefined;
  if (
    !answer?.activity ||
    !answer.say ||
    answer.who?.kind !== PartyKind.MEMBER ||
    !answer.who.id
  )
    return undefined;
  return {
    member: answer.who.id,
    cue: {
      id: input.id,
      activityRef: answer.activity.ref,
      cycles: answer.activity.cycles,
    },
  };
}
