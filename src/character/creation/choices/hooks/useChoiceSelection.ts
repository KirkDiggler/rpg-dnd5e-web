import type { Choice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useCallback, useState } from 'react';

export type ChoiceSelections = Record<string, string[]>;

export interface UseChoiceSelectionOptions {
  initialSelections?: ChoiceSelections;
}

export interface UseChoiceSelectionResult {
  selections: ChoiceSelections;
  setSelection: (choiceId: string, values: string[]) => void;
  clearSelection: (choiceId: string) => void;
  clearAllSelections: () => void;
  getSelection: (choiceId: string) => string[];
  isValidSelection: (choice: Choice, selection: string[]) => boolean;
  hasSelection: (choiceId: string) => boolean;
}

/**
 * Hook to manage choice selections
 */
export function useChoiceSelection({
  initialSelections = {},
}: UseChoiceSelectionOptions = {}): UseChoiceSelectionResult {
  const [selections, setSelections] =
    useState<ChoiceSelections>(initialSelections);

  const setSelection = useCallback((choiceId: string, values: string[]) => {
    setSelections((prev) => ({
      ...prev,
      [choiceId]: values,
    }));
  }, []);

  const clearSelection = useCallback((choiceId: string) => {
    setSelections((prev) => {
      const newSelections = { ...prev };
      delete newSelections[choiceId];
      return newSelections;
    });
  }, []);

  const clearAllSelections = useCallback(() => {
    setSelections({});
  }, []);

  const getSelection = useCallback(
    (choiceId: string): string[] => {
      return selections[choiceId] || [];
    },
    [selections]
  );

  const isValidSelection = useCallback(
    (choice: Choice, selection: string[]): boolean => {
      // Check if the correct number of items are selected
      if (selection.length !== choice.chooseCount) {
        return false;
      }

      // Check for duplicates
      const uniqueSelections = new Set(selection);
      if (uniqueSelections.size !== selection.length) {
        return false;
      }

      return true;
    },
    []
  );

  const hasSelection = useCallback(
    (choiceId: string): boolean => {
      return choiceId in selections && selections[choiceId].length > 0;
    },
    [selections]
  );

  return {
    selections,
    setSelection,
    clearSelection,
    clearAllSelections,
    getSelection,
    isValidSelection,
    hasSelection,
  };
}
