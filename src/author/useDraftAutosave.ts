/**
 * useDraftAutosave — debounced localStorage autosave for one draft mode's
 * working YAML text (`draftStorage.ts`'s `saveDraft`). Extracted from
 * `DungeonBuilderConcept.tsx`, which previously inlined this same effect
 * twice, once per mode (Copilot review, PR #717).
 *
 * **The bug this fixes.** The original inline `useEffect` fired on every
 * `yamlText` change, INCLUDING the one React runs right after initial
 * mount — so it autosaved the pristine default seed 500ms after every
 * fresh load. A subsequent refresh would then ALWAYS show "draft
 * restored" for content nobody actually touched, and a programmatic
 * `setYamlText` reset (Discard draft, New Canvas) got immediately
 * re-autosaved by the very next tick as if it were real content, silently
 * undoing the reset it was supposed to make stick.
 *
 * **The fix.** The hook's first tick is pre-skipped (the mount tick,
 * `skipNextRef` starts `true`), and `skipNextTick()` lets a caller arm
 * that same skip again immediately before any programmatic `yamlText`
 * reset, so that reset's own resulting tick is skipped too. Everything
 * else is exactly the original inline effect: save the RAW text on every
 * debounce tick, not just successfully-parsed text — the point is never
 * losing keystrokes to a refresh, including mid-typo — debounced,
 * cleared on unmount/next change.
 *
 * See `draftStorage.ts`'s own doc comment for the second, independent
 * safety net (`draftDiffersFromFreshSeed`) that catches the same class of
 * dishonest-banner bug from the RESTORE side, in case a no-op draft ever
 * makes it into storage some other way.
 */
import { useEffect, useRef } from 'react';
import { saveDraft, type DraftMode } from './draftStorage';

const DRAFT_AUTOSAVE_DEBOUNCE_MS = 500;

export interface DraftAutosave {
  /** Marks the NEXT `yamlText` change as not a real edit — skips exactly
   * one autosave tick. Call this synchronously, immediately before a
   * programmatic `setYamlText` reset, so that reset doesn't get silently
   * autosaved as if it were authored content. */
  skipNextTick: () => void;
}

export function useDraftAutosave(
  mode: DraftMode,
  yamlText: string
): DraftAutosave {
  const skipNextRef = useRef(true);

  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    const t = setTimeout(
      () => saveDraft(mode, yamlText),
      DRAFT_AUTOSAVE_DEBOUNCE_MS
    );
    return () => clearTimeout(t);
  }, [mode, yamlText]);

  return {
    skipNextTick: () => {
      skipNextRef.current = true;
    },
  };
}
