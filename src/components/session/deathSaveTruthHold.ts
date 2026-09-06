import type { Participant } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { CharacterData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useRef } from 'react';

interface DeathSaveTruthSource {
  readonly participants: readonly Participant[];
  readonly characterData: CharacterData | undefined;
}

export interface UseDeathSaveTruthHoldArgs extends DeathSaveTruthSource {
  /** Session + authenticated member. A change must not carry private state. */
  readonly scopeKey: string;
  /** Exact presentation identity, supplied only while concealment is active. */
  readonly presentationKey: string | undefined;
  /** Presentation-state answer; no HP/progress threshold is inferred here. */
  readonly conceal: boolean;
}

interface DeathSaveTruthHoldState {
  scopeKey: string;
  activePresentationKey: string | undefined;
  lastVisible: DeathSaveTruthSource;
  held: DeathSaveTruthSource;
}

function withHeldCharacterTruth(
  current: CharacterData | undefined,
  held: CharacterData | undefined
): CharacterData | undefined {
  if (!held) return undefined;
  if (!current) return held;
  return {
    ...current,
    hitPoints: held.hitPoints,
    lifeState: held.lifeState,
    deathSaves: held.deathSaves,
  };
}

/**
 * Keeps refreshed provider state authoritative while holding only its visible
 * Death Save projection. The first armed render captures what the mounted
 * viewer last saw; settlement immediately returns the newest provider values.
 */
export function useDeathSaveTruthHold({
  scopeKey,
  presentationKey,
  conceal,
  participants,
  characterData,
}: UseDeathSaveTruthHoldArgs): DeathSaveTruthSource {
  const current = { participants, characterData };
  const stateRef = useRef<DeathSaveTruthHoldState>({
    scopeKey,
    activePresentationKey: undefined,
    lastVisible: current,
    held: current,
  });
  let state = stateRef.current;

  if (state.scopeKey !== scopeKey) {
    state = {
      scopeKey,
      activePresentationKey: conceal ? presentationKey : undefined,
      lastVisible: current,
      held: current,
    };
    stateRef.current = state;
  } else if (!conceal) {
    state.activePresentationKey = undefined;
    state.lastVisible = current;
    state.held = current;
  } else if (state.activePresentationKey === undefined) {
    state.activePresentationKey = presentationKey;
    state.held = state.lastVisible;
  } else if (state.activePresentationKey !== presentationKey) {
    // A different live roll cannot inherit the prior roll's held projection.
    state.activePresentationKey = presentationKey;
    state.lastVisible = current;
    state.held = current;
  }

  if (!conceal) return current;
  return {
    participants: state.held.participants,
    characterData: withHeldCharacterTruth(
      characterData,
      state.held.characterData
    ),
  };
}
