import { useContext } from 'react';
import { DiscordContext } from './context';
import type { DiscordContextType } from './types';

/**
 * Hook to use Discord context
 */
export function useDiscord(): DiscordContextType {
  const context = useContext(DiscordContext);
  if (!context) {
    throw new Error('useDiscord must be used within a DiscordProvider');
  }
  return context;
}
