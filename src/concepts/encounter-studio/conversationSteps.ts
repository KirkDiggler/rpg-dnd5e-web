/**
 * A CONVERSATION'S STEPS, FROM THE ENGINE'S READ-BACK (rpg-project#1033).
 *
 * The engine says each step of a conversation's recipe as a
 * `conversation.transition` statement about `{conversation, <id>}`, at the
 * transition's path (`interactions.<id>.recipe.states.<from>.transitions[i]`).
 * Which statements are steps, and of which conversation, is the engine's;
 * the state a step leaves is the one the dialect's path parser (`locate`)
 * names at that path, and the beat and the state it enters are the values the
 * draft holds there (`on`, `to`). No sentence is read for meaning.
 */
import type { ReadBack } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import type {
  ConversationStep,
  StepWords,
} from '../world-building/stepWordsContext';
import { locate, valueAt } from './locatePath';

export const TRANSITION_KIND = 'conversation.transition';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function conversationStepsOf(
  readBack: ReadBack,
  document: Readonly<RoomDraftDocument>
): Map<string, ConversationStep[]> {
  const out = new Map<string, Map<string, ConversationStep>>();
  for (const section of readBack.sections)
    for (const group of section.groups)
      for (const statement of group.statements) {
        if (
          statement.kind !== TRANSITION_KIND ||
          statement.about?.kind !== 'conversation'
        )
          continue;
        const rest = locate(statement.path, document)?.rest;
        const from =
          rest && rest[1] === 'states' && typeof rest[2] === 'string'
            ? rest[2]
            : null;
        const written = valueAt(statement.path, document);
        if (
          from === null ||
          !isRecord(written) ||
          typeof written.on !== 'string' ||
          typeof written.to !== 'string'
        )
          continue;
        const id = statement.about.id;
        const steps = out.get(id) ?? new Map<string, ConversationStep>();
        out.set(id, steps);
        const step = steps.get(written.on) ?? {
          beat: written.on,
          moves: [],
          sentences: [],
        };
        steps.set(written.on, {
          beat: step.beat,
          moves: [...step.moves, { from, to: written.to }],
          sentences: [...step.sentences, statement.sentence],
        });
      }
  return new Map(
    [...out.entries()].map(([id, steps]) => [id, [...steps.values()]])
  );
}

/** The step words a line's form is given, from a read-back of the draft. */
export function stepWordsOf(
  readBack: ReadBack | null | undefined,
  document: Readonly<RoomDraftDocument>
): StepWords {
  if (!readBack) return { stepsOf: () => undefined };
  const steps = conversationStepsOf(readBack, document);
  return { stepsOf: (id) => steps.get(id) };
}
