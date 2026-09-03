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
  perspectiveOverrides,
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
  // The perspective escape hatch (`?camera=persp`/`fov`/`minDist`/
  // `maxDist`) is deliberately URL-only and not a registered dial (see
  // CAMERA_DIAL_SPECS's own doc comment), so `cameraDialsFrom` alone can
  // never see it — read it once here, directly, and layer it on top of the
  // live store result. Empty dependency array on purpose: read-once by
  // design, same as it always was.
  const perspective = useMemo(
    () =>
      typeof window === 'undefined'
        ? null
        : perspectiveOverrides(window.location.search),
    []
  );
  return useMemo(
    () => ({ ...cameraDialsFrom(values), ...perspective }),
    [values, perspective]
  );
}

export function useDiceDials(): DiceDials {
  const values = useDialValues();
  return useMemo(() => diceDialsFrom(values), [values]);
}
