import { sessionPresentationClient } from '@/api/client';
import type { DiceThrowPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/presentation/v1alpha1/service_pb';

interface WitnessStreamClient {
  streamDiceThrows(
    input: Readonly<{ session: string; member: string }>,
    options: Readonly<{ signal: AbortSignal }>
  ): AsyncIterable<DiceThrowPlan>;
}

export interface ConsumeLocalWorldDieWitnessStreamInput {
  readonly session: string;
  readonly member: string;
  readonly signal: AbortSignal;
  readonly onPlan: (plan: DiceThrowPlan) => void;
  readonly onUnavailable: () => void;
}

/** Consumes live-only decorative plans. Cancellation and failure never affect authority. */
export async function consumeLocalWorldDieWitnessStream(
  input: ConsumeLocalWorldDieWitnessStreamInput,
  client: WitnessStreamClient = sessionPresentationClient
): Promise<void> {
  try {
    const stream = client.streamDiceThrows(
      { session: input.session, member: input.member },
      { signal: input.signal }
    );
    for await (const plan of stream) {
      if (input.signal.aborted) return;
      input.onPlan(plan);
    }
  } catch {
    if (!input.signal.aborted) input.onUnavailable();
  }
}
