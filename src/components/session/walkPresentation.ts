import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';

/** Presentation outcomes never acknowledge a server command or game outcome. */
export type WalkPresentationOutcome = 'painted' | 'unavailable' | 'cancelled';

export interface PresentWalkInput {
  readonly act: Act;
  readonly complete: (outcome: WalkPresentationOutcome) => void;
}

/** Start one visible walk. Unsubscribe detaches the waiter without completing it. */
export type PresentWalk = (input: PresentWalkInput) => () => void;
