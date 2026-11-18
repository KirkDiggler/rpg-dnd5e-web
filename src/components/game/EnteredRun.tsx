import { useEffect } from 'react';
import { clearFailedOpen } from './resumeFailure';

/** Rendered beside the game view inside its error boundary: its effect
 * commits only when the view rendered, so a run that opened forgets any
 * earlier failure to open (rpg-project#1004). */
export function EnteredRun({
  player,
  encounter,
}: {
  player: string;
  encounter: string | null;
}): null {
  useEffect(() => {
    if (encounter) clearFailedOpen(player, encounter);
  }, [player, encounter]);
  return null;
}
