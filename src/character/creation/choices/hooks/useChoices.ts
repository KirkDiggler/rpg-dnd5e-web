import { useMemo } from 'react';
import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { ChoiceType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { filterChoicesByType, groupChoicesByType } from '../utils/choiceFilters';

export interface UseChoicesOptions {
  choices: Choice[];
  type?: ChoiceType;
}

export interface UseChoicesResult {
  allChoices: Choice[];
  filteredChoices: Choice[];
  groupedChoices: Record<ChoiceType, Choice[]>;
  hasChoices: boolean;
  choiceCount: number;
}

/**
 * Hook to manage and filter choices
 */
export function useChoices({ choices, type }: UseChoicesOptions): UseChoicesResult {
  const filteredChoices = useMemo(() => {
    if (!type) return choices;
    return filterChoicesByType(choices, type);
  }, [choices, type]);

  const groupedChoices = useMemo(() => {
    return groupChoicesByType(choices);
  }, [choices]);

  return {
    allChoices: choices,
    filteredChoices,
    groupedChoices,
    hasChoices: filteredChoices.length > 0,
    choiceCount: filteredChoices.length,
  };
}