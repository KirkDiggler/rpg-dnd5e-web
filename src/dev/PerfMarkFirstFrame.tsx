import { addAfterEffect, useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { mark, perfMarksEnabled, type PerfMarkName } from './perfMarks';

/**
 * Marks `name` once, after the first frame THIS component's Canvas renders.
 *
 * R3F's loop runs each root's `useFrame` subscribers immediately before that
 * root's `gl.render`, then the global after-effects once every root has
 * rendered. The `useFrame` below records that this root rendered; the
 * after-effect marks only then. So another Canvas on the page (the dice
 * overlay, say) rendering first never fires this mark, and the first frame's
 * shader compilation falls inside the measurement. Renders nothing; does
 * not subscribe to the loop's after-effects unless perf marks are on. The
 * `useFrame` subscription never invalidates, so a demand-frameloop canvas
 * renders no extra frame for it.
 */
export function PerfMarkFirstFrame({ name }: { name: PerfMarkName }) {
  const rendered = useRef(false);
  useFrame(() => {
    rendered.current = true;
  });
  useEffect(() => {
    if (!perfMarksEnabled()) return;
    let done = false;
    const unsubscribe = addAfterEffect(() => {
      if (done || !rendered.current) return;
      done = true;
      mark(name);
      unsubscribe();
    });
    return unsubscribe;
  }, [name]);
  return null;
}
