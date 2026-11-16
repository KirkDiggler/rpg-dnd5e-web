/** The reveal contract's providers (rpg-project#983); the contract itself
 * is `useReveal.ts`. */
import type { ReactNode } from 'react';
import {
  RevealContext,
  useRevealController,
  type RevealController,
} from './useReveal';

export function RevealContextProvider({
  controller,
  children,
}: {
  controller: RevealController;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <RevealContext.Provider value={controller}>
      {children}
    </RevealContext.Provider>
  );
}

/** A host with its own controller (tests, a panel used alone). */
export function RevealProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const controller = useRevealController();
  return (
    <RevealContextProvider controller={controller}>
      {children}
    </RevealContextProvider>
  );
}
