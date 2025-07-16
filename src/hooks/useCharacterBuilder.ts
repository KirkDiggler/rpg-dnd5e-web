import {
  CharacterBuilderContext,
  type CharacterBuilderContextType,
} from '@/character/creation/CharacterBuilderContext';
import { useContext } from 'react';

export function useCharacterBuilder(): CharacterBuilderContextType {
  const context = useContext(CharacterBuilderContext);
  if (!context) {
    throw new Error(
      'useCharacterBuilder must be used within a CharacterBuilderProvider'
    );
  }
  return context;
}
