import { useContext } from 'react';
import { CharacterDraftContext } from './CharacterDraftContextDef';

export function useCharacterDraft() {
  const context = useContext(CharacterDraftContext);
  if (!context) {
    throw new Error('useCharacterDraft must be used within CharacterDraftProvider');
  }
  return context;
}