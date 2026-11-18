import type { HTMLAttributes } from 'react';
import { useRevealable, useRevealablePath, type RevealKey } from './useReveal';

/** A block a jump can land on (rpg-project#983): by its file path, or by a
 * key when it has no path. Lets a list register each of its items. */
export function RevealDiv({
  path,
  revealKey,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  path?: string;
  revealKey?: RevealKey;
}): React.JSX.Element {
  const byPath = useRevealablePath(revealKey ? undefined : path);
  const byKey = useRevealable(revealKey);
  return <div ref={revealKey ? byKey : byPath} {...props} />;
}

/** The same, as a list item. */
export function RevealLi({
  path,
  revealKey,
  onReveal,
  ...props
}: HTMLAttributes<HTMLLIElement> & {
  path?: string;
  revealKey?: RevealKey;
  onReveal?: () => void;
}): React.JSX.Element {
  const byPath = useRevealablePath(revealKey ? undefined : path);
  const byKey = useRevealable(revealKey, onReveal);
  return <li ref={revealKey ? byKey : byPath} {...props} />;
}
