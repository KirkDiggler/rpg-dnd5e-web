import { useState } from 'react';
import type { RefusalJump } from './refusalJump';

/** THE COUNT HOLDS THROUGH A CHECK (R34): while the next check of the same
 * draft is out, the last settled refusals stay shown, so the count does not
 * blink out on every edit. Another draft never holds the previous one's. */
export function useSettledRefusals(
  jumps: readonly RefusalJump[],
  settling: boolean,
  identity: string
): readonly RefusalJump[] {
  const words = JSON.stringify(
    jumps.map((jump) => [jump.path, jump.message, jump.target])
  );
  const [held, setHeld] = useState({ identity, words, jumps });
  if (identity !== held.identity || (!settling && words !== held.words))
    setHeld({ identity, words, jumps });
  return settling && identity === held.identity ? held.jumps : jumps;
}
