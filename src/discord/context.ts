import { createContext } from 'react';
import type { DiscordContextType } from './types';

export const DiscordContext = createContext<DiscordContextType | null>(null);
