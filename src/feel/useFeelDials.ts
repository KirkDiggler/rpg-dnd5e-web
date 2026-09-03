/**
 * `useCameraDials()`/`useDiceDials()` — the reactive, drawer/localStorage/
 * URL-aware replacements for every `useMemo(() => readCameraDials(), [])`/
 * `readDiceDials()` read-once call site (#906 batch 2, step 3).
 *
 * Lives in its OWN file rather than inside `cameraDials.ts`/`diceDials.ts`
 * specifically to avoid an import cycle: `feel/dialStore.ts` (which these
 * hooks need, for `useDialValues()`) imports `feel/dials.ts`, which imports
 * `CAMERA_DIAL_SPECS`/`DICE_DIAL_SPECS` FROM `cameraDials.ts`/`diceDials.ts`
 * — so those two files importing back from here (or from `dialStore.ts`
 * directly) would close the loop. `cameraDialsFrom`/`diceDialsFrom` (the
 * pure derivations) are the only things imported from them here, which is
 * one-directional and fine.
 */
import {
  cameraDialsFrom,
  type CameraDials,
} from '@/components/hex-grid/cameraDials';
import {
  diceDialsFrom,
  type DiceDials,
} from '@/components/session/local-world-die/diceDials';
import { useMemo } from 'react';
import { useDialValues } from './dialStore';

export function useCameraDials(): CameraDials {
  const values = useDialValues();
  return useMemo(() => cameraDialsFrom(values), [values]);
}

export function useDiceDials(): DiceDials {
  const values = useDialValues();
  return useMemo(() => diceDialsFrom(values), [values]);
}
