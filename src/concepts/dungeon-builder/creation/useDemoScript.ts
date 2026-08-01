import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreationGrid, CreationState } from './creationTypes';
import { buildDemoScript } from './demoScript';
import type { CreationActions } from './useCreationState';

export interface UseDemoScriptResult {
  isPlaying: boolean;
  /** True once the script has run its last step to completion — distinct
   * from `!isPlaying`, which is also true while merely paused mid-script.
   * Without this, "resume" after a natural finish would silently
   * re-run just the final (empty) step instead of starting over. */
  isDone: boolean;
  caption: string | null;
  stepIndex: number;
  stepCount: number;
  play: () => void;
  pause: () => void;
  restart: () => void;
}

/**
 * Runs `demoScript.ts`'s steps against the SAME `actions`/`state` a
 * user's own clicks would use — pausing (or the user just clicking the
 * board mid-run) leaves the real creation state exactly where the script
 * left it, so "take over at any step" needs no special handling: it's
 * already the same board.
 */
export function useDemoScript(
  actions: CreationActions,
  getState: () => CreationState,
  grid: CreationGrid
): UseDemoScriptResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [caption, setCaption] = useState<string | null>(null);
  const playingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scriptRef = useRef(buildDemoScript(grid));

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const runFrom = useCallback(
    (index: number) => {
      const script = scriptRef.current;
      if (!playingRef.current) return;
      if (index >= script.length) {
        playingRef.current = false;
        setIsPlaying(false);
        setIsDone(true);
        return;
      }
      const step = script[index];
      step.run(actions, getState());
      setStepIndex(index);
      setCaption(step.caption);
      timerRef.current = setTimeout(() => runFrom(index + 1), step.holdMs);
    },
    [actions, getState]
  );

  const play = useCallback(() => {
    if (playingRef.current) return;
    playingRef.current = true;
    setIsPlaying(true);
    setIsDone(false);
    runFrom(isDone || stepIndex >= scriptRef.current.length ? 0 : stepIndex);
  }, [runFrom, stepIndex, isDone]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
    clearTimer();
  }, []);

  const restart = useCallback(() => {
    clearTimer();
    playingRef.current = false;
    setIsPlaying(false);
    setIsDone(false);
    setStepIndex(0);
    setCaption(null);
  }, []);

  useEffect(() => clearTimer, []);

  return {
    isPlaying,
    isDone,
    caption,
    stepIndex,
    stepCount: scriptRef.current.length,
    play,
    pause,
    restart,
  };
}
