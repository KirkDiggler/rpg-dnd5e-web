/**
 * THE HUBS THE ENGINE SAYS (rpg-project#973, R32): one group per fact or
 * topic in the read-back, with counts from the engine's own entries, keyed
 * on its kinds. Nothing is stored or derived from the draft.
 */
import type { ReadBackGroup } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { StudioReadBack } from './studioPublishing';

export interface ThreadHub {
  kind: 'fact' | 'topic';
  id: string;
}

export const NO_THREADS_SENTENCE = 'The engine has not said the threads yet.';

const TEACHES: Record<ThreadHub['kind'], string> = {
  fact: 'fact.teach',
  topic: 'topic.grant',
};
const ASKS: Record<ThreadHub['kind'], string> = {
  fact: 'fact.ask',
  topic: 'topic.ask',
};
/** The row's words for teaching, by hub kind: the engine's own verbs. */
export const TAUGHT: Record<ThreadHub['kind'], string> = {
  fact: 'taught',
  topic: 'granted',
};

interface HubRow {
  hub: ThreadHub;
  taught: number;
  asked: number;
}

function rowOf(kind: ThreadHub['kind'], group: ReadBackGroup): HubRow {
  const count = (statementKind: string) =>
    group.statements.filter((statement) => statement.kind === statementKind)
      .length;
  return {
    hub: { kind, id: group.about!.id },
    taught: count(TEACHES[kind]),
    asked: count(ASKS[kind]),
  };
}

/** Every hub group the engine says, in its order, by kind. */
export function hubsOf(
  readBack: StudioReadBack['readBack']
): Record<ThreadHub['kind'], HubRow[]> {
  const out: Record<ThreadHub['kind'], HubRow[]> = { fact: [], topic: [] };
  for (const section of readBack?.sections ?? [])
    for (const group of section.groups) {
      const kind = group.about?.kind;
      if (kind === 'fact' || kind === 'topic')
        out[kind].push(rowOf(kind, group));
    }
  return out;
}
