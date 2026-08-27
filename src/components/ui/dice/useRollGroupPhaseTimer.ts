import { useEffect, useRef } from 'react';
import {
  ROLL_GROUP_FEEL_PROFILES,
  type RollGroupFeelCandidateId,
} from './rollGroupMotionSolver';
import type {
  RollGroupPresentationAction,
  RollGroupPresentationState,
} from './rollGroupPresentationState';

export function useRollGroupPhaseTimer(input: {
  readonly boundaryMounted: boolean;
  readonly fallback: boolean;
  readonly feel: RollGroupFeelCandidateId;
  readonly isCurrentGeneration: () => boolean;
  readonly reducedMotion: boolean;
  readonly state: RollGroupPresentationState;
  readonly dispatch: (action: RollGroupPresentationAction) => void;
}) {
  const {
    boundaryMounted,
    dispatch,
    fallback,
    feel,
    isCurrentGeneration,
    reducedMotion,
    state,
  } = input;
  const timerFence = useRef(0);

  useEffect(() => {
    if (!boundaryMounted || fallback) return undefined;
    let action: RollGroupPresentationAction | undefined;
    let delay = 0;
    if (state.phase === 'settled-originals') {
      action = { type: 'reroll-flash-complete' };
    } else if (state.phase === 'reroll-flash') {
      action = { type: 'reroll-flash-complete' };
      delay = reducedMotion
        ? 0
        : ROLL_GROUP_FEEL_PROFILES[feel].flashDurationMs;
    } else if (state.phase === 'modifiers') {
      action = { type: 'modifier-shown' };
      delay = reducedMotion
        ? 0
        : ROLL_GROUP_FEEL_PROFILES[feel].modifierDurationMs;
    }
    if (!action) return undefined;

    timerFence.current += 1;
    const timerGeneration = timerFence.current;
    const scheduledAction = action;
    const timer = window.setTimeout(() => {
      if (isCurrentGeneration() && timerFence.current === timerGeneration)
        dispatch(scheduledAction);
    }, delay);
    return () => {
      timerFence.current += 1;
      window.clearTimeout(timer);
    };
  }, [
    boundaryMounted,
    dispatch,
    fallback,
    feel,
    isCurrentGeneration,
    reducedMotion,
    state.modifierIndex,
    state.phase,
    state.rerollIndex,
  ]);
}
